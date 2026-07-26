/**
 * @fileoverview AI SDK tool definitions for the Drive agent chat surface.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GoogleDriveClient } from "@/backend/google";

/**
 * Build the Drive chat tool set bound to a client instance.
 */
export function buildDriveTools(client: GoogleDriveClient): ToolSet {
  return {
    search: tool({
      description: "Search Drive files with a Drive query string.",
      inputSchema: z.object({ q: z.string() }),
      execute: async ({ q }) => client.search(q),
    }),
    listRecent: tool({
      description: "List the most recently modified Drive files.",
      inputSchema: z.object({ n: z.number().int().min(1).max(100).default(20) }),
      execute: async ({ n }) => client.recent(n),
    }),
    createFolder: tool({
      description: "Create a Drive folder.",
      inputSchema: z.object({ name: z.string(), parentId: z.string().optional() }),
      execute: async ({ name, parentId }) => client.createFolder(name, parentId),
    }),
    moveFile: tool({
      description: "Move a file into a folder.",
      inputSchema: z.object({ fileId: z.string(), folderId: z.string() }),
      execute: async ({ fileId, folderId }) => client.moveFile(fileId, folderId),
    }),
    renameFile: tool({
      description: "Rename a file.",
      inputSchema: z.object({ fileId: z.string(), newName: z.string() }),
      execute: async ({ fileId, newName }) => client.renameFile(fileId, newName),
    }),
  };
}
