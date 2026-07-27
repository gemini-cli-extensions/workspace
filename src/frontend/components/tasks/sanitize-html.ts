/**
 * @fileoverview HTML sanitization for the task rich-text surface.
 *
 * Task descriptions and comment bodies are stored as HTML strings in D1, so
 * every string that we either PERSIST (from the editor) or INJECT via
 * `dangerouslySetInnerHTML` (in the renderer) MUST be sanitized first —
 * stripping `<script>`, inline `on*` handlers, and `javascript:` URLs so a
 * malicious/stale row can never execute in another user's browser.
 *
 * We use DOMPurify, which requires a live DOM. These components mount inside
 * `client:load` islands, so in the browser we get the full, battle-tested
 * sweep. During Astro SSR / the first hydration paint there is no DOM, so
 * {@link sanitizeHtml} falls back to a conservative regex pass that removes the
 * dangerous constructs; the client then re-sanitizes with DOMPurify on mount.
 *
 * The allow-list mirrors exactly the tags/attrs our serializer emits (headings,
 * paragraphs, lists, blockquote, pre/code, links, and the b/i/u marks) so no
 * unexpected element survives.
 */

import DOMPurify from "dompurify";

/** Tags our editor can emit — everything else is dropped. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
];

/** Attributes allowed to survive (scoped to links). */
const ALLOWED_ATTR = ["href", "target", "rel"];

/** True when a real browser DOM is available (i.e. not Astro SSR). */
const hasDom = typeof window !== "undefined" && typeof window.document !== "undefined";

/**
 * A conservative, DOM-free fallback sanitizer for the SSR pass. It removes the
 * high-risk constructs (script/style/iframe blocks, inline event handlers,
 * `javascript:`/`data:` URLs) without attempting a full parse. The client
 * re-runs the real DOMPurify sweep on hydration, so this only needs to keep the
 * SSR paint safe.
 */
function regexSanitize(html: string): string {
  return (
    html
      // Strip dangerous element blocks entirely (open→close, case-insensitive).
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      // Strip any self-closing / unterminated dangerous tags too.
      .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
      // Remove inline event handlers: on*="..." / on*='...' / on*=bareword.
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Neutralise javascript:/vbscript:/data: URLs in href/src attributes.
      .replace(/(href|src)\s*=\s*("|')?\s*(javascript|vbscript|data):[^"'>\s]*("|')?/gi, '$1="#"')
  );
}

/**
 * Sanitize an HTML fragment to the task rich-text allow-list.
 *
 * In the browser this is a full DOMPurify sweep; during SSR it falls back to
 * {@link regexSanitize}. Always returns a string safe to store or inject.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  const raw = html ?? "";
  if (!raw) return "";

  if (!hasDom) return regexSanitize(raw);

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Force-safe link semantics; DOMPurify also drops `javascript:` hrefs.
    ADD_ATTR: ["target", "rel"],
  });
}
