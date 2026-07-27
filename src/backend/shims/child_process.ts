/**
 * @fileoverview Browser/Worker shim for Node's `child_process`.
 *
 * The `ai` package transitively pulls `@ai-sdk/mcp`'s stdio transport, which
 * imports `child_process.spawn`. That stdio transport is only meaningful when
 * spawning a local MCP subprocess — something this app never does (our MCP
 * server uses `@modelcontextprotocol/sdk` over HTTP). This shim satisfies the
 * `{ spawn }` named import at bundle time so the client/island build doesn't
 * fail; calling it throws, which is correct since it is never reachable.
 */

/** Not supported in this runtime. */
export function spawn(): never {
  throw new Error("child_process.spawn is not available in this runtime");
}

export default { spawn };
