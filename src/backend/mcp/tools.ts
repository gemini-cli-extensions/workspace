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
import { eq, desc, and } from "drizzle-orm";

import { getDb } from "@/db";
import { templateArtifacts, driveNotifications, brailleArtifacts, gmailLabels } from "@db/schemas";
import { deconstruct, detectSurface, type BrailleSurface } from "@/backend/braille/deconstruct";
import { syncLabels, syncLabelsForAllAccounts, listCaptureAccounts } from "@/backend/gmail/sync-service";
import { captureAccount, captureAllAccounts } from "@/backend/gmail/capture-service";
import { searchGmail } from "@/backend/gmail/search-service";
import { buildCodeTextRequests, CODE_THEMES } from "@/backend/docs/code-format";
import { findLastTable } from "@/backend/docs/locate";
import { buildFillRequests, buildTableStyleRequests } from "@/backend/docs/table-format";
import { lintDoc, buildQcFixRequests } from "@/backend/docs/qc";
import { RECIPES, getRequestTypes, type SchemaSurface } from "@/backend/docs/schema";
import { htmlToRequests } from "@/backend/docs/html-to-braille";
import { analyzePages, collectHeadings, pdfToPages } from "@/backend/docs/render-qc";
import { DriveService } from "./services/drive";
import { DocsService } from "./services/docs";
import { SheetsService } from "./services/sheets";
import { GmailService } from "./services/gmail";
import { SlidesService } from "./services/slides";
import { CalendarService } from "./services/calendar";
import { AppsScriptService } from "./services/appsscript";
import { CommentsService } from "./services/comments";
import { ChangesService } from "./services/changes";
import { WorkspaceEventsService } from "./services/workspaceevents";
import { PeopleService } from "./services/people";
import { FormsService } from "./services/forms";
import { queryCorpus } from "@/backend/ai/rag";
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

/**
 * Insert braille rows in chunks. D1 caps bound parameters at 100 per query;
 * braille_artifacts has 11 columns, so a single INSERT can hold at most 9
 * rows — chunk at 8 to stay clear.
 */
async function insertBrailleRows(
  db: ReturnType<typeof getDb>,
  rows: (typeof brailleArtifacts.$inferInsert)[],
): Promise<void> {
  const CHUNK = 8;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(brailleArtifacts).values(rows.slice(i, i + CHUNK));
  }
}

export const TOOLS: ToolDef[] = [
  // ---- Drive -------------------------------------------------------------
  {
    name: "search_files",
    description: "Search Google Drive files. Optional query in Drive query syntax (e.g. \"name contains 'report'\").",
    inputSchema: z.object({ query: z.string().optional(), pageSize: z.number().int().min(1).max(100).optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).search(a.query, a.pageSize) };
    },
  },
  {
    name: "list_recent_files",
    description: "List the most recently modified Drive files.",
    inputSchema: z.object({ pageSize: z.number().int().min(1).max(100).optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).listRecent(a.pageSize) };
    },
  },
  {
    name: "get_file_metadata",
    description: "Get a Drive file's metadata (id, name, mimeType, link) by id.",
    inputSchema: z.object({ fileId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, acct(sub, a)).get(a.fileId);
      return { result: f, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "read" } };
    },
  },
  {
    name: "get_file_permissions",
    description: "List the permissions (who has access, and what role) on a Drive file.",
    inputSchema: z.object({ fileId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).getPermissions(a.fileId), asset: { assetType: "drive", googleId: a.fileId, action: "read" } };
    },
  },
  {
    name: "read_file_content",
    description:
      "Read a Drive file's content as text. Google Docs/Sheets/Slides are exported (to text/csv); other files are read directly. Best for feeding file content to the model.",
    inputSchema: z.object({ fileId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const out = await new DriveService(env, acct(sub, a)).readContent(a.fileId);
      return { result: out, asset: { assetType: "drive", googleId: a.fileId, action: "read", detail: { exported: out.exported } } };
    },
  },
  {
    name: "download_file_content",
    description: "Download a Drive file's raw media content as text (alt=media). For binary files prefer read_file_content.",
    inputSchema: z.object({ fileId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).downloadContent(a.fileId), asset: { assetType: "drive", googleId: a.fileId, action: "read" } };
    },
  },
  {
    name: "create_file",
    description: "Create a Drive file with text content and an explicit mimeType (e.g. text/plain, text/markdown, text/csv).",
    inputSchema: z.object({ name: z.string(), mimeType: z.string(), content: z.string(), parentId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, acct(sub, a)).createFile(a.name, a.mimeType, a.content, a.parentId);
      return { result: f, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { mimeType: a.mimeType } } };
    },
  },
  {
    name: "copy_file",
    description: "Copy a Drive file to a new file (optionally into a target folder).",
    inputSchema: z.object({ fileId: z.string(), name: z.string(), targetFolderId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, acct(sub, a)).copy(a.fileId, a.name, a.targetFolderId);
      return { result: f, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { copiedFrom: a.fileId } } };
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
  {
    name: "share_file",
    description: "Share a Drive file: grant a role (reader/commenter/writer/owner) to a type (user/group/domain/anyone), optionally an emailAddress.",
    inputSchema: z.object({
      fileId: z.string(),
      role: z.enum(["reader", "commenter", "writer", "owner"]),
      type: z.enum(["user", "group", "domain", "anyone"]),
      emailAddress: z.string().email().optional(),
      sendNotificationEmail: z.boolean().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const r = await new DriveService(env, acct(sub, a)).share(a.fileId, a.role, a.type, a.emailAddress, a.sendNotificationEmail ?? false);
      return { result: r, asset: { assetType: "drive", googleId: a.fileId, action: "modify", detail: { role: a.role, type: a.type } } };
    },
  },
  {
    name: "update_file",
    description: "Rename and/or move a Drive file (name, addParents, removeParents).",
    inputSchema: z.object({ fileId: z.string(), name: z.string().optional(), addParents: z.string().optional(), removeParents: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, acct(sub, a)).updateFile(a.fileId, { name: a.name, addParents: a.addParents, removeParents: a.removeParents });
      return { result: f, asset: { assetType: "drive", googleId: a.fileId, title: a.name, action: "update" } };
    },
  },
  {
    name: "export_file",
    description: "Export a Google-native file to a given mimeType (e.g. application/pdf, text/plain, text/csv) and return the content.",
    inputSchema: z.object({ fileId: z.string(), mimeType: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new DriveService(env, acct(sub, a)).exportFile(a.fileId, a.mimeType), asset: { assetType: "drive", googleId: a.fileId, action: "read", detail: { export: a.mimeType } } };
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
  {
    name: "docs_replace_text",
    description: "Replace all occurrences of a string in a Google Doc.",
    inputSchema: z.object({ documentId: z.string(), find: z.string(), replace: z.string(), matchCase: z.boolean().optional(), ...asUser }),
    async run({ env, sub }, a) {
      await new DocsService(env, acct(sub, a)).replaceText(a.documentId, a.find, a.replace, a.matchCase);
      return { result: { ok: true }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { replace: a.find } } };
    },
  },
  {
    name: "docs_insert_image",
    description: "Insert an inline image (by public URL) into a Google Doc at an index (default 1).",
    inputSchema: z.object({ documentId: z.string(), uri: z.string().url(), index: z.number().int().optional(), ...asUser }),
    async run({ env, sub }, a) {
      await new DocsService(env, acct(sub, a)).insertImage(a.documentId, a.uri, a.index);
      return { result: { ok: true }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { image: true } } };
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
  {
    name: "sheets_get_metadata",
    description: "Get a spreadsheet's metadata: title + the list of tabs (sheetId, title, index).",
    inputSchema: z.object({ spreadsheetId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new SheetsService(env, acct(sub, a)).getMetadata(a.spreadsheetId), asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "read" } };
    },
  },
  {
    name: "sheets_add_sheet",
    description: "Add a new tab (sheet) to a spreadsheet.",
    inputSchema: z.object({ spreadsheetId: z.string(), title: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      await new SheetsService(env, acct(sub, a)).addSheet(a.spreadsheetId, a.title);
      return { result: { ok: true }, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "modify", detail: { addSheet: a.title } } };
    },
  },
  {
    name: "sheets_batch_update",
    description: "Apply raw Sheets API batchUpdate requests (formatting, addSheet, updateCells, conditional formats, etc.).",
    inputSchema: z.object({ spreadsheetId: z.string(), requests: z.array(z.record(z.string(), z.any())), ...asUser }),
    async run({ env, sub }, a) {
      await new SheetsService(env, acct(sub, a)).batchUpdate(a.spreadsheetId, a.requests);
      return { result: { ok: true }, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "modify", detail: { requests: a.requests.length } } };
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
  {
    name: "slides_create_from_markdown",
    description:
      "Create a Slides presentation FROM MARKDOWN (--- separates slides; '# '/'## ' = title; '- ' = bullets; '![](url)' = image). Returns the presentationId and a map of deterministic object IDs per slide (slideObjectId/titleId/bodyId/imageId) so you can then style each element with slides_batch_update. This is one way to build slides — slides_create + slides_batch_update remain for full control.",
    inputSchema: z.object({ title: z.string(), markdown: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const out = await new SlidesService(env, acct(sub, a)).createFromMarkdown(a.title, a.markdown);
      return { result: out, asset: { assetType: "slide", googleId: out.presentationId, title: a.title, action: "create", detail: { slides: out.slides.length, fromMarkdown: true } } };
    },
  },
  {
    name: "slides_replace_all_text",
    description: "Replace all occurrences of text across a presentation (great for filling a template). replacements = [{find, replace, matchCase?}].",
    inputSchema: z.object({ presentationId: z.string(), replacements: z.array(z.object({ find: z.string(), replace: z.string(), matchCase: z.boolean().optional() })), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new SlidesService(env, acct(sub, a)).replaceAllText(a.presentationId, a.replacements);
      return { result: r, asset: { assetType: "slide", googleId: a.presentationId, action: "modify", detail: { replacements: a.replacements.length } } };
    },
  },
  {
    name: "slides_get_thumbnail",
    description: "Get a rendered thumbnail image URL for a slide/page — lets you SEE a slide before styling it.",
    inputSchema: z.object({ presentationId: z.string(), pageObjectId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new SlidesService(env, acct(sub, a)).getThumbnail(a.presentationId, a.pageObjectId), asset: { assetType: "slide", googleId: a.presentationId, action: "read" } };
    },
  },
  {
    name: "slides_style_text",
    description:
      "Style all text in a text box/shape (bold, italic, underline, fontSize, fontFamily, foregroundColorHex #RRGGBB, link) without hand-writing an updateTextStyle batchUpdate request.",
    inputSchema: z.object({
      presentationId: z.string(),
      objectId: z.string(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.boolean().optional(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional(),
      foregroundColorHex: z.string().optional(),
      link: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const r = await new SlidesService(env, acct(sub, a)).styleText(a.presentationId, a.objectId, {
        bold: a.bold,
        italic: a.italic,
        underline: a.underline,
        fontSize: a.fontSize,
        fontFamily: a.fontFamily,
        foregroundColorHex: a.foregroundColorHex,
        link: a.link,
      });
      return { result: r, asset: { assetType: "slide", googleId: a.presentationId, action: "modify", detail: { objectId: a.objectId } } };
    },
  },
  {
    name: "slides_style_shape",
    description: "Style a shape's fill/outline color (backgroundColorHex/outlineColorHex, both #RRGGBB) without hand-writing an updateShapeProperties batchUpdate request.",
    inputSchema: z.object({
      presentationId: z.string(),
      objectId: z.string(),
      backgroundColorHex: z.string().optional(),
      outlineColorHex: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const r = await new SlidesService(env, acct(sub, a)).styleShape(a.presentationId, a.objectId, {
        backgroundColorHex: a.backgroundColorHex,
        outlineColorHex: a.outlineColorHex,
      });
      return { result: r, asset: { assetType: "slide", googleId: a.presentationId, action: "modify", detail: { objectId: a.objectId } } };
    },
  },
  {
    name: "slides_set_slide_background",
    description: "Set a slide's background to a solid color (colorHex #RRGGBB) without hand-writing an updatePageProperties batchUpdate request.",
    inputSchema: z.object({ presentationId: z.string(), pageObjectId: z.string(), colorHex: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new SlidesService(env, acct(sub, a)).setSlideBackground(a.presentationId, a.pageObjectId, a.colorHex);
      return { result: r, asset: { assetType: "slide", googleId: a.presentationId, action: "modify", detail: { pageObjectId: a.pageObjectId } } };
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
  {
    name: "calendar_update_event",
    description: "Patch/update fields of an existing calendar event.",
    inputSchema: z.object({ calendarId: z.string().optional(), eventId: z.string(), patch: z.record(z.string(), z.any()), ...asUser }),
    async run({ env, sub }, a) {
      const e = await new CalendarService(env, acct(sub, a)).updateEvent(a.calendarId ?? "primary", a.eventId, a.patch);
      return { result: e, asset: { assetType: "calendar", googleId: a.eventId, action: "update" } };
    },
  },
  {
    name: "calendar_delete_event",
    description: "Delete a calendar event.",
    inputSchema: z.object({ calendarId: z.string().optional(), eventId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new CalendarService(env, acct(sub, a)).deleteEvent(a.calendarId ?? "primary", a.eventId);
      return { result: r, asset: { assetType: "calendar", googleId: a.eventId, action: "delete" } };
    },
  },
  {
    name: "calendar_quick_add",
    description: "Create an event from natural-language text (e.g. 'Lunch with Sam tomorrow 12pm').",
    inputSchema: z.object({ calendarId: z.string().optional(), text: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const e = await new CalendarService(env, acct(sub, a)).quickAdd(a.calendarId ?? "primary", a.text);
      return { result: e, asset: { assetType: "calendar", googleId: e.id, title: e.summary, url: e.htmlLink, action: "create" } };
    },
  },
  {
    name: "calendar_list_calendars",
    description: "List the calendars on the user's calendar list.",
    inputSchema: z.object({ ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new CalendarService(env, acct(sub, a)).listCalendars() };
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
    name: "gmail_create_reply_draft",
    description:
      "Create a DRAFT reply to an existing message (same thread, proper In-Reply-To/References). Defaults to REPLY-ALL (original sender + all To/Cc, minus you). Pass `to` to reply to specific addresses only, or replyAll:false to reply to the sender only. Draft, not sent — for human review.",
    inputSchema: z.object({
      messageId: z.string(),
      body: z.string(),
      to: z.array(z.string().email()).optional(),
      replyAll: z.boolean().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const d = await new GmailService(env, acct(sub, a)).createReplyDraft(a.messageId, a.body, { to: a.to, replyAll: a.replyAll });
      return { result: d, asset: { assetType: "gmail", googleId: d.id, action: "create", detail: { replyTo: a.messageId, draft: true } } };
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
  {
    name: "gmail_get_thread",
    description: "Get a full Gmail thread (all messages) by threadId — best for feeding conversation context to the model.",
    inputSchema: z.object({ threadId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new GmailService(env, acct(sub, a)).getThread(a.threadId) };
    },
  },
  {
    name: "gmail_list_labels",
    description: "List Gmail labels (id + name).",
    inputSchema: z.object({ ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new GmailService(env, acct(sub, a)).listLabels() };
    },
  },
  {
    name: "gmail_create_label",
    description: "Create a Gmail label.",
    inputSchema: z.object({ name: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new GmailService(env, acct(sub, a)).createLabel(a.name) };
    },
  },
  {
    name: "gmail_modify_labels",
    description: "Add and/or remove labels on a Gmail message (e.g. archive by removing INBOX, mark read by removing UNREAD).",
    inputSchema: z.object({ id: z.string(), addLabelIds: z.array(z.string()).optional(), removeLabelIds: z.array(z.string()).optional(), ...asUser }),
    async run({ env, sub }, a) {
      const m = await new GmailService(env, acct(sub, a)).modifyMessageLabels(a.id, a.addLabelIds ?? [], a.removeLabelIds ?? []);
      return { result: m, asset: { assetType: "gmail", googleId: a.id, action: "modify" } };
    },
  },
  {
    name: "gmail_trash_message",
    description: "Move a Gmail message to Trash.",
    inputSchema: z.object({ id: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const m = await new GmailService(env, acct(sub, a)).trashMessage(a.id);
      return { result: m, asset: { assetType: "gmail", googleId: a.id, action: "delete" } };
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
  // ---- Drive comments (agent collaboration) ------------------------------
  {
    name: "comments_list",
    description: "List comments on a Drive file (with replies). Includes resolved/anchored info.",
    inputSchema: z.object({ fileId: z.string(), includeDeleted: z.boolean().optional(), pageSize: z.number().int().min(1).max(100).optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new CommentsService(env, acct(sub, a)).list(a.fileId, { includeDeleted: a.includeDeleted, pageSize: a.pageSize }), asset: { assetType: "drive", googleId: a.fileId, action: "read" } };
    },
  },
  {
    name: "comments_find_mentions",
    description:
      "Find comments/replies on a file that mention a tag (e.g. '#colby') so an agent can pick up work it was tagged in. Case-insensitive substring match on comment content.",
    inputSchema: z.object({ fileId: z.string(), tag: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new CommentsService(env, acct(sub, a)).findMentions(a.fileId, a.tag), asset: { assetType: "drive", googleId: a.fileId, action: "read" } };
    },
  },
  {
    name: "comments_get",
    description: "Get a single comment (with replies) on a Drive file.",
    inputSchema: z.object({ fileId: z.string(), commentId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new CommentsService(env, acct(sub, a)).get(a.fileId, a.commentId) };
    },
  },
  {
    name: "comments_create",
    description: "Create a comment on a Drive file. Optional `anchor` (JSON string) to anchor it to a region; omit for an unanchored comment.",
    inputSchema: z.object({ fileId: z.string(), content: z.string(), anchor: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const c = await new CommentsService(env, acct(sub, a)).create(a.fileId, a.content, a.anchor);
      return { result: c, asset: { assetType: "drive", googleId: a.fileId, action: "modify", detail: { commentId: c.id } } };
    },
  },
  {
    name: "comments_reply",
    description: "Reply to a comment on a Drive file.",
    inputSchema: z.object({ fileId: z.string(), commentId: z.string(), content: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new CommentsService(env, acct(sub, a)).reply(a.fileId, a.commentId, a.content);
      return { result: r, asset: { assetType: "drive", googleId: a.fileId, action: "modify", detail: { commentId: a.commentId, reply: true } } };
    },
  },
  {
    name: "comments_resolve",
    description: "Resolve (close) a comment on a Drive file by posting a resolving reply.",
    inputSchema: z.object({ fileId: z.string(), commentId: z.string(), content: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new CommentsService(env, acct(sub, a)).resolve(a.fileId, a.commentId, a.content);
      return { result: r, asset: { assetType: "drive", googleId: a.fileId, action: "modify", detail: { commentId: a.commentId, resolved: true } } };
    },
  },
  // ---- Drive changes (classic watch/list) --------------------------------
  {
    name: "changes_get_start_page_token",
    description: "Get a Drive changes start page token — the cursor to begin tracking changes from now.",
    inputSchema: z.object({ driveId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new ChangesService(env, acct(sub, a)).getStartPageToken(a.driveId) };
    },
  },
  {
    name: "changes_list",
    description: "List Drive changes since a page token. Returns changes + a newStartPageToken to persist for the next poll.",
    inputSchema: z.object({
      pageToken: z.string(),
      includeRemoved: z.boolean().optional(),
      includeItemsFromAllDrives: z.boolean().optional(),
      restrictToMyDrive: z.boolean().optional(),
      pageSize: z.number().int().min(1).max(1000).optional(),
      driveId: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      return {
        result: await new ChangesService(env, acct(sub, a)).list(a.pageToken, {
          includeRemoved: a.includeRemoved,
          includeItemsFromAllDrives: a.includeItemsFromAllDrives,
          restrictToMyDrive: a.restrictToMyDrive,
          pageSize: a.pageSize,
          driveId: a.driveId,
        }),
      };
    },
  },
  {
    name: "changes_watch",
    description:
      "Subscribe to Drive changes via a push channel. `address` is the HTTPS webhook (e.g. this worker's /api/gws/drive-webhook). Returns the channel (id + resourceId) — keep them to stop the watch.",
    inputSchema: z.object({
      pageToken: z.string(),
      channelId: z.string(),
      address: z.string().url(),
      token: z.string().optional(),
      expiration: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      return { result: await new ChangesService(env, acct(sub, a)).watch(a.pageToken, { id: a.channelId, address: a.address, token: a.token, expiration: a.expiration }) };
    },
  },
  {
    name: "changes_stop",
    description: "Stop a Drive changes push channel (from changes_watch).",
    inputSchema: z.object({ channelId: z.string(), resourceId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new ChangesService(env, acct(sub, a)).stop(a.channelId, a.resourceId) };
    },
  },
  // ---- Workspace Events API (fine-grained subscriptions) -----------------
  {
    name: "events_create_subscription",
    description:
      "Create a Workspace Events subscription for a Drive target (file: '//drive.googleapis.com/files/ID' or shared drive: '//drive.googleapis.com/drives/ID') and CloudEvents event types (e.g. 'google.workspace.drive.comment.v3.created'). Events (incl. comment mentions/assignees) are delivered to a Cloud Pub/Sub topic 'projects/P/topics/T'.",
    inputSchema: z.object({
      targetResource: z.string(),
      eventTypes: z.array(z.string()).min(1),
      pubsubTopic: z.string(),
      includeResource: z.boolean().optional(),
      includeDescendants: z.boolean().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      return { result: await new WorkspaceEventsService(env, acct(sub, a)).createSubscription(a.targetResource, a.eventTypes, a.pubsubTopic, { includeResource: a.includeResource, includeDescendants: a.includeDescendants }) };
    },
  },
  {
    name: "events_list_subscriptions",
    description: "List Workspace Events subscriptions. `filter` is required, e.g. event_types:\"google.workspace.drive.file.v3.contentChanged\".",
    inputSchema: z.object({ filter: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new WorkspaceEventsService(env, acct(sub, a)).listSubscriptions(a.filter) };
    },
  },
  {
    name: "events_get_subscription",
    description: "Get a Workspace Events subscription by resource name (subscriptions/ID).",
    inputSchema: z.object({ name: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new WorkspaceEventsService(env, acct(sub, a)).getSubscription(a.name) };
    },
  },
  {
    name: "events_delete_subscription",
    description: "Delete a Workspace Events subscription by resource name (subscriptions/ID).",
    inputSchema: z.object({ name: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new WorkspaceEventsService(env, acct(sub, a)).deleteSubscription(a.name) };
    },
  },
  {
    name: "rag_query",
    description:
      "Semantic search over an indexed RAG corpus (emails | docs | general) via Vectorize embeddings. Returns the top matching chunks. Content must have been indexed by the agents first.",
    inputSchema: z.object({ corpus: z.enum(["emails", "docs", "general"]), query: z.string(), topK: z.number().int().min(1).max(20).optional() }),
    async run({ env }, a) {
      return { result: await queryCorpus(env, a.corpus, a.query, a.topK ?? 5) };
    },
  },
  {
    name: "list_notifications",
    description:
      "List recent push notifications received at the Drive webhook (from changes_watch channels or Workspace Events Pub/Sub push). Poll this to react to file/comment changes.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
    async run({ env }, a) {
      const db = getDb(env);
      const rows = await db.select().from(driveNotifications).orderBy(desc(driveNotifications.receivedAt)).limit(a.limit ?? 50);
      return { result: { notifications: rows } };
    },
  },
  // ---- People (contacts + directory) -------------------------------------
  {
    name: "people_get_contact",
    description: "Get a person by resourceName ('people/me' or 'people/c123'). personFields defaults to names,emails,phones,orgs.",
    inputSchema: z.object({ resourceName: z.string(), personFields: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new PeopleService(env, acct(sub, a)).getContact(a.resourceName, a.personFields) };
    },
  },
  {
    name: "people_list_connections",
    description: "List the user's contacts (connections), most-recently-modified first.",
    inputSchema: z.object({ pageSize: z.number().int().min(1).max(1000).optional(), personFields: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new PeopleService(env, acct(sub, a)).listConnections(a.pageSize, a.personFields) };
    },
  },
  {
    name: "people_search_contacts",
    description: "Search the user's own contacts by name/email/phone.",
    inputSchema: z.object({ query: z.string(), readMask: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new PeopleService(env, acct(sub, a)).searchContacts(a.query, a.readMask) };
    },
  },
  {
    name: "people_search_directory",
    description: "Search the Workspace domain directory for people (requires directory access).",
    inputSchema: z.object({ query: z.string(), readMask: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new PeopleService(env, acct(sub, a)).searchDirectory(a.query, a.readMask) };
    },
  },
  {
    name: "people_create_contact",
    description: "Create a new contact (names, emailAddresses, phoneNumbers).",
    inputSchema: z.object({
      names: z.array(z.object({ givenName: z.string().optional(), familyName: z.string().optional() })).optional(),
      emailAddresses: z.array(z.object({ value: z.string() })).optional(),
      phoneNumbers: z.array(z.object({ value: z.string() })).optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const p = await new PeopleService(env, acct(sub, a)).createContact({ names: a.names, emailAddresses: a.emailAddresses, phoneNumbers: a.phoneNumbers });
      return { result: p, asset: { assetType: "contact", googleId: p.resourceName, action: "create" } };
    },
  },
  // ---- Forms -------------------------------------------------------------
  {
    name: "forms_create",
    description: "Create a Google Form with a title.",
    inputSchema: z.object({ title: z.string(), documentTitle: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const f = await new FormsService(env, acct(sub, a)).create(a.title, a.documentTitle);
      return { result: f, asset: { assetType: "form", googleId: f.formId, title: a.title, url: f.responderUri, action: "create" } };
    },
  },
  {
    name: "forms_get",
    description: "Get a Google Form (its items/questions + metadata).",
    inputSchema: z.object({ formId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new FormsService(env, acct(sub, a)).get(a.formId), asset: { assetType: "form", googleId: a.formId, action: "read" } };
    },
  },
  {
    name: "forms_add_question",
    description: "Add a question to a Form. No options → a text question; with options → a multiple-choice (RADIO) question.",
    inputSchema: z.object({ formId: z.string(), title: z.string(), options: z.array(z.string()).optional(), required: z.boolean().optional(), index: z.number().int().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new FormsService(env, acct(sub, a)).addQuestion(a.formId, a.title, a.options, a.required ?? false, a.index ?? 0);
      return { result: r, asset: { assetType: "form", googleId: a.formId, action: "modify", detail: { question: a.title } } };
    },
  },
  {
    name: "forms_batch_update",
    description: "Apply raw Forms API batchUpdate requests (add/move/delete items, update settings).",
    inputSchema: z.object({ formId: z.string(), requests: z.array(z.record(z.string(), z.any())), ...asUser }),
    async run({ env, sub }, a) {
      const r = await new FormsService(env, acct(sub, a)).batchUpdate(a.formId, a.requests);
      return { result: r, asset: { assetType: "form", googleId: a.formId, action: "modify", detail: { requests: a.requests.length } } };
    },
  },
  {
    name: "forms_list_responses",
    description: "List the responses submitted to a Google Form.",
    inputSchema: z.object({ formId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      return { result: await new FormsService(env, acct(sub, a)).listResponses(a.formId), asset: { assetType: "form", googleId: a.formId, action: "read" } };
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
  {
    name: "deconstruct_to_braille",
    description:
      "Read a Google Doc, Slides deck, or Sheet and index its structure ('braille') into the D1 registry: one whole-file template row plus one component row per anchor-tagged block ([Component: X]…[End Component]) in a Doc, per slide, or per sheet tab. Builds the reusable component/template library. Surface is auto-detected from the Drive mimeType.",
    inputSchema: z.object({
      fileId: z.string(),
      name: z.string().optional(),
      surface: z.enum(["doc", "slide", "sheet"]).optional(),
      tags: z.array(z.string()).optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      // Default to the service account's own identity (it's shared on the target
      // files); `as_user` overrides to DWD impersonation.
      const account = a.as_user ? acct(sub, a) : "sa";
      const meta = await new DriveService(env, account).get(a.fileId);
      const surface: BrailleSurface | null = a.surface ?? detectSurface(meta.mimeType ?? "");
      if (!surface) {
        throw new Error(`Unsupported file type for braille (mimeType: ${meta.mimeType ?? "unknown"}). Supported: Google Doc, Slides, Sheet.`);
      }

      let raw: unknown;
      if (surface === "doc") raw = await new DocsService(env, account).getRaw(a.fileId);
      else if (surface === "slide") raw = await new SlidesService(env, account).get(a.fileId);
      else raw = await new SheetsService(env, account).getStructure(a.fileId);

      const fragments = deconstruct(surface, raw);
      const baseName = a.name ?? meta.name ?? a.fileId;
      const sourceUrl = meta.webViewLink ?? null;
      const rows = fragments.map((f) => ({
        id: crypto.randomUUID(),
        sourceFileId: a.fileId,
        sourceUrl,
        surface: f.surface,
        kind: f.kind,
        name: f.kind === "template" ? baseName : `${baseName} · ${f.name}`,
        anchor: f.anchor,
        structure: f.structure as Record<string, unknown>,
        tags: a.tags ?? null,
        createdBySub: sub,
      }));
      await insertBrailleRows(getDb(env), rows);

      const template = rows.find((r) => r.kind === "template");
      return {
        result: {
          indexed: rows.length,
          surface,
          templateId: template?.id ?? null,
          components: rows.filter((r) => r.kind === "component").map((r) => ({ id: r.id, name: r.name, anchor: r.anchor })),
        },
        asset: { assetType: surface, googleId: a.fileId, title: baseName, url: sourceUrl ?? undefined, action: "read", detail: { braille: rows.length } },
      };
    },
  },
  {
    name: "braille_list",
    description:
      "List indexed braille artifacts (templates & components) from the registry. Filter by surface, kind, or sourceFileId. Returns metadata only — call braille_get for a specific artifact's full structure.",
    inputSchema: z.object({
      surface: z.enum(["doc", "slide", "sheet"]).optional(),
      kind: z.enum(["template", "component"]).optional(),
      sourceFileId: z.string().optional(),
    }),
    async run({ env }, a) {
      const db = getDb(env);
      const conds = [];
      if (a.surface) conds.push(eq(brailleArtifacts.surface, a.surface));
      if (a.kind) conds.push(eq(brailleArtifacts.kind, a.kind));
      if (a.sourceFileId) conds.push(eq(brailleArtifacts.sourceFileId, a.sourceFileId));
      const cols = {
        id: brailleArtifacts.id,
        name: brailleArtifacts.name,
        surface: brailleArtifacts.surface,
        kind: brailleArtifacts.kind,
        anchor: brailleArtifacts.anchor,
        tags: brailleArtifacts.tags,
        sourceFileId: brailleArtifacts.sourceFileId,
        sourceUrl: brailleArtifacts.sourceUrl,
        createdAt: brailleArtifacts.createdAt,
      };
      const base = db.select(cols).from(brailleArtifacts);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(desc(brailleArtifacts.createdAt));
      return { result: { artifacts: rows } };
    },
  },
  {
    name: "braille_get",
    description:
      "Get one braille artifact by id, including its full structure JSON — the batchUpdate-replayable braille for a template or component.",
    inputSchema: z.object({ id: z.string() }),
    async run({ env }, a) {
      const db = getDb(env);
      const rows = await db.select().from(brailleArtifacts).where(eq(brailleArtifacts.id, a.id)).limit(1);
      return { result: { artifact: rows[0] ?? null } };
    },
  },
  {
    name: "deconstruct_drive_folder",
    description:
      "Sweep a Drive folder and deconstruct every Google Doc, Slides deck, and Sheet inside it into the braille registry in one call. Other file types are skipped. Accepts a folder id or a Drive folder URL.",
    inputSchema: z.object({ folderId: z.string(), tags: z.array(z.string()).optional(), ...asUser }),
    async run({ env, sub }, a) {
      // Default to the service account's own identity (it's shared on the folder);
      // `as_user` overrides to DWD impersonation.
      const account = a.as_user ? acct(sub, a) : "sa";
      const folderId = (a.folderId.match(/[-\w]{25,}/) ?? [a.folderId])[0];
      const drive = new DriveService(env, account);
      const { files } = await drive.search(`'${folderId}' in parents and trashed = false`, 100);

      const db = getDb(env);
      const results: Array<{ fileId: string; name: string; surface: BrailleSurface; indexed: number }> = [];
      let skipped = 0;

      for (const f of files) {
        const surface = detectSurface(f.mimeType ?? "");
        if (!surface) {
          skipped++;
          continue;
        }
        let raw: unknown;
        if (surface === "doc") raw = await new DocsService(env, account).getRaw(f.id);
        else if (surface === "slide") raw = await new SlidesService(env, account).get(f.id);
        else raw = await new SheetsService(env, account).getStructure(f.id);

        const rows = deconstruct(surface, raw).map((fr) => ({
          id: crypto.randomUUID(),
          sourceFileId: f.id,
          sourceUrl: f.webViewLink ?? null,
          surface: fr.surface,
          kind: fr.kind,
          name: fr.kind === "template" ? f.name : `${f.name} · ${fr.name}`,
          anchor: fr.anchor,
          structure: fr.structure as Record<string, unknown>,
          tags: a.tags ?? null,
          createdBySub: sub,
        }));
        await insertBrailleRows(db, rows);
        results.push({ fileId: f.id, name: f.name, surface, indexed: rows.length });
      }

      return { result: { folderId, filesIndexed: results.length, skipped, results } };
    },
  },
  // ---- Docs batchUpdate engine (braille replay) -------------------------
  {
    name: "docs_get_json",
    description:
      "Return a Google Doc's raw structure JSON (the 'braille'), tab-aware (includeTabsContent=true). This is the exact shape docs_batch_update replays. Defaults to the service-account identity; as_user overrides.",
    inputSchema: z.object({ documentId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      return { result: await new DocsService(env, account).getRaw(a.documentId) };
    },
  },
  {
    name: "docs_batch_update",
    description:
      "Apply an array of native Google Docs API requests to a document atomically — the full grammar: headings, tables, colors, spacing, page/section breaks, tabs (addDocumentTab), landscape (updateSectionStyle flipPageOrientation), styled tables. Each request carries its own tabId/location. This is how stored braille is replayed into docs. Defaults to the service-account identity; as_user overrides.",
    inputSchema: z.object({
      documentId: z.string(),
      requests: z.array(z.record(z.string(), z.unknown())),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const result = await new DocsService(env, account).batchUpdate(a.documentId, a.requests);
      return { result, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { requests: a.requests.length } } };
    },
  },
  {
    name: "table_factory",
    description:
      "Insert a themed table into a Google Doc from a 2D array (first row = header). Header row gets a dark-blue fill with white bold centered text; every cell gets a 1pt border. Handles the index math (fills bottom-up, styles after re-fetch). Defaults to the SA identity.",
    inputSchema: z.object({
      documentId: z.string(),
      data: z.array(z.array(z.string())),
      theme: z.string().optional(),
      tabId: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const docs = new DocsService(env, account);
      const rows = a.data.length;
      const cols = Math.max(0, ...a.data.map((r: string[]) => r.length));
      if (!rows || !cols) throw new Error("data must be a non-empty 2D array");

      await docs.batchUpdate(a.documentId, [{ insertTable: { rows, columns: cols, endOfSegmentLocation: a.tabId ? { tabId: a.tabId } : {} } }]);
      let table = findLastTable(await docs.getRaw(a.documentId), a.tabId);
      if (!table) throw new Error("Could not locate the inserted table.");
      await docs.batchUpdate(a.documentId, buildFillRequests(table, a.data, a.tabId));
      table = findLastTable(await docs.getRaw(a.documentId), a.tabId);
      if (!table) throw new Error("Table not found after fill.");
      await docs.batchUpdate(a.documentId, buildTableStyleRequests(table, a.data, a.theme ?? "default", a.tabId));

      return { result: { documentId: a.documentId, rows, cols }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { table: `${rows}x${cols}` } } };
    },
  },
  {
    name: "code_block_factory",
    description:
      "Insert a syntax-highlighted code block (shaded 1x1 container) into a Google Doc. Tokenizes by language (sql, javascript, typescript, python, bash…) and colors by theme (dracula | github). Defaults to the SA identity.",
    inputSchema: z.object({
      documentId: z.string(),
      code: z.string(),
      language: z.string().optional(),
      theme: z.enum(["dracula", "github"]).optional(),
      tabId: z.string().optional(),
      ...asUser,
    }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const docs = new DocsService(env, account);
      const theme = a.theme ?? "github";

      await docs.batchUpdate(a.documentId, [{ insertTable: { rows: 1, columns: 1, endOfSegmentLocation: a.tabId ? { tabId: a.tabId } : {} } }]);
      const table = findLastTable(await docs.getRaw(a.documentId), a.tabId);
      if (!table?.cells[0]) throw new Error("Could not locate the inserted code container.");
      const cellIndex = table.cells[0].startIndex;
      const start = a.tabId ? { index: table.tableStartIndex, tabId: a.tabId } : { index: table.tableStartIndex };
      const bg = (CODE_THEMES[theme] ?? CODE_THEMES.github).background;

      const requests = [
        {
          updateTableCellStyle: {
            tableRange: { tableCellLocation: { tableStartLocation: start, rowIndex: 0, columnIndex: 0 }, rowSpan: 1, columnSpan: 1 },
            tableCellStyle: {
              backgroundColor: { color: { rgbColor: bg } },
              paddingTop: { magnitude: 8, unit: "PT" },
              paddingBottom: { magnitude: 8, unit: "PT" },
              paddingLeft: { magnitude: 10, unit: "PT" },
              paddingRight: { magnitude: 10, unit: "PT" },
            },
            fields: "backgroundColor,paddingTop,paddingBottom,paddingLeft,paddingRight",
          },
        },
        ...buildCodeTextRequests(cellIndex, a.code, a.language ?? "text", theme, a.tabId),
      ];
      await docs.batchUpdate(a.documentId, requests);
      return { result: { documentId: a.documentId, language: a.language ?? "text", theme }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { codeBlock: a.language ?? "text" } } };
    },
  },
  {
    name: "docs_qc_check",
    description:
      "Structural quality check on a Google Doc (from its braille): headings that will orphan (no keepWithNext), tables with no borders, empty paragraphs that render blank pages. Read-only — returns findings. Layout-only issues (table spilling two pages) need the vision QC pass. Defaults to the SA identity.",
    inputSchema: z.object({ documentId: z.string(), tabId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const raw = await new DocsService(env, account).getRaw(a.documentId);
      return { result: { findings: lintDoc(raw, a.tabId) } };
    },
  },
  {
    name: "docs_qc_fix",
    description:
      "Apply the safe white-glove fixes to a Google Doc: keepWithNext on headings (no orphans) and 1pt borders on unstyled tables. Content untouched. Returns what was fixed + any remaining (report-only) findings. This is the polish/apply-style pass. Defaults to the SA identity.",
    inputSchema: z.object({ documentId: z.string(), tabId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const docs = new DocsService(env, account);
      const findings = lintDoc(await docs.getRaw(a.documentId), a.tabId);
      const requests = buildQcFixRequests(findings, a.tabId);
      if (requests.length) await docs.batchUpdate(a.documentId, requests);
      return {
        result: {
          fixed: requests.length,
          remaining: findings.filter((f) => f.rule === "phantom-empty-paragraph"),
          findings,
        },
        asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { qcFixes: requests.length } },
      };
    },
  },
  {
    name: "docs_schema",
    description:
      "Get the batchUpdate request grammar for a Google surface (docs | slides | sheets | forms): curated recipes (correct patterns for styled headers, landscape sections via flipPageOrientation, keep-with-next, tabs) plus the full list of available request-type names. The complete Discovery JSON is served at GET /api/schema/:surface.",
    inputSchema: z.object({ surface: z.enum(["docs", "slides", "sheets", "forms"]) }),
    async run({ env }, a) {
      const surface = a.surface as SchemaSurface;
      const requestTypes = await getRequestTypes(env, surface).catch(() => [] as string[]);
      return { result: { surface, recipes: RECIPES[surface], requestTypes, discoveryUrl: `/api/schema/${surface}` } };
    },
  },
  {
    name: "html_to_doc",
    description:
      "Convert an HTML string into a Google Doc via native batchUpdate (NOT Google's importer) — headings, bold/italic/underline/code, and bullet/numbered lists come out clean. WE control the mapping, so no <hr>-around-heading junk. Inserts at index 1 (use a fresh/scratch doc). Tables/images not yet mapped — use table_factory. Defaults to the SA identity.",
    inputSchema: z.object({ documentId: z.string(), html: z.string(), tabId: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const requests = htmlToRequests(a.html, 1, a.tabId);
      if (!requests.length) throw new Error("No renderable content parsed from the HTML.");
      await new DocsService(env, account).batchUpdate(a.documentId, requests);
      return { result: { documentId: a.documentId, blocks: requests.length }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { htmlImport: true } } };
    },
  },
  {
    name: "office_to_google",
    description:
      "Convert an Office file already in Drive (.docx/.xlsx/.pptx) to its Google-native equivalent (Doc/Sheet/Slides) via Drive's converter — far higher fidelity than parsing OpenXML. Returns the new file id + url; then deconstruct_to_braille it. Defaults to the SA identity.",
    inputSchema: z.object({ fileId: z.string(), name: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const f = await new DriveService(env, account).convertToGoogle(a.fileId, a.name);
      return { result: { id: f.id, name: f.name, mimeType: f.mimeType, url: f.webViewLink }, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { convertedFrom: a.fileId } } };
    },
  },
  {
    name: "render_qc",
    description:
      "Render-level QC across ALL document types (Docs, Sheets, Slides): export the file to PDF, read the ACTUAL pagination, and flag layout issues the structural QC can't see — a heading stranded at a page bottom (orphan). Returns pageCount + findings. Defaults to the SA identity.",
    inputSchema: z.object({ fileId: z.string(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const drive = new DriveService(env, account);
      const pages = await pdfToPages(await drive.exportBinary(a.fileId, "application/pdf"));

      let headings: string[] = [];
      try {
        const meta = await drive.get(a.fileId);
        if ((meta.mimeType ?? "").includes("document")) {
          headings = collectHeadings(await new DocsService(env, account).getRaw(a.fileId));
        }
      } catch {
        // non-Docs or no heading access → pagination-only report
      }
      return { result: { pageCount: pages.length, findings: analyzePages(pages, headings) } };
    },
  },
  // ---- Scratch sandbox ---------------------------------------------------
  {
    name: "create_scratch_doc",
    description:
      "Create a Google Doc in the dedicated 'MCP Scratch' folder, stamped as work-product/design-scratch, and return its link. A safe sandbox for building a sample for approval before producing the real document. Defaults to the SA identity.",
    inputSchema: z.object({ title: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const drive = new DriveService(env, account);
      const folderId = await drive.findOrCreateFolder("MCP Scratch");
      const docs = new DocsService(env, account);
      const doc = await docs.create(a.title ?? "Scratch Doc");
      await docs.insertText(doc.documentId, "⚠️  WORK PRODUCT — DESIGN SCRATCH · not a final document\n\n", 1);
      await drive.updateFile(doc.documentId, { addParents: folderId });
      const url = `https://docs.google.com/document/d/${doc.documentId}/edit`;
      return { result: { documentId: doc.documentId, url, folderId }, asset: { assetType: "doc", googleId: doc.documentId, title: doc.title, url, action: "create", detail: { scratch: true } } };
    },
  },
  {
    name: "create_scratch_sheet",
    description: "Create a Google Sheet in the 'MCP Scratch' folder and return its link. Sandbox for sample spreadsheets. Defaults to the SA identity.",
    inputSchema: z.object({ title: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const drive = new DriveService(env, account);
      const folderId = await drive.findOrCreateFolder("MCP Scratch");
      const sheet = await new SheetsService(env, account).create(a.title ?? "Scratch Sheet");
      await drive.updateFile(sheet.spreadsheetId, { addParents: folderId });
      const url = `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}/edit`;
      return { result: { spreadsheetId: sheet.spreadsheetId, url, folderId }, asset: { assetType: "sheet", googleId: sheet.spreadsheetId, url, action: "create", detail: { scratch: true } } };
    },
  },
  {
    name: "create_scratch_slides",
    description: "Create a Google Slides deck in the 'MCP Scratch' folder and return its link. Sandbox for sample decks. Defaults to the SA identity.",
    inputSchema: z.object({ title: z.string().optional(), ...asUser }),
    async run({ env, sub }, a) {
      const account = a.as_user ? acct(sub, a) : "sa";
      const drive = new DriveService(env, account);
      const folderId = await drive.findOrCreateFolder("MCP Scratch");
      const deck = await new SlidesService(env, account).create(a.title ?? "Scratch Deck");
      await drive.updateFile(deck.presentationId, { addParents: folderId });
      const url = `https://docs.google.com/presentation/d/${deck.presentationId}/edit`;
      return { result: { presentationId: deck.presentationId, url, folderId }, asset: { assetType: "slide", googleId: deck.presentationId, url, action: "create", detail: { scratch: true } } };
    },
  },
  // ---- Gmail label registry ---------------------------------------------
  {
    name: "gmail_labels_sync",
    description:
      "Reconcile the D1 gmail_labels registry with live Gmail across ALL active accounts (or one, via `account`): register new labels, reactivate returned ones, soft-delete (is_active=0) labels gone from Gmail. Runs weekly via cron; call to sync on demand.",
    inputSchema: z.object({ account: z.string().email().optional() }),
    async run({ env }, a) {
      if (a.account) {
        const target = (await listCaptureAccounts(env)).find((x) => x.email === a.account!.toLowerCase());
        if (!target) throw new Error(`Account ${a.account} is not active/available.`);
        return { result: { synced: [await syncLabels(env, target.ref, target.email)] } };
      }
      return { result: { synced: await syncLabelsForAllAccounts(env) } };
    },
  },
  {
    name: "gmail_labels_list",
    description:
      "List labels from the D1 registry (not live Gmail), across all accounts or one via `account`. Filter by active state and/or capture mode. Includes per-label capture config.",
    inputSchema: z.object({
      account: z.string().email().optional(),
      activeOnly: z.boolean().optional(),
      captureMode: z.enum(["none", "metadata", "vectorize"]).optional(),
    }),
    async run({ env }, a) {
      const db = getDb(env);
      const conds = [];
      if (a.account) conds.push(eq(gmailLabels.account, a.account.toLowerCase()));
      if (a.activeOnly !== false) conds.push(eq(gmailLabels.isActive, true));
      if (a.captureMode) conds.push(eq(gmailLabels.captureMode, a.captureMode));
      const base = db.select().from(gmailLabels);
      const rows = await (conds.length ? base.where(and(...conds)) : base).orderBy(gmailLabels.name);
      return { result: { labels: rows } };
    },
  },
  {
    name: "gmail_label_create",
    description:
      "Create a Gmail label on an account (optionally nested under parentId and/or auto-applied by a filter), and register it in D1. `account` selects which registered account (defaults to the first active); `filter` is Gmail filter criteria, e.g. { from: 'a@b.com' } or { query: 'has:attachment' }.",
    inputSchema: z.object({
      name: z.string(),
      account: z.string().email().optional(),
      parentId: z.string().optional(),
      description: z.string().optional(),
      filter: z.record(z.string(), z.unknown()).optional(),
    }),
    async run({ env }, a) {
      const db = getDb(env);
      const accounts = await listCaptureAccounts(env);
      const target = a.account ? accounts.find((x) => x.email === a.account!.toLowerCase()) : accounts[0];
      if (!target) throw new Error(`Account ${a.account ?? "(default)"} not active. Available: ${accounts.map((x) => x.email).join(", ") || "none"}.`);

      let fullName = a.name;
      if (a.parentId) {
        const parent = await db.select({ name: gmailLabels.name }).from(gmailLabels).where(eq(gmailLabels.id, a.parentId)).limit(1);
        if (!parent[0]) throw new Error(`No registered label with id ${a.parentId} to nest under. Run gmail_labels_sync first.`);
        fullName = `${parent[0].name}/${a.name}`;
      }

      const gmail = new GmailService(env, target.ref);
      const label = await gmail.createLabel(fullName);
      let filterCriteria: Record<string, unknown> | undefined;
      if (a.filter) {
        await gmail.createFilter(a.filter, label.id);
        filterCriteria = a.filter;
      }

      const now = new Date();
      await db.insert(gmailLabels).values({
        id: label.id,
        account: target.email,
        name: fullName,
        parentId: a.parentId ?? null,
        description: a.description ?? null,
        isActive: true,
        createdVia: "worker",
        filtersJson: filterCriteria ? [filterCriteria] : null,
        createdAt: now,
        updatedAt: now,
      });

      return {
        result: { id: label.id, name: fullName, parentId: a.parentId ?? null, filter: filterCriteria ?? null },
        asset: { assetType: "gmail-label", googleId: label.id, title: fullName, action: "create" },
      };
    },
  },
  {
    name: "gmail_label_set_capture",
    description:
      "Configure how a label's messages are captured. captureMode: none | metadata | vectorize. captureAttachments + attachmentStore (r2|drive) + attachmentDriveFolderId control attachment handling. Only labels with captureMode != none are ingested.",
    inputSchema: z.object({
      labelId: z.string(),
      captureMode: z.enum(["none", "metadata", "vectorize"]).optional(),
      captureAttachments: z.boolean().optional(),
      attachmentStore: z.enum(["r2", "drive"]).optional(),
      attachmentDriveFolderId: z.string().optional(),
      description: z.string().optional(),
    }),
    async run({ env }, a) {
      const db = getDb(env);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (a.captureMode !== undefined) patch.captureMode = a.captureMode;
      if (a.captureAttachments !== undefined) patch.captureAttachments = a.captureAttachments;
      if (a.attachmentStore !== undefined) patch.attachmentStore = a.attachmentStore;
      if (a.attachmentDriveFolderId !== undefined) patch.attachmentDriveFolderId = a.attachmentDriveFolderId;
      if (a.description !== undefined) patch.description = a.description;
      await db.update(gmailLabels).set(patch).where(eq(gmailLabels.id, a.labelId));
      const row = await db.select().from(gmailLabels).where(eq(gmailLabels.id, a.labelId)).limit(1);
      return { result: { label: row[0] ?? null } };
    },
  },
  {
    name: "gmail_capture_run",
    description:
      "Ingest messages for capture-enabled labels (captureMode != none) into the relational store: gmail_threads, gmail_messages, gmail_message_bodies, gmail_message_contacts (from/to/cc/bcc). Runs weekly via cron after label sync; call to ingest on demand. Idempotent — already-stored messages are skipped. All active accounts, or one via `account`.",
    inputSchema: z.object({
      account: z.string().email().optional(),
      perLabel: z.number().int().min(1).max(100).optional(),
    }),
    async run({ env }, a) {
      if (a.account) {
        const target = (await listCaptureAccounts(env)).find((x) => x.email === a.account!.toLowerCase());
        if (!target) throw new Error(`Account ${a.account} is not active/available.`);
        return { result: { captured: [await captureAccount(env, target.ref, target.email, a.perLabel ?? 25)] } };
      }
      return { result: { captured: await captureAllAccounts(env) } };
    },
  },
  {
    name: "gmail_rag_search",
    description:
      "Semantic search over captured mail (labels set to captureMode=vectorize). Returns the best-matching messages with subject, sender, snippet, and a matched-text preview. Optionally scope to one account.",
    inputSchema: z.object({
      query: z.string(),
      account: z.string().email().optional(),
      topK: z.number().int().min(1).max(25).optional(),
    }),
    async run({ env }, a) {
      return { result: { hits: await searchGmail(env, a.query, { account: a.account, topK: a.topK }) } };
    },
  },
];
