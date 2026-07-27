/**
 * @fileoverview Barrel for the Google Workspace REST client layer.
 *
 * Re-exports the shared core (account-aware fetch client, ID extraction,
 * Docs→Markdown conversion) plus every surface client. Each client extends
 * {@link GoogleApiClient} and is bound to a {@link GoogleAccount} at
 * construction (`new GoogleDocsClient(env, account)`). All clients are
 * Workers-native (`fetch` only — no Node `googleapis`).
 *
 * @example
 * ```ts
 * import { GoogleDocsClient, GmailClient } from "@/backend/google";
 * const docs = new GoogleDocsClient(env, "workspace");
 * const gmail = new GmailClient(env, "personal");
 * ```
 */

// Core
export { GoogleApiClient, type GoogleRequestOptions } from "@/backend/google/core/client";
export { extractGoogleId } from "@/backend/google/core/ids";
export { convertDocsJsonToMarkdown } from "@/backend/google/core/markdown";

// Surface clients
export {
  GoogleDocsClient,
  type TextStyleArgs,
  type ParagraphStyleArgs,
  type DriveComment,
  type DriveReply,
  type TabWithLevel,
  type DocsRequest,
} from "@/backend/google/docs";
export {
  GoogleDriveClient,
  type DriveFile,
  type DrivePermission,
} from "@/backend/google/drive";
export {
  GoogleSheetsClient,
  type ValueRange,
  type SpreadsheetInfo,
  type SheetListItem,
  type SheetsRequest,
} from "@/backend/google/sheets";
export {
  GoogleSlidesClient,
  type Presentation,
  type SlidesRequest,
} from "@/backend/google/slides";
export {
  GmailClient,
  type GmailMessage,
  type GmailAttachment,
  type GmailThread,
  type GmailLabel,
  type ComposeOptions,
  type FilterCriteria,
  type FilterAction,
} from "@/backend/google/gmail";
export {
  CalendarClient,
  type CalendarInfo,
  type CalendarEvent,
  type EventDateTime,
  type CreateEventOptions,
  type ListEventsOptions,
  type BusyInterval,
} from "@/backend/google/calendar";
export {
  AppsScriptClient,
  type ScriptProject,
  type ScriptFile,
  type ScriptListItem,
} from "@/backend/google/appscript";
