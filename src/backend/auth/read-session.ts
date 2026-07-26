/**
 * @fileoverview Single source of truth for reading + verifying the browser
 * session from an incoming request.
 *
 * The frontend gate (`AuthGate`) and the SSR layouts (`BaseLayout`,
 * `DocsLayout`) both need to answer the same question — "does this request
 * carry a valid `gsuite_session` cookie?" — and they were each doing it with a
 * hand-rolled cookie regex + `verifySessionToken` call. That duplication is the
 * kind of drift that lets the auth gate silently re-prompt. This module
 * centralizes the cookie parse + HMAC verification so every caller (SSR layouts,
 * the `GET /api/auth/session` endpoint, and any future middleware) shares one
 * code path.
 *
 * The session cookie is intentionally NOT HttpOnly (the browser islands read the
 * derived token to authenticate the agent WebSocket + `/api/*` calls), so the
 * client can also read it directly — see `getSessionToken()` in
 * `src/frontend/lib/session.ts`. This module is the SERVER-side counterpart.
 *
 * PHASE 1 TRIM: the source repo shares `SESSION_COOKIE` from a tiny
 * `api/routes/platform/session-cookie.ts` module (kept separate so SSR layouts
 * don't pull in the full session router). That router, the AuthGate, and the
 * agent WebSocket path are Phase 3 (chat frontend) scope and don't exist here
 * yet, so the constant is inlined below for now — hoist it back into a shared
 * module if/when the session router is ported.
 */

import { verifySessionToken } from "@/backend/auth/session-token";

/** Cookie name holding the signed session token. Shared across SSR + API + auth helpers. */
const SESSION_COOKIE = "gsuite_session";

/** Result of reading the session cookie off a request. */
export type SessionReadResult = {
  /** True when a `gsuite_session` cookie is present AND its HMAC verifies AND it is unexpired. */
  authed: boolean;
  /** The raw, verified token (`exp.signature`) when `authed`, else null. */
  token: string | null;
  /** The token's expiry (unix seconds) when parseable, else null. Present even when not authed. */
  exp: number | null;
};

/**
 * Parse the `gsuite_session` token out of a Cookie header.
 *
 * The token is base64url (`exp.signature`) and therefore cookie/URL-safe, so
 * `decodeURIComponent` is a no-op for well-formed values but is kept for
 * defensiveness against any intermediary that percent-encodes the value.
 *
 * @param cookieHeader - The raw `Cookie` request header (may be empty/null).
 * @returns The decoded token string, or null when the cookie is absent.
 */
export function parseSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Read and verify the browser session from a request.
 *
 * Verification runs in whatever Worker context the caller is in (SSR render or
 * the Hono `/api/auth/session` handler); both receive the same `env` and call
 * the same `verifySessionToken`, so the answer is identical regardless of entry
 * point. This is the function both the SSR layouts and the session endpoint must
 * use so the gate can never disagree with itself.
 *
 * @param env - Worker env (needs the `WORKER_API_KEY` Secrets Store binding).
 * @param request - The incoming request whose `Cookie` header to inspect.
 * @returns `{ authed, token, exp }`.
 */
export async function readVerifiedSession(env: Env, request: Request): Promise<SessionReadResult> {
  const token = parseSessionCookie(request.headers.get("cookie"));
  if (!token) return { authed: false, token: null, exp: null };

  // Pull the expiry out for diagnostics/UX even before HMAC verification.
  const dot = token.indexOf(".");
  const expParsed = dot > 0 ? Number(token.slice(0, dot)) : NaN;
  const exp = Number.isFinite(expParsed) ? expParsed : null;

  const ok = await verifySessionToken(env, token);
  if (!ok) return { authed: false, token: null, exp };

  return { authed: true, token, exp };
}
