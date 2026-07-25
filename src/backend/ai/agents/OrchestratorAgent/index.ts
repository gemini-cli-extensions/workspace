/**
 * @fileoverview OrchestratorAgent — multi-agent orchestrator Durable Object.
 *
 * Coordinates task delegation across a fleet of specialist sub-agents
 * (ResearcherAgent, CoderAgent). Unlike the previous stub, this implementation
 * performs **real delegation**: the `spawnTask` tool (and the public
 * `@callable delegate(...)` RPC) reach the specialist DO via
 * `getAgentByName(env.RESEARCHER_AGENT | env.CODER_AGENT, ...)` and `await` the
 * specialist's real output, which is streamed back to the client as a tool
 * result and persisted to embedded SQLite for audit.
 *
 * ## Wire contract
 * - Binding: `ORCHESTRATOR_AGENT`
 * - Kebab name (for `useAgent`/`useAgentChat`): `orchestrator-agent`
 * - Chat: `onChatMessage` (assistant-ui Thread) with the `spawnTask` tool.
 * - RPC: `delegate(agentType, task): Promise<SubAgentResult>` — direct delegation
 *   without going through the chat loop (useful for non-chat UIs).
 * - RPC: `getStats(): Promise<OrchestratorState>` — live counters.
 *
 * ## Calling rule
 * Sub-agents are reached with `getAgentByName(...)` + `await stub.method(...)`.
 * NEVER `stub.fetch(new Request(...))`.
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable, getAgentByName } from "agents";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";
import type { ResearcherAgent } from "@/backend/ai/agents/ResearcherAgent";
import type { CoderAgent } from "@/backend/ai/agents/CoderAgent";
import type {
  SpawnTaskParams,
  OrchestratorState,
  SubAgentResult,
  NestedThreadMessage,
} from "./types";
import { spawnTaskSchema } from "./types";

/**
 * Build the nested sub-agent conversation the frontend renders under the
 * delegation tool call (the assistant-ui Multi-Agent pattern). Produces a
 * two-turn thread: the delegated task as the sub-agent's "user" turn, and the
 * specialist's real output (or error) as its "assistant" turn.
 *
 * @param taskId - The delegation id, used to derive stable message ids.
 * @param task - The task delegated to the specialist.
 * @param assistantText - The specialist's output, or an error explanation.
 * @returns Assistant-ui-compatible `ThreadMessage[]`.
 */
function buildNestedMessages(
  taskId: string,
  task: string,
  assistantText: string,
): NestedThreadMessage[] {
  return [
    { id: `${taskId}-user`, role: "user", content: [{ type: "text", text: task }] },
    {
      id: `${taskId}-assistant`,
      role: "assistant",
      content: [{ type: "text", text: assistantText }],
    },
  ];
}

const SYSTEM_PROMPT = `You are the Multi-Agent Orchestrator for the Cloudflare Edge Showcase.
Analyze each user request and delegate it to the most appropriate specialist using the spawnTask tool:
- "research" for investigation, summarization, comparison, or analysis tasks
- "code" for writing, refactoring, or explaining code
Always state your routing decision in one sentence before calling spawnTask, then present the specialist's result to the user.`;

/** A unique instance name per orchestrator so sub-agent work is co-located. */
function subInstanceName(agentType: SpawnTaskParams["agentType"]): string {
  return `orchestrated-${agentType}`;
}

export class OrchestratorAgent extends AIChatAgent<Env> {
  /** Orchestration counters, mirrored from SQLite on start. */
  private agentState: OrchestratorState = {
    activeTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  };

  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "OrchestratorAgent",
      className: "OrchestratorAgent",
      description:
        "Multi-agent orchestrator. Delegates tasks to ResearcherAgent / CoderAgent over real getAgentByName RPC and streams their actual output back through the assistant-ui Thread. Persists every delegation to embedded SQLite.",
      docsPath: "/docs/agents/orchestrator",
      methods: [
        {
          name: "onChatMessage",
          description: "Chat loop with the spawnTask tool for live, streamed delegation.",
          params: "onFinish",
          returns: "Response (streamed)",
        },
        {
          name: "delegate",
          description: "Directly delegate a task to a specialist sub-agent and await its real output.",
          params: "agentType: 'research' | 'code', task: string",
          returns: "Promise<SubAgentResult>",
        },
        {
          name: "getStats",
          description: "Return live orchestration counters.",
          params: "()",
          returns: "Promise<OrchestratorState>",
        },
      ],
    };
  }

  /** Initialize SQLite + restore persisted counters on cold start. */
  async onStart(): Promise<void> {
    await this.initializeStorage();
    await this.loadAgentState();
  }

  /**
   * Chat loop. Exposes the `spawnTask` tool, which performs real delegation to a
   * specialist sub-agent and returns its actual output to the model.
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const result = streamText({
      model: getChatModel(this.env),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      tools: {
        spawnTask: tool({
          description:
            "Delegate a task to a specialist sub-agent (research or code). Returns the specialist's real output.",
          inputSchema: spawnTaskSchema,
          execute: async (params: SpawnTaskParams): Promise<SubAgentResult> =>
            this.delegate(params.agentType, params.task),
        }),
      },
      stopWhen: stepCountIs(10),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }

  /**
   * Directly delegate a task to a specialist sub-agent over RPC and await its
   * real output. Persists the delegation to SQLite and updates live counters.
   *
   * @param agentType - Which specialist to route to.
   * @param task - The task description to delegate.
   * @returns The specialist's real {@link SubAgentResult}.
   */
  @callable()
  async delegate(
    agentType: SpawnTaskParams["agentType"],
    task: string,
  ): Promise<SubAgentResult> {
    const taskId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const instance = subInstanceName(agentType);

    this.agentState.activeTasks++;
    await this.saveAgentState();
    await this.sql`
      INSERT INTO task_log (task_id, agent_type, task, status, started_at)
      VALUES (${taskId}, ${agentType}, ${task}, 'running', ${startedAt})
    `;

    try {
      let result: SubAgentResult;

      if (agentType === "research") {
        // The generated runtime binding is typed as `DurableObjectNamespace<undefined>`
        // (runtime types don't carry the agent class), so cast to the concrete
        // namespace to recover the typed RPC stub.
        const ns = this.env.RESEARCHER_AGENT as unknown as DurableObjectNamespace<ResearcherAgent>;
        const stub = await getAgentByName<Env, ResearcherAgent>(ns, instance);
        const r = await stub.research(task);
        const assistantText =
          r.output ?? r.error ?? "The researcher returned no output.";
        result = {
          agentType,
          instance,
          taskId: r.taskId,
          status: r.status,
          output: r.output,
          answer: r.output,
          error: r.error,
          durationMs: r.durationMs,
          messages: buildNestedMessages(r.taskId, task, assistantText),
        };
      } else {
        const ns = this.env.CODER_AGENT as unknown as DurableObjectNamespace<CoderAgent>;
        const stub = await getAgentByName<Env, CoderAgent>(ns, instance);
        const r = await stub.code(task);
        const assistantText =
          r.output ?? r.error ?? "The coder returned no output.";
        result = {
          agentType,
          instance,
          taskId: r.taskId,
          status: r.status,
          output: r.output,
          answer: r.output,
          error: r.error,
          durationMs: r.durationMs,
          messages: buildNestedMessages(r.taskId, task, assistantText),
        };
      }

      const completedAt = new Date().toISOString();
      await this.sql`
        UPDATE task_log
        SET status = ${result.status},
            output = ${result.output ?? null},
            error = ${result.error ?? null},
            completed_at = ${completedAt}
        WHERE task_id = ${taskId}
      `;

      this.agentState.activeTasks = Math.max(0, this.agentState.activeTasks - 1);
      if (result.status === "completed") this.agentState.completedTasks++;
      else this.agentState.failedTasks++;
      this.agentState.lastRoutedAgent = agentType;
      await this.saveAgentState();

      return result;
    } catch (err) {
      const completedAt = new Date().toISOString();
      const error = err instanceof Error ? err.message : String(err);
      await this.sql`
        UPDATE task_log
        SET status = 'failed', error = ${error}, completed_at = ${completedAt}
        WHERE task_id = ${taskId}
      `;
      this.agentState.activeTasks = Math.max(0, this.agentState.activeTasks - 1);
      this.agentState.failedTasks++;
      await this.saveAgentState();

      return {
        agentType,
        instance,
        taskId,
        status: "failed",
        error,
        durationMs: 0,
        messages: buildNestedMessages(taskId, task, `Delegation failed: ${error}`),
      };
    }
  }

  /** Return live orchestration counters. */
  @callable()
  async getStats(): Promise<OrchestratorState> {
    return this.agentState;
  }

  /** Create the SQLite tables backing the task log and counters. */
  private async initializeStorage(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS task_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        agent_type TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      )
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS agent_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;
  }

  /** Restore persisted counters from SQLite. */
  private async loadAgentState(): Promise<void> {
    const rows = await this.sql<{ value: string }>`
      SELECT value FROM agent_state WHERE key = 'state'
    `;
    if (rows.length > 0) this.agentState = JSON.parse(rows[0].value);
  }

  /** Persist counters to SQLite. */
  private async saveAgentState(): Promise<void> {
    await this.sql`
      INSERT OR REPLACE INTO agent_state (key, value)
      VALUES ('state', ${JSON.stringify(this.agentState)})
    `;
  }
}
