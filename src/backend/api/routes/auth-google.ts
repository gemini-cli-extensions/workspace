/**
 * @fileoverview Google OAuth login + callback handler.
 *
 * `GET /auth/google`          → 302 redirect to Google's consent screen.
 * `GET /auth/google/callback` → exchanges the auth code, stores the refresh
 *                                token in KV, sets the session cookie, and
 *                                302s to `/gws`.
 *
 * CSRF protection: the login step mints a random `state`, echoes it to
 * Google, and stashes it in a short-lived `gws_oauth_state` cookie. The
 * callback rejects unless the query `state` matches the cookie.
 *
 * Never log `code`, `client_secret`, `refresh_token`, `access_token`, or
 * `id_token`.
 */
import { SCOPE_STRING } from "@/backend/mcp/scopes";
import { getSecret } from "@/backend/utils/secrets";
import { saveUser } from "@/backend/mcp/tokenProvider";
import { createSessionCookie, readCookie } from "@/backend/lib/cookies";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_COOKIE = "gws_oauth_state";
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes

function baseUrl(env: Env, req: Request): string {
  return (env as any).PUBLIC_BASE_URL || new URL(req.url).origin;
}

function redirectUri(env: Env, req: Request): string {
  return `${baseUrl(env, req)}/auth/google/callback`;
}

function decodeJwtPayload(idToken: string): { sub: string; email?: string } {
  const part = idToken.split(".")[1];
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );
  return JSON.parse(json);
}

async function requireSecret(env: Env, key: string): Promise<string> {
  const value = await getSecret(env, key);
  if (!value) throw new Error(`Missing ${key} secret — set it before using /auth/google`);
  return value;
}

export async function handleGoogleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/auth/google") {
    const clientId = await requireSecret(env, "GOOGLE_CLIENT_ID");
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(env, request),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: SCOPE_STRING,
      state,
    });

    const headers = new Headers({ location: `${AUTH_URL}?${params}` });
    headers.append(
      "set-cookie",
      `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_COOKIE_MAX_AGE}; Path=/auth/google`,
    );
    return new Response(null, { status: 302, headers });
  }

  if (url.pathname === "/auth/google/callback") {
    const state = url.searchParams.get("state");
    const cookieState = readCookie(request.headers.get("cookie"), STATE_COOKIE);
    if (!state || !cookieState || state !== cookieState) {
      return new Response("Invalid OAuth state", { status: 400 });
    }

    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code", { status: 400 });

    const clientId = await requireSecret(env, "GOOGLE_CLIENT_ID");
    const clientSecret = await requireSecret(env, "GOOGLE_CLIENT_SECRET");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(env, request),
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return new Response(`Token exchange failed: ${res.status}`, { status: 502 });

    const tok = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token: string;
    };
    if (!tok.refresh_token) {
      // Google only returns refresh_token on first consent; prompt=consent forces it.
      return new Response("No refresh_token returned; revoke app access and retry.", {
        status: 400,
      });
    }

    const { sub, email } = decodeJwtPayload(tok.id_token);
    await saveUser(env, {
      sub,
      email,
      refreshToken: tok.refresh_token,
      scopes: SCOPE_STRING.split(" "),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    const sessionCookie = await createSessionCookie(env, { sub, email });
    const headers = new Headers({ location: "/gws/connect" });
    headers.append("set-cookie", sessionCookie);
    headers.append("set-cookie", `${STATE_COOKIE}=; Max-Age=0; Path=/auth/google`);
    return new Response(null, { status: 302, headers });
  }

  return new Response("Not found", { status: 404 });
}
