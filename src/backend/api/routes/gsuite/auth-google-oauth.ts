/**
 * @fileoverview Google OAuth2 consent routes for the dynamic multi-account
 * registry, ported from `core-gsuite-tools` Phase 3. Both routes are
 * auth-exempt (browser consent kickoff + callback).
 *
 * Mounted at `/api/auth/google/oauth` — distinct from this Worker's existing
 * `/auth/google*` path (handled directly in `_worker.ts`, outside Hono, for
 * the single-account DWD/OAuth admin flow) and from `/api/auth` (this
 * Worker's own `cr_session` admin-panel login).
 *
 * Routes:
 *  GET /api/auth/google/oauth/start    — 302 to Google consent (signed state cookie)
 *  GET /api/auth/google/oauth/callback — verify state, exchange code, redirect
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

import { buildConsentUrl, exchangeCodeForTokens } from "@/backend/auth/oauth-google";
import { hmacSign, constantTimeEqual, encodeBase64Url, decodeBase64Url } from "@/backend/lib/crypto";
import { getWorkerApiKey } from "@/backend/utils/secrets";

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** Cookie name for the signed OAuth state. */
const STATE_COOKIE = "g_oauth_state";

export const authGoogleOauthRouter = new OpenAPIHono<{ Bindings: Env }>();

/** Build an opaque, signed state string carrying a nonce + optional label. */
async function buildSignedState(env: Env, label?: string): Promise<{ state: string; cookie: string }> {
  const nonce = crypto.randomUUID();
  const payload = encodeBase64Url(JSON.stringify({ nonce, label: label ?? null }));
  const secret = (await getWorkerApiKey(env)) ?? "g-oauth";
  const sig = await hmacSign(secret, payload);
  // The state sent to Google carries the payload; the cookie carries the signature.
  return { state: payload, cookie: sig };
}

/** Verify a returned state against the signed cookie; returns the decoded label. */
async function verifySignedState(
  env: Env,
  state: string | undefined,
  cookie: string | undefined,
): Promise<{ ok: boolean; label: string | null }> {
  if (!state || !cookie) return { ok: false, label: null };
  const secret = (await getWorkerApiKey(env)) ?? "g-oauth";
  const expected = await hmacSign(secret, state);
  if (!constantTimeEqual(expected, cookie)) return { ok: false, label: null };
  try {
    const decoded = JSON.parse(decodeBase64Url(state)) as { nonce: string; label: string | null };
    return { ok: true, label: decoded.label ?? null };
  } catch {
    return { ok: false, label: null };
  }
}

// GET /start — kick off browser consent. Auth-exempt.
authGoogleOauthRouter.openapi(
  createRoute({
    method: "get",
    path: "/start",
    tags: ["Auth"],
    summary: "Start Google OAuth2 consent flow for any account",
    operationId: "gsuiteAuthGoogleStart",
    request: {
      query: z.object({ label: z.string().optional() }),
    },
    responses: {
      302: { description: "Redirect to Google consent page" },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { label } = c.req.valid("query");
    const { state, cookie } = await buildSignedState(c.env, label);
    setCookie(c, STATE_COOKIE, cookie, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    return c.redirect(await buildConsentUrl(c.env, state), 302);
  },
);

// GET /callback — exchange the code, redirect to the frontend. Auth-exempt.
authGoogleOauthRouter.openapi(
  createRoute({
    method: "get",
    path: "/callback",
    tags: ["Auth"],
    summary: "Handle Google OAuth2 callback",
    operationId: "gsuiteAuthGoogleCallback",
    request: {
      query: z.object({
        code: z.string().optional(),
        error: z.string().optional(),
        state: z.string().optional(),
      }),
    },
    responses: {
      302: { description: "Redirect to the frontend accounts page" },
      400: { description: "OAuth error", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { code, error, state } = c.req.valid("query");

    if (error) {
      return c.json({ error: { code: "OAUTH_ERROR", message: error } }, 400);
    }
    if (!code) {
      return c.json({ error: { code: "MISSING_CODE", message: "No authorization code received." } }, 400);
    }

    const cookie = getCookie(c, STATE_COOKIE);
    const verified = await verifySignedState(c.env, state, cookie);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    if (!verified.ok) {
      return c.json({ error: { code: "BAD_STATE", message: "Invalid or expired OAuth state." } }, 400);
    }

    try {
      const { email } = await exchangeCodeForTokens(c.env, code);
      // Prefer a 302 to the frontend accounts page; HTML fallback below.
      const redirectUrl = `/accounts?added=${encodeURIComponent(email)}`;
      return c.html(
        `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=${redirectUrl}"><title>Account added</title></head>
<body style="font-family:sans-serif;text-align:center;padding:40px;">
  <h1>Google account authorized</h1>
  <p>${email} has been connected. Redirecting…</p>
  <p><a href="${redirectUrl}">Continue to accounts</a></p>
  <script>location.replace(${JSON.stringify(redirectUrl)})</script>
</body>
</html>`,
        302,
        { Location: redirectUrl },
      );
    } catch (err) {
      console.error("OAuth callback error:", err instanceof Error ? err.message : String(err));
      return c.json(
        {
          error: {
            code: "EXCHANGE_FAILED",
            message: err instanceof Error ? err.message : "Token exchange failed.",
          },
        },
        500,
      );
    }
  },
);
