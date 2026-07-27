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
import { templateArtifacts, driveNotifications } from "@db/schemas";
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
];
