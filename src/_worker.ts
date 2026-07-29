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
import { syncLabelsForAllAccounts } from "./backend/gmail/sync-service";
import { captureAllAccounts } from "./backend/gmail/capture-service";
import { purgeOldRenders } from "./backend/docs/browser-render";
import { handleGoogleAuth } from "./backend/api/routes/auth-google"; // added in Task 6
import { handleOAuth } from "./backend/mcp/oauth"; // MCP OAuth authorization server

import { getWorkerApiKey } from "./backend/utils/secrets";
import { verifySessionToken } from "./backend/auth/session-token";
import { readVerifiedSession } from "./backend/auth/read-session";
import { constantTimeEqual } from "./backend/lib/crypto";
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
import { CircuitBreaker, getBreaker, type CircuitKind } from "./backend/circuit-breaker";

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
  CircuitBreaker,
};

// ---------------------------------------------------------------------------
// Billing circuit breaker — cheap hot-path kill guard.
//
// The DO (`src/backend/circuit-breaker.ts`) auto-trips on a per-minute usage
// spike and keeps this KV flag in sync on every open/close transition. The
// hot path below reads ONLY this flag (one KV read, edge-cached) — it never
// calls the DO directly, so the guard stays cheap even while blocking.
// ---------------------------------------------------------------------------

/** KV key the breaker DO writes on every open/close transition. */
const CIRCUIT_KV_FLAG_KEY = "circuit:open";

/**
 * Path prefixes that stay reachable even while the breaker is open, so the
 * owner can diagnose + reset: the control route itself, and every login path
 * needed to authenticate to reach it. `/api/auth` covers both the admin
 * cr_session login AND `/api/auth/google/oauth/*` (already a sub-path).
 */
const CIRCUIT_EXEMPT_PREFIXES = [
  "/api/admin/circuit",
  "/auth/google",
  "/api/auth",
  "/api/agent-session",
  "/circuit", // static status page, if/when one is added
];

function isCircuitExempt(pathname: string): boolean {
  return CIRCUIT_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

async function isCircuitOpen(env: Env): Promise<boolean> {
  try {
    const raw = await env.SESSIONS.get(CIRCUIT_KV_FLAG_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { open?: boolean }).open === true;
  } catch {
    // A corrupt/unreadable flag must never brick the whole worker — fail open.
    return false;
  }
}

/** Fire-and-forget usage recording. Never lets a DO error affect the response. */
function recordUsage(env: Env, ctx: ExecutionContext, kind: CircuitKind): void {
  ctx.waitUntil(getBreaker(env).record(kind).catch(() => {}));
}

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
 *  - `Authorization: Bearer <...>` header carrying the worker API key
 *    (constant-time compare) or a signed session token, or
 *  - the browser's own `gsuite_session` cookie (same-origin WS/HTTP requests
 *    carry it automatically) via `readVerifiedSession`.
 *
 * Deliberately does NOT accept a `?token=`/`?AGENT_AUTH=` query param: query
 * strings are logged by Cloudflare request logging/analytics, land in
 * `Referer` headers, and persist in browser history — an unacceptable place
 * to carry the master key (see I2 in the 2026-07-25 security audit).
 */
async function isAuthorizedAgentRequest(request: Request, env: Env): Promise<boolean> {
  const presented = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (presented) {
    const workerKey = await getWorkerApiKey(env);
    if (workerKey && constantTimeEqual(presented, workerKey)) return true;
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

      // Billing circuit breaker: the FIRST thing on every request, before all
      // other routing. One KV read; see the block above `isApiPath`.
      if (!isCircuitExempt(url.pathname) && (await isCircuitOpen(env))) {
        return new Response("Service temporarily unavailable (circuit breaker open)", {
          status: 503,
          headers: { "retry-after": "120" },
        });
      }

      if (url.pathname === "/mcp") {
        recordUsage(env, ctx, "tool");
        recordUsage(env, ctx, "request");
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
        // SECURITY TODO(multi-tenant): `isAuthorizedAgentRequest` only proves
        // the caller holds *a* valid credential — the credential carries no
        // subject/identity, so it does not bind the requested `<name>` path
        // segment to that caller. Every authenticated session can currently
        // address every agent DO instance (sessions are interchangeable).
        // Acceptable for single-tenant deployments only; before serving more
        // than one principal, derive the permitted instance name(s) from the
        // token's subject instead of trusting the caller-supplied path.
        recordUsage(env, ctx, "agent");
        const agentResponse = await routeAgentRequest(request as any, env as any);
        if (agentResponse) return agentResponse as unknown as Response;
      }

      if (isApiPath(url.pathname)) {
        recordUsage(env, ctx, "request");
        return honoApp.fetch(request as any, env, ctx);
      }
      if (astroApp) {
        recordUsage(env, ctx, "request");
        return handle(astroManifest, astroApp, request as any, env as any, ctx as any);
      }
      return env.ASSETS.fetch(request as any);
    },
    // Weekly cron (see wrangler.jsonc triggers.crons): reconcile the Gmail
    // label registry for every signed-in account.
    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
      // Reconcile labels, then ingest messages for capture-enabled labels.
      ctx.waitUntil(
        (async () => {
          await syncLabelsForAllAccounts(env);
          await captureAllAccounts(env);
          await purgeOldRenders(env); // drop QC screenshots older than 90 days
        })(),
      );
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
    CircuitBreaker,
  };
}

export default makeHandler();
