/**
 * @fileoverview Stateless MCP request handler — placeholder.
 *
 * TODO(task 14): replace with the real stateless /mcp handler + tool catalog.
 */

export async function handleMcpRequest(
  _request: Request,
  _env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  return new Response("MCP not yet wired", { status: 501 });
}
