/**
 * @fileoverview McpAgent — a working "tools as MCP" demo.
 *
 * `@cloudflare/ai-chat` does not re-export the standalone `McpAgent` transport
 * class, and wiring a full external MCP server is out of scope for an in-app
 * showcase. Instead this agent demonstrates the *same capability surface* an MCP
 * server exposes — a discoverable tool catalog plus real tool execution — but
 * over the assistant-ui / Agents SDK channel the rest of the showcase already
 * uses.
 *
 * It exposes three genuinely-executing tools to the model:
 * - `echo`        — returns its input (the canonical MCP smoke-test tool).
 * - `currentTime` — returns the real server time in a requested IANA timezone.
 * - `dbCount`     — runs a real `SELECT count(*)` against a D1 table.
 *
 * The same catalog is enumerable over RPC via `@callable listTools()` so a
 * non-chat UI can render the tool list exactly like an MCP `tools/list` call,
 * and `@callable callTool(name, input)` executes a tool exactly like
 * `tools/call`.
 *
 * ## Wire contract
 * - Binding: `MCP_AGENT`
 * - Kebab name: `mcp-agent`
 * - Chat: `onChatMessage` with the three tools above.
 * - RPC: `listTools(): Promise<McpToolDescriptor[]>`
 * - RPC: `callTool(name: string, input: unknown): Promise<unknown>`
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";

/** A serializable description of one MCP-style tool (mirrors `tools/list`). */
export interface McpToolDescriptor {
  name: string;
  description: string;
  /** JSON-schema-ish shape rendered by the client; kept simple on purpose. */
  inputShape: Record<string, string>;
}

const echoSchema = z.object({
  message: z.string().describe("Text to echo back verbatim."),
});

const currentTimeSchema = z.object({
  timezone: z
    .string()
    .default("UTC")
    .describe("IANA timezone, e.g. 'America/New_York'. Defaults to UTC."),
});

const dbCountSchema = z.object({
  table: z
    .enum(["notifications", "projects", "tasks"])
    .describe("Which known D1 table to count rows in."),
});

const SYSTEM_PROMPT = `You are an MCP tools demo agent.
You have three tools: echo, currentTime, and dbCount.
Always prefer calling a tool over guessing:
- "what time is it" / any time or date question -> call currentTime.
- "echo ..." / "repeat ..." / "say ..." -> call echo with the text.
- "how many <notifications|projects|tasks>" / any row-count question -> call dbCount with that table.
After the tool returns, briefly summarize the real result for the user in one sentence.
If asked what you can do, list your three tools and what each one does.`;

export class McpAgent extends AIChatAgent<Env> {
  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "McpAgent",
      className: "McpAgent",
      description:
        "MCP-style tools demo. Exposes a discoverable tool catalog (echo, currentTime, dbCount) over both the chat loop and RPC (listTools/callTool), executing each tool for real (D1 count is a live query).",
      docsPath: "/docs/agents/mcp",
      methods: [
        { name: "onChatMessage", description: "Chat loop with echo/currentTime/dbCount tools.", params: "onFinish", returns: "Response (streamed)" },
        { name: "listTools", description: "Enumerate the tool catalog (MCP tools/list).", params: "()", returns: "Promise<McpToolDescriptor[]>" },
        { name: "callTool", description: "Execute a tool by name (MCP tools/call).", params: "name: string, input: unknown", returns: "Promise<unknown>" },
      ],
    };
  }

  /**
   * Chat loop exposing the three real tools to the model.
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const result = streamText({
      model: getChatModel(this.env),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      tools: {
        echo: tool({
          description: "Echo the provided message back verbatim.",
          inputSchema: echoSchema,
          execute: async ({ message }) => this.runEcho(message),
        }),
        currentTime: tool({
          description: "Return the current server time in the given IANA timezone.",
          inputSchema: currentTimeSchema,
          execute: async ({ timezone }) => this.runCurrentTime(timezone),
        }),
        dbCount: tool({
          description: "Return the live row count of a known D1 table.",
          inputSchema: dbCountSchema,
          execute: async ({ table }) => this.runDbCount(table),
        }),
      },
      stopWhen: stepCountIs(6),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }

  /** Enumerate the tool catalog (equivalent to an MCP `tools/list`). */
  @callable()
  async listTools(): Promise<McpToolDescriptor[]> {
    return [
      { name: "echo", description: "Echo the provided message back verbatim.", inputShape: { message: "string" } },
      { name: "currentTime", description: "Current server time in an IANA timezone.", inputShape: { timezone: "string" } },
      { name: "dbCount", description: "Live row count of a known D1 table.", inputShape: { table: "notifications|projects|tasks" } },
    ];
  }

  /**
   * Execute a tool by name with raw input (equivalent to an MCP `tools/call`).
   *
   * @param name - The tool name from {@link listTools}.
   * @param input - Raw input object; validated per-tool with Zod.
   */
  @callable()
  async callTool(name: string, input: unknown): Promise<unknown> {
    switch (name) {
      case "echo":
        return this.runEcho(echoSchema.parse(input).message);
      case "currentTime":
        return this.runCurrentTime(currentTimeSchema.parse(input).timezone);
      case "dbCount":
        return this.runDbCount(dbCountSchema.parse(input).table);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /** Real echo implementation. */
  private runEcho(message: string): { tool: "echo"; message: string } {
    return { tool: "echo", message };
  }

  /** Real clock read, formatted for the requested timezone. */
  private runCurrentTime(timezone: string): {
    tool: "currentTime";
    timezone: string;
    iso: string;
    formatted: string;
  } {
    const now = new Date();
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "full",
        timeStyle: "long",
      }).format(now);
    } catch {
      formatted = now.toUTCString();
      timezone = "UTC";
    }
    return { tool: "currentTime", timezone, iso: now.toISOString(), formatted };
  }

  /** Real D1 row count for a whitelisted table. */
  private async runDbCount(
    table: "notifications" | "projects" | "tasks",
  ): Promise<{ tool: "dbCount"; table: string; count: number }> {
    // Table name comes from a closed enum, so this string interpolation is safe.
    const row = await this.env.DB.prepare(
      `SELECT count(*) AS c FROM ${table}`,
    ).first<{ c: number }>();
    return { tool: "dbCount", table, count: row?.c ?? 0 };
  }
}
