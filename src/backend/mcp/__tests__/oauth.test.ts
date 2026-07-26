import { describe, it, expect, beforeEach } from "vitest";
import { handleOAuth, completeMcpAuthorize, resolveAccessToken } from "../oauth";

function kvMock() {
  const m = new Map<string, string>();
  return {
    store: m,
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

let env: Env;
beforeEach(() => {
  env = { SESSIONS: kvMock(), GOOGLE_CLIENT_ID: "gcid", PUBLIC_BASE_URL: "https://mcp.example.dev" } as unknown as Env;
});

function req(path: string, init: RequestInit = {}): Request {
  return new Request(`https://mcp.example.dev${path}`, init);
}

/** PKCE S256 challenge for a verifier (same transform as the server). */
async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("MCP OAuth discovery", () => {
  it("protected-resource metadata points at the MCP resource + auth server", async () => {
    const res = (await handleOAuth(req("/.well-known/oauth-protected-resource"), env))!;
    const body = (await res.json()) as any;
    expect(body.resource).toBe("https://mcp.example.dev/mcp");
    expect(body.authorization_servers).toEqual(["https://mcp.example.dev"]);
  });

  it("authorization-server metadata exposes the required RFC 8414 fields", async () => {
    const res = (await (await handleOAuth(req("/.well-known/oauth-authorization-server"), env))!.json()) as any;
    expect(res.issuer).toBe("https://mcp.example.dev");
    expect(res.authorization_endpoint).toBe("https://mcp.example.dev/authorize");
    expect(res.token_endpoint).toBe("https://mcp.example.dev/token");
    expect(res.registration_endpoint).toBe("https://mcp.example.dev/register");
    expect(res.code_challenge_methods_supported).toEqual(["S256"]);
    expect(res.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
  });
});

describe("MCP OAuth full flow", () => {
  async function registerClient(redirectUri: string): Promise<string> {
    const res = await handleOAuth(
      req("/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [redirectUri], client_name: "Claude" }),
      }),
      env,
    );
    expect(res!.status).toBe(201);
    const body = (await res!.json()) as any;
    expect(body.client_id).toMatch(/^client_/);
    expect(body.token_endpoint_auth_method).toBe("none");
    return body.client_id;
  }

  it("register → authorize → (google) → token → resolve, with PKCE", async () => {
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const clientId = await registerClient(redirectUri);

    const verifier = "verifier-0123456789-0123456789-0123456789-abc";
    const challenge = await challengeFor(verifier);

    // /authorize → 302 to Google, stores a pending request
    const authRes = await handleOAuth(
      req(
        `/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&code_challenge=${challenge}&code_challenge_method=S256&state=client-state-xyz`,
      ),
      env,
    );
    expect(authRes!.status).toBe(302);
    const googleLoc = authRes!.headers.get("location")!;
    expect(googleLoc).toContain("accounts.google.com");
    const googleState = new URL(googleLoc).searchParams.get("state")!;
    expect(googleState).toMatch(/^mcp:/);
    const reqId = googleState.slice(4);

    // Google callback would call this after authenticating the user
    const clientRedirect = await completeMcpAuthorize(env, reqId, "sub-999");
    expect(clientRedirect).toBeTruthy();
    const cbUrl = new URL(clientRedirect!);
    expect(cbUrl.origin + cbUrl.pathname).toBe(redirectUri);
    expect(cbUrl.searchParams.get("state")).toBe("client-state-xyz");
    const code = cbUrl.searchParams.get("code")!;
    expect(code).toBeTruthy();

    // /token exchange with the matching verifier
    const tokRes = await handleOAuth(
      req("/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }).toString(),
      }),
      env,
    );
    expect(tokRes!.status).toBe(200);
    const tok = (await tokRes!.json()) as any;
    expect(tok.token_type).toBe("Bearer");
    expect(tok.access_token).toMatch(/^at_/);
    expect(tok.refresh_token).toMatch(/^rt_/);

    // The access token resolves to the Google sub
    expect(await resolveAccessToken(env, tok.access_token)).toBe("sub-999");

    // refresh_token grant issues a fresh access token
    const refreshRes = await handleOAuth(
      req("/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id: clientId }).toString(),
      }),
      env,
    );
    const refreshed = (await refreshRes!.json()) as any;
    expect(refreshed.access_token).toMatch(/^at_/);
    expect(await resolveAccessToken(env, refreshed.access_token)).toBe("sub-999");
  });

  it("rejects a token exchange with a wrong PKCE verifier", async () => {
    const redirectUri = "https://claude.ai/api/mcp/auth_callback";
    const clientId = await registerClient(redirectUri);
    const challenge = await challengeFor("the-real-verifier-aaaaaaaaaaaaaaaaaaaaaaaa");

    const authRes = await handleOAuth(
      req(
        `/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&code_challenge=${challenge}&code_challenge_method=S256&state=s`,
      ),
      env,
    );
    const reqId = new URL(authRes!.headers.get("location")!).searchParams.get("state")!.slice(4);
    const code = new URL((await completeMcpAuthorize(env, reqId, "sub-1"))!).searchParams.get("code")!;

    const tokRes = await handleOAuth(
      req("/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: "WRONG-verifier-bbbbbbbbbbbbbbbbbbbbbbbb",
        }).toString(),
      }),
      env,
    );
    expect(tokRes!.status).toBe(400);
    expect(((await tokRes!.json()) as any).error).toBe("invalid_grant");
  });

  it("rejects /authorize with an unregistered redirect_uri", async () => {
    const clientId = await registerClient("https://claude.ai/api/mcp/auth_callback");
    const res = await handleOAuth(
      req(
        `/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent("https://evil.example/steal")}` +
          `&code_challenge=abc&code_challenge_method=S256&state=s`,
      ),
      env,
    );
    // Must NOT redirect to the attacker URI — render an error instead.
    expect(res!.status).toBe(400);
  });

  it("returns null for non-OAuth paths (falls through)", async () => {
    expect(await handleOAuth(req("/gws"), env)).toBeNull();
  });
});
