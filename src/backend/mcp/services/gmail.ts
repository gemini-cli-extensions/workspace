import { googleJson } from "../googleClient";

export type GmailMessage = { id: string; snippet: string; payload?: unknown };

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function base64Url(input: string): string {
  return btoa(unescape(encodeURIComponent(input))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Extracts bare email addresses from a comma-separated header value, handling "Name <a@b.com>" forms.
function extractEmails(headerValue: string | undefined): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/<([^>]+)>/);
      return (match ? match[1] : trimmed).trim();
    })
    .filter(Boolean);
}

export class GmailService {
  constructor(private env: Env, private sub: string) {}

  async listMessages(query?: string, maxResults = 20): Promise<{ messages: { id: string; threadId: string }[] }> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (query) params.set("q", query);
    const out = await googleJson<{ messages?: { id: string; threadId: string }[] }>(this.env, this.sub, `${BASE}/messages?${params}`);
    return { messages: out.messages ?? [] };
  }

  async getMessage(id: string): Promise<GmailMessage> {
    return googleJson<GmailMessage>(this.env, this.sub, `${BASE}/messages/${id}?format=full`);
  }

  /** List message ids carrying a specific label. */
  async listByLabel(labelId: string, maxResults = 25): Promise<{ messages: { id: string; threadId: string }[] }> {
    const params = new URLSearchParams({ maxResults: String(maxResults), labelIds: labelId });
    const out = await googleJson<{ messages?: { id: string; threadId: string }[] }>(this.env, this.sub, `${BASE}/messages?${params}`);
    return { messages: out.messages ?? [] };
  }

  /** Fetch the raw `format=full` message JSON (payload + headers) for parsing. */
  async getRawMessage(id: string): Promise<Record<string, unknown>> {
    return googleJson<Record<string, unknown>>(this.env, this.sub, `${BASE}/messages/${id}?format=full`);
  }

  /** Fetch attachment bytes (base64url `data`) for a message part. */
  async getAttachment(messageId: string, attachmentId: string): Promise<{ data: string; size: number }> {
    return googleJson<{ data: string; size: number }>(
      this.env,
      this.sub,
      `${BASE}/messages/${messageId}/attachments/${attachmentId}`,
    );
  }

  async send(to: string, subject: string, body: string): Promise<{ id: string }> {
    const mime = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    return googleJson<{ id: string }>(this.env, this.sub, `${BASE}/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: base64Url(mime) }),
    });
  }

  async createDraft(to: string, subject: string, body: string): Promise<{ id: string; message?: { id: string } }> {
    const mime = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    return googleJson<{ id: string; message?: { id: string } }>(this.env, this.sub, `${BASE}/drafts`, {
      method: "POST",
      body: JSON.stringify({ message: { raw: base64Url(mime) } }),
    });
  }

  async getProfile(): Promise<{ emailAddress: string }> {
    return googleJson<{ emailAddress: string }>(this.env, this.sub, `${BASE}/profile`);
  }

  async getMessageHeaders(messageId: string): Promise<{ headers: Record<string, string>; threadId: string }> {
    const params = new URLSearchParams({ format: "metadata" });
    for (const name of ["From", "To", "Cc", "Subject", "Message-ID", "References"]) {
      params.append("metadataHeaders", name);
    }
    const out = await googleJson<{ threadId: string; payload?: { headers?: { name: string; value: string }[] } }>(
      this.env,
      this.sub,
      `${BASE}/messages/${messageId}?${params}`,
    );
    const headers: Record<string, string> = {};
    for (const h of out.payload?.headers ?? []) {
      headers[h.name.toLowerCase()] = h.value;
    }
    return { headers, threadId: out.threadId };
  }

  async createReplyDraft(
    messageId: string,
    body: string,
    opts?: { to?: string[]; replyAll?: boolean },
  ): Promise<{ id: string; message?: { id: string; threadId?: string } }> {
    const [{ headers, threadId }, profile] = await Promise.all([this.getMessageHeaders(messageId), this.getProfile()]);
    const self = profile.emailAddress.toLowerCase();

    let recipients: string[];
    if (opts?.to && opts.to.length > 0) {
      recipients = opts.to;
    } else if (opts?.replyAll === false) {
      recipients = extractEmails(headers["from"]);
    } else {
      const seen = new Set<string>();
      recipients = [];
      for (const addr of [...extractEmails(headers["from"]), ...extractEmails(headers["to"]), ...extractEmails(headers["cc"])]) {
        const key = addr.toLowerCase();
        if (key === self || seen.has(key)) continue;
        seen.add(key);
        recipients.push(addr);
      }
    }

    const originalSubject = headers["subject"] ?? "";
    const subject = /^re:/i.test(originalSubject.trim()) ? originalSubject : `Re: ${originalSubject}`;
    const messageIdHeader = headers["message-id"] ?? "";
    const references = [headers["references"], messageIdHeader].filter(Boolean).join(" ").trim();

    const mime = [
      `To: ${recipients.join(", ")}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${messageIdHeader}`,
      `References: ${references}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");

    return googleJson<{ id: string; message?: { id: string; threadId?: string } }>(this.env, this.sub, `${BASE}/drafts`, {
      method: "POST",
      body: JSON.stringify({ message: { raw: base64Url(mime), threadId } }),
    });
  }

  async listLabels(): Promise<{ labels: unknown[] }> {
    const out = await googleJson<{ labels?: unknown[] }>(this.env, this.sub, `${BASE}/labels`);
    return { labels: out.labels ?? [] };
  }

  async createLabel(name: string): Promise<{ id: string; name: string }> {
    return googleJson<{ id: string; name: string }>(this.env, this.sub, `${BASE}/labels`, {
      method: "POST",
      body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
    });
  }

  /** Create a Gmail filter that auto-applies `labelId` to matching messages. */
  async createFilter(
    criteria: Record<string, unknown>,
    labelId: string,
  ): Promise<{ id: string; criteria: Record<string, unknown> }> {
    return googleJson<{ id: string; criteria: Record<string, unknown> }>(
      this.env,
      this.sub,
      `${BASE}/settings/filters`,
      { method: "POST", body: JSON.stringify({ criteria, action: { addLabelIds: [labelId] } }) },
    );
  }

  async modifyMessageLabels(id: string, addLabelIds: string[], removeLabelIds: string[]): Promise<GmailMessage> {
    return googleJson<GmailMessage>(this.env, this.sub, `${BASE}/messages/${id}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }

  async getThread(threadId: string): Promise<{ id: string; messages: GmailMessage[] }> {
    return googleJson(this.env, this.sub, `${BASE}/threads/${threadId}?format=full`);
  }

  async trashMessage(id: string): Promise<GmailMessage> {
    return googleJson<GmailMessage>(this.env, this.sub, `${BASE}/messages/${id}/trash`, { method: "POST" });
  }
}
