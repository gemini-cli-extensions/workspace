/**
 * @fileoverview Workers-native Gmail REST client.
 *
 * `GmailClient` extends {@link GoogleApiClient} and wraps the Gmail v1 API
 * (`https://gmail.googleapis.com/gmail/v1/users/me`). It ports search, message
 * /thread/attachment fetching, RFC822 send + draft creation, label and filter
 * management, and label/trash mutations from the legacy `gmailApiHelpers.ts`
 * onto pure `fetch` — no Node `googleapis`, no `Buffer`. Outgoing messages are
 * RFC822-encoded and base64url-encoded via Web APIs.
 *
 * Scopes: reads/mutations use `gmail.modify`; sends additionally request
 * `gmail.send`; filter management uses `gmail.settings.basic`.
 */

import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** A parsed Gmail message (headers extracted, body decoded). */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  attachments?: GmailAttachment[];
}

/** Attachment metadata extracted from a message payload. */
export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** A Gmail thread with its messages. */
export interface GmailThread {
  id: string;
  snippet?: string;
  messages: GmailMessage[];
}

/** A Gmail label. */
export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

/** Options for composing an outgoing message or draft. */
export interface ComposeOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Send the body as `text/html` instead of `text/plain`. */
  html?: boolean;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

/** Criteria for a Gmail filter. */
export interface FilterCriteria {
  from?: string;
  to?: string;
  subject?: string;
  query?: string;
  hasAttachment?: boolean;
  size?: number;
  sizeComparison?: "larger" | "smaller";
}

/** Action for a Gmail filter. */
export interface FilterAction {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  forward?: string;
}

const MAX_BATCH_SIZE = 25;

/**
 * Account-bound client for the Gmail API v1.
 *
 * @example
 * ```ts
 * const gmail = new GmailClient(env, "personal");
 * const hits = await gmail.searchMessages("is:unread", 10);
 * await gmail.sendMessage({ to: "a@b.com", subject: "Hi", body: "Hello" });
 * ```
 */
export class GmailClient extends GoogleApiClient {
  /**
   * Search messages with Gmail query syntax.
   *
   * @param q - Gmail search query (e.g. `"from:foo is:unread"`)
   * @param maxResults - Max message stubs to return (default 50)
   * @returns Message id/threadId stubs plus an optional `nextPageToken`
   * @throws If the request fails
   */
  async searchMessages(
    q: string,
    maxResults = 50,
  ): Promise<{ messages: { id: string; threadId: string }[]; nextPageToken?: string }> {
    const res = await this.request<{
      messages?: { id: string; threadId: string }[];
      nextPageToken?: string;
    }>(`${GMAIL_BASE}/messages`, {
      query: { q, maxResults },
      scopes: [GoogleScope.Gmail],
    });
    return { messages: res.messages ?? [], nextPageToken: res.nextPageToken };
  }

  /**
   * Fetch a full message by ID (headers parsed, body decoded).
   *
   * @param id - Message ID
   * @param format - Gmail format (default `"full"`)
   * @returns The parsed {@link GmailMessage}
   * @throws If the message is missing or access is denied
   */
  async getMessage(
    id: string,
    format: "minimal" | "full" | "raw" | "metadata" = "full",
  ): Promise<GmailMessage> {
    const raw = await this.request<RawMessage>(`${GMAIL_BASE}/messages/${id}`, {
      query: { format },
      scopes: [GoogleScope.Gmail],
    });
    return convertToGmailMessage(raw);
  }

  /**
   * Fetch multiple messages in parallel (max 25).
   *
   * @param ids - Message IDs
   * @param format - Gmail format (default `"full"`)
   * @returns The parsed messages (failed fetches are skipped)
   * @throws If more than 25 IDs are supplied
   */
  async getMessagesBatch(
    ids: string[],
    format: "minimal" | "full" | "metadata" = "full",
  ): Promise<GmailMessage[]> {
    if (ids.length === 0) return [];
    if (ids.length > MAX_BATCH_SIZE) {
      throw new Error(`Maximum ${MAX_BATCH_SIZE} messages per batch. Received: ${ids.length}`);
    }
    const results = await Promise.all(
      ids.map((id) => this.getMessage(id, format).catch(() => null)),
    );
    return results.filter((m): m is GmailMessage => m !== null);
  }

  /**
   * Get an attachment's base64url-encoded data.
   *
   * @param msgId - Message ID owning the attachment
   * @param attId - Attachment ID
   * @returns `{ data, size }` where `data` is base64url-encoded
   * @throws If the attachment is missing or access is denied
   */
  async getAttachment(msgId: string, attId: string): Promise<{ data: string; size: number }> {
    const res = await this.request<{ data?: string; size?: number }>(
      `${GMAIL_BASE}/messages/${msgId}/attachments/${attId}`,
      { scopes: [GoogleScope.Gmail] },
    );
    if (!res.data) throw new Error("Attachment data is empty");
    return { data: res.data, size: res.size ?? 0 };
  }

  /**
   * Fetch a thread and all of its messages.
   *
   * @param id - Thread ID
   * @param format - Gmail format (default `"full"`)
   * @returns The {@link GmailThread}
   * @throws If the thread is missing or access is denied
   */
  async getThread(
    id: string,
    format: "minimal" | "full" | "metadata" = "full",
  ): Promise<GmailThread> {
    const res = await this.request<{
      id?: string;
      snippet?: string;
      messages?: RawMessage[];
    }>(`${GMAIL_BASE}/threads/${id}`, {
      query: { format },
      scopes: [GoogleScope.Gmail],
    });
    return {
      id: res.id ?? "",
      snippet: res.snippet,
      messages: (res.messages ?? []).map(convertToGmailMessage),
    };
  }

  /**
   * Send an email.
   *
   * @param options - Compose options ({@link ComposeOptions})
   * @returns The sent message `{ id, threadId }`
   * @throws If the send fails
   * @example
   * ```ts
   * await gmail.sendMessage({ to: "a@b.com", subject: "Hi", body: "<b>Hi</b>", html: true });
   * ```
   */
  async sendMessage(options: ComposeOptions): Promise<{ id: string; threadId: string }> {
    const raw = buildRawMessage(options);
    const body: Record<string, unknown> = { raw };
    if (options.threadId) body.threadId = options.threadId;
    return this.request<{ id: string; threadId: string }>(`${GMAIL_BASE}/messages/send`, {
      method: "POST",
      body,
      scopes: [GoogleScope.Gmail, GoogleScope.GmailSend],
    });
  }

  /**
   * Create a draft email.
   *
   * @param options - Compose options ({@link ComposeOptions})
   * @returns The created draft `{ id, message }`
   * @throws If the request fails
   */
  async createDraft(
    options: ComposeOptions,
  ): Promise<{ id: string; message?: { id?: string; threadId?: string } }> {
    const raw = buildRawMessage(options);
    const message: Record<string, unknown> = { raw };
    if (options.threadId) message.threadId = options.threadId;
    return this.request<{ id: string; message?: { id?: string; threadId?: string } }>(
      `${GMAIL_BASE}/drafts`,
      {
        method: "POST",
        body: { message },
        scopes: [GoogleScope.Gmail, GoogleScope.GmailSend],
      },
    );
  }

  /**
   * List all labels.
   *
   * @returns The account's {@link GmailLabel} list
   * @throws If the request fails
   */
  async listLabels(): Promise<GmailLabel[]> {
    const res = await this.request<{ labels?: RawLabel[] }>(`${GMAIL_BASE}/labels`, {
      scopes: [GoogleScope.Gmail],
    });
    return (res.labels ?? []).map(toLabel);
  }

  /**
   * Create a new label.
   *
   * @param name - Label name
   * @returns The created {@link GmailLabel}
   * @throws If the label already exists or the request fails
   */
  async createLabel(name: string): Promise<GmailLabel> {
    const res = await this.request<RawLabel>(`${GMAIL_BASE}/labels`, {
      method: "POST",
      body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
      scopes: [GoogleScope.Gmail],
    });
    return toLabel(res);
  }

  /**
   * Delete a label.
   *
   * @param id - Label ID
   * @throws If the label is missing or is a system label
   */
  async deleteLabel(id: string): Promise<void> {
    await this.request<void>(`${GMAIL_BASE}/labels/${id}`, {
      method: "DELETE",
      scopes: [GoogleScope.Gmail],
    });
  }

  /**
   * Update a label's properties.
   *
   * @param id - Label ID
   * @param updates - Fields to change (e.g. `{ name }`)
   * @returns The updated {@link GmailLabel}
   * @throws If the label is missing or access is denied
   */
  async updateLabel(
    id: string,
    updates: {
      name?: string;
      labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide";
      messageListVisibility?: "show" | "hide";
    },
  ): Promise<GmailLabel> {
    const res = await this.request<RawLabel>(`${GMAIL_BASE}/labels/${id}`, {
      method: "PATCH",
      body: updates,
      scopes: [GoogleScope.Gmail],
    });
    return toLabel(res);
  }

  /**
   * List the account's filters.
   *
   * @returns The filters with their criteria/action
   * @throws If the request fails
   */
  async listFilters(): Promise<
    { id: string; criteria: FilterCriteria; action: FilterAction }[]
  > {
    const res = await this.request<{
      filter?: { id?: string; criteria?: FilterCriteria; action?: FilterAction }[];
    }>(`${GMAIL_BASE}/settings/filters`, {
      scopes: [GoogleScope.GmailSettings],
    });
    return (res.filter ?? []).map((f) => ({
      id: f.id ?? "",
      criteria: f.criteria ?? {},
      action: f.action ?? {},
    }));
  }

  /**
   * Create a filter.
   *
   * @param criteria - Matching criteria
   * @param action - Action to take on matched messages
   * @returns The created filter
   * @throws If the request fails
   */
  async createFilter(
    criteria: FilterCriteria,
    action: FilterAction,
  ): Promise<{ id: string; criteria: FilterCriteria; action: FilterAction }> {
    const res = await this.request<{ id?: string; criteria?: FilterCriteria; action?: FilterAction }>(
      `${GMAIL_BASE}/settings/filters`,
      {
        method: "POST",
        body: { criteria, action },
        scopes: [GoogleScope.GmailSettings],
      },
    );
    return { id: res.id ?? "", criteria: res.criteria ?? {}, action: res.action ?? {} };
  }

  /**
   * Delete a filter.
   *
   * @param id - Filter ID
   * @throws If the filter is missing or access is denied
   */
  async deleteFilter(id: string): Promise<void> {
    await this.request<void>(`${GMAIL_BASE}/settings/filters/${id}`, {
      method: "DELETE",
      scopes: [GoogleScope.GmailSettings],
    });
  }

  /**
   * Add and/or remove labels on a single message.
   *
   * @param id - Message ID
   * @param add - Label IDs to add
   * @param remove - Label IDs to remove
   * @returns The updated {@link GmailMessage}
   * @throws If the message is missing or access is denied
   */
  async modifyMessageLabels(id: string, add: string[] = [], remove: string[] = []): Promise<GmailMessage> {
    const res = await this.request<RawMessage>(`${GMAIL_BASE}/messages/${id}/modify`, {
      method: "POST",
      body: { addLabelIds: add, removeLabelIds: remove },
      scopes: [GoogleScope.Gmail],
    });
    return convertToGmailMessage(res);
  }

  /**
   * Move a message to Trash.
   *
   * @param id - Message ID
   * @returns The updated {@link GmailMessage}
   * @throws If the message is missing or access is denied
   */
  async trashMessage(id: string): Promise<GmailMessage> {
    const res = await this.request<RawMessage>(`${GMAIL_BASE}/messages/${id}/trash`, {
      method: "POST",
      body: {},
      scopes: [GoogleScope.Gmail],
    });
    return convertToGmailMessage(res);
  }

  /**
   * Add and/or remove labels across every message in a thread.
   *
   * @param threadId - Thread ID
   * @param add - Label IDs to add
   * @param remove - Label IDs to remove
   * @returns The updated thread metadata
   * @throws If the thread is missing or access is denied
   */
  async labelThread(threadId: string, add: string[] = [], remove: string[] = []): Promise<unknown> {
    return this.request(`${GMAIL_BASE}/threads/${threadId}/modify`, {
      method: "POST",
      body: { addLabelIds: add, removeLabelIds: remove },
      scopes: [GoogleScope.Gmail],
    });
  }

  /**
   * Remove labels from every message in a thread.
   *
   * @param threadId - Thread ID
   * @param remove - Label IDs to remove
   * @returns The updated thread metadata
   * @throws If the thread is missing or access is denied
   */
  async unlabelThread(threadId: string, remove: string[]): Promise<unknown> {
    return this.labelThread(threadId, [], remove);
  }
}

// --- Internal helpers ---

interface RawMessagePartHeader {
  name?: string;
  value?: string;
}

interface RawMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: RawMessagePartHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: RawMessagePart[];
}

interface RawMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: RawMessagePart;
}

interface RawLabel {
  id?: string;
  name?: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

function toLabel(l: RawLabel): GmailLabel {
  return {
    id: l.id ?? "",
    name: l.name ?? "",
    type: l.type,
    messagesTotal: l.messagesTotal,
    messagesUnread: l.messagesUnread,
  };
}

/** Decode a base64url string to a UTF-8 string (Workers-native, no Buffer). */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Encode a UTF-8 string to base64url (Workers-native, no Buffer). */
function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseHeaders(headers: RawMessagePartHeader[] | undefined): {
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
} {
  const out: { subject?: string; from?: string; to?: string; date?: string } = {};
  for (const h of headers ?? []) {
    switch (h.name?.toLowerCase()) {
      case "subject":
        out.subject = h.value ?? undefined;
        break;
      case "from":
        out.from = h.value ?? undefined;
        break;
      case "to":
        out.to = h.value ?? undefined;
        break;
      case "date":
        out.date = h.value ?? undefined;
        break;
    }
  }
  return out;
}

function extractBody(payload: RawMessagePart | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) {
      if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
    }
    for (const p of payload.parts) {
      if (p.mimeType === "text/html" && p.body?.data) return decodeBase64Url(p.body.data);
    }
    for (const p of payload.parts) {
      const nested = extractBody(p);
      if (nested) return nested;
    }
  }
  return "";
}

function extractAttachments(payload: RawMessagePart | undefined): GmailAttachment[] {
  const out: GmailAttachment[] = [];
  const walk = (part: RawMessagePart): void => {
    if (part.filename && part.body?.attachmentId) {
      out.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    for (const sub of part.parts ?? []) walk(sub);
  };
  if (payload) walk(payload);
  return out;
}

function convertToGmailMessage(message: RawMessage): GmailMessage {
  const headers = parseHeaders(message.payload?.headers);
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    labelIds: message.labelIds,
    snippet: message.snippet,
    subject: headers.subject,
    from: headers.from,
    to: headers.to,
    date: headers.date,
    body: extractBody(message.payload),
    attachments: extractAttachments(message.payload),
  };
}

/** Build an RFC822 message and base64url-encode it for the Gmail API. */
function buildRawMessage(options: ComposeOptions): string {
  const contentType = options.html
    ? "text/html; charset=utf-8"
    : "text/plain; charset=utf-8";
  const lines = [`To: ${options.to}`, `Subject: ${options.subject}`];
  if (options.cc) lines.push(`Cc: ${options.cc}`);
  if (options.bcc) lines.push(`Bcc: ${options.bcc}`);
  if (options.inReplyTo) lines.push(`In-Reply-To: ${options.inReplyTo}`);
  if (options.references) lines.push(`References: ${options.references}`);
  lines.push("MIME-Version: 1.0", `Content-Type: ${contentType}`, "", options.body);
  return encodeBase64Url(lines.join("\r\n"));
}
