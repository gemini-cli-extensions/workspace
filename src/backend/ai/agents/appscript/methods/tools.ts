/**
 * @fileoverview AI SDK tool definitions for the Apps Script agent chat surface.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { AppsScriptClient } from "@/backend/google";

/** Zod schema for an Apps Script file. */
const scriptFileSchema = z.object({
  name: z.string(),
  type: z.enum(["SERVER_JS", "HTML", "JSON"]),
  source: z.string(),
});

/**
 * Build the Apps Script chat tool set bound to a client instance.
 */
export function buildAppsScriptTools(client: AppsScriptClient): ToolSet {
  return {
    listProjects: tool({
      description: "List the user's Apps Script projects.",
      inputSchema: z.object({}),
      execute: async () => client.listProjects(),
    }),
    createStandalone: tool({
      description: "Create a standalone Apps Script project.",
      inputSchema: z.object({ title: z.string() }),
      execute: async ({ title }) => client.createStandalone(title),
    }),
    createBoundScript: tool({
      description: "Create a container-bound Apps Script for a Doc/Sheet/Slide.",
      inputSchema: z.object({ parentId: z.string(), title: z.string() }),
      execute: async ({ parentId, title }) => client.createBoundScript(parentId, title),
    }),
    updateContent: tool({
      description: "Replace an Apps Script project's source files.",
      inputSchema: z.object({ scriptId: z.string(), files: z.array(scriptFileSchema) }),
      execute: async ({ scriptId, files }) => client.updateContent(scriptId, files),
    }),
    getContent: tool({
      description: "Read an Apps Script project's source files.",
      inputSchema: z.object({ scriptId: z.string() }),
      execute: async ({ scriptId }) => client.getContent(scriptId),
    }),
  };
}
