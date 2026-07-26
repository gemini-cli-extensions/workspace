/**
 * @fileoverview AI SDK tool definitions for the Gmail agent's chat surface.
 *
 * Each tool mirrors a `@callable()` RPC method on {@link GmailAgent} and
 * delegates to the same {@link GmailClient} instance, so chat-driven actions and
 * RPC-driven actions share one implementation and one persistence path.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GmailClient } from "@/backend/google";

/**
 * Build the Gmail chat tool set bound to a specific client instance.
 *
 * @param client A Gmail client already bound to the active account.
 * @returns A {@link ToolSet} for use in `streamText`.
 */
export function buildGmailTools(client: GmailClient): ToolSet {
  return {
    searchMessages: tool({
      description: "Search Gmail messages using a Gmail search query.",
      inputSchema: z.object({
        query: z.string().describe("Gmail search query, e.g. 'from:boss is:unread'"),
        maxResults: z.number().int().min(1).max(100).default(10),
      }),
      execute: async ({ query, maxResults }) =>
        client.searchMessages(query, maxResults),
    }),
    getMessage: tool({
      description: "Fetch a single Gmail message by id.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => client.getMessage(id),
    }),
    sendMessage: tool({
      description: "Send an email from the user's Gmail account.",
      inputSchema: z.object({
        to: z.email(),
        subject: z.string(),
        body: z.string(),
        cc: z.email().optional(),
        bcc: z.email().optional(),
        html: z.boolean().optional(),
      }),
      execute: async (input) => client.sendMessage(input),
    }),
    listLabels: tool({
      description: "List all Gmail labels.",
      inputSchema: z.object({}),
      execute: async () => client.listLabels(),
    }),
    modifyMessageLabels: tool({
      description: "Add and/or remove labels on a Gmail message.",
      inputSchema: z.object({
        id: z.string(),
        add: z.array(z.string()).default([]),
        remove: z.array(z.string()).default([]),
      }),
      execute: async ({ id, add, remove }) =>
        client.modifyMessageLabels(id, add, remove),
    }),
  };
}
