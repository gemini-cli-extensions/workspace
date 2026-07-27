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
import { resolveAccessToken, oauthBaseUrl } from "./oauth";
import { TOOLS } from "./tools";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method: string; params?: any };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};
const JSON_HEADERS = { "content-type": "application/json", ...CORS_HEADERS };

/**
 * Resolves the authenticated Google `sub` from either:
 *   1. an OAuth access token we issued (the claude.ai web-connector flow), or
 *   2. a session-cookie value passed as a bearer (Claude Code / Desktop), or
 *   3. the browser session cookie itself.
 */
async function resolveSub(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const oauthSub = await resolveAccessToken(env, token);
    if (oauthSub) return oauthSub;
    const payload = await verifySessionCookie(env, `cr_session=${token}`);
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
        // ponytail: mcp_logs is served by public-ish /api/gws/operations to any
        // signed-in user — never persist raw arg values or response bodies
        // (gmail_send body, gmail_list contents, etc). Key names are enough for
        // the operations-log UI (tool name / success / latency / timestamp).
        await logOperation(env, {
          toolName: tool.name,
          request: { keys: Object.keys(parsedArgs ?? {}) },
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
          request: { keys: Object.keys(parsedArgs ?? {}) },
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
  // CORS preflight for browser-based MCP clients (e.g. claude.ai).
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
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

  // Unauthenticated → real HTTP 401 with the resource-metadata pointer so
  // spec-compliant clients (claude.ai) discover the OAuth server and authorize.
  if (!sub) {
    const base = oauthBaseUrl(env, request);
    return new Response(JSON.stringify(rpcError(extractId(body), -32001, "Unauthorized")), {
      status: 401,
      headers: {
        ...JSON_HEADERS,
        "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
      },
    });
  }

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
