/**
 * @fileoverview Cloudflare Workers entry point for Astro SSR + Hono API (the
 * `workerEntryPoint` for `@astrojs/cloudflare`), now also wiring the
 * Cloudflare Agents SDK Durable Object agents + `GsuiteService` RPC
 * entrypoint ported from `core-gsuite-tools` (Phase 2).
 *
 * The adapter's generated `dist/_worker.js/index.js`:
 *   1. calls `start(manifest, args)` (if exported) to hand us the SSR manifest,
 *   2. calls `createExports()` to get the default fetch handler PLUS every
 *      named Durable Object / RPC class the runtime must instantiate,
 *   3. re-exports those as the module's exports.
 *
 * Our handler routes (in order):
 *   - `/mcp`              → the stateless MCP request handler
 *   - `/auth/google*`     → the Google OAuth handler
 *   - MCP OAuth authorization server (`/register`, `/authorize`, `/token`,
 *     `/.well-known/oauth-*`)
 *   - `/agents/*` + WebSocket upgrades → `routeAgentRequest` (session-gated)
 *   - `/api/*` + doc URLs → the Hono app
 *   - everything else     → Astro SSR via the adapter's `handle()` (which also
 *                           falls through to the `ASSETS` binding for static
 *                           files).
 *
 * `astro.config.ts` `workerEntryPoint.namedExports` must list the same DO/RPC
 * names re-exported here.
 */

import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import type { ExportedHandler } from "@cloudflare/workers-types";
import { routeAgentRequest } from "agents";

import { app as honoApp } from "./backend/api/index";
import { handleMcpRequest } from "./backend/mcp/server"; // added in Task 14
import { handleGoogleAuth } from "./backend/api/routes/auth-google"; // added in Task 6
import { handleOAuth } from "./backend/mcp/oauth"; // MCP OAuth authorization server

import { getWorkerApiKey } from "./backend/utils/secrets";
import { verifySessionToken } from "./backend/auth/session-token";
import { readVerifiedSession } from "./backend/auth/read-session";
import {
  AppsScriptAgent,
  CalendarAgent,
  DocsAgent,
  DriveAgent,
  GmailAgent,
  OrchestratorAgent,
  SheetsAgent,
  SlidesAgent,
} from "./backend/ai/agents";
import { GsuiteService } from "./backend/rpc";

// Re-export Durable Object agent classes + the RPC entrypoint so the Astro
// Cloudflare adapter (and wrangler's `durable_objects`/service bindings) can
// find them on this module. Must match `astro.config.ts`
// `workerEntryPoint.namedExports` and `wrangler.jsonc` `durable_objects.bindings`.
export {
  OrchestratorAgent,
  GmailAgent,
  DocsAgent,
  SheetsAgent,
  SlidesAgent,
  AppsScriptAgent,
  DriveAgent,
  CalendarAgent,
  GsuiteService,
};

/** True for paths the Hono API owns (REST + OpenAPI doc surfaces). */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar"
  );
}

/**
 * Authenticate an Agents SDK request (WebSocket or HTTP chat/agent call).
 * `routeAgentRequest` will happily serve any client that knows the agent
 * class + instance `name`, so without this gate one caller could read
 * another's chat history / task state.
 *
 * Accepts either:
 *  - the worker API key or a signed session token as `?token=`/`?AGENT_AUTH=`
 *    query param or `Authorization: Bearer <...>` header (parity with the
 *    `core-gsuite-tools` source), or
 *  - the browser's own `gsuite_session` cookie (same-origin WS/HTTP requests
 *    carry it automatically) via `readVerifiedSession`.
 */
async function isAuthorizedAgentRequest(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  const presented =
    url.searchParams.get("token") ??
    url.searchParams.get("AGENT_AUTH") ??
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (presented) {
    const workerKey = await getWorkerApiKey(env);
    if (workerKey && presented === workerKey) return true;
    if (await verifySessionToken(env, presented)) return true;
  }
  const { authed } = await readVerifiedSession(env, request);
  return authed;
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
 * Build the worker's default fetch handler. Invoked by the adapter's
 * generated entry (after `start`).
 *
 * NOTE: `request as any` at the call sites bridges the lib.dom (Hono) vs
 * @cloudflare/workers-types `Request` type friction.
 */
function makeHandler(): ExportedHandler<Env> {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const url = new URL(request.url);

      if (url.pathname === "/mcp") {
        return handleMcpRequest(request as any, env, ctx);
      }
      if (url.pathname.startsWith("/auth/google")) {
        return handleGoogleAuth(request as any, env);
      }
      // MCP OAuth authorization server: /.well-known/oauth-*, /register,
      // /authorize, /token. Returns null for any non-OAuth path.
      const oauthResponse = await handleOAuth(request as any, env);
      if (oauthResponse) return oauthResponse;

      // Cloudflare Agents SDK: WebSocket chat + agent HTTP routing under
      // /agents/*. Session-gated — see `isAuthorizedAgentRequest`.
      if (url.pathname.startsWith("/agents/") || request.headers.get("upgrade") === "websocket") {
        if (!(await isAuthorizedAgentRequest(request, env))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const agentResponse = await routeAgentRequest(request as any, env as any);
        if (agentResponse) return agentResponse as unknown as Response;
      }

      if (isApiPath(url.pathname)) {
        return honoApp.fetch(request as any, env, ctx);
      }
      if (astroApp) {
        return handle(astroManifest, astroApp, request as any, env as any, ctx as any);
      }
      return env.ASSETS.fetch(request as any);
    },
  } as unknown as ExportedHandler<Env>;
}

export function createExports() {
  return {
    default: makeHandler(),
    OrchestratorAgent,
    GmailAgent,
    DocsAgent,
    SheetsAgent,
    SlidesAgent,
    AppsScriptAgent,
    DriveAgent,
    CalendarAgent,
    GsuiteService,
  };
}

export default makeHandler();
