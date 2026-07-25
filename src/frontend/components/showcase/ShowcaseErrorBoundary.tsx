/**
 * @fileoverview A resilient error boundary for the live agent showcase panels.
 *
 * Agent panels stream from a Durable Object over a WebSocket while React renders
 * partial, evolving state. A malformed frame, an unexpected state shape, or a
 * mid-run provider error can throw during render — historically this produced a
 * white screen (e.g. the Workflows panel crashing with React error #31 while
 * streaming thoughts on a SODA API URL).
 *
 * This boundary catches those render-time failures and shows a graceful,
 * recoverable error card instead. It is intentionally class-based (React error
 * boundaries require a class) and browser-only.
 */

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Props for {@link ShowcaseErrorBoundary}. */
interface ShowcaseErrorBoundaryProps {
  children: ReactNode;
  /** Short label for what failed, shown in the fallback card. */
  label?: string;
}

/** Internal error-boundary state. */
interface ShowcaseErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors from a streaming agent panel and renders a
 * recoverable fallback. Clicking "Try again" resets the boundary so a fresh
 * render (or the next state frame) can recover without a full page reload.
 */
export class ShowcaseErrorBoundary extends Component<
  ShowcaseErrorBoundaryProps,
  ShowcaseErrorBoundaryState
> {
  constructor(props: ShowcaseErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ShowcaseErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for debugging without taking down the page.
    console.error("[showcase] panel render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg bg-destructive/5 p-8 text-center ring-1 ring-destructive/25">
        <AlertTriangleIcon className="size-8 text-destructive/80" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {this.props.label ?? "Something went wrong while streaming."}
          </p>
          <p className="mx-auto max-w-md text-xs break-words text-muted-foreground">
            {error.message || "The agent stream produced an unexpected value."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={this.reset}>
          <RotateCcwIcon className="mr-1.5 size-3.5" />
          Try again
        </Button>
      </div>
    );
  }
}
