/**
 * @fileoverview CoderAgent — a specialist sub-agent the OrchestratorAgent
 * delegates code-generation tasks to.
 *
 * Mirrors {@link ResearcherAgent}: a plain Cloudflare Agents SDK `Agent` with a
 * single `@callable code(task)` RPC. The orchestrator reaches it via
 * `getAgentByName(env.CODER_AGENT, ...)` then `await stub.code(...)`. Each call
 * performs a *real* Workers AI `generateText` request tuned for code output and
 * persists the result to embedded SQLite.
 *
 * ## Wire contract
 * - Binding: `CODER_AGENT`
 * - Kebab name (for `useAgent`/routing): `coder-agent`
 * - RPC: `code(task: string): Promise<DelegationResult>`
 * - RPC: `history(): Promise<DelegationRecord[]>`
 */

import { Agent, callable } from "agents";
import { generateText } from "ai";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";
import type {
  DelegationRecord,
  DelegationResult as ResearchDelegationResult,
} from "@/backend/ai/agents/ResearcherAgent";

/** Result returned to the orchestrator for a single delegated coding task. */
export type CoderDelegationResult = Omit<ResearchDelegationResult, "agent"> & {
  agent: "coder";
};

/** Synced state so a subscribed client can watch the coder work live. */
export interface CoderState {
  totalTasks: number;
  lastTask: string | null;
  busy: boolean;
}

const SYSTEM_PROMPT = `You are a senior TypeScript engineer sub-agent in a multi-agent system.
Given a task, return a single, complete, copy-pasteable code solution.
Prefer a fenced \`\`\`ts code block. Add a one-sentence explanation above it.
Do not include placeholder comments like "rest of code" — write the whole thing.`;

export class CoderAgent extends Agent<Env, CoderState> {
  /** Default synced state before any task runs. */
  initialState: CoderState = { totalTasks: 0, lastTask: null, busy: false };

  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "CoderAgent",
      className: "CoderAgent",
      description:
        "Code-generation specialist sub-agent. Delegated to by the OrchestratorAgent via getAgentByName RPC. Runs a real Workers AI generateText call per task and persists results to embedded SQLite.",
      docsPath: "/docs/agents/coder",
      methods: [
        {
          name: "code",
          description: "Generate a complete code solution via Workers AI and persist it.",
          params: "task: string",
          returns: "Promise<CoderDelegationResult>",
        },
        {
          name: "history",
          description: "Return all delegated tasks recorded in embedded SQLite (newest first).",
          params: "()",
          returns: "Promise<DelegationRecord[]>",
        },
      ],
    };
  }

  /** Create the delegation log table on cold start. */
  async onStart(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS code_log (
        task_id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        error TEXT,
        created_at TEXT NOT NULL
      )
    `;
  }

  /**
   * Generate a real code solution. Invoked by the orchestrator over RPC.
   *
   * @param task - Natural-language coding request.
   * @returns A {@link CoderDelegationResult} with the generated code or an error.
   */
  @callable()
  async code(task: string): Promise<CoderDelegationResult> {
    const taskId = crypto.randomUUID();
    const startedAt = Date.now();
    const createdAt = new Date().toISOString();

    this.setState({
      totalTasks: this.state.totalTasks + 1,
      lastTask: task,
      busy: true,
    });

    try {
      const { text } = await generateText({
        model: getChatModel(this.env),
        system: SYSTEM_PROMPT,
        prompt: task,
        maxOutputTokens: 2048,
        temperature: 0.2,
      });

      await this.sql`
        INSERT INTO code_log (task_id, task, status, output, error, created_at)
        VALUES (${taskId}, ${task}, 'completed', ${text}, ${null}, ${createdAt})
      `;
      this.setState({ ...this.state, busy: false });

      return {
        agent: "coder",
        taskId,
        status: "completed",
        output: text,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.sql`
        INSERT INTO code_log (task_id, task, status, output, error, created_at)
        VALUES (${taskId}, ${task}, 'failed', ${null}, ${error}, ${createdAt})
      `;
      this.setState({ ...this.state, busy: false });

      return {
        agent: "coder",
        taskId,
        status: "failed",
        error,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Return the full delegation history (newest first) from embedded SQLite.
   */
  @callable()
  async history(): Promise<DelegationRecord[]> {
    const rows = await this.sql<{
      task_id: string;
      task: string;
      status: string;
      output: string | null;
      error: string | null;
      created_at: string;
    }>`
      SELECT task_id, task, status, output, error, created_at
      FROM code_log
      ORDER BY created_at DESC
    `;
    return rows.map((r) => ({
      taskId: r.task_id,
      task: r.task,
      status: r.status,
      output: r.output,
      error: r.error,
      createdAt: r.created_at,
    }));
  }
}
