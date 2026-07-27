import { describe, it, expect, vi } from "vitest";
import { getDwdAccessToken } from "../dwd";

function kvWith(entries: Record<string, string> = {}) {
  const m = new Map(Object.entries(entries));
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  };
}

describe("getDwdAccessToken", () => {
  it("returns a cached token without signing or fetching", async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const env = {
      SESSIONS: kvWith({ "dwdtok:user@corp.com": JSON.stringify({ access_token: "cached-at", exp }) }),
    } as unknown as Env;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const tok = await getDwdAccessToken(env, "user@corp.com");
    expect(tok).toBe("cached-at");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a clear error when the service-account key is not configured", async () => {
    const env = {
      SESSIONS: kvWith(),
      GOOGLE_CREDS_SA_CLIENT_EMAIL: "sa@project.iam.gserviceaccount.com",
      // no GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1/_2
    } as unknown as Env;
    await expect(getDwdAccessToken(env, "user@corp.com")).rejects.toThrow(/private key not configured/i);
  });

  it("throws when the service-account client email is missing", async () => {
    const env = { SESSIONS: kvWith() } as unknown as Env;
    await expect(getDwdAccessToken(env, "user@corp.com")).rejects.toThrow(/CLIENT_EMAIL/);
  });
});
