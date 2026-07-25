import { describe, it, expect, vi } from "vitest";

import { createSessionCookie } from "@/backend/lib/cookies";

// Finding 1(d): `tools/call` must not persist raw arg values or response bodies
// into `mcp_logs` (that table is served, sanitized-or-not, to any signed-in
// caller via `/api/gws/operations`). Mock `./tools` with a fake tool carrying
// an obviously-sensitive arg, and `./logging` to capture exactly what
// `logOperation` was called with — then assert the secret value never
// appears in the call, only its key name.
const logOperationSpy = vi.fn(async (_env: unknown, _opts: Record<string, unknown>) => {});
vi.mock("../logging", () => ({
  logOperation: logOperationSpy,
  logAssetTouch: vi.fn(async () => {}),
}));

const FAKE_RESULT = { ok: true, body: "sensitive response body" };
vi.mock("../tools", () => ({
  TOOLS: [
    {
      name: "fake_tool",
      description: "test-only tool",
      inputSchema: { parse: (a: unknown) => a },
      async run() {
        return { result: FAKE_RESULT };
      },
    },
  ],
}));

const { handleMcpRequest } = await import("../server");

const env = { SESSIONS: { get: async () => "test-key-please-change" } } as unknown as Env;
const ctx = {} as ExecutionContext;

async function bearerFor(sub: string): Promise<string> {
  const setCookie = await createSessionCookie(env, { sub });
  return setCookie.split(";")[0].slice("cr_session=".length);
}

describe("tools/call logging redaction", () => {
  it("logs only argument key names, never argument values or the response body", async () => {
    const token = await bearerFor("s1");
    const res = await handleMcpRequest(
      new Request("https://example.workers.dev/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "fake_tool", arguments: { secretValue: "topsecret", count: 3 } },
        }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(logOperationSpy).toHaveBeenCalledTimes(1);

    const logged = logOperationSpy.mock.calls[0][1];
    expect(logged.toolName).toBe("fake_tool");
    expect(logged.request).toEqual({ keys: ["secretValue", "count"] });
    expect(logged).not.toHaveProperty("response");

    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain("topsecret");
    expect(serialized).not.toContain("sensitive response body");
  });
});
