/**
 * @fileoverview AI SDK tool definitions for the Docs agent chat surface.
 *
 * Mirrors the `@callable()` RPC methods on {@link DocsAgent} and delegates to the
 * same Docs/Drive clients.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GoogleDocsClient, GoogleDriveClient } from "@/backend/google";

/**
 * Build the Docs chat tool set bound to specific client instances.
 *
 * @param docs  Docs client bound to the active account.
 * @param drive Drive client bound to the active account (for create/copy).
 */
export function buildDocsTools(
  docs: GoogleDocsClient,
  drive: GoogleDriveClient,
): ToolSet {
  return {
    readDocument: tool({
      description: "Read a Google Doc and return its Markdown content.",
      inputSchema: z.object({ docId: z.string() }),
      execute: async ({ docId }) => docs.read(docId),
    }),
    createDocument: tool({
      description: "Create a new Google Doc from HTML content.",
      inputSchema: z.object({
        name: z.string(),
        html: z.string().default("<p></p>"),
        parentFolderId: z.string().optional(),
      }),
      execute: async ({ name, html, parentFolderId }) =>
        drive.createDocFromHtml(name, html, parentFolderId),
    }),
    appendText: tool({
      description: "Append plain text to the end of a Google Doc.",
      inputSchema: z.object({ docId: z.string(), text: z.string() }),
      execute: async ({ docId, text }) => docs.append(docId, text),
    }),
    replaceAllText: tool({
      description: "Replace all occurrences of text in a Google Doc.",
      inputSchema: z.object({
        docId: z.string(),
        find: z.string(),
        replace: z.string(),
      }),
      execute: async ({ docId, find, replace }) =>
        docs.replaceAllText(docId, find, replace),
    }),
    listComments: tool({
      description: "List comments on a Google Doc, optionally filtered.",
      inputSchema: z.object({ docId: z.string(), filter: z.string().optional() }),
      execute: async ({ docId, filter }) => docs.listComments(docId, filter),
    }),
  };
}
