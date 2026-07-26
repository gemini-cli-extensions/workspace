import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { agentAuthMiddleware } from "../agent-auth";

const env: any = { WORKER_API_KEY: "worker-secret" };

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("/protected/*", agentAuthMiddleware);
  app.get("/protected/thing", (c) => c.json({ ok: true }));
  return app;
}

describe("agentAuthMiddleware", () => {
  it("401s a request with no credentials", async () => {
    const app = buildApp();
    const res = await app.request("/protected/thing", {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("401s a request with a wrong bearer token", async () => {
    const app = buildApp();
    const res = await app.request(
      "/protected/thing",
      { headers: { Authorization: "Bearer nope" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("401s a request that tries the query-string token path (no longer accepted)", async () => {
    const app = buildApp();
    const res = await app.request("/protected/thing?token=worker-secret", {}, env);
    expect(res.status).toBe(401);
  });

  it("passes through with a valid worker-key bearer token", async () => {
    const app = buildApp();
    const res = await app.request(
      "/protected/thing",
      { headers: { Authorization: "Bearer worker-secret" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("passes through with a valid gsuite_session cookie", async () => {
    const app = buildApp();
    // Mint a real session token the same way the login route does, then
    // present it as the cookie agentAuthMiddleware reads.
    const { mintSessionToken } = await import("@/backend/auth/session-token");
    const token = await mintSessionToken(env);
    expect(token).toBeTruthy();

    const res = await app.request(
      "/protected/thing",
      { headers: { cookie: `gsuite_session=${token}` } },
      env,
    );
    expect(res.status).toBe(200);
  });
});
