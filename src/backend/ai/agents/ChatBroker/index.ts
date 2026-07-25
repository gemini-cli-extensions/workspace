/**
 * @fileoverview ChatBroker - State-persistent Durable Object chat broker.
 *
 * Hosts assistant-ui `<Thread />` conversations over a Cloudflare Agents SDK
 * WebSocket channel, bypassing external provider middleware. Each instance is
 * keyed by a thread id (`idFromName`) and persists its message history in the
 * embedded SQLite store managed by `AIChatAgent`.
 *
 * ## Wire contract (frontend pairing)
 * - `useAgent({ agent: "chat-broker", name: threadId })` from `agents/react`
 *   opens the WebSocket to `/agents/chat-broker/<threadId>`. The `threadId` is
 *   ALSO the `chat_threads` D1 row id, so messages (here) + metadata (D1) stay
 *   linked by one id.
 * - `useAgentChat({ agent })` from `@cloudflare/ai-chat/react` wraps that socket.
 * - `useAISDKRuntime(chat)` from `@assistant-ui/react-ai-sdk` feeds it into
 *   `<AssistantRuntimeProvider>`.
 *
 * ## Per-thread model + auto-title
 * On each turn the broker reads the thread's selected Workers AI model from
 * `chat_threads.model` (keyed by `this.name`) so the model picker in the Thread
 * header takes effect. After the FIRST user turn it generates a short title from
 * that message and persists it to `chat_threads.title`.
 *
 * ## Graceful degradation
 * Workers AI (`env.AI`) is a *remote* binding — in pure `wrangler dev --local`
 * it throws "Binding AI needs to be run remotely". `onChatMessage` wraps the
 * model call so the client always sees a concrete assistant turn even when
 * inference is unavailable.
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import { chatThreads } from "@/backend/db/schema";
import { getChatModel } from "@/backend/ai/providers/ai-sdk";

/**
 * System prompt built with a real multi-line template literal (never
 * `.join("\n")`) so the model receives clean, readable instructions.
 *
 * The prompt advertises the generative-UI tools so the model reaches for them
 * to render rich inline cards instead of describing data in prose.
 */
const SYSTEM_PROMPT = `You are the in-app assistant for the Cloudflare Edge Showcase.
Reply concisely. Prefer short paragraphs and fenced code blocks for code.
Never invent Cloudflare bindings; cite the user's wrangler.jsonc when asked.

You can render rich inline UI through these tools — prefer calling the right tool
over describing the data in prose:
- "showMetric" — a single KPI / statistic worth highlighting. Renders a KPI card.
- "showCard" — a titled summary with optional bullet points and a footnote.
- "showChart" — a comparison or trend over labelled data points. Pick kind
  "bar" | "line" | "area" | "pie". Use for any "compare / over time / breakdown".
- "showMindmap" — a concept breakdown as a hierarchical mind map (a root topic
  with nested children). Use when explaining how ideas relate.
- "createTaskDraft" — propose a task / action item the user can add to their board.

Use showChart for comparisons, showMindmap for concept breakdowns, showCard for
summaries, and createTaskDraft to propose a task.`;

/**
 * Generative-UI tools exposed to the model. Each has a real `execute` that
 * returns structured JSON; the matching client-side `makeAssistantToolUI`
 * renderers (`src/frontend/components/assistant/generative/`) turn that JSON
 * into Monolith-styled cards inline in the Thread.
 *
 * Keep arg + result shapes in lockstep with the client renderers — the wire
 * contract is the Zod schema below + the mirrored TS types in
 * `generative/types.ts`.
 */
const CHAT_TOOLS = {
  /** Render a single KPI / metric card. */
  showMetric: tool({
    description:
      "Display a single key metric (KPI) as a rich card. Use for any statistic, count, or measurement worth highlighting.",
    inputSchema: z.object({
      label: z.string().describe("Human label for the metric, e.g. 'Requests / min'."),
      value: z.string().describe("Formatted value to display, e.g. '12.4k' or '99.98%'."),
      deltaPct: z
        .number()
        .optional()
        .describe("Period-over-period change as a percentage. Positive is up, negative is down."),
      hint: z.string().optional().describe("Short supporting context shown under the value."),
    }),
    execute: async ({ label, value, deltaPct, hint }) => ({
      label,
      value,
      deltaPct: deltaPct ?? null,
      hint: hint ?? null,
      generatedAt: new Date().toISOString(),
    }),
  }),

  /** Render a titled info card with optional bullets + footnote. */
  showCard: tool({
    description:
      "Display a titled summary card. Use to present a concise explanation, a definition, or a summary with optional bullet points.",
    inputSchema: z.object({
      title: z.string().describe("Card heading."),
      body: z.string().describe("One or two sentences of summary prose."),
      bullets: z.array(z.string()).optional().describe("Optional list of short bullet points."),
      footnote: z.string().optional().describe("Optional small print shown at the bottom."),
    }),
    execute: async ({ title, body, bullets, footnote }) => ({
      title,
      body,
      bullets: bullets ?? null,
      footnote: footnote ?? null,
    }),
  }),

  /** Render a chart from labelled data points. */
  showChart: tool({
    description:
      "Render a chart for comparisons, trends, or breakdowns. Use for 'compare', 'over time', or 'distribution' style data.",
    inputSchema: z.object({
      kind: z
        .enum(["bar", "line", "area", "pie"])
        .describe("Chart type. Use pie for parts-of-a-whole, line/area for trends, bar for comparisons."),
      title: z.string().describe("Chart title."),
      data: z
        .array(
          z.object({
            label: z.string().describe("X-axis category / slice label."),
            value: z.number().describe("Numeric value for this point."),
          }),
        )
        .min(1)
        .describe("Data points to plot."),
      series: z.string().optional().describe("Optional label for the value series, e.g. 'Requests'."),
    }),
    execute: async ({ kind, title, data, series }) => ({
      kind,
      title,
      data,
      series: series ?? null,
    }),
  }),

  /** Render a hierarchical mind map. */
  showMindmap: tool({
    description:
      "Render a mind map: a root topic with nested child topics. Use to break a concept down into related sub-topics.",
    inputSchema: z.object({
      title: z.string().describe("Mind map title."),
      root: z
        .object({
          topic: z.string().describe("Central root topic."),
          children: z.array(z.unknown()).optional().describe("Nested child nodes (same shape)."),
        })
        .describe("Root node. Each node is { topic: string, children?: Node[] }."),
    }),
    execute: async ({ title, root }) => ({ title, root }),
  }),

  /** Render an editable task-draft card the user can commit to their board. */
  createTaskDraft: tool({
    description:
      "Propose a task / action item as a card the user can add to their board. Use when the user wants to capture a todo.",
    inputSchema: z.object({
      title: z.string().describe("Concise task title."),
      priority: z.enum(["low", "medium", "high"]).default("medium").describe("Task priority."),
      notes: z.string().optional().describe("Optional supporting detail for the task."),
    }),
    execute: async ({ title, priority, notes }) => ({
      id: crypto.randomUUID(),
      title,
      priority,
      notes: notes ?? null,
      status: "draft" as const,
      createdAt: new Date().toISOString(),
    }),
  }),
};

export class ChatBroker extends AIChatAgent<Env> {
  /** Docs metadata consumed by the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "ChatBroker",
      className: "ChatBroker",
      description:
        "WebSocket-native chat broker for assistant-ui `<Thread />`. Persists conversation state per thread in embedded SQLite; thread METADATA (title, model, archived) lives in the `chat_threads` D1 table keyed by the same id. Resolves a per-thread Workers AI model from `chat_threads.model`, auto-titles the thread from the first user turn, and exposes five generative-UI tools (`showMetric`, `showCard`, `showChart`, `showMindmap`, `createTaskDraft`) rendered as inline cards on the client.",
      docsPath: "/docs/agents/chat-broker",
      methods: [
        {
          name: "onChatMessage",
          description:
            "Streams an LLM reply for the latest user turn with the five generative-UI tools enabled (multi-step up to 8 steps), using the thread's selected model. Persists assistant output on finish and auto-titles the thread after the first user turn. Degrades to a streamed notice if Workers AI is unreachable.",
          params: "onFinish: (result) => void",
          returns: "Response (streamed)",
        },
      ],
    };
  }

  /**
   * Stream an assistant reply for the latest user turn.
   *
   * @param onFinish - SDK finish callback that persists the assistant message.
   * @returns A streamed UI-message `Response`.
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const modelId = await this.resolveThreadModel();

    try {
      const result = streamText({
        model: getChatModel(this.env, modelId),
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(this.messages as UIMessage[]),
        // Widen to `ToolSet` so `streamText` does not narrow the `onFinish`
        // generic to our concrete tool map (the base `onFinish` is typed against
        // the generic `ToolSet`). Runtime behaviour is identical.
        tools: CHAT_TOOLS as ToolSet,
        stopWhen: stepCountIs(8),
        onFinish: async (event) => {
          // Persist the assistant turn first (SDK contract), then best-effort
          // auto-title. Title generation never blocks or fails the reply.
          await onFinish(event);
          this.maybeAutoTitle(modelId).catch((error) =>
            console.error("ChatBroker auto-title error:", error),
          );
        },
        onError: (event) => {
          console.error("ChatBroker streamText error:", event.error);
        },
      });

      return result.toUIMessageStreamResponse({
        onError: (error) =>
          `The assistant could not reach Workers AI. ${
            error instanceof Error ? error.message : String(error)
          }`,
      });
    } catch (error) {
      return this.degradedResponse(error);
    }
  }

  /**
   * Resolve the Workers AI model id selected for THIS thread from
   * `chat_threads.model` (keyed by `this.name`). Returns `null` when unset or
   * unreadable, so `getChatModel` falls back to the env default.
   */
  private async resolveThreadModel(): Promise<string | null> {
    try {
      const db = getDb(this.env);
      const [row] = await db
        .select({ model: chatThreads.model })
        .from(chatThreads)
        .where(eq(chatThreads.id, this.name))
        .limit(1);
      return row?.model ?? null;
    } catch (error) {
      console.error("ChatBroker resolveThreadModel error:", error);
      return null;
    }
  }

  /**
   * After the first user turn, generate a short title and persist it to the
   * thread row. No-op once the thread already has a non-default title or has
   * more than one user message.
   *
   * @param modelId - The thread's resolved model id (reused for titling).
   */
  private async maybeAutoTitle(modelId: string | null): Promise<void> {
    const userMessages = (this.messages as UIMessage[]).filter((m) => m.role === "user");
    if (userMessages.length !== 1) return; // only the very first turn

    const db = getDb(this.env);
    const [row] = await db
      .select({ title: chatThreads.title })
      .from(chatThreads)
      .where(eq(chatThreads.id, this.name))
      .limit(1);

    // Only title rows that still carry the placeholder.
    if (!row || (row.title && row.title !== "New chat")) return;

    const firstUserText = extractText(userMessages[0]!);
    if (!firstUserText) return;

    const { text } = await generateText({
      model: getChatModel(this.env, modelId),
      system:
        "You write a short chat title (3-7 words) summarising the user's message. " +
        "Return ONLY the title — no quotes, no punctuation at the end, no preamble.",
      prompt: firstUserText.slice(0, 800),
    });

    const title = text.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 80);
    if (!title) return;

    await db
      .update(chatThreads)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatThreads.id, this.name));
  }

  /**
   * Build a streamed UI-message `Response` carrying a single graceful-degradation
   * notice, keeping the Thread populated when inference is unavailable.
   *
   * @param error - The originating failure, surfaced verbatim for debuggability.
   */
  private degradedResponse(error: unknown): Response {
    const detail = error instanceof Error ? error.message : String(error);
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        writer.write({
          type: "text-delta",
          id,
          delta: `Workers AI is currently unreachable from this environment, so I can't generate a live reply. (${detail})`,
        });
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }
}

/**
 * Extract plain text from a UI message's parts (text parts only).
 *
 * @param message - A UI message from the conversation log.
 */
function extractText(message: UIMessage): string {
  const parts = (message.parts ?? []) as Array<{ type?: string; text?: string }>;
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ")
    .trim();
}
