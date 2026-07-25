/**
 * @fileoverview Presentational card for a single assistant-ui tool call.
 * Renders the tool name, its JSON arguments, and (when available) its result,
 * styled to the Monolith profile (no 1px borders — `ring-1 ring-border/40`).
 *
 * Used as the default tool renderer inside {@link AgentThread} and reused by
 * panels that need a consistent "tool ran" affordance in their chat stream.
 */

"use client";

import { Badge } from "@/components/ui/badge";

/** Status string from an assistant-ui tool part (`status.type`). */
export type ToolPartStatus =
  | "running"
  | "requires-action"
  | "complete"
  | "incomplete"
  | undefined;

/** Props for {@link ToolCallCard}. */
export interface ToolCallCardProps {
  toolName: string;
  args: unknown;
  result?: unknown;
  status?: ToolPartStatus;
  /** Optional footer (e.g. an approval gate) rendered below the result. */
  footer?: React.ReactNode;
}

/** Pretty-print a value as JSON, tolerating circular / undefined inputs. */
function safeJson(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Map a tool status to a badge variant + label. */
function statusBadge(status: ToolPartStatus): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  switch (status) {
    case "running":
      return { label: "running", variant: "secondary" };
    case "requires-action":
      return { label: "needs approval", variant: "outline" };
    case "incomplete":
      return { label: "incomplete", variant: "destructive" };
    case "complete":
      return { label: "done", variant: "default" };
    default:
      return { label: "tool", variant: "outline" };
  }
}

/**
 * Renders a single tool invocation with its arguments and result.
 */
export function ToolCallCard({ toolName, args, result, status, footer }: ToolCallCardProps) {
  const badge = statusBadge(status);
  const argsText = safeJson(args);
  const resultText = safeJson(result);

  return (
    <div className="my-2 rounded-md bg-background/60 p-3 ring-1 ring-border/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <code className="text-xs font-semibold text-primary">{toolName}()</code>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {argsText && (
        <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
          <code>{argsText}</code>
        </pre>
      )}

      {resultText && (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold tracking-wide text-emerald-400 uppercase">
            Output
          </p>
          <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-emerald-300">
            <code>{resultText}</code>
          </pre>
        </div>
      )}

      {footer}
    </div>
  );
}
