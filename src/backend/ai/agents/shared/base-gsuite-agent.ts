/**
 * @fileoverview BaseGsuiteAgent — the shared abstract Durable Object base class
 * for every Google Workspace specialist agent in `core-gsuite-tools`.
 *
 * Every specialist agent (Gmail, Docs, Sheets, Slides, Apps Script, Drive)
 * extends this class. It centralizes:
 *
 *  - **Chat streaming** (`onChatMessage`) — bridges the persisted `AIChatAgent`
 *    message history to the Vercel AI SDK `streamText` loop, driven by Workers AI
 *    routed through AI Gateway, with each agent's registered AI tool set wired in.
 *  - **Skills** (`getSkills`) — returns the agent's bundled `SKILL.md` documents.
 *    The `agents:skills` virtual import is NOT wired in `agents@0.12.4`, so skills
 *    are bundled as static text imports per agent and surfaced here.
 *  - **Skill script runner** (`getSkillScriptRunner`) — a thin wrapper over
 *    `env.WORKER_LOADERS` for executing skill-authored helper scripts.
 *  - **Task telemetry** (`recordTask`, `logTaskEvent`) — persists task lifecycle
 *    and append-only progress events to D1 so the UI canvas can poll live status.
 *  - **Account resolution** (`resolve`) — turns an optional `"workspace" |
 *    "personal"` hint into a concrete {@link GoogleAccount}.
 *
 * The Agents SDK in this version does not export `AIChatAgent` from the root
 * `agents` entry; it is re-exported from `@cloudflare/ai-chat` via the
 * `agents/ai-chat-agent` subpath, which is the import used here.
 *
 * @see https://developers.cloudflare.com/agents/
 */

import { callable } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { createWorkersAI } from "workers-ai-provider";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { RagCorpus } from "@/backend/ai/rag";

import { resolveAccount } from "@/backend/auth/provider";
import { getDb } from "@/backend/db";
import { ingestDocument } from "@/backend/ai/rag";
// ponytail: SRC's table is named `tasks`, but this worker's `tasks` D1 table is
// already a distinct project-management domain — imported/renamed as
// `agentTasks` (backed by the `agent_tasks` SQL table) to avoid the collision.
import { agentTasks, scheduledTasks, taskEvents } from "@db/schemas";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/**
 * A single bundled skill document discovered for an agent.
 */
export interface AgentSkill {
  /** Skill slug, e.g. `"format-from-markdown"`. */
  name: string;
  /** One-line human-readable description (first heading / front-matter). */
  description: string;
  /** Full Markdown body of the `SKILL.md`. */
  content: string;
  /** Where the skill came from. Bundled skills ship in the Worker. */
  source: "bundled" | "r2";
}

/**
 * Minimal signature of a skill helper script runner backed by `WORKER_LOADERS`.
 */
export interface SkillScriptRunner {
  /**
   * Load and run an ephemeral worker module exposing a default export fetch
   * handler, returning the worker stub for RPC / fetch invocation.
   *
   * @param id     Stable id for the loaded worker (enables caching/reuse).
   * @param code   ES module source code for the skill helper.
   */
  load(id: string, code: string): WorkerStub;
}

/**
 * Shape used to upsert a row in the `tasks` table.
 */
export interface RecordTaskInput {
  /** Stable task id. When omitted a UUID is generated. */
  id?: string;
  /** Task category — matches the specialist agent surface. */
  kind: (typeof agentTasks.$inferInsert)["kind"];
  /** Human-readable task title. */
  title: string;
  /** Lifecycle status. Defaults to `"pending"`. */
  status?: (typeof agentTasks.$inferInsert)["status"];
  /** Google account context. Defaults to the agent's resolved account. */
  account?: GoogleAccount;
  /** Originating session id, if any. */
  sessionId?: string;
  /** Originating thread id, if any. */
  threadId?: string;
  /** The produced Google file id, once known. */
  googleFileId?: string;
  /** The produced Google file URL, once known. */
  googleFileUrl?: string;
  /** Where the task was initiated. Defaults to `"rpc"`. */
  source?: (typeof agentTasks.$inferInsert)["source"];
  /** Arbitrary structured metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// BaseGsuiteAgent
// ---------------------------------------------------------------------------

/**
 * Abstract base for all Google Workspace specialist agents.
 *
 * Subclasses MUST:
 *  - instantiate their Google client(s) in `onStart`,
 *  - implement {@link getAgentName} (the canonical task `agent` / `kind` value),
 *  - implement {@link getChatTools} to expose their callable surface to chat,
 *  - optionally override {@link getBundledSkills} to return their `SKILL.md`s,
 *  - optionally override {@link getSystemPrompt} to specialize chat behavior.
 *
 * @template State Per-agent persisted state shape (defaults to `unknown`).
 */
export abstract class BaseGsuiteAgent<
  State = unknown,
> extends AIChatAgent<Env, State> {
  /**
   * The default Google account this agent operates against. Resolved lazily
   * from the environment on first use; specialist methods accept an explicit
   * override per call.
   */
  protected defaultAccount: GoogleAccount = "workspace";

  // -------------------------------------------------------------------------
  // Abstract surface — subclasses implement
  // -------------------------------------------------------------------------

  /**
   * Canonical agent name used for `tasks.agent`, `tasks.kind`, skill lookup,
   * and routing from the orchestrator. e.g. `"gmail"`, `"docs"`.
   */
  protected abstract getAgentName(): string;

  /**
   * The AI SDK tool set this agent exposes to the chat model. Each tool's
   * `execute` should delegate to the same underlying client method as the
   * corresponding `@callable()` RPC method so chat and RPC stay in lockstep.
   */
  protected abstract getChatTools(account: GoogleAccount): ToolSet;

  /**
   * Dispatch a catalog action to the underlying client/method for one account.
   *
   * Each specialist agent implements a switch mapping a catalog action name
   * (see `shared/action-catalog.ts`) plus its parameter map and a resolved
   * account to the corresponding `@callable`/client call. This is the single
   * execution seam used by the scheduler (`runGsuiteTask`).
   *
   * @param action  Catalog action name (e.g. `"listLabels"`).
   * @param params  Parameter map keyed by the action's `ParamDef.name`s.
   * @param account The target account selector for this run.
   * @returns The raw action result (shape varies per action).
   */
  protected abstract executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown>;

  /**
   * Bundled `SKILL.md` documents for this agent. Default is empty; specialist
   * agents override to return their statically-imported skill docs.
   *
   * NOTE: `agents@0.12.4` does not wire the `agents:skills` virtual module, so
   * skills are bundled as static string imports rather than resolved at runtime.
   */
  protected getBundledSkills(): AgentSkill[] {
    return [];
  }

  /**
   * System prompt fragment prepended to every chat turn. Subclasses override
   * to specialize tone and capabilities; the base provides a generic preamble
   * that injects the agent's bundled skills as context.
   */
  protected getSystemPrompt(): string {
    const skills = this.getBundledSkills();
    const skillBlock = skills.length
      ? `\n\nYou have the following skills available. Apply them when relevant:\n${skills
          .map((s) => `- **${s.name}**: ${s.description}`)
          .join("\n")}`
      : "";

    return (
      `You are the ${this.getAgentName()} specialist agent for a Google Workspace ` +
      `automation platform. Use the provided tools to take real actions on the ` +
      `user's Google Workspace. Be concise and confirm what you did, including any ` +
      `links to created or modified files.${skillBlock}`
    );
  }

  // -------------------------------------------------------------------------
  // Chat streaming
  // -------------------------------------------------------------------------

  /**
   * Stream a chat response for the current turn.
   *
   * Bridges the persisted `AIChatAgent` UI message history to the AI SDK
   * `streamText` tool loop, driven by Workers AI routed through AI Gateway. The
   * agent's registered tools are wired in so the model can take real Workspace
   * actions mid-conversation. The resulting UI message stream is persisted by
   * the base `AIChatAgent` via the supplied `onFinish` callback.
   *
   * @param onFinish Callback invoked by the SDK when the assistant turn ends.
   * @returns A streaming `Response` consumed by the assistant-ui client.
   */
  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
  ): Promise<Response | undefined> {
    const account = this.defaultAccount;
    const model = this.getLanguageModel();
    const tools = this.getChatTools(account);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system: this.getSystemPrompt(),
          messages: await convertToModelMessages(this.messages as UIMessage[]),
          tools,
          // Allow the model to chain tool calls then summarize for the user.
          stopWhen: stepCountIs(8),
          onFinish,
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Construct an AI SDK `LanguageModel` backed by Workers AI and routed through
   * AI Gateway for caching, observability, and cost control. The model id is
   * resolved from `env.MODEL_CHAT`.
   */
  protected getLanguageModel() {
    const workersai = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: this.env.AI_GATEWAY_ID },
    });

    return workersai.chat(
      (this.env.MODEL_CHAT as string) || "@cf/openai/gpt-oss-120b",
    );
  }

  // -------------------------------------------------------------------------
  // Skills
  // -------------------------------------------------------------------------

  /**
   * Return the skills available to this agent.
   *
   * In `agents@0.12.4` the `agents:skills` virtual import is not wired, so this
   * returns the agent's statically-bundled skill documents. When/if the virtual
   * module becomes available, this is the single seam to swap in
   * `skills.fromManifest`.
   */
  getSkills(): AgentSkill[] {
    return this.getBundledSkills();
  }

  /**
   * Return a skill script runner backed by `env.WORKER_LOADERS`.
   *
   * Skills may ship helper scripts that need to run in an isolated worker; this
   * exposes the loader so a skill can `load(id, code)` and invoke the resulting
   * stub. Returns `undefined` if the binding is not configured.
   */
  getSkillScriptRunner(): SkillScriptRunner | undefined {
    const loader = this.env.WORKER_LOADERS;
    if (!loader) return undefined;

    return {
      load: (id: string, code: string): WorkerStub =>
        loader.get(id, () => ({ compatibilityDate: "2025-01-01", mainModule: "main.js", modules: { "main.js": code } })),
    };
  }

  // -------------------------------------------------------------------------
  // Account resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve an optional account hint to a concrete {@link GoogleAccount}.
   *
   * @param input Optional `"workspace" | "personal"` (or any string) hint.
   * @returns The resolved account, defaulting to this agent's default account.
   */
  protected resolve(input?: string): GoogleAccount {
    if (!input) return this.defaultAccount;
    return resolveAccount(this.env, input);
  }

  // -------------------------------------------------------------------------
  // Task telemetry (D1)
  // -------------------------------------------------------------------------

  /**
   * Upsert a row in the `tasks` table. Returns the persisted task id.
   *
   * Used by specialist methods to register a unit of work and, later, to attach
   * the produced Google file id/URL and final status. The companion
   * {@link logTaskEvent} appends live progress for the UI canvas.
   *
   * @param input Task fields. `kind`/`title` are required; the rest default.
   * @returns The task id (generated when not supplied).
   */
  protected async recordTask(input: RecordTaskInput): Promise<string> {
    const db = getDb(this.env);
    const id = input.id ?? crypto.randomUUID();
    const now = new Date();

    await db
      .insert(agentTasks)
      .values({
        id,
        kind: input.kind,
        title: input.title,
        status: input.status ?? "pending",
        account: input.account ?? this.defaultAccount,
        agent: this.getAgentName(),
        sessionId: input.sessionId,
        threadId: input.threadId,
        googleFileId: input.googleFileId,
        googleFileUrl: input.googleFileUrl,
        source: input.source ?? "rpc",
        createdAt: now,
        updatedAt: now,
        metadataJson: input.metadata,
      })
      .onConflictDoUpdate({
        target: agentTasks.id,
        set: {
          status: input.status ?? "pending",
          title: input.title,
          googleFileId: input.googleFileId,
          googleFileUrl: input.googleFileUrl,
          updatedAt: now,
          metadataJson: input.metadata,
        },
      });

    return id;
  }

  /**
   * Append an event to the live, append-only `task_events` feed for a task.
   *
   * The frontend canvas polls `/api/tasks/{id}/events` for these, so call this
   * at each meaningful milestone (started, created file, applied edits, done,
   * error).
   *
   * @param taskId  The task this event belongs to.
   * @param type    Short event type, e.g. `"started"`, `"artifact"`, `"error"`.
   * @param message Human-readable progress line.
   * @param data    Optional structured payload (ids, counts, links).
   */
  protected async logTaskEvent(
    taskId: string,
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const db = getDb(this.env);
    await db.insert(taskEvents).values({
      id: crypto.randomUUID(),
      taskId,
      ts: new Date(),
      type,
      message,
      dataJson: data,
    });
  }

  // -------------------------------------------------------------------------
  // Scheduled-task lifecycle (Agents SDK scheduling)
  //
  // DO-INSTANCE NAMING SCHEME: all scheduled-task RPCs target ONE singleton DO
  // instance per agent surface, named "scheduler" (resolved by the Hono routes
  // via `getAgentByName(env.<AGENT>_AGENT, "scheduler")`). A single scheduler
  // instance owns every schedule for its surface; the `defId` is carried as the
  // callback payload so `runGsuiteTask` can load the right `scheduledTasks` row.
  // This keeps alarms colocated and `cancelSchedule(id)` owner-matched.
  // -------------------------------------------------------------------------

  /**
   * Register the Agents SDK schedule(s) for a saved scheduled-task definition.
   *
   * Loads the `scheduledTasks` row by id and, based on its `frequency`, registers
   * a schedule that fires {@link runGsuiteTask} with the def id as payload:
   *  - `once`     → `this.schedule(new Date(spec), "runGsuiteTask", { defId })`
   *  - `cron`     → `this.schedule(spec, "runGsuiteTask", { defId })`
   *  - `interval` → `this.scheduleEvery(Number(spec), "runGsuiteTask", { defId })`
   *  - `on_demand`→ no schedule registered.
   *
   * Persists the returned schedule id(s) to `scheduleIdsJson` and sets `nextRunAt`.
   *
   * @param defId The `scheduledTasks.id` to schedule.
   * @returns The created schedule ids and the next run timestamp (epoch ms) if any.
   */
  @callable()
  async scheduleGsuiteTask(
    defId: string,
  ): Promise<{ scheduleIds: string[]; nextRunAt: number | null }> {
    const db = getDb(this.env);
    const rows = await db
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.id, defId))
      .limit(1);
    const def = rows[0];
    if (!def) throw new Error(`scheduledTask ${defId} not found`);

    const scheduleIds: string[] = [];
    let nextRunAt: number | null = null;

    if (def.frequency !== "on_demand") {
      const spec = def.scheduleSpec ?? "";
      if (def.frequency === "once") {
        const when = new Date(spec);
        const s = await this.schedule(when, "runGsuiteTask", { defId });
        scheduleIds.push(s.id);
        nextRunAt = when.getTime();
      } else if (def.frequency === "cron") {
        const s = await this.schedule(spec, "runGsuiteTask", { defId });
        scheduleIds.push(s.id);
        nextRunAt = s.time != null ? Number(s.time) * 1000 : null;
      } else if (def.frequency === "interval") {
        const seconds = Number(spec);
        const s = await this.scheduleEvery(seconds, "runGsuiteTask", { defId });
        scheduleIds.push(s.id);
        nextRunAt = Date.now() + seconds * 1000;
      }
    }

    await db
      .update(scheduledTasks)
      .set({
        scheduleIdsJson: scheduleIds,
        nextRunAt: nextRunAt != null ? new Date(nextRunAt) : null,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(scheduledTasks.id, defId));

    return { scheduleIds, nextRunAt };
  }

  /**
   * The scheduled callback that executes a saved task definition.
   *
   * This is the real method name registered with the Agents SDK scheduler (and
   * also invoked directly for on-demand "run now"). For each target account it:
   *  1. creates a `tasks` run row + `taskEvents` progress feed,
   *  2. invokes {@link executeAction} (the per-agent dispatch),
   *  3. optionally stores the raw result in D1 (`indexToD1`),
   *  4. optionally embeds the result into a RAG corpus (`indexVectorizeCorpus`),
   *  5. optionally runs an LLM step over the result (`promptText`),
   *  6. updates `lastRunAt` / `nextRunAt` / `status` on the definition.
   *
   * It MUST NEVER throw: per-account failures are caught and logged as error
   * events so the scheduler alarm is not poisoned.
   *
   * @param payload The def id to run.
   */
  async runGsuiteTask(payload: { defId: string }): Promise<void> {
    const db = getDb(this.env);
    try {
      const rows = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, payload.defId))
        .limit(1);
      const def = rows[0];
      if (!def) return;

      const accounts = Array.isArray(def.accountsJson) ? def.accountsJson : [];
      const params = (def.paramsJson ?? {}) as Record<string, unknown>;

      for (const account of accounts) {
        const acct = this.resolve(account);
        const taskId = await this.recordTask({
          kind: this.getAgentName() as RecordTaskInput["kind"],
          title: def.title,
          status: "running",
          account: acct,
          source: (def.source as RecordTaskInput["source"]) ?? "ui",
          metadata: { defId: def.id, action: def.action },
        });
        try {
          await this.logTaskEvent(taskId, "started", `Running ${def.action} for ${account}`);
          // Mirror a def-level event so GET /api/tasks/:id surfaces run history.
          await this.logTaskEvent(def.id, "run_started", `Run started for ${account}`, { runId: taskId });
          const result = await this.executeAction(def.action, params, account);

          if (def.indexToD1) {
            await this.recordTask({
              id: taskId,
              kind: this.getAgentName() as RecordTaskInput["kind"],
              title: def.title,
              status: "running",
              account: acct,
              metadata: { defId: def.id, action: def.action, result },
            });
            await this.logTaskEvent(taskId, "result", "Stored raw result in D1");
          }

          if (def.indexVectorizeCorpus) {
            const text = typeof result === "string" ? result : JSON.stringify(result);
            await ingestDocument(this.env, def.indexVectorizeCorpus as RagCorpus, {
              id: `${def.id}:${taskId}`,
              account: acct,
              title: def.title,
              text,
            });
            await this.logTaskEvent(taskId, "indexed", `Embedded result into ${def.indexVectorizeCorpus} corpus`);
          }

          if (def.promptText) {
            const llm = await this.runPromptStep(def.promptText, result);
            await this.logTaskEvent(taskId, "prompt", "Ran LLM step over result", { output: llm });
          }

          await this.recordTask({
            id: taskId,
            kind: this.getAgentName() as RecordTaskInput["kind"],
            title: def.title,
            status: "done",
            account: acct,
          });
          await this.logTaskEvent(taskId, "done", `Completed ${def.action} for ${account}`);
          await this.logTaskEvent(def.id, "run_done", `Run completed for ${account}`, { runId: taskId });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          await this.recordTask({
            id: taskId,
            kind: this.getAgentName() as RecordTaskInput["kind"],
            title: def.title,
            status: "error",
            account: acct,
          });
          await this.logTaskEvent(taskId, "error", msg);
          await this.logTaskEvent(def.id, "run_error", msg, { runId: taskId });
        }
      }

      // Update the definition's run bookkeeping.
      let nextRunAt: Date | null = null;
      let status: (typeof scheduledTasks.$inferInsert)["status"] = def.status;
      if (def.frequency === "interval") {
        nextRunAt = new Date(Date.now() + Number(def.scheduleSpec ?? 0) * 1000);
      } else if (def.frequency === "once") {
        status = "completed";
      }
      await db
        .update(scheduledTasks)
        .set({ lastRunAt: new Date(), nextRunAt, status, updatedAt: new Date() })
        .where(eq(scheduledTasks.id, def.id));
    } catch (error) {
      // Last-resort guard: never throw out of a scheduled callback.
      const msg = error instanceof Error ? error.message : String(error);
      try {
        await db
          .update(scheduledTasks)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(scheduledTasks.id, payload.defId));
      } catch {
        /* swallow */
      }
      console.error(`runGsuiteTask(${payload.defId}) failed:`, msg);
    }
  }

  /**
   * Cancel the Agents SDK schedules backing a definition.
   *
   * @param scheduleIds The schedule ids previously stored in `scheduleIdsJson`.
   */
  @callable()
  async cancelGsuiteTask(scheduleIds: string[]): Promise<void> {
    for (const id of scheduleIds) {
      try {
        await this.cancelSchedule(id);
      } catch (error) {
        console.error(`cancelSchedule(${id}) failed:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  /**
   * Run the optional natural-language prompt step over an action result.
   *
   * The action result is supplied to the model as context; the model's text
   * output is returned (and logged as a `prompt` task event by the caller).
   *
   * @param prompt The user's natural-language instruction.
   * @param result The raw action result to reason over.
   * @returns The model's text output (empty string on failure).
   */
  protected async runPromptStep(prompt: string, result: unknown): Promise<string> {
    try {
      const context = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      const { text } = await generateText({
        model: this.getLanguageModel(),
        system: this.getSystemPrompt(),
        prompt: `${prompt}\n\n--- Action result (context) ---\n${context}`,
      });
      return text;
    } catch (error) {
      console.error("runPromptStep failed:", error instanceof Error ? error.message : String(error));
      return "";
    }
  }
}
