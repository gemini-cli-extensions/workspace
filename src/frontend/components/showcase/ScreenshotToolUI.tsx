/**
 * @fileoverview `takeScreenshot` tool UI for the Browser-HITL showcase.
 *
 * Registers (via `makeAssistantToolUI`) a renderer for the browser agent's
 * read-only `takeScreenshot` tool. While the capture runs it shows a skeleton;
 * once the {@link BrowserActionResult} arrives it renders the returned image
 * (a data-URL — currently a clearly-labeled *simulated* SVG, since
 * `@cloudflare/puppeteer` + the `MYBROWSER` binding are not wired in this
 * template) plus the action message.
 *
 * Gated tools (`fillSecureForm`, `clickElement`) are NOT rendered here — those
 * are handled by the {@link ApprovalGate}. Mounting {@link ScreenshotToolUI}
 * inside the runtime provider registers this renderer.
 */

"use client";

import { CameraIcon, Loader2Icon } from "lucide-react";

import { makeAssistantToolUI } from "@assistant-ui/react";

import { Badge } from "@/components/ui/badge";

/** Input args of the agent's `takeScreenshot` tool. */
interface TakeScreenshotArgs {
  url?: string;
  fullPage?: boolean;
  selector?: string;
}

/** Result the agent returns from `takeScreenshot` (see BrowserHitlAgent types). */
interface TakeScreenshotResult {
  status?: "success" | "error" | "approval_required";
  message?: string;
  url?: string;
  screenshot?: string;
  error?: string;
}

/** Whether a message indicates a simulated (non-live) capture. */
function isSimulated(message?: string): boolean {
  return !!message && /\[SIMULATED\]/i.test(message);
}

/** Tool-UI renderer for `takeScreenshot`. Render inside the runtime provider. */
export const ScreenshotToolUI = makeAssistantToolUI<
  TakeScreenshotArgs,
  TakeScreenshotResult
>({
  toolName: "takeScreenshot",
  render: ({ args, result, status }) => {
    const target = result?.url ?? args?.url ?? "current page";
    const isRunning =
      status?.type === "running" || (!result && status?.type !== "incomplete");

    return (
      <div className="my-2 w-full max-w-md rounded-xl bg-card p-3 ring-1 ring-border/40">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2Icon className="size-4 animate-spin text-primary" />
            ) : (
              <CameraIcon className="size-4 text-primary" />
            )}
            <span className="text-sm font-medium text-foreground">Screenshot</span>
            <code className="max-w-[14rem] truncate text-xs text-muted-foreground">
              {target}
            </code>
          </div>
          {result && isSimulated(result.message) ? (
            <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
              simulated
            </Badge>
          ) : null}
        </div>

        {isRunning && !result ? (
          <div className="aspect-[16/10] w-full animate-pulse rounded-md bg-muted/50" />
        ) : result?.screenshot ? (
          <img
            src={result.screenshot}
            alt={`Screenshot of ${target}`}
            className="w-full rounded-md ring-1 ring-border/40"
          />
        ) : result?.status === "error" ? (
          <p className="text-sm text-destructive">
            {result.error ?? result.message ?? "Screenshot failed."}
          </p>
        ) : null}

        {result?.message ? (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {result.message}
          </p>
        ) : null}
      </div>
    );
  },
});
