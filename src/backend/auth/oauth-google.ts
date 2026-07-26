/**
 * @fileoverview OAuth2 user-consent flow for DYNAMIC multi-account Google auth.
 *
 * Domain-Wide Delegation cannot impersonate a consumer `@gmail.com` account (or
 * any external Google account), so those identities are reached with a standard
 * OAuth2 Authorization Code flow. A one-time consent
 * (`buildConsentUrl` → Google → `exchangeCodeForTokens`) yields a long-lived
 * **refresh token** which is persisted in KV, keyed **per email**:
 *
 *   - `google:oauth:<email>:refresh_token`
 *   - `google:oauth:<email>:access_token`
 *
 * The authorized email is resolved from Google's userinfo endpoint after the
 * code exchange, a `googleAccounts` registry row is upserted, and subsequent
 * `getOAuthAccessToken(env, email, scopes)` calls exchange the stored refresh
 * token for short-lived access tokens (cached in KV).
 *
 * Back-compat: a legacy single seed token (`GOOGLE_PERSONAL_REFRESH_TOKEN`) is
 * still honored for `GOOGLE_PERSONAL_ACCOUNT_EMAIL` when no per-email refresh
 * token exists in KV.
 *
 * Config:
 *  - `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` — read via
 *    {@link getGoogleOAuthClientId}/{@link getGoogleOAuthClientSecret}, which
 *    fall back to the existing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
 *    secrets already used by the `/mcp` OAuth path, so both surfaces can share
 *    one registered OAuth client.
 *  - `env.GOOGLE_OAUTH_REDIRECT_URI`  (var)            — registered redirect
 *  - `env.GOOGLE_PERSONAL_REFRESH_TOKEN` (worker secret, optional) — seed token
 *    used for the personal account if KV has none yet.
 *
 * Token cache: this ported module originally used a dedicated `CACHE` KV
 * namespace; Phase 1 of the port re-uses the existing `SESSIONS` KV instead
 * (distinct `google:oauth:*` key prefix, no collision) rather than
 * provisioning a new binding just for this.
 */

import { ALL_GOOGLE_SCOPES } from "@/backend/lib/google-auth";
import {
  getGoogleOAuthClientId,
  getGoogleOAuthClientSecret,
  getSeedPersonalRefreshToken,
} from "@/backend/utils/secrets";
import { getDb } from "@/backend/db";
import { googleAccounts } from "@db/schemas";
import { eq } from "drizzle-orm";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

/** Per-email KV key for the stored refresh token. */
function refreshTokenKey(email: string): string {
  return `google:oauth:${email.toLowerCase()}:refresh_token`;
}

/** Per-email KV key for the cached short-lived access token. */
function accessTokenKey(email: string): string {
  return `google:oauth:${email.toLowerCase()}:access_token`;
}

/**
 * Build the Google consent URL for a one-time account authorization.
 * `access_type=offline` + `prompt=consent` guarantees a refresh token is issued.
 *
 * @param env - Worker env (needs `GOOGLE_OAUTH_CLIENT_ID` + redirect URI)
 * @param state - opaque CSRF/state value echoed back to the callback. Callers
 *   may JSON+base64url a `{ nonce, label }` payload into it; Google treats it as
 *   an opaque string.
 * @returns The full Google authorization URL to redirect the user to
 */
export async function buildConsentUrl(env: Env, state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await getGoogleOAuthClientId(env),
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: ALL_GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Resolve the authorized email for an access token via Google userinfo. */
async function resolveAuthorizedEmail(accessToken: string): Promise<string> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve authorized email: ${response.status} ${await response.text()}`);
  }
  const info = (await response.json()) as { email?: string };
  if (!info.email) {
    throw new Error("Google userinfo did not return an email for the authorized account.");
  }
  return info.email.toLowerCase();
}

/**
 * Exchange an authorization code (from the OAuth callback) for tokens, resolve
 * the authorized email, persist the refresh token under that email, and upsert
 * a `googleAccounts` registry row.
 *
 * @param env - Worker env
 * @param code - The authorization code from the OAuth callback
 * @returns The authorized account email
 * @throws If the exchange fails or no refresh token is returned
 */
export async function exchangeCodeForTokens(env: Env, code: string): Promise<{ email: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getGoogleOAuthClientId(env),
    getGoogleOAuthClientSecret(env),
  ]);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth code exchange failed: ${response.status} ${await response.text()}`);
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!token.refresh_token) {
    throw new Error(
      "OAuth code exchange returned no refresh_token. Ensure access_type=offline and prompt=consent, and that the app has not already been authorized without offline access.",
    );
  }

  const email = await resolveAuthorizedEmail(token.access_token);

  await env.SESSIONS.put(refreshTokenKey(email), token.refresh_token);
  await env.SESSIONS.put(accessTokenKey(email), token.access_token, {
    expirationTtl: Math.max(60, token.expires_in - 60),
  });

  const scopes = token.scope ? token.scope.split(" ").filter(Boolean) : ALL_GOOGLE_SCOPES;
  await upsertAccountRow(env, email, scopes);

  return { email };
}

/** Upsert the `googleAccounts` registry row for a newly authorized OAuth account. */
async function upsertAccountRow(env: Env, email: string, scopes: string[]): Promise<void> {
  const db = getDb(env);
  const now = new Date();
  const existing = await db
    .select()
    .from(googleAccounts)
    .where(eq(googleAccounts.email, email))
    .limit(1);

  if (existing.length) {
    await db
      .update(googleAccounts)
      .set({
        kind: "oauth",
        status: "active",
        scopesJson: scopes,
        authorizedAt: now,
        updatedAt: now,
      })
      .where(eq(googleAccounts.email, email));
    return;
  }

  await db.insert(googleAccounts).values({
    email,
    kind: "oauth",
    label: email,
    isDefault: false,
    status: "active",
    scopesJson: scopes,
    authorizedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Resolve the stored refresh token for an email, falling back to the legacy
 * personal seed secret for `GOOGLE_PERSONAL_ACCOUNT_EMAIL`.
 */
async function resolveRefreshToken(env: Env, email: string): Promise<string | undefined> {
  const stored = await env.SESSIONS.get(refreshTokenKey(email));
  if (stored) return stored;

  const personalEmail = env.GOOGLE_PERSONAL_ACCOUNT_EMAIL?.toLowerCase();
  if (personalEmail && email.toLowerCase() === personalEmail) {
    const seed = await getSeedPersonalRefreshToken(env);
    if (seed) {
      await env.SESSIONS.put(refreshTokenKey(email), seed);
      return seed;
    }
  }
  return undefined;
}

/**
 * Whether an OAuth refresh token is available for the given email (KV or, for
 * the personal account, the legacy seed secret).
 *
 * @param env - Worker env
 * @param email - Account email
 */
export async function hasOAuthRefreshToken(env: Env, email: string): Promise<boolean> {
  return Boolean(await resolveRefreshToken(env, email));
}

/**
 * Get an OAuth2 access token for an account email, refreshing if needed.
 *
 * Back-compat overload: when `email` is omitted, it falls back to
 * `GOOGLE_PERSONAL_ACCOUNT_EMAIL` (which in turn honors the legacy seed token).
 *
 * Note: the `scopes` argument is accepted for interface symmetry with the DWD
 * path; OAuth access tokens carry whatever scopes were granted at consent time.
 *
 * @throws If no refresh token is available (consent not yet completed)
 */
export async function getOAuthAccessToken(env: Env, scopes: string[]): Promise<string>;
export async function getOAuthAccessToken(env: Env, email: string, scopes: string[]): Promise<string>;
export async function getOAuthAccessToken(
  env: Env,
  emailOrScopes: string | string[],
  maybeScopes?: string[],
): Promise<string> {
  const email = (
    typeof emailOrScopes === "string"
      ? emailOrScopes
      : (env.GOOGLE_PERSONAL_ACCOUNT_EMAIL ?? "jmbish04@gmail.com")
  ).toLowerCase();

  const cached = await env.SESSIONS.get(accessTokenKey(email));
  if (cached) {
    return cached;
  }

  const refreshToken = await resolveRefreshToken(env, email);
  if (!refreshToken) {
    throw new Error(
      `No refresh token for ${email}. Visit /api/auth/google/oauth/start to authorize this account.`,
    );
  }

  const [clientId, clientSecret] = await Promise.all([
    getGoogleOAuthClientId(env),
    getGoogleOAuthClientSecret(env),
  ]);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OAuth refresh failed for ${email}: ${response.status} ${await response.text()}. The account may need re-authorization at /api/auth/google/oauth/start.`,
    );
  }

  const token = (await response.json()) as { access_token: string; expires_in: number };
  await env.SESSIONS.put(accessTokenKey(email), token.access_token, {
    expirationTtl: Math.max(60, token.expires_in - 60),
  });

  // The `maybeScopes` / `scopes` argument is intentionally unused (see JSDoc).
  void maybeScopes;
  return token.access_token;
}

/**
 * Revoke an OAuth account: delete the per-email KV tokens, best-effort POST to
 * Google's revoke endpoint, and mark the `googleAccounts` row revoked.
 *
 * @param env - Worker env
 * @param email - Account email to revoke
 */
export async function revokeAccount(env: Env, email: string): Promise<void> {
  const normalized = email.toLowerCase();
  const refreshToken = await env.SESSIONS.get(refreshTokenKey(normalized));

  await env.SESSIONS.delete(refreshTokenKey(normalized));
  await env.SESSIONS.delete(accessTokenKey(normalized));

  // Best-effort token revocation at Google; ignore failures.
  if (refreshToken) {
    try {
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch {
      // ignore — KV state is already cleared
    }
  }

  const db = getDb(env);
  await db
    .update(googleAccounts)
    .set({ status: "revoked", isDefault: false, updatedAt: new Date() })
    .where(eq(googleAccounts.email, normalized));
}

/**
 * Whether the personal account has been authorized (refresh token present for
 * `GOOGLE_PERSONAL_ACCOUNT_EMAIL`, or a legacy seed token exists).
 */
export async function isPersonalAccountAuthorized(env: Env): Promise<boolean> {
  const personalEmail = env.GOOGLE_PERSONAL_ACCOUNT_EMAIL ?? "jmbish04@gmail.com";
  return hasOAuthRefreshToken(env, personalEmail);
}
