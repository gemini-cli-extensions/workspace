import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionCookie } from "@/backend/lib/cookies";
import { handleMcpRequest } from "../server";

// ponytail: getCookieSigningKey(env) reads env.SESSIONS.get("COOKIE_SIGNING_KEY")
// (a KV binding), not a plain env var — mock the KV shape (matches cookies.test.ts).
const env = {
  SESSIONS: { get: async () => "test-key-please-change" },
} as unknown as Env;

const ctx = {} as ExecutionContext;

async function bearerFor(sub: string): Promise<string> {
  const setCookie = await createSessionCookie(env, { sub });
  const raw = setCookie.split(";")[0]; // "cr_session=payload.sig"
  return raw.slice("cr_session=".length);
}

function rpc(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://example.workers.dev/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

type RpcBody = { result?: any; error?: { code: number; message: string } };

async function rpcJson(res: Response): Promise<RpcBody> {
  return (await res.json()) as RpcBody;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("handleMcpRequest", () => {
  it("initialize returns protocolVersion + serverInfo without auth", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }), env, ctx);
    expect(res.status).toBe(200);
    const body = await rpcJson(res);
    expect(body.result.protocolVersion).toBe("2024-11-05");
    expect(body.result.serverInfo).toEqual({ name: "google-workspace-mcp", version: "1.0.0" });
  });

  it("tools/list returns the catalog with JSON Schema input shapes, no auth required", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }), env, ctx);
    expect(res.status).toBe(200);
    const body = await rpcJson(res);
    const names = body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(["drive_search", "docs_create", "sheets_get_values", "gmail_send"]));
    for (const t of body.result.tools) {
      expect(typeof t.inputSchema).toBe("object");
      expect(t.inputSchema).not.toBeNull();
    }
  });

  it("tools/call with no auth returns a JSON-RPC error and never executes the tool", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await handleMcpRequest(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "drive_search", arguments: {} } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await rpcJson(res);
    expect(body.result).toBeUndefined();
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32001);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tools/call with auth but an unknown tool name returns -32602 and never hits the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const token = await bearerFor("s1");
    const res = await handleMcpRequest(
      rpc(
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "not_a_real_tool", arguments: {} } },
        { authorization: `Bearer ${token}` },
      ),
      env,
      ctx,
    );
    const body = await rpcJson(res);
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32602);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tools/call with auth but invalid arguments returns -32602 and never hits the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const token = await bearerFor("s1");
    const res = await handleMcpRequest(
      rpc(
        // gmail_send requires to/subject/body; send nothing.
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "gmail_send", arguments: {} } },
        { authorization: `Bearer ${token}` },
      ),
      env,
      ctx,
    );
    const body = await rpcJson(res);
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32602);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("notifications/* return HTTP 202 with no JSON-RPC body", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }), env, ctx);
    expect(res.status).toBe(202);
    const text = await res.text();
    expect(text).toBe("");
  });

  it("unknown method returns -32601", async () => {
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 6, method: "bogus/method" }), env, ctx);
    const body = await rpcJson(res);
    expect(body.error!.code).toBe(-32601);
  });

  it("rejects non-POST requests with 405", async () => {
    const res = await handleMcpRequest(new Request("https://example.workers.dev/mcp", { method: "GET" }), env, ctx);
    expect(res.status).toBe(405);
  });

  it("a request missing `method` degrades to -32600 instead of throwing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await handleMcpRequest(rpc({ jsonrpc: "2.0", id: 1 }), env, ctx);
    expect(res.status).toBe(200);
    const body = await rpcJson(res);
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32600);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a non-JSON body degrades to a parse error instead of throwing", async () => {
    const res = await handleMcpRequest(
      new Request("https://example.workers.dev/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      env,
      ctx,
    );
    expect([400, 200]).toContain(res.status);
    const body = await rpcJson(res);
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBe(-32700);
  });
});
