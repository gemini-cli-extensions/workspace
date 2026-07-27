/**
 * @fileoverview Browser-side singleton Shiki highlighter for the documentation
 * surfaces.
 *
 * Shiki is the same syntax-highlighting engine that powers shadcn/ui and
 * kibo-ui. To keep the client bundle reasonable and edge-friendly we:
 *
 *   1. Lazily create a SINGLE highlighter instance (Shiki is expensive to
 *      bootstrap — sharing one instance across every `<CodeBlock>` island
 *      avoids re-loading WASM + grammars per component).
 *   2. Restrict the grammar/theme set to exactly the languages this app shows
 *      and one dark theme tuned to our Monolith palette.
 *   3. Compose a fine-grained highlighter from `shiki/core` + the WASM-less
 *      `@shikijs/engine-javascript` and only the individual grammar + theme
 *      modules we use. This avoids pulling Shiki's full bundled grammar map
 *      (php, cpp, vue, …) into the dependency graph, keeping the lazy chunk
 *      payload tight.
 *
 * This module is CLIENT-ONLY. It must never run during Astro SSR — the React
 * islands that consume it are mounted with `client:visible` / `client:only`,
 * and the highlighter is only created from inside a browser effect.
 */

import type { HighlighterCore } from "shiki/core";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/** Grammar/theme keys we accept (kept in sync with the dynamic imports below). */
type BundledLanguage =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "bash"
  | "json"
  | "sql"
  | "astro"
  | "html"
  | "css";
type BundledTheme = "github-dark-default";

/**
 * The exact languages the documentation/code surfaces render. Keeping this list
 * tight is what keeps the lazily-loaded grammar payload small.
 */
export const SUPPORTED_LANGUAGES = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "bash",
  "json",
  "sql",
  "astro",
  "html",
  "css",
] as const satisfies readonly BundledLanguage[];

/** A language token accepted by {@link highlightCode}. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * The single dark theme used everywhere. `github-dark-default` sits closest to
 * our Monolith palette (near-black background, desaturated foreground) while
 * remaining a maintained, well-tested grammar theme.
 */
export const SHIKI_THEME = "github-dark-default" satisfies BundledTheme;

let highlighterPromise: Promise<HighlighterCore> | undefined;

/**
 * Returns the shared highlighter, creating it on first use. Concurrent callers
 * all await the same in-flight promise, so the grammars load exactly once for
 * the lifetime of the page.
 *
 * Grammars and the theme are dynamically imported so they're code-split into
 * a single lazily-loaded chunk rather than eagerly bundled with the island.
 * The JavaScript regex engine is used (no WASM) for the smallest footprint.
 *
 * @returns A promise resolving to the singleton Shiki highlighter.
 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import("@shikijs/themes/github-dark-default")],
      langs: [
        import("@shikijs/langs/typescript"),
        import("@shikijs/langs/tsx"),
        import("@shikijs/langs/javascript"),
        import("@shikijs/langs/jsx"),
        import("@shikijs/langs/bash"),
        import("@shikijs/langs/json"),
        import("@shikijs/langs/sql"),
        import("@shikijs/langs/astro"),
        import("@shikijs/langs/html"),
        import("@shikijs/langs/css"),
      ] as Parameters<typeof createHighlighterCore>[0]["langs"],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

/**
 * Normalizes loosely-typed language strings (e.g. `"typescript"`, `"shell"`)
 * onto one of {@link SUPPORTED_LANGUAGES}, falling back to plain text when the
 * language isn't in our bundle.
 *
 * @param lang - A user-supplied language hint.
 * @returns A supported language token, or `"text"` when unsupported.
 */
export function normalizeLanguage(lang: string | undefined): SupportedLanguage | "text" {
  if (!lang) return "text";
  const lower = lang.toLowerCase();
  const alias: Record<string, SupportedLanguage> = {
    typescript: "ts",
    ts: "ts",
    tsx: "tsx",
    javascript: "js",
    js: "js",
    jsx: "jsx",
    shell: "bash",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    jsonc: "json",
    sql: "sql",
    astro: "astro",
    html: "html",
    css: "css",
  };
  return alias[lower] ?? "text";
}

/**
 * Highlights a source string to a Shiki-produced HTML `<pre>` string for the
 * configured dark theme. Falls back to `"text"` (no grammar) for unsupported
 * languages so the call never throws on an unknown hint.
 *
 * @param code - The raw source to highlight.
 * @param lang - A language hint (alias-tolerant; see {@link normalizeLanguage}).
 * @returns A promise resolving to a Shiki `<pre class="shiki">…</pre>` string.
 * @example
 * const html = await highlightCode("const x = 1", "ts");
 */
export async function highlightCode(code: string, lang: string | undefined): Promise<string> {
  const highlighter = await getHighlighter();
  const language = normalizeLanguage(lang);
  return highlighter.codeToHtml(code, {
    lang: language,
    theme: SHIKI_THEME,
    // Strip Shiki's inline background so our shell's `bg-card` shows through.
    colorReplacements: { "#0d1117": "transparent" },
  });
}
