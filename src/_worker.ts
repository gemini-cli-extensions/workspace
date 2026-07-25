/**
 * @fileoverview Cloudflare Workers entry point for Astro SSR + Hono API +
 * Durable Objects (the `workerEntryPoint` for `@astrojs/cloudflare`).
 *
 * The adapter's generated `dist/_worker.js/index.js`:
 *   1. calls `start(manifest, args)` (if exported) to hand us the SSR manifest,
 *   2. calls `createExports()` to get the default fetch handler + DO classes,
 *   3. re-exports those DO classes alongside the default handler.
 *
 * Our handler routes:
 *   - `/agents/*`        → the Agents SDK router (`routeAgentRequest`)
 *   - `/api/*` + doc URLs → the Hono app
 *   - everything else    → Astro SSR via the adapter's `handle()` (which also
 *                          falls through to the `ASSETS` binding for static
 *                          files). This is the piece a naive `env.ASSETS.fetch`
 *                          custom entry forgets — without it, SSR pages 404.
 *
 * In addition to `fetch`, the handler exports `email(message, env, ctx)` —
 * Cloudflare Email Routing's inbound entry point. It parses + stores received
 * mail in D1 for the `/inbox` showcase (see `backend/email/inbound.ts`). The
 * handler is attached to BOTH the object returned by `createExports().default`
 * (what the Astro adapter re-exports) AND the standalone default export.
 */

import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import type { ExportedHandler } from "@cloudflare/workers-types";
import { routeAgentRequest } from "agents";

import { app as honoApp } from "./backend/api/index";
import { handleInboundEmail } from "./backend/email/inbound";

// Import Durable Object classes (the Agents SDK showcase + realtime agents)
import { CodeModeAgent } from "./backend/ai/agents/CodeModeAgent";
import { BrowserHitlAgent } from "./backend/ai/agents/BrowserHitlAgent";
import { WorkflowsAgent } from "./backend/ai/agents/WorkflowsAgent";
import { ArtifactAgent } from "./backend/ai/agents/ArtifactAgent";
import { OrchestratorAgent } from "./backend/ai/agents/OrchestratorAgent";
import { ResearcherAgent } from "./backend/ai/agents/ResearcherAgent";
import { CoderAgent } from "./backend/ai/agents/CoderAgent";
import { ChatBroker } from "./backend/ai/agents/ChatBroker";
import { NotificationsAgent } from "./backend/ai/agents/NotificationsAgent";
import { McpAgent } from "./backend/ai/agents/McpAgent";
import { ThinkingAgent } from "./backend/ai/agents/ThinkingAgent";
import { SkillsAgent } from "./backend/ai/agents/SkillsAgent";

// Re-export Durable Object classes (Pattern B: the @astrojs/cloudflare adapter
// re-exports these alongside the default handler so Cloudflare resolves every
// DO binding declared in wrangler.jsonc).
export {
  CodeModeAgent,
  BrowserHitlAgent,
  WorkflowsAgent,
  ArtifactAgent,
  OrchestratorAgent,
  ResearcherAgent,
  CoderAgent,
  ChatBroker,
  NotificationsAgent,
  McpAgent,
  ThinkingAgent,
  SkillsAgent,
};

/** True for paths the Hono API owns (REST + OpenAPI doc surfaces). */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar" ||
    pathname === "/scaler"
  );
  // NOTE: `/docs` is intentionally NOT an API path — it is served as an Astro
  // SSR page (`src/frontend/pages/docs/index.astro`). The docs metadata API is
  // mounted at `/api/docs/*`, which is covered by the `/api/` prefix above.
}

// Astro SSR app + manifest, populated by `start()` before the first request.
let astroApp: App | undefined;
let astroManifest: any;

/**
 * Called by the adapter's generated entry with the SSR manifest. We build the
 * Astro `App` here so the fetch handler can render pages.
 */
export function start(manifest: any, _args: unknown) {
  astroManifest = manifest;
  astroApp = new App(manifest);
}

/**
 * Build the worker's default fetch handler + the DO class exports. Invoked by
 * the adapter's generated entry (after `start`).
 *
 * NOTE: `request as any` at the call sites bridges the lib.dom (Hono) vs
 * @cloudflare/workers-types (`agents` / ASSETS / Astro) `Request` type friction.
 */
export function createExports() {
  const handler = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const url = new URL(request.url);

      // 1. Agents SDK WebSocket/HTTP routing: /agents/:agent-name/:instance.
      if (url.pathname.startsWith("/agents/")) {
        const agentResponse = await routeAgentRequest(request as any, env);
        if (agentResponse) return agentResponse;
      }

      // 2. REST API + OpenAPI docs → Hono.
      if (isApiPath(url.pathname)) {
        return honoApp.fetch(request as any, env, ctx);
      }

      // 3. Everything else → Astro SSR (with static-asset fallthrough).
      if (astroApp) {
        return handle(astroManifest, astroApp, request as any, env as any, ctx as any);
      }
      return env.ASSETS.fetch(request as any);
    },

    // Cloudflare Email Routing inbound handler. Invoked when a routing rule
    // targets this Worker (configured in the dashboard / via `wrangler email
    // routing`). Parses + stores the email in D1 for the `/inbox` showcase.
    async email(message: any, env: Env, ctx: ExecutionContext) {
      await handleInboundEmail(message, env, ctx);
    },
  } as unknown as ExportedHandler<Env>;

  return {
    default: handler,
    CodeModeAgent,
    BrowserHitlAgent,
    WorkflowsAgent,
    ArtifactAgent,
    OrchestratorAgent,
    ResearcherAgent,
    CoderAgent,
    ChatBroker,
    NotificationsAgent,
    McpAgent,
    ThinkingAgent,
    SkillsAgent,
  };
}

/**
 * Default export for standalone (non-Astro) usage. The Astro build uses
 * `createExports().default` instead; this exists only so the module is also a
 * valid Worker on its own (no SSR — API + assets only).
 */
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/agents/")) {
      const agentResponse = await routeAgentRequest(request as any, env);
      if (agentResponse) return agentResponse;
    }
    if (isApiPath(url.pathname)) {
      return honoApp.fetch(request as any, env, ctx);
    }
    return env.ASSETS.fetch(request as any);
  },

  // Email Routing inbound handler (mirrors the one on `createExports().default`)
  // so this module is a valid standalone Worker target for a routing rule too.
  async email(message: any, env: Env, ctx: ExecutionContext) {
    await handleInboundEmail(message, env, ctx);
  },
} as unknown as ExportedHandler<Env>;

export default handler;
