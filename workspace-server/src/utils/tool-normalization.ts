/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Utility for normalizing tool names
/**
 * Wraps the McpServer.registerTool method to normalize tool names.
 * If useDotNames is true, dots in tool names are preserved.
 * If useDotNames is false (default), dots are replaced with underscores.
 *
 * @param server The McpServer instance to modify.
 * @param useDotNames Whether to preserve dot notation in tool names.
 */
export function applyToolNameNormalization(
  server: McpServer,
  useDotNames: boolean,
): void {
  const separator = useDotNames ? '.' : '_';
  const originalRegisterTool = server.registerTool.bind(server);

  // We use `any` for the override to match the varying signatures of registerTool
  // while maintaining the runtime behavior we need.
  // The original signature is roughly:
  // registerTool(name: string, toolDef: Tool, handler: ToolHandler): void
  (server as any).registerTool = (name: string, ...rest: unknown[]) => {
    const normalizedName = name.replace(/\./g, separator);
    // Cast originalRegisterTool to accept spread arguments
    return (originalRegisterTool as (...args: unknown[]) => unknown)(
      normalizedName,
      ...rest,
    );
  };
}
