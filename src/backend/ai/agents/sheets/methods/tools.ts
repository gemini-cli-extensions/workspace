/**
 * @fileoverview AI SDK tool definitions for the Sheets agent chat surface.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { GoogleSheetsClient } from "@/backend/google";

/**
 * Build the Sheets chat tool set bound to a client instance.
 */
export function buildSheetsTools(client: GoogleSheetsClient): ToolSet {
  return {
    createSpreadsheet: tool({
      description: "Create a new Google Spreadsheet.",
      inputSchema: z.object({ title: z.string() }),
      execute: async ({ title }) => client.createSpreadsheet(title),
    }),
    readRange: tool({
      description: "Read a range of values from a spreadsheet.",
      inputSchema: z.object({ id: z.string(), range: z.string() }),
      execute: async ({ id, range }) => client.read(id, range),
    }),
    writeRange: tool({
      description: "Write a 2D array of values to a range.",
      inputSchema: z.object({
        id: z.string(),
        range: z.string(),
        values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
      }),
      execute: async ({ id, range, values }) => client.write(id, range, values),
    }),
    appendRange: tool({
      description: "Append rows to a range.",
      inputSchema: z.object({
        id: z.string(),
        range: z.string(),
        values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
      }),
      execute: async ({ id, range, values }) => client.append(id, range, values),
    }),
    listSpreadsheets: tool({
      description: "List the user's spreadsheets.",
      inputSchema: z.object({}),
      execute: async () => client.list(),
    }),
  };
}
