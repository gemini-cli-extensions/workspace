/**
 * @fileoverview CodeModeAgent - Dynamic Worker execution agent for secure code sandbox
 *
 * This agent provides secure, sandboxed execution of AI-generated TypeScript code
 * using Cloudflare's DynamicWorkerExecutor. Key features:
 * - ~15ms cold start latency with V8 isolates
 * - Zero-trust execution (no file system, controlled network access)
 * - 80% token reduction by executing single plans instead of sequential tool calls
 * - Real-time WebSocket-based result streaming
 *
 * Built on Cloudflare Agents SDK with embedded SQLite for execution history.
 *
 * @example
 * ```typescript
 * // From frontend with AgentClient:
 * const result = await agent.stub.executePlan({
 *   code: "export default { fetch() { return new Response('Hello World'); } }"
 * });
 * ```
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { getChatModel } from "@/backend/ai/providers/ai-sdk";
import type {
  ExecutionConfig,
  ExecutionResult,
  CodeModeAgentState,
  ExecutePlanParams,
} from "./types";
import { executePlanSchema } from "./types";
import { prepareModule, hasFetchEntry } from "./sandbox";

/**
 * CodeModeAgent - Executes AI-generated code in secure V8 isolates
 */
export class CodeModeAgent extends AIChatAgent<Env> {
  private agentState: CodeModeAgentState = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
  };

  /**
   * Initialize the agent and create execution history table.
   * Called automatically by the Agents SDK on first connection.
   */
  async onStart() {
    await this.initializeStorage();
    await this.loadAgentState();
  }

  /**
   * Handle incoming chat messages with code generation tools.
   * Provides executePlan tool for dynamic code execution.
   *
   * @returns AI SDK message stream response
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const result = streamText({
      model: getChatModel(this.env),
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      system: `You are the Code Mode agent. You support two workflows, chosen by the user:

## 1. Dynamic Worker Sandbox
When the user wants to RUN code, write a complete, self-contained Worker script and
call the executePlan tool to execute it in an isolated V8 sandbox. Rules:
- Prefer the module form: export default { async fetch(request) { … return new Response(...) } }.
- A bare snippet that ends in \`return <value>\` is also accepted — it is auto-wrapped
  and its value is JSON-encoded, so \`const sum = 2 + 40; return { sum };\` works.
- TypeScript type annotations are fine; they are stripped before execution.
- After running, briefly explain the result the tool returned.

## 2. Plan with the agent
When the user wants a PLAN (not execution), do NOT call the tool. Instead respond in
Markdown: a short numbered plan, then the code in a fenced \`\`\`typescript block so it
renders as a proper code card. Explain trade-offs concisely.

If it is unclear which workflow the user wants, ask them to pick "Dynamic Worker Sandbox"
or "Plan with the agent". Keep every response focused and concise.

Example runnable structure:
\`\`\`typescript
export default {
  async fetch(request) {
    const result = { ok: true };
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json" },
    });
  },
};
\`\`\``,
      tools: {
        executePlan: tool({
          description:
            "Execute a TypeScript execution plan securely in a sandboxed V8 isolate. Use this instead of making multiple sequential tool calls. The code must be a complete Workers script with a fetch handler.",
          inputSchema: executePlanSchema,
          execute: async (params: ExecutePlanParams) => {
            return await this.executeCode({
              code: params.code,
              timeout: 30000,
              allowNetwork: false,
              compatibilityDate: "2026-05-25",
            });
          },
        }),
      },
      stopWhen: stepCountIs(8),
      temperature: 0.2,
      maxOutputTokens: 4096,
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }

  /**
   * Execute TypeScript/JavaScript code in a real Dynamic Worker sandbox via the
   * `WORKER_LOADERS` binding, then fetch its handler and capture the real
   * response body. This is genuine isolated execution — the submitted code runs
   * in its own V8 isolate with no access to this DO's bindings.
   *
   * Exposed as a `@callable` RPC so a non-chat UI can run code directly:
   * `agent.call("executeCode", [{ code, ... }])`.
   *
   * @param config - Execution configuration (code + sandbox options).
   * @returns Execution result with status, real output, and metrics.
   */
  @callable()
  async executeCode(config: ExecutionConfig): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Prepare (TS-strip + normalize) the snippet up front so validation runs
      // against what will ACTUALLY execute — a bare `return {...}` body or a
      // service-worker listener is wrapped into a real fetch module here.
      const prepared = prepareModule(config.code);
      if (!hasFetchEntry(prepared.code)) {
        throw new Error(
          "Could not derive a fetch handler from the submitted code. Provide either " +
            "`export default { fetch(request) { … } }`, an `addEventListener('fetch', …)` " +
            "listener, or a snippet ending in `return <value>`.",
        );
      }

      const output = await this.runInDynamicWorker({ ...config, code: prepared.code });
      const executionTime = Date.now() - startTime;

      this.agentState.totalExecutions++;
      this.agentState.successfulExecutions++;
      this.agentState.lastExecutionTime = executionTime;
      this.agentState.averageExecutionTime =
        (this.agentState.averageExecutionTime * (this.agentState.totalExecutions - 1) +
          executionTime) /
        this.agentState.totalExecutions;

      await this.saveAgentState();
      await this.logExecution("success", config.code, executionTime);

      return { status: "success", output, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.agentState.totalExecutions++;
      this.agentState.failedExecutions++;

      await this.saveAgentState();
      await this.logExecution("error", config.code, executionTime, String(error));

      return {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      };
    }
  }

  /**
   * Load the submitted code as an ephemeral Worker and invoke its `fetch`
   * handler, returning the response body as text.
   *
   * Uses `WORKER_LOADERS.get(...)` with a stable per-code id so repeated runs of
   * identical code reuse the isolate. `globalOutbound: null` blocks all outbound
   * network unless the caller opts in via `allowNetwork`.
   *
   * @param config - Execution configuration.
   * @returns The real response body produced by the sandboxed worker.
   */
  private async runInDynamicWorker(config: ExecutionConfig): Promise<string> {
    const loader = this.env.WORKER_LOADERS;
    const workerId = `code-mode-${this.hashCode(config.code)}`;

    const stub = loader.get(workerId, async () => ({
      compatibilityDate: config.compatibilityDate,
      mainModule: "main.js",
      modules: { "main.js": config.code },
      // Block network egress unless explicitly allowed by the caller.
      globalOutbound: config.allowNetwork ? undefined : null,
      limits: { cpuMs: Math.min(config.timeout, 30000) },
    }));

    const entry = stub.getEntrypoint();
    const response = await entry.fetch("https://code-mode.sandbox/");
    const body = await response.text();
    return `HTTP ${response.status}\n${body}`;
  }

  /**
   * Log execution details to SQLite for audit trail.
   *
   * @param status - Execution status
   * @param code - Executed code
   * @param executionTime - Time taken in milliseconds
   * @param error - Error message if failed
   */
  private async logExecution(
    status: string,
    code: string,
    executionTime: number,
    error?: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.sql`
      INSERT INTO execution_log (timestamp, status, code_hash, execution_time, error)
      VALUES (
        ${timestamp},
        ${status},
        ${this.hashCode(code)},
        ${executionTime},
        ${error || null}
      )
    `;
  }

  /**
   * Initialize SQLite tables for execution tracking.
   */
  private async initializeStorage(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS execution_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        execution_time INTEGER NOT NULL,
        error TEXT
      )
    `;

    await this.sql`
      CREATE TABLE IF NOT EXISTS agent_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;
  }

  /**
   * Load agent state from SQLite.
   */
  private async loadAgentState(): Promise<void> {
    const result = await this.sql<{ value: string }>`
      SELECT value FROM agent_state WHERE key = 'state'
    `;

    if (result.length > 0) {
      this.agentState = JSON.parse(result[0].value);
    }
  }

  /**
   * Save agent state to SQLite.
   */
  private async saveAgentState(): Promise<void> {
    await this.sql`
      INSERT OR REPLACE INTO agent_state (key, value)
      VALUES ('state', ${JSON.stringify(this.agentState)})
    `;
  }

  /**
   * Simple hash function for code deduplication.
   */
  private hashCode(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
