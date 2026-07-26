/**
 * @fileoverview Auth gate for the ported gsuite REST surfaces
 * (`/api/threads/*`, `/api/catalog/*`, `/api/agent-tasks/*`,
 * `/api/accounts/*`, `/api/gsuite-health/*`).
 *
 * These routes read chat/thread state, drive Google Workspace actions via the
 * agent DOs, and revoke OAuth credentials — see the C1 finding in the
 * 2026-07-25 security audit. They must accept exactly the same credentials as
 * the `/agents/*` Durable Object gate (`isAuthorizedAgentRequest` in
 * `src/_worker.ts`) so a caller who can reach the agents can also reach these
 * REST endpoints, and no one else can:
 *
 *  - the browser's `gsuite_session` cookie (`readVerifiedSession`), or
 *  - `Authorization: Bearer <WORKER_API_KEY>`, compared in constant time.
 *
 * Deliberately NOT accepted: query-string tokens (see I2 — they leak into
 * logs/Referer/history) and signed session tokens presented as a bearer value
 * (browsers already carry the cookie; server-to-server callers use the raw
 * master key).
 */

import type { Context, Next } from "hono";

import type { Variables } from "@/backend/api/index";
import { readVerifiedSession } from "@/backend/auth/read-session";
import { constantTimeEqual } from "@/backend/lib/crypto";
import { getWorkerApiKey } from "@/backend/utils/secrets";

/**
 * Reject the request unless it carries a valid `gsuite_session` cookie or the
 * `WORKER_API_KEY` as a bearer token.
 */
export async function agentAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
) {
  const { authed } = await readVerifiedSession(c.env, c.req.raw);
  if (authed) {
    await next();
    return;
  }

  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const workerKey = await getWorkerApiKey(c.env);
    if (workerKey && constantTimeEqual(bearer, workerKey)) {
      await next();
      return;
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
}
