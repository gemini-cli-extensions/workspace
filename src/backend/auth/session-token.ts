/**
 * @fileoverview Short-lived, HMAC-signed browser session tokens.
 *
 * The frontend chat/agent connections need a credential, but we must NOT ship
 * the master `WORKER_API_KEY` to the browser. Instead the SSR layer mints a
 * short-lived token of the form `exp.signature`, where `signature =
 * HMAC-SHA256(WORKER_API_KEY, exp)`. The worker's agent gate and the API auth
 * middleware accept either the raw `WORKER_API_KEY` (server-to-server) or a
 * valid, unexpired session token (browser).
 *
 * SECURITY NOTE: there is still no page-level login, so anyone who can load a
 * page receives a working short-lived token. This is strictly better than
 * exposing the master key, but real per-user auth (a login that scopes the
 * agent instance `name` to the user) remains the documented follow-up.
 */

import { constantTimeEqual, hmacSign } from "@/backend/lib/crypto";
import { getWorkerApiKey } from "@/backend/utils/secrets";

/** Default token lifetime (12 hours). */
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

/**
 * Mint a signed session token valid for `ttlSeconds`. Returns null if no signing
 * key is configured.
 *
 * @param env - Worker env (needs `WORKER_API_KEY`)
 * @param ttlSeconds - Token lifetime in seconds (default 12h)
 */
export async function mintSessionToken(
  env: Env,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  const key = await getWorkerApiKey(env);
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacSign(key, String(exp));
  return `${exp}.${sig}`;
}

/**
 * Verify a signed session token: correct HMAC signature and not expired.
 *
 * @param env - Worker env
 * @param token - The `exp.signature` token to verify
 * @returns true if the token is valid and unexpired
 */
export async function verifySessionToken(env: Env, token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const key = await getWorkerApiKey(env);
  if (!key) return false;
  const expected = await hmacSign(key, expStr);
  return constantTimeEqual(sig, expected);
}
