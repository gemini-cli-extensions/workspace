/**
 * @fileoverview ResearcherAgent — a specialist sub-agent the OrchestratorAgent
 * delegates research/analysis tasks to.
 *
 * This is a plain Cloudflare Agents SDK `Agent` (no chat UI of its own). It
 * exposes a single `@callable research(task)` RPC that the orchestrator invokes
 * via `getAgentByName(env.RESEARCHER_AGENT, ...)` then `await stub.research(...)`.
 * The method performs a *real* Workers AI `generateText` call and persists every
 * delegation to embedded SQLite so the work is observable and auditable.
 *
 * ## Wire contract
 * - Binding: `RESEARCHER_AGENT`
 * - Kebab name (for `useAgent`/routing): `researcher-agent`
 * - RPC: `research(task: string): Promise<DelegationResult>`
 * - RPC: `history(): Promise<DelegationRecord[]>`
 *
 * The orchestrator is the primary caller; the frontend may also subscribe to a
 * `researcher-agent` instance directly to watch `setState` updates.
 */

import { Agent, callable } from "agents";
import { generateText } from "ai";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";

/** Result returned to the orchestrator for a single delegated research task. */
export interface DelegationResult {
  /** The specialist that produced the result (always `"researcher"`). */
  agent: "researcher";
  /** Unique id for this delegation, also stored in SQLite. */
  taskId: string;
  /** `"completed"` when the model returned output, `"failed"` on error. */
  status: "completed" | "failed";
  /** The model's research output (present when `status === "completed"`). */
  output?: string;
  /** Error message (present when `status === "failed"`). */
  error?: string;
  /** Wall-clock duration of the model call, in milliseconds. */
  durationMs: number;
}

/** A persisted delegation row, returned by {@link ResearcherAgent.history}. */
export interface DelegationRecord {
  taskId: string;
  task: string;
  status: string;
  output: string | null;
  error: string | null;
  createdAt: string;
}

/** Synced state so a subscribed client can watch the researcher work live. */
export interface ResearcherState {
  /** Total tasks delegated to this researcher. */
  totalTasks: number;
  /** The most recent task description, or null before any work. */
  lastTask: string | null;
  /** Whether a model call is currently in flight. */
  busy: boolean;
}

const SYSTEM_PROMPT = `You are a research specialist sub-agent in a multi-agent system.
Given a task, produce a concise, well-structured research brief.
Use short bullet points. Lead with the single most important finding.
Never fabricate citations; if you are unsure, say so explicitly.`;

export class ResearcherAgent extends Agent<Env, ResearcherState> {
  /** Default synced state before any task runs. */
  initialState: ResearcherState = { totalTasks: 0, lastTask: null, busy: false };

  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "ResearcherAgent",
      className: "ResearcherAgent",
      description:
        "Research specialist sub-agent. Delegated to by the OrchestratorAgent via getAgentByName RPC. Runs a real Workers AI generateText call per task and persists results to embedded SQLite.",
      docsPath: "/docs/agents/researcher",
      methods: [
        {
          name: "research",
          description: "Run a real research task through Workers AI and persist the result.",
          params: "task: string",
          returns: "Promise<DelegationResult>",
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
      CREATE TABLE IF NOT EXISTS research_log (
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
   * Run a real research task. Invoked by the orchestrator over RPC.
   *
   * @param task - Natural-language research request.
   * @returns A {@link DelegationResult} with the model output or an error.
   */
  @callable()
  async research(task: string): Promise<DelegationResult> {
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
        maxOutputTokens: 1024,
        temperature: 0.3,
      });

      await this.sql`
        INSERT INTO research_log (task_id, task, status, output, error, created_at)
        VALUES (${taskId}, ${task}, 'completed', ${text}, ${null}, ${createdAt})
      `;
      this.setState({ ...this.state, busy: false });

      return {
        agent: "researcher",
        taskId,
        status: "completed",
        output: text,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.sql`
        INSERT INTO research_log (task_id, task, status, output, error, created_at)
        VALUES (${taskId}, ${task}, 'failed', ${null}, ${error}, ${createdAt})
      `;
      this.setState({ ...this.state, busy: false });

      return {
        agent: "researcher",
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
      FROM research_log
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
