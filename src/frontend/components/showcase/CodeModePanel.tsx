/**
 * @fileoverview Live interactive panel for the `code-mode-agent`.
 *
 * Two surfaces, both talking to the same Durable Object instance:
 *  1. A Wave-1 assistant-ui chat thread. It opens with a guided welcome that
 *     asks which demo to run — rendered as two suggested-prompt chips
 *     ("Dynamic Worker Sandbox" / "Plan with the agent") plus free-form input.
 *     Replies render as markdown with Shiki code blocks (the plan path streams
 *     a plan with fenced code; the sandbox path runs the `executePlan` tool).
 *  2. A code editor + "Run" button that invokes the agent's `@callable`
 *     `executeCode({ code, timeout?, allowNetwork? })` RPC and renders the REAL
 *     `{ status, output?, error?, executionTime }` result from the V8 isolate.
 *
 * The pre-loaded sample runs successfully: a bare `return <value>` body is
 * auto-wrapped into a fetch handler server-side (see CodeModeAgent/sandbox.ts),
 * and TypeScript annotations are stripped before execution.
 *
 * Mounted with `client:only="react"` — browser-only agents stack.
 */

"use client";

import { useState } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";

import { ConnectionBadge, ErrorBanner, useSessionId } from "./shared";
import { ShowcaseErrorBoundary } from "./ShowcaseErrorBoundary";

/** Shape returned by the agent's `executeCode` callable. */
interface ExecuteCodeResult {
  status: "success" | "error";
  output?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * Pre-loaded sample. A bare `return` body — the agent auto-wraps it into a real
 * fetch handler and JSON-encodes the result, so it runs successfully as-is.
 * Includes a TypeScript annotation to prove the TS strip works.
 */
const SAMPLE_CODE = `// Runs in a sandboxed V8 isolate (no network unless allowed).
// TypeScript annotations are stripped before execution.
const nums: number[] = [2, 40];
const sum = nums.reduce((a, b) => a + b, 0);
return { sum, doubled: sum * 2 };`;

/** Chip prompts that steer the chat into each guided demo path. */
const WELCOME_SUGGESTIONS = [
  "Dynamic Worker Sandbox: write and run code that returns fib(10)",
  "Plan with the agent: outline a rate limiter (no execution)",
];

/**
 * Full code-mode showcase: editor + Run RPC on the left, Wave-1 assistant chat
 * on the right, both bound to one `code-mode-agent` instance.
 */
export function CodeModePanel() {
  const sessionId = useSessionId("code-mode");
  const agent = useAgent({ agent: "code-mode-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  const [code, setCode] = useState(SAMPLE_CODE);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExecuteCodeResult | null>(null);

  /** Invoke the `executeCode` callable and surface the real isolate output. */
  async function runCode() {
    setRunning(true);
    setError(null);
    try {
      const res = await agent.call<ExecuteCodeResult>("executeCode", [
        { code, timeout: 10_000, allowNetwork: false },
      ]);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute code.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <ShowcaseErrorBoundary label="The code-mode panel hit an error.">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Code editor + Run */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <CardTitle>Dynamic Worker Sandbox</CardTitle>
              <CardDescription>
                Run TypeScript in an isolated V8 Worker via the agent&rsquo;s{" "}
                <code className="text-primary">executeCode</code> RPC.
              </CardDescription>
            </div>
            <ConnectionBadge status={status} sessionId={sessionId} />
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              rows={10}
              className="min-h-48 flex-1 font-mono text-xs"
              aria-label="Code to execute"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={runCode} disabled={running || status !== "connected"}>
                {running ? "Running…" : "Run code"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                disabled={running}
              >
                Clear output
              </Button>
            </div>

            <ErrorBanner message={error} />

            {result ? (
              <div className="rounded-md bg-background/60 p-3 ring-1 ring-border/40">
                <div className="mb-2 flex items-center justify-between text-[10px] tracking-wide uppercase">
                  <span
                    className={
                      result.status === "success" ? "text-emerald-400" : "text-destructive"
                    }
                  >
                    {result.status}
                  </span>
                  <span className="text-muted-foreground">{result.executionTime}ms</span>
                </div>
                <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-emerald-300">
                  <code>
                    {result.status === "success"
                      ? formatOutput(result.output)
                      : result.error}
                  </code>
                </pre>
              </div>
            ) : (
              !error && (
                <p className="text-xs text-muted-foreground">
                  Output from the isolate appears here. The sample returns{" "}
                  <code>{`{ "sum": 42, "doubled": 84 }`}</code>.
                </p>
              )
            )}
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex h-[34rem] flex-col">
          <CardHeader className="pb-3">
            <CardTitle>Plan with the agent</CardTitle>
            <CardDescription>
              Pick a demo below, or ask freely. Plans render as markdown with code
              blocks; the <code className="text-primary">executePlan</code> tool runs code inline.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-0">
            <ThreadProvider
              runtime={runtime}
              status={status}
              welcomeTitle="Which demo?"
              welcomeSubtitle="Choose Dynamic Worker Sandbox to run code, or Plan with the agent for a code plan."
              welcomeSuggestions={WELCOME_SUGGESTIONS}
              placeholder="e.g. write & run code that computes fib(10)…"
            />
          </CardContent>
        </Card>
      </div>
    </ShowcaseErrorBoundary>
  );
}

/** Map a PartySocket `readyState` to the Thread's status vocabulary. */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/** Render the isolate output as pretty JSON when structured, else as text. */
function formatOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
