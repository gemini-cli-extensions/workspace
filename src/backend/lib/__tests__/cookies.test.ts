import { describe, it, expect } from "vitest";
import { createSessionCookie, verifySessionCookie } from "../cookies";

// ponytail: getCookieSigningKey(env) reads env.SESSIONS.get("COOKIE_SIGNING_KEY")
// (a KV binding), not a plain COOKIE_SIGNING_KEY env var — mock the KV shape.
const env = {
  SESSIONS: { get: async () => "test-key-please-change" },
} as unknown as Env;

describe("cookies multi-user", () => {
  it("round-trips an arbitrary google sub", async () => {
    const setCookie = await createSessionCookie(env, { sub: "google-sub-123", email: "a@b.com" });
    const raw = setCookie.split(";")[0]; // "cr_session=payload.sig"
    const payload = await verifySessionCookie(env, raw);
    expect(payload?.sub).toBe("google-sub-123");
    expect(payload?.email).toBe("a@b.com");
  });
});
