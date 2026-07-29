/**
 * @file gmail/parse-message.ts
 * @description Pure parsing of a raw Gmail `format=full` message into the shape
 * the relational store wants: thread/message fields, plain-text body, and
 * from/to/cc/bcc contacts. No network — feed it the raw API JSON. Testable.
 */

export type ContactType = "from" | "to" | "cc" | "bcc";

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  email: string;
  type: ContactType;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  subject: string | null;
  snippet: string | null;
  internalDate: number | null;
  labelIds: string[];
  bodyText: string;
  contacts: ParsedContact[];
}

// ---------------------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------------------

/** Split an address header on top-level commas (not inside quotes or angles). */
export function splitAddresses(header: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of header) {
    if (ch === '"') inQuote = !inQuote;
    else if (ch === "<") inAngle = true;
    else if (ch === ">") inAngle = false;
    if (ch === "," && !inQuote && !inAngle) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Parse one address ("John Doe <j@x.com>" / "j@x.com" / '"Doe, John" <j@x>"). */
export function parseAddress(addr: string): { firstName: string | null; lastName: string | null; email: string } | null {
  const angle = addr.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : addr).trim().toLowerCase();
  if (!email.includes("@")) return null;

  let name = angle ? addr.slice(0, addr.indexOf("<")).trim() : "";
  name = name.replace(/^"|"$/g, "").trim();
  if (!name) return { firstName: null, lastName: null, email };

  if (name.includes(",")) {
    // "Last, First" convention.
    const [last, first] = name.split(",");
    return { firstName: (first ?? "").trim() || null, lastName: (last ?? "").trim() || null, email };
  }
  const parts = name.split(/\s+/);
  return { firstName: parts[0] || null, lastName: parts.slice(1).join(" ") || null, email };
}

// ---------------------------------------------------------------------------
// Body decoding
// ---------------------------------------------------------------------------

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** First text/plain leaf anywhere in the tree. */
function extractPlain(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const p of payload.parts ?? []) {
    const t = extractPlain(p);
    if (t) return t;
  }
  return "";
}

/** Walk the MIME tree: prefer any text/plain part, else fall back to any decodable leaf. */
export function extractBodyText(payload: any): string {
  if (!payload) return "";
  const plain = extractPlain(payload);
  if (plain) return plain;
  if (payload.body?.data && !payload.parts) return decodeBase64Url(payload.body.data);
  for (const p of payload.parts ?? []) {
    const t = extractBodyText(p);
    if (t) return t;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

function headerValue(headers: any[], name: string): string | undefined {
  return headers.find((h) => h?.name?.toLowerCase() === name)?.value ?? undefined;
}

function contactsFrom(headers: any[], name: string, type: ContactType): ParsedContact[] {
  const raw = headerValue(headers, name);
  if (!raw) return [];
  return splitAddresses(raw)
    .map((a) => parseAddress(a))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => ({ ...c, type }));
}

/** Parse a raw Gmail `format=full` message into structured rows. */
export function parseRawMessage(raw: any): ParsedMessage {
  const payload = raw?.payload ?? {};
  const headers: any[] = payload.headers ?? [];
  const internal = raw?.internalDate ? Number(raw.internalDate) : null;
  return {
    id: String(raw?.id ?? ""),
    threadId: String(raw?.threadId ?? ""),
    subject: headerValue(headers, "subject") ?? null,
    snippet: raw?.snippet ?? null,
    internalDate: Number.isFinite(internal) ? internal : null,
    labelIds: Array.isArray(raw?.labelIds) ? raw.labelIds : [],
    bodyText: extractBodyText(payload),
    contacts: [
      ...contactsFrom(headers, "from", "from"),
      ...contactsFrom(headers, "to", "to"),
      ...contactsFrom(headers, "cc", "cc"),
      ...contactsFrom(headers, "bcc", "bcc"),
    ],
  };
}
