/**
 * @fileoverview Generative-UI renderer for the `showCard` ChatBroker tool.
 *
 * Registers (via `makeAssistantToolUI`) a titled info card for tool-call parts
 * whose `toolName === "showCard"`: a heading, summary body, optional bullet
 * list, and an optional footnote.
 */

"use client";

import { FileTextIcon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { TOOL_NAMES, type ShowCardArgs, type ShowCardResult } from "./types";

/** Tool-UI component for `showCard`. Render inside the runtime provider. */
export const InfoCardToolUI = makeAssistantToolUI<ShowCardArgs, ShowCardResult>({
  toolName: TOOL_NAMES.showCard,
  render: ({ args, result, status }) => {
    const isRunning = status?.type === "running" || (!result && status?.type !== "incomplete");
    const title = result?.title ?? args?.title ?? "Summary";

    if (isRunning && !result) {
      return (
        <div className="my-2 w-full max-w-md animate-pulse rounded-xl bg-card p-4 ring-1 ring-border/40">
          <div className="mb-3 h-4 w-40 rounded bg-muted/60" />
          <div className="mb-2 h-3 w-full rounded bg-muted/60" />
          <div className="h-3 w-2/3 rounded bg-muted/60" />
        </div>
      );
    }

    const body = result?.body ?? args?.body ?? "";
    const bullets = result?.bullets ?? args?.bullets ?? null;
    const footnote = result?.footnote ?? args?.footnote ?? null;

    return (
      <div className="my-2 w-full max-w-md rounded-xl bg-card p-4 ring-1 ring-border/40">
        <div className="mb-2 flex items-center gap-2">
          <FileTextIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        {body ? (
          <p className="text-sm leading-relaxed text-foreground/80">{body}</p>
        ) : null}

        {bullets && bullets.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" />
                <span className="leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {footnote ? (
          <p className="mt-3 border-t border-border/30 pt-2 text-xs text-muted-foreground">
            {footnote}
          </p>
        ) : null}
      </div>
    );
  },
});
