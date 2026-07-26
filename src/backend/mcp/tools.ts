/**
 * @fileoverview MCP tool catalog for the Google Workspace worker.
 *
 * Each `ToolDef.run` constructs the matching REST service and returns
 * `{ result, asset? }`. The `asset` field, when present, tells server.ts to
 * record a `workspace_assets` touch via `logAssetTouch`.
 *
 * Every tool accepts an optional `as_user` (a Workspace email). When present,
 * the call runs via Domain-Wide Delegation impersonating that user (the
 * `acct()` helper turns it into a `dwd:<email>` account ref that
 * `getAccessToken` routes to the service account). When absent, the call uses
 * the signed-in OAuth account (the default). See tokenProvider + dwd.
 *
 * Also consumed by `/api/gws/tools` for a human-facing tool list.
 */
import { z } from "zod";
import { eq, desc } from "drizzle-orm";

import { getDb } from "@/db";
import { templateArtifacts } from "@db/schemas";
import { DriveService } from "./services/drive";
import { DocsService } from "./services/docs";
import { SheetsService } from "./services/sheets";
import { GmailService } from "./services/gmail";
import { SlidesService } from "./services/slides";
import { CalendarService } from "./services/calendar";
import { AppsScriptService } from "./services/appsscript";
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

/** Optional impersonation field mixed into every tool schema. */
const asUser = {
  as_user: z
    .string()
    .email()
    .optional()
    .describe("Optional Workspace email to act as via domain-wide delegation. Omit to use the signed-in account (default)."),
};

/** Resolve the account ref for a call: DWD impersonation, or the OAuth caller. */
function acct(sub: string, a: { as_user?: string }): string {
  return a.as_user ? `dwd:${a.as_user}` : sub;
}

export const TOOLS: ToolDef[] = [
  // ---- Drive -------------------------------------------------------------
  {
    name: "drive_search",
    description: "Search Google Drive files. Optional query in Drive query syntax.",
    inputSchema: z.object({ query: z.string().optional(), pageSize: z.number().int().min(1).max(100).optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).search(a.query, a.pageSize) };
    },
  },
  {
    name: "drive_create_folder",
    description: "Create a Drive folder.",
    inputSchema: z.object({ name: z.string(), parentId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, acct(sub, a)).createFolder(a.name, a.parentId);
      return { result: f, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { name: a.name } } };
    },
  },
  // ---- Docs --------------------------------------------------------------
  {
    name: "docs_get",
    description: "Get a Google Doc by id.",
    inputSchema: z.object({ documentId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, acct(sub, a)).get(a.documentId);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "read" } };
    },
  },
  {
    name: "docs_create",
    description: "Create a Google Doc with a title.",
    inputSchema: z.object({ title: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, acct(sub, a)).create(a.title);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "create" } };
    },
  },
  {
    name: "docs_insert_text",
    description: "Insert text into a Google Doc at an index (default 1).",
    inputSchema: z.object({ documentId: z.string(), text: z.string(), index: z.number().int().optional(), ...asUser }),
    async run({ env, sub }, a) {
      await new DocsService(env, acct(sub, a)).insertText(a.documentId, a.text, a.index);
      return { result: { ok: true }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { inserted: a.text.length } } };
    },
  },
  // ---- Sheets ------------------------------------------------------------
  {
    name: "sheets_create",
    description: "Create a spreadsheet with a title.",
    inputSchema: z.object({ title: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const s = await new SheetsService(env, acct(sub, a)).create(a.title);
      return { result: s, asset: { assetType: "sheet", googleId: s.spreadsheetId, title: a.title, action: "create" } };
    },
  },
  {
    name: "sheets_get_values",
    description: "Read a range of values from a spreadsheet (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const v = await new SheetsService(env, acct(sub, a)).getValues(a.spreadsheetId, a.range);
      return { result: v, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "read", detail: { range: a.range } } };
    },
  },
  {
    name: "sheets_append_values",
    description: "Append rows to a spreadsheet range (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.string())), ...asUser }),
    async run({ env, sub }, a) {
      await new SheetsService(env, acct(sub, a)).appendValues(a.spreadsheetId, a.range, a.values);
      return { result: { ok: true }, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "update", detail: { rows: a.values.length } } };
    },
  },
  // ---- Slides ------------------------------------------------------------
  {
    name: "slides_create",
    description: "Create a Google Slides presentation with a title.",
    inputSchema: z.object({ title: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const p = await new SlidesService(env, acct(sub, a)).create(a.title);
      return { result: p, asset: { assetType: "slide", googleId: p.presentationId, title: a.title, action: "create" } };
    },
  },
  {
    name: "slides_get",
    description: "Get a Slides presentation (title + slides) by id.",
    inputSchema: z.object({ presentationId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const p = await new SlidesService(env, acct(sub, a)).get(a.presentationId);
      return { result: p, asset: { assetType: "slide", googleId: a.presentationId, title: p.title, action: "read" } };
    },
  },
  {
    name: "slides_batch_update",
    description: "Apply raw Slides API batchUpdate requests (createSlide, insertText, etc.) to a presentation.",
    inputSchema: z.object({ presentationId: z.string(), requests: z.array(z.record(z.string(), z.any())), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new SlidesService(env, acct(sub, a)).batchUpdate(a.presentationId, a.requests);
      return { result: r, asset: { assetType: "slide", googleId: a.presentationId, action: "modify", detail: { requests: a.requests.length } } };
    },
  },
  // ---- Calendar ----------------------------------------------------------
  {
    name: "calendar_list_events",
    description: "List calendar events (default calendar 'primary'). Optional time window (RFC3339) + text query.",
    inputSchema: z.object({
      calendarId: z.string().optional(),
      timeMin: z.string().optional(),
      timeMax: z.string().optional(),
      q: z.string().optional(),
      maxResults: z.number().int().min(1).max(250).optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const out = await new CalendarService(env, acct(sub, a)).listEvents(a.calendarId ?? "primary", {
        timeMin: a.timeMin,
        timeMax: a.timeMax,
        q: a.q,
        maxResults: a.maxResults,
      });
      return { result: out };
    },
  },
  {
    name: "calendar_get_event",
    description: "Get a single calendar event by id.",
    inputSchema: z.object({ calendarId: z.string().optional(), eventId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const e = await new CalendarService(env, acct(sub, a)).getEvent(a.calendarId ?? "primary", a.eventId);
      return { result: e, asset: { assetType: "calendar", googleId: a.eventId, title: e.summary, url: e.htmlLink, action: "read" } };
    },
  },
  {
    name: "calendar_create_event",
    description:
      "Create a calendar event. start/end are Google EventDateTime objects, e.g. { dateTime: '2026-01-15T10:00:00Z' } or { date: '2026-01-15' }.",
    inputSchema: z.object({
      calendarId: z.string().optional(),
      summary: z.string(),
      description: z.string().optional(),
      start: z.record(z.string(), z.any()),
      end: z.record(z.string(), z.any()),
      attendees: z.array(z.object({ email: z.string().email() })).optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const e = await new CalendarService(env, acct(sub, a)).createEvent(a.calendarId ?? "primary", {
        summary: a.summary,
        description: a.description,
        start: a.start,
        end: a.end,
        attendees: a.attendees,
      });
      return { result: e, asset: { assetType: "calendar", googleId: e.id, title: a.summary, url: e.htmlLink, action: "create" } };
    },
  },
  // ---- Gmail -------------------------------------------------------------
  {
    name: "gmail_list",
    description: "List Gmail messages matching an optional query.",
    inputSchema: z.object({ query: z.string().optional(), maxResults: z.number().int().min(1).max(100).optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new GmailService(env, acct(sub, a)).listMessages(a.query, a.maxResults) };
    },
  },
  {
    name: "gmail_create_draft",
    description: "Create a Gmail DRAFT (not sent) so a human can review before sending. Preferred over gmail_send for agent workflows.",
    inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const d = await new GmailService(env, acct(sub, a)).createDraft(a.to, a.subject, a.body);
      return { result: d, asset: { assetType: "gmail", googleId: d.id, title: a.subject, action: "create", detail: { to: a.to, draft: true } } };
    },
  },
  {
    name: "gmail_send",
    description: "Send a plain-text email immediately. Prefer gmail_create_draft when a human should review first.",
    inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const sent = await new GmailService(env, acct(sub, a)).send(a.to, a.subject, a.body);
      return { result: sent, asset: { assetType: "gmail", googleId: sent.id, title: a.subject, action: "create", detail: { to: a.to } } };
    },
  },
  // ---- Apps Script (escape hatch) ---------------------------------------
  {
    name: "appsscript_create_project",
    description: "Create a standalone Apps Script project, returning its scriptId.",
    inputSchema: z.object({ title: z.string(), parentId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const p = await new AppsScriptService(env, acct(sub, a)).createProject(a.title, a.parentId);
      return { result: p, asset: { assetType: "script", googleId: p.scriptId, title: a.title, action: "create" } };
    },
  },
  {
    name: "appsscript_get_content",
    description: "Get the files (code + manifest) of an Apps Script project.",
    inputSchema: z.object({ scriptId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new AppsScriptService(env, acct(sub, a)).getContent(a.scriptId), asset: { assetType: "script", googleId: a.scriptId, action: "read" } };
    },
  },
  {
    name: "appsscript_update_content",
    description:
      "Push code to an Apps Script project (overwrites all files). `files` is the Apps Script files array (an appsscript manifest JSON file + one or more SERVER_JS files).",
    inputSchema: z.object({ scriptId: z.string(), files: z.array(z.record(z.string(), z.any())), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new AppsScriptService(env, acct(sub, a)).updateContent(a.scriptId, a.files);
      return { result: r, asset: { assetType: "script", googleId: a.scriptId, action: "update", detail: { files: a.files.length } } };
    },
  },
  {
    name: "appsscript_run",
    description:
      "Execute a function in a deployed Apps Script project (must be deployed as an API Executable). Params/return are basic JSON types only.",
    inputSchema: z.object({
      scriptId: z.string(),
      functionName: z.string(),
      parameters: z.array(z.any()).optional(),
      devMode: z.boolean().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const r = await new AppsScriptService(env, acct(sub, a)).run(a.scriptId, a.functionName, a.parameters, a.devMode ?? true);
      return { result: r, asset: { assetType: "script", googleId: a.scriptId, action: "modify", detail: { function: a.functionName } } };
    },
  },
  {
    name: "appsscript_list_processes",
    description: "List recent Apps Script execution processes (status + history).",
    inputSchema: z.object({ ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new AppsScriptService(env, acct(sub, a)).listProcesses() };
    },
  },
  // ---- Template registry (reference library for agents) ------------------
  {
    name: "list_templates",
    description:
      "List template artifacts from the registry — reusable Drive files (docs/sheets/slides/…) agents can reference or copy. Optional type filter.",
    inputSchema: z.object({ templateType: z.string().optional() }),
    async run({ env }, a) {
      const db = getDb(env);
      const rows = a.templateType
        ? await db.select().from(templateArtifacts).where(eq(templateArtifacts.templateType, a.templateType)).orderBy(desc(templateArtifacts.updatedAt))
        : await db.select().from(templateArtifacts).orderBy(desc(templateArtifacts.updatedAt));
      return { result: { templates: rows } };
    },
  },
  {
    name: "get_template",
    description: "Get one template artifact from the registry by its id.",
    inputSchema: z.object({ id: z.string() }),
    async run({ env }, a) {
      const db = getDb(env);
      const rows = await db.select().from(templateArtifacts).where(eq(templateArtifacts.id, a.id)).limit(1);
      return { result: { template: rows[0] ?? null } };
    },
  },
  {
    name: "instantiate_from_template",
    description:
      "Copy a registry template's Drive file into a new file (optionally in a target folder) and return the new file's id + url. Use this to start from a template instead of a blank document.",
    inputSchema: z.object({ templateId: z.string(), name: z.string(), targetFolderId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const db = getDb(env);
      const rows = await db.select().from(templateArtifacts).where(eq(templateArtifacts.id, a.templateId)).limit(1);
      const tpl = rows[0];
      if (!tpl) throw new Error(`No template with id ${a.templateId}`);
      const copy = await new DriveService(env, acct(sub, a)).copy(tpl.driveId, a.name, a.targetFolderId);
      return {
        result: { id: copy.id, name: copy.name, url: copy.webViewLink, fromTemplate: tpl.id, templateType: tpl.templateType },
        asset: { assetType: tpl.templateType || "drive", googleId: copy.id, title: copy.name, url: copy.webViewLink, action: "create", detail: { fromTemplate: tpl.id } },
      };
    },
  },
];
