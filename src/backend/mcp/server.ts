/**
 * @fileoverview Stateless MCP `/mcp` endpoint — hand-rolled JSON-RPC 2.0
 * over `fetch`, not the `@modelcontextprotocol/sdk` transport.
 *
 * `@modelcontextprotocol/sdk` is not installed in this project, and its
 * `StreamableHTTPServerTransport` is built around Node's `http.IncomingMessage`
 * / `ServerResponse` — it doesn't bridge cleanly onto a Workers `fetch`
 * `Request`/`Response`. Rather than pull in the SDK plus a Node-compat shim,
 * this implements the documented fallback: a small stateless JSON-RPC 2.0
 * handler that dispatches directly against `TOOLS` (tools.ts). No sessions,
 * no Durable Objects — every request is independently authenticated and
 * handled.
 */
import { z } from "zod";

import { verifySessionCookie } from "@/backend/lib/cookies";
import { logOperation, logAssetTouch } from "./logging";
import { TOOLS } from "./tools";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method: string; params?: any };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const JSON_HEADERS = { "content-type": "application/json" };

/** Resolves the authenticated Google `sub` from a bearer token or session cookie. */
async function resolveSub(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = await verifySessionCookie(env, `cr_session=${auth.slice(7)}`);
    if (payload) return payload.sub;
  }
  const payload = await verifySessionCookie(env, request.headers.get("cookie"));
  return payload?.sub ?? null;
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Best-effort `id` extraction for error responses when the body shape itself is untrusted. */
function extractId(raw: unknown): string | number | null {
  if (raw && typeof raw === "object" && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    return typeof id === "string" || typeof id === "number" ? id : null;
  }
  return null;
}

/**
 * Validates + dispatches a single untrusted JSON-RPC element. `/mcp` is a
 * public endpoint, so `raw` may be anything a caller sent as JSON (an array
 * element, `null`, a string, an object missing `method`, ...) — never assume
 * it matches `JsonRpcRequest` before checking its shape. Any error thrown
 * below (including unexpected bugs in `dispatch`) is caught here so callers
 * always get a JSON-RPC error instead of an unhandled exception.
 */
async function safeDispatch(raw: unknown, env: Env, sub: string | null): Promise<JsonRpcResponse | null> {
  const id = extractId(raw);
  if (typeof raw !== "object" || raw === null || typeof (raw as { method?: unknown }).method !== "string") {
    return rpcError(id, -32600, "Invalid Request");
  }
  try {
    return await dispatch(raw as JsonRpcRequest, env, sub);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return rpcError(id, -32603, `Internal error: ${msg}`);
  }
}

/** Dispatches a single well-formed JSON-RPC request. Returns `null` for notifications (no `id`, no response body owed). */
async function dispatch(req: JsonRpcRequest, env: Env, sub: string | null): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const method = req.method;

  if (method.startsWith("notifications/")) {
    return null;
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "google-workspace-mcp", version: "1.0.0" },
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: z.toJSONSchema(t.inputSchema),
        })),
      });

    case "tools/call": {
      if (!sub) {
        return rpcError(id, -32001, "Unauthorized. Sign in at /auth/google.");
      }
      const name = req.params?.name;
      const args = req.params?.arguments ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return rpcError(id, -32602, `Unknown tool: ${name}`);
      }

      let parsedArgs: any;
      try {
        parsedArgs = tool.inputSchema.parse(args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return rpcError(id, -32602, `Invalid arguments: ${msg}`);
      }

      const started = Date.now();
      try {
        const { result, asset } = await tool.run({ env, sub }, parsedArgs);
        await logOperation(env, {
          toolName: tool.name,
          request: parsedArgs,
          response: result,
          success: true,
          latencyMs: Date.now() - started,
        });
        if (asset) {
          await logAssetTouch(env, { userSub: sub, toolName: tool.name, ...asset });
        }
        return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logOperation(env, {
          toolName: tool.name,
          request: parsedArgs,
          success: false,
          errorMessage: msg,
          latencyMs: Date.now() - started,
        });
        return rpcResult(id, { content: [{ type: "text", text: `Error: ${msg}` }], isError: true });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcpRequest(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. POST JSON-RPC 2.0 requests to /mcp." }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, "Parse error: invalid JSON")), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const sub = await resolveSub(request, env);

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((r) => safeDispatch(r, env, sub)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    if (responses.length === 0) {
      return new Response(null, { status: 202 });
    }
    return new Response(JSON.stringify(responses), { status: 200, headers: JSON_HEADERS });
  }

  const response = await safeDispatch(body, env, sub);
  if (response === null) {
    return new Response(null, { status: 202 });
  }
  return new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS });
}
