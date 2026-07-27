/**
 * @fileoverview KV-backed Google OAuth token provider.
 *
 * Stores the per-user refresh token (`gwsuser:<sub>`) and caches minted
 * access tokens (`gwstok:<sub>`) in the SESSIONS KV namespace, refreshing
 * via Google's token endpoint when the cached token is missing or expiring.
 */
import { getSecret } from "../utils/secrets";
import { getDwdAccessToken, getServiceAccountAccessToken } from "./dwd";

export type GwsUser = {
  sub: string;
  email?: string;
  refreshToken: string;
  scopes: string[];
  updatedAt: number;
};

const USER_PREFIX = "gwsuser:";
const TOK_PREFIX = "gwstok:";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function saveUser(env: Env, user: GwsUser): Promise<void> {
  await env.SESSIONS.put(USER_PREFIX + user.sub, JSON.stringify(user));
}

export async function getUser(env: Env, sub: string): Promise<GwsUser | null> {
  const raw = await env.SESSIONS.get(USER_PREFIX + sub);
  return raw ? (JSON.parse(raw) as GwsUser) : null;
}

export async function getAccessToken(env: Env, sub: string): Promise<string> {
  // Domain-wide delegation: a `dwd:<email>` account ref impersonates that user
  // via the service account instead of an OAuth refresh token. Passing
  // `as_user` on a tool call takes this explicit path and always wins.
  if (sub.startsWith("dwd:")) {
    return getDwdAccessToken(env, sub.slice(4));
  }

  // Service-account own identity: reaches any Drive item shared with the SA's
  // email. No impersonation, no domain — works for consumer-owned files too.
  if (sub === "sa") {
    return getServiceAccountAccessToken(env);
  }

  // Global default impersonation: when GOOGLE_USER_TO_IMPERSONATE is set, every
  // call acts as that user via DWD — no per-tool `as_user` needed. Clear the var
  // to fall back to the OAuth caller's own token.
  const forced = env.GOOGLE_USER_TO_IMPERSONATE?.trim();
  if (forced) {
    return getDwdAccessToken(env, forced);
  }

  const cached = await env.SESSIONS.get(TOK_PREFIX + sub);
  if (cached) {
    const { access_token, exp } = JSON.parse(cached) as { access_token: string; exp: number };
    if (exp - 60 > Math.floor(Date.now() / 1000)) return access_token;
  }

  const user = await getUser(env, sub);
  if (!user) throw new Error(`No Google credentials for sub ${sub}. Sign in at /auth/google.`);

  const clientId = await getSecret(env, "GOOGLE_CLIENT_ID");
  const clientSecret = await getSecret(env, "GOOGLE_CLIENT_SECRET");
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID secret not configured");
  if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET secret not configured");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: user.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const exp = Math.floor(Date.now() / 1000) + json.expires_in;
  await env.SESSIONS.put(
    TOK_PREFIX + sub,
    JSON.stringify({ access_token: json.access_token, exp }),
    { expirationTtl: Math.max(60, json.expires_in) },
  );
  return json.access_token;
}
