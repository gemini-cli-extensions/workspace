import { describe, it, expect, vi } from "vitest";
import { handleGoogleAuth } from "../auth-google";

const env: any = {
  SESSIONS: (() => {
    const s = new Map();
    return {
      get: async (k: string) => s.get(k) ?? null,
      put: async (k: string, v: string) => void s.set(k, v),
    };
  })(),
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "secret",
  PUBLIC_BASE_URL: "https://example.workers.dev",
  COOKIE_SIGNING_KEY: "k",
};

describe("google auth", () => {
  it("GET /auth/google redirects to Google consent", async () => {
    const res = await handleGoogleAuth(new Request("https://example.workers.dev/auth/google"), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("accounts.google.com");
    expect(loc).toContain("access_type=offline");
    expect(loc).toContain("spreadsheets");
  });

  it("callback exchanges code, stores user, sets cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          id_token: "h." + btoa(JSON.stringify({ sub: "sub9", email: "x@y.com" })) + ".s",
        }),
        { status: 200 },
      ),
    );
    const res = await handleGoogleAuth(
      new Request("https://example.workers.dev/auth/google/callback?code=abc&state=xyz", {
        headers: { cookie: "gws_oauth_state=xyz" },
      }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("cr_session=");
    expect(await env.SESSIONS.get("gwsuser:sub9")).toContain("rt");
  });

  it("callback rejects mismatched/absent state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const callsBefore = fetchSpy.mock.calls.length;
    const resMismatch = await handleGoogleAuth(
      new Request("https://example.workers.dev/auth/google/callback?code=abc&state=xyz", {
        headers: { cookie: "gws_oauth_state=different" },
      }),
      env,
    );
    expect(resMismatch.status).toBe(400);

    const resAbsent = await handleGoogleAuth(
      new Request("https://example.workers.dev/auth/google/callback?code=abc&state=xyz"),
      env,
    );
    expect(resAbsent.status).toBe(400);
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });
});
