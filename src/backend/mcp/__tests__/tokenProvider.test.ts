import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAccessToken, saveUser } from "../tokenProvider";

function kvMock() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    delete: vi.fn(async (k: string) => void store.delete(k)),
  };
}

describe("tokenProvider", () => {
  let env: any;
  beforeEach(() => {
    env = {
      SESSIONS: kvMock(),
      GOOGLE_CLIENT_ID: { get: async () => "cid" }, // secrets-store style
      GOOGLE_CLIENT_SECRET: { get: async () => "secret" },
    };
  });

  it("refreshes and caches an access token when none is cached", async () => {
    await saveUser(env, { sub: "s1", refreshToken: "rt", scopes: [], updatedAt: 0 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at-123", expires_in: 3600 }), { status: 200 }),
    );
    const tok = await getAccessToken(env, "s1");
    expect(tok).toBe("at-123");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await env.SESSIONS.get("gwstok:s1")).toContain("at-123");

    // second call is served from cache (no new fetch)
    const tok2 = await getAccessToken(env, "s1");
    expect(tok2).toBe("at-123");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
