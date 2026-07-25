/**
 * @fileoverview Cloudflare Workers entry point for Astro SSR + Hono API (the
 * `workerEntryPoint` for `@astrojs/cloudflare`).
 *
 * The adapter's generated `dist/_worker.js/index.js`:
 *   1. calls `start(manifest, args)` (if exported) to hand us the SSR manifest,
 *   2. calls `createExports()` to get the default fetch handler,
 *   3. re-exports that handler as the default export.
 *
 * Our handler routes:
 *   - `/mcp`              → the stateless MCP request handler
 *   - `/auth/google*`     → the Google OAuth handler
 *   - `/api/*` + doc URLs → the Hono app
 *   - everything else     → Astro SSR via the adapter's `handle()` (which also
 *                           falls through to the `ASSETS` binding for static
 *                           files). This is the piece a naive `env.ASSETS.fetch`
 *                           custom entry forgets — without it, SSR pages 404.
 *
 * This Worker has ZERO Durable Object bindings — no `agents` SDK import, no DO
 * class exports, no `/agents/*` routing branch.
 */

import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import type { ExportedHandler } from "@cloudflare/workers-types";

import { app as honoApp } from "./backend/api/index";
import { handleMcpRequest } from "./backend/mcp/server"; // added in Task 14
import { handleGoogleAuth } from "./backend/api/routes/auth-google"; // added in Task 6

/** True for paths the Hono API owns (REST + OpenAPI doc surfaces). */
function isApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar"
  );
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
  return { default: makeHandler() };
}

export default makeHandler();
