/**
 * @fileoverview Shared types + small helpers for the Inbox island.
 *
 * Mirrors the `email_messages` D1 table / `GET /api/inbox` response shape. The
 * API serializes `received_at` as epoch milliseconds (number) over the wire.
 */

/** Folder buckets a message can live in (matches the D1 enum). */
export type EmailFolder = "inbox" | "archive" | "spam";

/** A single received email as returned by the inbox API. */
export interface EmailMessage {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  snippet: string;
  folder: EmailFolder;
  labels: string[];
  read: boolean;
  starred: boolean;
  receivedAt: number | string;
  rawSize: number;
}

/** `GET /api/inbox` paginated envelope (extends the standard list shape). */
export interface InboxEnvelope {
  data: EmailMessage[];
  total: number;
  limit: number;
  offset: number;
  unread: number;
}

/** `POST /api/inbox/seed` response. */
export interface SeedResponse {
  seeded: boolean;
  message: string;
  count?: number;
}

/** The left-pane view selector. "starred" is a cross-folder view. */
export type InboxView = "inbox" | "starred" | "archive";

/** Map a view to the API query params it implies. */
export function viewToQuery(view: InboxView): { folder?: EmailFolder; starred?: "true" } {
  if (view === "starred") return { starred: "true" };
  if (view === "archive") return { folder: "archive" };
  return { folder: "inbox" };
}

/** Derive up-to-two-letter initials from a name or email address. */
export function senderInitials(name: string | null, address: string): string {
  const source = name?.trim() || address.split("@")[0] || address;
  const parts = source.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Display label for a sender: name if present, else the address. */
export function senderLabel(msg: Pick<EmailMessage, "fromName" | "fromAddress">): string {
  return msg.fromName?.trim() || msg.fromAddress;
}
