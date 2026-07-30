/**
 * @fileoverview Minimal OAuth 2.1 authorization server for the MCP endpoint,
 * per the MCP authorization spec (2025-06-18) + RFC 8414 / 7591 / 7636 (PKCE).
 *
 * This lets spec-compliant MCP clients (e.g. the claude.ai web "custom
 * connector") authorize automatically: discover metadata → dynamically register
 * → /authorize (which authenticates the user via Google) → /token → call /mcp
 * with the issued Bearer access token.
 *
 * The access token we mint is opaque and maps (in KV) to the user's Google
 * `sub`. Tool calls then use the Google refresh token already stored in KV
 * (see tokenProvider). We never expose Google tokens to the MCP client.
 *
 * All state lives in the existing `SESSIONS` KV, namespaced by prefix:
 *   oauthclient:<client_id>   registered client (long-lived)
 *   oauthreq:<req_id>         pending /authorize awaiting Google login (10 min)
 *   oauthcode:<code>          issued authorization code (5 min, single-use)
 *   oauthtok:<access_token>   access token → { sub, scope, clientId } (1 y)
 *   oauthrt:<refresh_token>   refresh token → { sub, scope, clientId } (~13 mo)
 */

import { toBase64Url } from "../lib/crypto";
import { getSecret } from "../utils/secrets";
import { SCOPES as SCOPES_SUPPORTED } from "./scopes";

const ACCESS_TTL = 60 * 60 * 24 * 365; // 1 year — MCP clients shouldn't re-auth often
const REFRESH_TTL = 60 * 60 * 24 * 400; // ~13 months — outlives the access token
const CODE_TTL = 300; // 5 minutes
const REQ_TTL = 600; // 10 minutes


// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function oauthBaseUrl(env: Env, request: Request): string {
  return (env as { PUBLIC_BASE_URL?: string }).PUBLIC_BASE_URL || new URL(request.url).origin;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

/** PKCE S256: base64url(SHA-256(verifier)). */
async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra },
  });
}

function oauthError(error: string, description?: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

// KV typed accessors -------------------------------------------------------

type Client = { client_id: string; redirect_uris: string[]; client_name?: string; created_at: number };
type AuthReq = { clientId: string; redirectUri: string; codeChallenge: string; clientState?: string; scope?: string };
type CodeRec = { clientId: string; redirectUri: string; codeChallenge: string; sub: string; scope?: string };
type TokRec = { sub: string; scope?: string; clientId: string };

const kv = (env: Env) => env.SESSIONS;
const getJson = async <T>(env: Env, key: string): Promise<T | null> => {
  const raw = await kv(env).get(key);
  return raw ? (JSON.parse(raw) as T) : null;
};

// ---------------------------------------------------------------------------
// Public API used by the rest of the worker
// ---------------------------------------------------------------------------

/** Resolve an issued MCP access token to its Google `sub`, or null. */
export async function resolveAccessToken(env: Env, token: string): Promise<string | null> {
  const rec = await getJson<TokRec>(env, `oauthtok:${token}`);
  return rec?.sub ?? null;
}

/**
 * Complete a pending /authorize after the user has authenticated with Google.
 * Called from the Google callback when it detects an `mcp:<reqId>` state.
 * Returns the client redirect URL (with code+state) or null if reqId invalid.
 */
export async function completeMcpAuthorize(env: Env, reqId: string, sub: string): Promise<string | null> {
  const req = await getJson<AuthReq>(env, `oauthreq:${reqId}`);
  if (!req) return null;
  await kv(env).delete(`oauthreq:${reqId}`);

  const code = randomToken();
  const rec: CodeRec = {
    clientId: req.clientId,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    sub,
    // The token grants the full Google scope set regardless of what the client
    // requested (tools enforce no per-scope subset), so advertise the real
    // granted scope rather than echoing a narrower request back (scope-confusion).
    scope: SCOPES_SUPPORTED.join(" "),
  };
  await kv(env).put(`oauthcode:${code}`, JSON.stringify(rec), { expirationTtl: CODE_TTL });

  const to = new URL(req.redirectUri);
  to.searchParams.set("code", code);
  if (req.clientState) to.searchParams.set("state", req.clientState);
  return to.toString();
}

// ---------------------------------------------------------------------------
// Route handler — returns a Response for OAuth paths, or null to fall through.
// ---------------------------------------------------------------------------

export async function handleOAuth(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const p = url.pathname;
  const base = oauthBaseUrl(env, request);

  const isOAuthPath =
    p.startsWith("/.well-known/oauth-protected-resource") ||
    p.startsWith("/.well-known/oauth-authorization-server") ||
    p === "/register" ||
    p === "/authorize" ||
    p === "/token";
  if (!isOAuthPath) return null;

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // --- Discovery: protected resource metadata -----------------------------
  if (p.startsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: `${base}/mcp`,
      authorization_servers: [base],
      scopes_supported: SCOPES_SUPPORTED,
      bearer_methods_supported: ["header"],
    });
  }

  // --- Discovery: authorization server metadata (RFC 8414) ----------------
  if (p.startsWith("/.well-known/oauth-authorization-server")) {
    return json({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: SCOPES_SUPPORTED,
    });
  }

  // --- Dynamic client registration (RFC 7591) -----------------------------
  if (p === "/register") {
    if (request.method !== "POST") return oauthError("invalid_request", "POST required", 405);
    let body: { redirect_uris?: unknown; client_name?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return oauthError("invalid_request", "Body must be JSON");
    }
    const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
    if (redirectUris.length === 0 || !redirectUris.every((u) => typeof u === "string" && isValidRedirect(u))) {
      return oauthError("invalid_redirect_uri", "redirect_uris must be a non-empty array of https (or http://localhost) URIs");
    }
    const clientId = `client_${randomToken(16)}`;
    const client: Client = {
      client_id: clientId,
      redirect_uris: redirectUris,
      client_name: typeof body.client_name === "string" ? body.client_name : undefined,
      created_at: Math.floor(Date.now() / 1000),
    };
    await kv(env).put(`oauthclient:${clientId}`, JSON.stringify(client));
    return json(
      {
        client_id: clientId,
        redirect_uris: redirectUris,
        client_name: client.client_name,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_id_issued_at: client.created_at,
      },
      201,
    );
  }

  // --- Authorization endpoint ---------------------------------------------
  if (p === "/authorize") {
    const q = url.searchParams;
    const clientId = q.get("client_id") ?? "";
    const redirectUri = q.get("redirect_uri") ?? "";
    const responseType = q.get("response_type");
    const codeChallenge = q.get("code_challenge") ?? "";
    const method = q.get("code_challenge_method");
    const state = q.get("state") ?? undefined;
    const scope = q.get("scope") ?? undefined;

    const client = await getJson<Client>(env, `oauthclient:${clientId}`);
    // Errors that can't be safely redirected must render, not redirect.
    if (!client) return oauthError("invalid_client", "Unknown client_id");
    if (!client.redirect_uris.includes(redirectUri)) {
      return oauthError("invalid_request", "redirect_uri not registered for this client");
    }
    // From here, errors redirect back to the (validated) redirect_uri.
    const back = (error: string, desc?: string) => {
      const to = new URL(redirectUri);
      to.searchParams.set("error", error);
      if (desc) to.searchParams.set("error_description", desc);
      if (state) to.searchParams.set("state", state);
      return Response.redirect(to.toString(), 302);
    };
    if (responseType !== "code") return back("unsupported_response_type");
    if (!codeChallenge || method !== "S256") return back("invalid_request", "PKCE S256 required");

    // Store the pending request; authenticate the user via Google, carrying the
    // req id through Google's `state` (prefixed so the callback can branch).
    const reqId = randomToken(18);
    const req: AuthReq = { clientId, redirectUri, codeChallenge, clientState: state, scope };
    await kv(env).put(`oauthreq:${reqId}`, JSON.stringify(req), { expirationTtl: REQ_TTL });

    const clientIdG = await getSecret(env, "GOOGLE_CLIENT_ID");
    if (!clientIdG) return back("server_error", "GOOGLE_CLIENT_ID not configured");
    const googleParams = new URLSearchParams({
      client_id: clientIdG,
      redirect_uri: `${base}/auth/google/callback`,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: SCOPES_SUPPORTED.join(" "),
      state: `mcp:${reqId}`,
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${googleParams}`, 302);
  }

  // --- Token endpoint ------------------------------------------------------
  if (p === "/token") {
    if (request.method !== "POST") return oauthError("invalid_request", "POST required", 405);
    const form = new URLSearchParams(await request.text());
    const grantType = form.get("grant_type");

    if (grantType === "authorization_code") {
      const code = form.get("code") ?? "";
      const redirectUri = form.get("redirect_uri") ?? "";
      const clientId = form.get("client_id") ?? "";
      const codeVerifier = form.get("code_verifier") ?? "";

      const rec = await getJson<CodeRec>(env, `oauthcode:${code}`);
      if (!rec) return oauthError("invalid_grant", "Unknown or expired code");
      await kv(env).delete(`oauthcode:${code}`); // single use
      if (rec.clientId !== clientId) return oauthError("invalid_grant", "client_id mismatch");
      if (rec.redirectUri !== redirectUri) return oauthError("invalid_grant", "redirect_uri mismatch");
      if (!codeVerifier || (await s256(codeVerifier)) !== rec.codeChallenge) {
        return oauthError("invalid_grant", "PKCE verification failed");
      }
      return issueTokens(env, rec.sub, rec.scope, rec.clientId);
    }

    if (grantType === "refresh_token") {
      const refreshToken = form.get("refresh_token") ?? "";
      const rec = await getJson<TokRec>(env, `oauthrt:${refreshToken}`);
      if (!rec) return oauthError("invalid_grant", "Unknown or expired refresh_token");
      // OAuth 2.1 §4.3.1: the refresh token must have been issued to the
      // requesting client. Reject cross-client replay.
      if (rec.clientId !== (form.get("client_id") ?? "")) {
        return oauthError("invalid_grant", "refresh_token was not issued to this client");
      }
      return issueTokens(env, rec.sub, rec.scope, rec.clientId, refreshToken);
    }

    return oauthError("unsupported_grant_type");
  }

  return null;
}

// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------

async function issueTokens(
  env: Env,
  sub: string,
  scope: string | undefined,
  clientId: string,
  reuseRefresh?: string,
): Promise<Response> {
  const accessToken = `at_${randomToken()}`;
  await kv(env).put(`oauthtok:${accessToken}`, JSON.stringify({ sub, scope, clientId } satisfies TokRec), {
    expirationTtl: ACCESS_TTL,
  });

  let refreshToken = reuseRefresh;
  if (!refreshToken) {
    refreshToken = `rt_${randomToken()}`;
    await kv(env).put(`oauthrt:${refreshToken}`, JSON.stringify({ sub, scope, clientId } satisfies TokRec), {
      expirationTtl: REFRESH_TTL,
    });
  }

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refreshToken,
    scope,
  });
}

// ---------------------------------------------------------------------------

function isValidRedirect(u: string): boolean {
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:") return true;
    // Allow loopback for native/desktop clients.
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return true;
    return false;
  } catch {
    return false;
  }
}

