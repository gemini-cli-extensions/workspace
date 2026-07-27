/**
 * @fileoverview Serialization layer for the task rich-text surface.
 *
 * Round 3 unifies task DESCRIPTIONS and COMMENTS on a single PlateJS editor
 * whose content is persisted to D1 as **sanitized HTML** (not a Plate envelope).
 * The content columns stay plain `string`s — `tasks.description` and
 * `task_comments.body` now hold an HTML fragment — so no schema change is needed.
 *
 * Three concerns live here, all framework-agnostic (no React):
 *
 *  1. {@link plateValueToHtml} — serialize the editor's Plate value to a clean,
 *     SEMANTIC HTML string (no framework class names / data-slate attributes).
 *     This is synchronous and DOM-free so it can run anywhere. It understands
 *     the exact node set the shared notes plugin stack emits: paragraphs,
 *     H1–H3, blockquote, fenced code blocks, the indent-based list model
 *     (`listStyleType` + `indent` carried on block elements — grouped back into
 *     nested `<ul>`/`<ol>`), inline links, and the bold/italic/underline/code
 *     marks.
 *
 *  2. {@link normalizeStoredToHtml} — turn ANY stored string into displayable
 *     HTML, transparently upgrading the three legacy forms that may exist in the
 *     column: (a) an HTML fragment (Round 3) → used as-is, (b) a Plate envelope
 *     `{v,format:"plate",value}` (Round 2) → serialized via
 *     {@link plateValueToHtml}, (c) plain text / lightweight markdown (Round 1
 *     and earlier) → paragraph/`<br>` HTML. The result is NOT yet sanitized —
 *     callers sanitize at the render/persist boundary (see `sanitize-html.ts`).
 *
 *  3. {@link htmlToPlainText} — flatten any stored string to plain text for
 *     previews, search snippets, and "empty?" checks. Never returns markup.
 *
 * Deserialization of an HTML string back INTO a Plate value (needed only by the
 * editable editor, which has a live browser DOM) lives in `TaskRichEditor.tsx`
 * via Plate's `deserializeHtml`, keeping this module DOM-free.
 */

// ---------------------------------------------------------------------------
// Plate value types (mirrors the notes stack — kept local so this module has
// no dependency on the notes feature folder).
// ---------------------------------------------------------------------------

/** A single Slate/Plate text leaf. Marks are boolean flags. */
export interface PlateText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  [mark: string]: unknown;
}

/** A Slate/Plate element node. `type` keys into the plugin registry. */
export interface PlateElement {
  type: string;
  children: PlateNode[];
  /** Inline-link href (LinkPlugin). */
  url?: string;
  /** Indent-based list marker, e.g. "disc" | "decimal" (ListPlugin). */
  listStyleType?: string;
  /** Indent depth for the list model (1-based). */
  indent?: number;
  [prop: string]: unknown;
}

/** Either an element or a text leaf. */
export type PlateNode = PlateElement | PlateText;

/** The editor value is an array of top-level block elements. */
export type PlateValue = PlateElement[];

/** Round-2 versioned envelope, still present for descriptions authored then. */
interface PlateEnvelope {
  v: 1;
  format: "plate";
  value: PlateValue;
}

// ---------------------------------------------------------------------------
// Empty value + type guards
// ---------------------------------------------------------------------------

/** A minimal, valid empty document (one empty paragraph). */
export function emptyPlateValue(): PlateValue {
  return [{ type: "p", children: [{ text: "" }] }];
}

/** Type guard: does this node look like a Plate element (has `children`)? */
function isElement(node: PlateNode): node is PlateElement {
  return (
    typeof node === "object" &&
    node !== null &&
    "children" in node &&
    Array.isArray((node as PlateElement).children)
  );
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

/** Escape the five HTML-significant characters in text content. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a URL for an `href` attribute, neutralising `javascript:` schemes. */
function safeHref(url: string): string {
  const trimmed = (url ?? "").trim();
  // Block script-y protocols outright; DOMPurify strips these too, but doing it
  // here keeps the serialized string clean even before sanitization.
  if (/^\s*(javascript|data|vbscript):/i.test(trimmed)) return "#";
  return escapeHtml(trimmed);
}

// ---------------------------------------------------------------------------
// Leaf (marks) → HTML
// ---------------------------------------------------------------------------

/** Serialize a single text leaf, wrapping it in its active mark tags. */
function serializeLeaf(leaf: PlateText): string {
  let html = escapeHtml(leaf.text ?? "");
  // Inline code first (innermost), then emphasis marks, then bold (outermost),
  // mirroring how the editor renders nested marks.
  if (leaf.code) html = `<code>${html}</code>`;
  if (leaf.italic) html = `<em>${html}</em>`;
  if (leaf.underline) html = `<u>${html}</u>`;
  if (leaf.bold) html = `<strong>${html}</strong>`;
  return html;
}

/** Serialize the inline children of a block (leaves + inline links). */
function serializeInline(children: PlateNode[]): string {
  return children
    .map((child) => {
      if (isElement(child)) {
        // The only inline element we emit is a link.
        if (child.type === "a" || child.type === "link") {
          const inner = serializeInline(child.children);
          return `<a href="${safeHref(String(child.url ?? "#"))}" target="_blank" rel="noreferrer">${inner}</a>`;
        }
        // Unknown nested element — fall back to its inline text.
        return serializeInline(child.children);
      }
      return serializeLeaf(child);
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Block → HTML (with indent-based list grouping)
// ---------------------------------------------------------------------------

/** Map a block `type` to its non-list HTML tag. */
const BLOCK_TAG: Record<string, string> = {
  p: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  blockquote: "blockquote",
};

/** True when a block participates in the indent-based list model. */
function isListItem(block: PlateElement): boolean {
  return typeof block.listStyleType === "string" && block.listStyleType.length > 0;
}

/** Choose the wrapping list tag for a `listStyleType`. */
function listTagFor(styleType: string): "ol" | "ul" {
  // Ordered markers Plate emits: decimal, lower/upper-alpha, lower/upper-roman.
  return /decimal|alpha|roman/i.test(styleType) ? "ol" : "ul";
}

/**
 * Serialize a run of consecutive list blocks (already sliced out of the top
 * level) into nested `<ul>`/`<ol>` markup, honouring each block's `indent`
 * depth. A shallow depth stack keeps sibling/nesting transitions correct.
 */
function serializeListRun(run: PlateElement[]): string {
  let html = "";
  // Stack of open list tags, one per open indent level.
  const openTags: ("ul" | "ol")[] = [];

  const closeTo = (depth: number) => {
    while (openTags.length > depth) {
      html += `</li></${openTags.pop()}>`;
    }
  };

  let prevIndent = 0;
  for (const block of run) {
    const indent = Math.max(1, Number(block.indent ?? 1));
    const tag = listTagFor(String(block.listStyleType));

    if (indent > prevIndent) {
      // Descend: open a new list (nested inside the current <li> if any).
      for (let d = prevIndent; d < indent; d++) {
        if (d > 0) html = html.replace(/<\/li>$/, ""); // reopen parent li for nesting
        html += `<${tag}>`;
        openTags.push(tag);
      }
      html += `<li>${serializeInline(block.children)}</li>`;
    } else if (indent < prevIndent) {
      // Ascend: close deeper lists, then add a sibling <li>.
      closeTo(indent);
      html += `<li>${serializeInline(block.children)}</li>`;
    } else {
      // Same level: sibling <li>.
      html += `<li>${serializeInline(block.children)}</li>`;
    }
    prevIndent = indent;
  }

  closeTo(0);
  return html;
}

/** Serialize a single non-list block element to HTML. */
function serializeBlock(block: PlateElement): string {
  const type = block.type;

  // Fenced code block: the notes stack models it as a `code_block` whose
  // children are `code_line`s. Join the lines with newlines inside <pre><code>.
  if (type === "code_block" || type === "codeBlock") {
    const lines = block.children
      .filter(isElement)
      .map((line) => escapeHtml(serializeCodeLine(line)))
      .join("\n");
    return `<pre><code>${lines}</code></pre>`;
  }

  const tag = BLOCK_TAG[type] ?? "p";
  const inner = serializeInline(block.children);
  return `<${tag}>${inner}</${tag}>`;
}

/** Flatten a `code_line` element to its raw text (no marks in code). */
function serializeCodeLine(line: PlateElement): string {
  return line.children
    .map((c) => (isElement(c) ? serializeCodeLine(c) : (c.text ?? "")))
    .join("");
}

/**
 * Serialize a full Plate value to a clean, semantic HTML string.
 * Consecutive list blocks are grouped into nested `<ul>`/`<ol>`; everything
 * else maps 1:1 to its block tag. The output carries no class names or
 * data-slate attributes, so it renders identically anywhere and sanitizes to a
 * stable result.
 */
export function plateValueToHtml(value: PlateValue): string {
  if (!Array.isArray(value) || value.length === 0) return "";

  let html = "";
  let i = 0;
  while (i < value.length) {
    const block = value[i]!;
    if (isElement(block) && isListItem(block)) {
      // Collect the maximal run of consecutive list blocks.
      const run: PlateElement[] = [];
      while (i < value.length && isElement(value[i]!) && isListItem(value[i]!)) {
        run.push(value[i]!);
        i++;
      }
      html += serializeListRun(run);
      continue;
    }
    if (isElement(block)) html += serializeBlock(block);
    i++;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Legacy / stored-string normalization
// ---------------------------------------------------------------------------

/** True when a stored string is (very likely) already an HTML fragment. */
function looksLikeHtml(raw: string): boolean {
  // A tag at the start, or any block/inline tag anywhere. Deliberately loose —
  // the render boundary sanitizes regardless, and plain text with stray `<`
  // falls through to the paragraph path below.
  return /<\/?(p|div|h[1-6]|ul|ol|li|blockquote|pre|code|strong|em|u|b|i|a|br)\b[^>]*>/i.test(raw);
}

/** Try to parse a Round-2 Plate envelope out of a stored string. */
function tryParseEnvelope(raw: string): PlateValue | null {
  if (!raw.trimStart().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlateEnvelope>;
    if (
      parsed &&
      parsed.format === "plate" &&
      parsed.v === 1 &&
      Array.isArray(parsed.value) &&
      parsed.value.length > 0
    ) {
      return parsed.value as PlateValue;
    }
  } catch {
    /* not an envelope — fall through */
  }
  return null;
}

/** Convert a plain-text / lightweight-markdown string into paragraph HTML. */
function plainTextToHtml(text: string): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  // Split on blank lines into paragraphs; single newlines become <br>.
  return trimmed
    .split(/\n{2,}/)
    .map((para) => {
      const inner = escapeHtml(para).replace(/\n/g, "<br>");
      return `<p>${inner}</p>`;
    })
    .join("");
}

/**
 * Normalize ANY stored content string into displayable (but not-yet-sanitized)
 * HTML, transparently upgrading the three legacy storage forms:
 *
 *  - Plate envelope (Round 2)   → serialize the value to HTML.
 *  - HTML fragment (Round 3+)   → used verbatim.
 *  - plain text / markdown      → paragraph HTML.
 *
 * Callers MUST pass the result through the sanitizer before injecting it.
 */
export function normalizeStoredToHtml(stored: string | null | undefined): string {
  const raw = stored ?? "";
  if (!raw.trim()) return "";

  const envelopeValue = tryParseEnvelope(raw);
  if (envelopeValue) return plateValueToHtml(envelopeValue);

  if (looksLikeHtml(raw)) return raw;

  return plainTextToHtml(raw);
}

// ---------------------------------------------------------------------------
// Plain-text extraction (previews / snippets / empty checks)
// ---------------------------------------------------------------------------

/** Walk a Plate value and concatenate its text leaves (blocks joined by \n). */
function plateValueToPlainText(value: PlateValue): string {
  const walk = (nodes: PlateNode[]): string => {
    let acc = "";
    for (const node of nodes) {
      if (isElement(node)) acc += walk(node.children);
      else if (typeof node.text === "string") acc += node.text;
    }
    return acc;
  };
  return value
    .map((block) => (isElement(block) ? walk(block.children) : ""))
    .filter((s) => s.length > 0)
    .join("\n");
}

/** Strip tags + decode the common entities from an HTML fragment. */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Flatten any stored content string to plain text — safe for list previews,
 * search snippets, and "is this empty?" checks. Handles all three storage
 * forms and never returns markup.
 */
export function htmlToPlainText(stored: string | null | undefined): string {
  const raw = stored ?? "";
  if (!raw.trim()) return "";

  const envelopeValue = tryParseEnvelope(raw);
  if (envelopeValue) return plateValueToPlainText(envelopeValue);

  if (looksLikeHtml(raw)) return stripHtmlTags(raw);

  return raw.trim();
}
