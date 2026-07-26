/**
 * @fileoverview OrchestratorAgent — the top-level chat agent that routes a user
 * request to the right Google Workspace specialist.
 *
 * The orchestrator owns the primary chat thread. For any action it dispatches to
 * a specialist Durable Object via `getAgentByName` (resolved in
 * {@link resolveSpecialist}) and calls the specialist's `@callable()` method.
 *
 * Routing is always through the typed `getAgentByName` RPC path — never via raw
 * namespace id lookups or DO fetch dispatch.
 */

import type { ChatResponseResult } from "agents/ai-chat-agent";

import { callable } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";

import type { OrchestratorHealth, SpecialistKind } from "@/backend/ai/agents/orchestrator/types";

import { checkOrchestratorHealth } from "@/backend/ai/agents/orchestrator/health";
import { resolveSpecialist } from "@/backend/ai/agents/orchestrator/methods/route";
import { mirrorTurnToD1 } from "@/backend/ai/agents/shared/d1-mirror";
import { buildWorkspaceToolSet } from "@/backend/ai/agents/shared/merged-tools";
import { resolveAccount } from "@/backend/auth/provider";

/**
 * Top-level routing chat agent. One instance per `name` (typically user id).
 */
export class OrchestratorAgent extends AIChatAgent<Env> {
  /**
   * Static documentation metadata for the agent catalog / docs UI.
   */
  static docsMetadata() {
    return {
      name: "Orchestrator",
      className: "OrchestratorAgent",
      description:
        "The primary chat orchestrator. Understands a request and routes it to the right Google Workspace specialist (Gmail, Docs, Sheets, Slides, Drive, Apps Script) via typed RPC.",
      docsPath: "/docs/agents/orchestrator",
      methods: [
        {
          name: "route",
          description: "Route a method call to a specialist",
          params: "kind, method, args[]",
          returns: "unknown",
        },
        {
          name: "healthProbe",
          description: "Aggregate specialist health",
          params: "(none)",
          returns: "OrchestratorHealth",
        },
      ],
      tools: ["Gmail", "Docs", "Sheets", "Slides", "Drive", "Apps Script"],
    };
  }

  // -------------------------------------------------------------------------
  // Chat streaming
  // -------------------------------------------------------------------------

  /**
   * Stream a chat response with the full flattened Workspace tool set so a
   * single thread can chain across surfaces.
   *
   * @param onFinish - AI SDK finish callback (the base class persists history).
   * @param options  - Per-turn options; `options.body.model` carries the chat
   *   model id selected in the UI's model picker (validated against an
   *   allow-list before use).
   */
  override async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { body?: Record<string, unknown> },
  ): Promise<Response | undefined> {
    const workersai = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: this.env.AI_GATEWAY_ID },
    });
    const model = workersai.chat(this.resolveModelId(options?.body?.model));

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system: this.getSystemPrompt(),
          messages: await convertToModelMessages(this.messages as UIMessage[]),
          tools: this.getChatTools(),
          // Allow long multi-surface chains (e.g. Gmail → Sheets → Apps Script)
          // to complete within a single turn.
          stopWhen: stepCountIs(16),
          onFinish,
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * The orchestrator's system prompt. Built as a single template literal with
   * real newlines (never `.join('\n')`/`+`) so the structure survives every
   * transport boundary intact.
   */
  private getSystemPrompt(): string {
    return `You are the single orchestrator chat for a Google Workspace automation platform, acting on behalf of the user across Gmail, Docs, Sheets, Slides, Drive, Apps Script, and Calendar.

You have direct tools for every surface, named \`<surface>_<action>\` (e.g. \`gmail_searchMessages\`, \`sheets_writeRange\`, \`drive_search\`, \`appscript_createStandalone\`, \`calendar_createEvent\`). Call them yourself — do not ask the user to switch agents.

Guidelines:
- Every tool accepts an optional \`account\` argument ('workspace' = default, 'personal', or an email). Pass \`account: 'personal'\` when the user refers to their personal Gmail/Drive; omit it otherwise to use the default workspace account.
- Plan multi-step work and chain tools across surfaces in one turn. Example: search Gmail, write the findings into a new Sheet, then create an Apps Script that automates the task on a scheduled trigger.
- Prefer reading/searching before mutating. Confirm destructive actions (delete, overwrite) in your summary.
- When you create or modify a Google file, include its link/id in your summary.
- If a step fails, report the error plainly and continue with what is still possible.
- Be concise; surface the concrete result, not a narration of every tool call.`;
  }

  /**
   * The orchestrator's chat tool set: the full, flattened Workspace tool surface
   * (every specialist tool, surface-namespaced) so a single thread can chain
   * across Gmail/Docs/Sheets/Slides/Drive/Apps Script/Calendar.
   */
  private getChatTools(): ToolSet {
    const account = resolveAccount(this.env);
    return buildWorkspaceToolSet(this.env, account);
  }

  /**
   * Resolve the chat model id for a turn. Honors the UI-selected model when it
   * is in the allow-list (prevents arbitrary model injection from the client),
   * otherwise falls back to the `MODEL_CHAT` env var or the platform default.
   *
   * Keep this allow-list in sync with `src/frontend/lib/models.ts` (`CHAT_MODELS`).
   *
   * @param requested - The raw `options.body.model` value from the client.
   */
  private resolveModelId(requested: unknown): string {
    const allowed = new Set([
      "@cf/openai/gpt-oss-120b",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/meta/llama-3.1-8b-instruct",
    ]);
    if (typeof requested === "string" && allowed.has(requested)) return requested;
    return (this.env.MODEL_CHAT as string) || "@cf/openai/gpt-oss-120b";
  }

  /**
   * Mirror each completed turn into D1 so chat history survives Durable Object
   * resets and is queryable via `/api/threads/:id/messages`. Fired after the
   * turn lock is released, so D1 writes never block streaming. Best-effort: a
   * D1 failure is logged but never breaks the chat (DO SQLite remains the live
   * source of truth).
   */
  protected override async onChatResponse(result: ChatResponseResult): Promise<void> {
    if (result.status !== "completed") return;
    try {
      await mirrorTurnToD1(this.env, this.name, this.messages as UIMessage[]);
    } catch (error) {
      console.error("[orchestrator] D1 mirror failed", {
        name: this.name,
        requestId: result.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /**
   * Route a method call to a specialist agent via `getAgentByName` RPC.
   *
   * @param kind   Which specialist to route to.
   * @param method The `@callable()` method to invoke on the specialist.
   * @param args   Positional arguments forwarded to the method.
   * @returns The specialist method's return value.
   */
  @callable()
  async route(kind: SpecialistKind, method: string, args: unknown[] = []) {
    const stub = await resolveSpecialist(this.env, kind, this.name);
    const target = stub as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    const fn = target[method];
    if (typeof fn !== "function") {
      throw new Error(`Unknown method "${method}" on specialist "${kind}"`);
    }
    return fn.apply(target, args);
  }

  /**
   * Aggregate health across all specialists.
   */
  @callable()
  async healthProbe(): Promise<OrchestratorHealth> {
    return checkOrchestratorHealth(this.env, this.name);
  }
}
