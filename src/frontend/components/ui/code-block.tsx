/**
 * @fileoverview A polished, kibo-ui-style code block built by hand on our
 * base-ui + Tailwind stack (zero Radix, zero external code-block registry).
 *
 * Features:
 *   - A header bar with an optional filename, a language badge, and the shared
 *     `CopyButton`.
 *   - A syntax-highlighted body powered by the singleton Shiki highlighter
 *     (`@/lib/shiki`), highlighted on the client with a graceful plain-`<pre>`
 *     fallback rendered immediately while Shiki's WASM + grammars load.
 *   - Optional line numbers.
 *   - Optional multi-file TABS — pass several `files` and the header renders
 *     filename tabs that swap the highlighted snippet.
 *
 * Styling follows the dark Monolith rules: no 1px separators — surfaces are
 * separated with `bg-card`, `ring-1 ring-border/40`, and `divide-*`.
 *
 * SSR SAFETY: Shiki never runs during Astro SSR. Highlighting happens inside a
 * browser `useEffect`; until it resolves we render the raw code in a styled
 * `<pre>`. Mount this island with `client:visible` (or `client:load`) so it is
 * hydrated only in the browser.
 */

import * as React from "react";

import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { highlightCode, normalizeLanguage } from "@/lib/shiki";

/** A single file/snippet shown by {@link CodeBlock}. */
export type CodeBlockFile = {
  /** Filename shown in the header / used as the tab label (e.g. `agent.ts`). */
  filename?: string;
  /** Language hint for both highlighting and the language badge. */
  language?: string;
  /** The raw source string. */
  code: string;
};

export type CodeBlockProps = {
  /**
   * Single-file shorthand. Provide either this trio OR {@link CodeBlockProps.files}.
   */
  code?: string;
  /** Language hint for the single-file form. */
  language?: string;
  /** Filename for the single-file form. */
  filename?: string;
  /**
   * Multi-file form. When two or more files are supplied the header renders
   * filename tabs that switch the highlighted snippet.
   */
  files?: CodeBlockFile[];
  /** Show 1-based line numbers in a gutter. Defaults to `false`. */
  showLineNumbers?: boolean;
  /** Hide the header bar entirely (no filename / badge / copy). */
  hideHeader?: boolean;
  /** Optional cap on body height; content scrolls past it. e.g. `"24rem"`. */
  maxHeight?: string;
  /** Extra classes for the outer container. */
  className?: string;
};

/** Normalizes the single-file vs multi-file props into one list. */
function resolveFiles(props: CodeBlockProps): CodeBlockFile[] {
  if (props.files && props.files.length > 0) return props.files;
  return [{ code: props.code ?? "", language: props.language, filename: props.filename }];
}

/**
 * The highlighted (or fallback) body for one file. Renders an immediate plain
 * `<pre>` and upgrades it in place once Shiki resolves on the client.
 */
function CodeBody({
  file,
  showLineNumbers,
  maxHeight,
}: {
  file: CodeBlockFile;
  showLineNumbers: boolean;
  maxHeight?: string;
}) {
  const [html, setHtml] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void highlightCode(file.code, file.language).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [file.code, file.language]);

  const lineCount = React.useMemo(() => file.code.replace(/\n$/, "").split("\n").length, [file.code]);

  return (
    <div className="relative overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <div className="flex min-w-full">
        {showLineNumbers ? (
          <div
            aria-hidden
            className="sticky left-0 z-10 shrink-0 select-none bg-card px-4 py-4 text-right font-mono text-xs leading-relaxed text-muted-foreground/50"
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {html ? (
            // Shiki output. `[&_pre]` overrides reset Shiki's own padding/bg so
            // the snippet sits cleanly inside our shell.
            <div
              className={cn(
                "[&_pre]:m-0 [&_pre]:!bg-transparent [&_pre]:px-4 [&_pre]:py-4",
                "[&_code]:font-mono [&_code]:text-xs [&_code]:leading-relaxed",
              )}
              // Shiki emits trusted, escaped HTML for a static string we control.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <pre className="m-0 overflow-visible px-4 py-4 font-mono text-xs leading-relaxed text-foreground/90">
              <code>{file.code}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header chrome shared by the single- and multi-file layouts. */
function HeaderBar({
  left,
  language,
  copyText,
}: {
  left: React.ReactNode;
  language?: string;
  copyText: string;
}) {
  const langLabel = language ? normalizeLanguage(language).toUpperCase() : null;
  return (
    <div className="flex items-center justify-between gap-3 bg-muted/30 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex shrink-0 items-center gap-2">
        {langLabel && langLabel !== "TEXT" ? (
          <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
            {langLabel}
          </Badge>
        ) : null}
        <CopyButton text={copyText} label="Copy" copiedLabel="Copied" />
      </div>
    </div>
  );
}

/**
 * A reusable, syntax-highlighted code block with an optional header
 * (filename + language badge + copy), optional line numbers, and optional
 * multi-file tabs.
 *
 * @example Single file
 * <CodeBlock filename="agent.ts" language="ts" code={src} showLineNumbers />
 *
 * @example Multi-file tabs
 * <CodeBlock files={[{ filename: "agent.ts", language: "ts", code: a },
 *                    { filename: "client.tsx", language: "tsx", code: b }]} />
 */
export function CodeBlock(props: CodeBlockProps) {
  const files = React.useMemo(() => resolveFiles(props), [props]);
  const showLineNumbers = props.showLineNumbers ?? false;
  const [active, setActive] = React.useState(0);

  const isMultiFile = files.length > 1;
  const activeFile = files[Math.min(active, files.length - 1)] ?? files[0]!;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card ring-1 ring-border/40",
        props.className,
      )}
    >
      {props.hideHeader ? null : isMultiFile ? (
        <HeaderBar
          language={activeFile.language}
          copyText={activeFile.code}
          left={
            <div className="-mb-px flex min-w-0 items-center gap-1 overflow-x-auto">
              {files.map((file, i) => (
                <button
                  key={file.filename ?? i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
                    i === active
                      ? "bg-card text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {file.filename ?? `file-${i + 1}`}
                </button>
              ))}
            </div>
          }
        />
      ) : (
        <HeaderBar
          language={activeFile.language}
          copyText={activeFile.code}
          left={
            activeFile.filename ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {activeFile.filename}
              </span>
            ) : (
              <span className="font-mono text-xs text-muted-foreground/60">code</span>
            )
          }
        />
      )}

      <CodeBody file={activeFile} showLineNumbers={showLineNumbers} maxHeight={props.maxHeight} />
    </div>
  );
}

export default CodeBlock;
