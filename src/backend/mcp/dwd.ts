/**
 * @fileoverview Domain-Wide Delegation (DWD) — edge-native service-account
 * impersonation for headless agent use, per the workspace-agent architecture.
 *
 * A Workspace super-admin authorizes the service account's client id for the
 * API scopes (Admin console → Security → API controls → Domain-wide delegation).
 * We then mint a signed RS256 JWT (assertion) with:
 *   iss = service-account client email
 *   sub = the Workspace user to impersonate
 *   scope = the API scopes
 * and exchange it at Google's token endpoint (grant_type jwt-bearer) for a
 * short-lived access token, cached per-user in KV.
 *
 * Signing uses `jose` over WebCrypto (no Node crypto / no google-auth-library),
 * so it runs cleanly in a V8 isolate.
 */
import { importPKCS8, SignJWT } from "jose";

import { getSecret } from "../utils/secrets";
import { API_SCOPE_STRING } from "./scopes";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOK_PREFIX = "dwdtok:";

/** Reassemble the PKCS8 PEM from the two split secrets. */
async function servicePrivateKeyPem(env: Env): Promise<string> {
  const p1 = (await getSecret(env, "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1")) ?? "";
  const p2 = (await getSecret(env, "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2")) ?? "";
  const pem = (p1 + p2).replace(/\\n/g, "\n");
  if (!pem.includes("PRIVATE KEY")) {
    throw new Error(
      "Service account private key not configured (GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1 / _PT_2). Domain-wide delegation is unavailable.",
    );
  }
  return pem;
}

/**
 * Mint (or return cached) an access token that impersonates `subEmail` via the
 * service account's domain-wide delegation grant.
 */
export async function getDwdAccessToken(env: Env, subEmail: string): Promise<string> {
  const cacheKey = TOK_PREFIX + subEmail;
  const cached = await env.SESSIONS.get(cacheKey);
  if (cached) {
    const { access_token, exp } = JSON.parse(cached) as { access_token: string; exp: number };
    if (exp - 60 > Math.floor(Date.now() / 1000)) return access_token;
  }

  const clientEmail = await getSecret(env, "GOOGLE_CREDS_SA_CLIENT_EMAIL");
  if (!clientEmail) throw new Error("GOOGLE_CREDS_SA_CLIENT_EMAIL not configured — domain-wide delegation unavailable.");

  const key = await importPKCS8(await servicePrivateKeyPem(env), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: API_SCOPE_STRING })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(subEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) {
    // A 403/401 here usually means the admin console DWD grant is missing for
    // one of the scopes, or the sub user isn't in the domain.
    throw new Error(`DWD token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const exp = Math.floor(Date.now() / 1000) + json.expires_in;
  await env.SESSIONS.put(cacheKey, JSON.stringify({ access_token: json.access_token, exp }), {
    expirationTtl: Math.max(60, json.expires_in),
  });
  return json.access_token;
}
