/**
 * @fileoverview Secret + signing-key helpers for the template.
 *
 * Reads values from the Secrets Store bindings declared in `wrangler.jsonc`
 * (which expose an async `.get()`), falling back to plain env vars for local
 * development. Domain-specific helpers (Google service accounts, R2 access
 * keys, third-party integrations) were removed when this repo was slimmed to
 * a template — add your own as you wire new integrations.
 */

/**
 * Generic helper to read a secret value by binding name.
 *
 * Precedence:
 * 1. Secrets Store / Secret binding (async `.get()`)
 * 2. Plain env var (string) — local/dev fallback
 */
export async function getSecret(env: Env, key: string): Promise<string | undefined> {
  const envVal = (env as Record<string, any>)[key];
  if (envVal && typeof envVal?.get === "function") {
    return await envVal.get();
  }
  return envVal;
}

/**
 * Fetch the WORKER_API_KEY (used for the single-user login + GitHub webhook
 * signature verification).
 */
export async function getWorkerApiKey(env: Env): Promise<string | undefined> {
  if (env.WORKER_API_KEY) {
    return typeof env.WORKER_API_KEY === "string"
      ? env.WORKER_API_KEY
      : await (env.WORKER_API_KEY as any).get();
  }
  return getSecret(env, "WORKER_API_KEY");
}

/** Fetch the Cloudflare API token (Wrangler / provisioning operations). */
export async function getCloudflareApiToken(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_WRANGLER_API_TOKEN) {
    return typeof env.CLOUDFLARE_WRANGLER_API_TOKEN === "string"
      ? env.CLOUDFLARE_WRANGLER_API_TOKEN
      : await (env.CLOUDFLARE_WRANGLER_API_TOKEN as any).get();
  }
  return getSecret(env, "CLOUDFLARE_WRANGLER_API_TOKEN");
}

/** Fetch the Cloudflare account id. */
export async function getCloudflareAccountId(env: Env): Promise<string | undefined> {
  if (env.CLOUDFLARE_ACCOUNT_ID) {
    return typeof env.CLOUDFLARE_ACCOUNT_ID === "string"
      ? env.CLOUDFLARE_ACCOUNT_ID
      : await (env.CLOUDFLARE_ACCOUNT_ID as any).get();
  }
  return getSecret(env, "CLOUDFLARE_ACCOUNT_ID");
}

/**
 * HMAC key used to sign the session cookie.
 *
 * Stored in the `SESSIONS` KV namespace (not the Secrets Store) so it can be
 * rotated at runtime without a redeploy. Auto-provisions a random key on first
 * use, with a dev fallback if KV is unavailable.
 */
export async function getCookieSigningKey(env: Env): Promise<string> {
  try {
    let key = await env.SESSIONS.get("COOKIE_SIGNING_KEY");
    if (key) return key;

    key = crypto.randomUUID();
    await env.SESSIONS.put("COOKIE_SIGNING_KEY", key);
    return key;
  } catch (e) {
    console.warn("Failed to read/write COOKIE_SIGNING_KEY from KV", e);
    return "default_dev_key_fallback";
  }
}

/**
 * GitHub webhook secret. Maps to WORKER_API_KEY in this template.
 */
export async function getGitHubWebhookSecret(env: Env): Promise<string> {
  const secret = await getWorkerApiKey(env);
  if (!secret) {
    throw new Error("Missing WORKER_API_KEY in Secrets Store");
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Google OAuth / DWD (ported from core-gsuite-tools, Phase 1)
// ---------------------------------------------------------------------------

/**
 * Default Workspace user impersonated via Domain-Wide Delegation.
 * Plain `vars` entry (see `wrangler.jsonc`) — not a Secrets Store binding.
 */
export function getGoogleUserToImpersonate(env: Env): string {
  if (!env.GOOGLE_USER_TO_IMPERSONATE) {
    throw new Error("Missing GOOGLE_USER_TO_IMPERSONATE var");
  }
  return env.GOOGLE_USER_TO_IMPERSONATE;
}

/** Display email for the default Workspace account (plain `vars` entry). */
export function getGoogleWorkspaceAccountEmail(env: Env): string {
  return env.GOOGLE_WORKSPACE_ACCOUNT_EMAIL || getGoogleUserToImpersonate(env);
}

/** Email for the consumer/personal Google account (plain `vars` entry). */
export function getGooglePersonalAccountEmail(env: Env): string {
  return env.GOOGLE_PERSONAL_ACCOUNT_EMAIL || "jmbish04@gmail.com";
}

/**
 * OAuth client id for the multi-account consent flow.
 *
 * Falls back to the `GOOGLE_CLIENT_ID` secret already used by the `/mcp` OAuth
 * path so both surfaces can share one registered OAuth client without a
 * separate `GOOGLE_OAUTH_CLIENT_ID` secret having to be provisioned.
 */
export async function getGoogleOAuthClientId(env: Env): Promise<string> {
  const value =
    (await getSecret(env, "GOOGLE_OAUTH_CLIENT_ID")) ?? (await getSecret(env, "GOOGLE_CLIENT_ID"));
  if (!value) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID (or GOOGLE_CLIENT_ID) secret");
  }
  return value;
}

/** OAuth client secret for the multi-account consent flow — see {@link getGoogleOAuthClientId}. */
export async function getGoogleOAuthClientSecret(env: Env): Promise<string> {
  const value =
    (await getSecret(env, "GOOGLE_OAUTH_CLIENT_SECRET")) ??
    (await getSecret(env, "GOOGLE_CLIENT_SECRET"));
  if (!value) {
    throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET) secret");
  }
  return value;
}

/**
 * Optional seed refresh token for the personal account, used before the
 * interactive consent flow has run. Returns undefined if unset.
 */
export async function getSeedPersonalRefreshToken(env: Env): Promise<string | undefined> {
  return getSecret(env, "GOOGLE_PERSONAL_REFRESH_TOKEN");
}
