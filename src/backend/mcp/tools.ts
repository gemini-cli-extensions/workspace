/**
 * @fileoverview MCP tool catalog for the Google Workspace worker.
 *
 * Each `ToolDef.run` constructs the matching REST service (Tasks 8-11) and
 * returns `{ result, asset? }`. The `asset` field, when present, tells the
 * caller (server.ts) to record a `workspace_assets` touch via
 * `logAssetTouch` — read-only listing tools (`drive_search`, `gmail_list`)
 * omit it since there's no single asset to attribute the read to.
 *
 * Also consumed by `/api/gws/tools` (Task 15) for a human-facing tool list.
 */
import { z } from "zod";

import { DriveService } from "./services/drive";
import { DocsService } from "./services/docs";
import { SheetsService } from "./services/sheets";
import { GmailService } from "./services/gmail";
import type { AssetAction } from "./logging";

export type ToolCtx = { env: Env; sub: string };

export type ToolAsset = {
  assetType: string;
  googleId: string;
  title?: string;
  url?: string;
  action: AssetAction;
  detail?: Record<string, unknown>;
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  run(ctx: ToolCtx, args: any): Promise<{ result: unknown; asset?: ToolAsset }>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "drive_search",
    description: "Search Google Drive files. Optional query in Drive query syntax.",
    inputSchema: z.object({
      query: z.string().optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
    async run({ env, sub }, a) {
      const out = await new DriveService(env, sub).search(a.query, a.pageSize);
      return { result: out };
    },
  },
  {
    name: "drive_create_folder",
    description: "Create a Drive folder.",
    inputSchema: z.object({ name: z.string(), parentId: z.string().optional() }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, sub).createFolder(a.name, a.parentId);
      return {
        result: f,
        asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { name: a.name } },
      };
    },
  },
  {
    name: "docs_get",
    description: "Get a Google Doc by id.",
    inputSchema: z.object({ documentId: z.string() }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, sub).get(a.documentId);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "read" } };
    },
  },
  {
    name: "docs_create",
    description: "Create a Google Doc with a title.",
    inputSchema: z.object({ title: z.string() }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, sub).create(a.title);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "create" } };
    },
  },
  {
    name: "docs_insert_text",
    description: "Insert text into a Google Doc at an index (default 1).",
    inputSchema: z.object({ documentId: z.string(), text: z.string(), index: z.number().int().optional() }),
    async run({ env, sub }, a) {
      await new DocsService(env, sub).insertText(a.documentId, a.text, a.index);
      return {
        result: { ok: true },
        asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { inserted: a.text.length } },
      };
    },
  },
  {
    name: "sheets_create",
    description: "Create a spreadsheet with a title.",
    inputSchema: z.object({ title: z.string() }),
    async run({ env, sub }, a) {
      const s = await new SheetsService(env, sub).create(a.title);
      return { result: s, asset: { assetType: "sheet", googleId: s.spreadsheetId, title: a.title, action: "create" } };
    },
  },
  {
    name: "sheets_get_values",
    description: "Read a range of values from a spreadsheet (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string() }),
    async run({ env, sub }, a) {
      const v = await new SheetsService(env, sub).getValues(a.spreadsheetId, a.range);
      return { result: v, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "read", detail: { range: a.range } } };
    },
  },
  {
    name: "sheets_append_values",
    description: "Append rows to a spreadsheet range (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.string())) }),
    async run({ env, sub }, a) {
      await new SheetsService(env, sub).appendValues(a.spreadsheetId, a.range, a.values);
      return {
        result: { ok: true },
        asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "update", detail: { rows: a.values.length } },
      };
    },
  },
  {
    name: "gmail_list",
    description: "List Gmail messages matching an optional query.",
    inputSchema: z.object({ query: z.string().optional(), maxResults: z.number().int().min(1).max(100).optional() }),
    async run({ env, sub }, a) {
      const out = await new GmailService(env, sub).listMessages(a.query, a.maxResults);
      return { result: out };
    },
  },
  {
    name: "gmail_send",
    description: "Send a plain-text email.",
    inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
    async run({ env, sub }, a) {
      const sent = await new GmailService(env, sub).send(a.to, a.subject, a.body);
      return { result: sent, asset: { assetType: "gmail", googleId: sent.id, title: a.subject, action: "create", detail: { to: a.to } } };
    },
  },
];
