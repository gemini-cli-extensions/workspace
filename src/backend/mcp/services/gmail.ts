import { googleJson } from "../googleClient";

export type GmailMessage = { id: string; snippet: string; payload?: unknown };

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function base64Url(input: string): string {
  return btoa(unescape(encodeURIComponent(input))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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

  async send(to: string, subject: string, body: string): Promise<{ id: string }> {
    const mime = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    return googleJson<{ id: string }>(this.env, this.sub, `${BASE}/messages/send`, {
      method: "POST",
      body: JSON.stringify({ raw: base64Url(mime) }),
    });
  }
}
