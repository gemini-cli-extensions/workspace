/**
 * @fileoverview MCP tool catalog + direct-call form.
 *
 * Drives two of the three MCP-showcase requirements straight off the agent's
 * `@callable` RPC methods (no chat model in the loop):
 *   - (a) list the available MCP tools live via `listTools()`
 *         (equivalent to an MCP `tools/list`);
 *   - (b) invoke a chosen tool via `callTool(name, input)` and show the real
 *         result (equivalent to an MCP `tools/call`).
 *
 * The parent `McpPanel` owns the WebSocket (`useAgent`) so the same connection
 * backs both this catalog and the chat Thread; it passes the connected `agent`
 * and derived `status` down here.
 *
 * Browser-only (depends on the live agent connection).
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import type { AgentStatus } from "./AgentThread";
import { EmptyState, ErrorBanner, LoadingRow } from "./shared";

/** Descriptor returned by the agent's `listTools()` RPC (MCP `tools/list`). */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputShape?: Record<string, string> | unknown;
}

/** Sensible starter input JSON per tool, so the call form is one-click usable. */
const EXAMPLE_INPUT: Record<string, string> = {
  echo: '{ "message": "hello" }',
  currentTime: '{ "timezone": "America/New_York" }',
  dbCount: '{ "table": "tasks" }',
};

/**
 * The subset of the `useAgent(...)` handle this catalog needs: a WebSocket
 * `readyState` and the untyped RPC `call(method, args?)`. Kept minimal so the
 * parent can pass its live agent handle without type-parameter friction.
 */
export interface CatalogAgent {
  readyState: number;
  call: <T = unknown>(method: string, args?: unknown[]) => Promise<T>;
}

/** Props for {@link McpToolCatalog}. */
export interface McpToolCatalogProps {
  agent: CatalogAgent;
  status: AgentStatus;
}

/**
 * Live tool catalog + direct call form, backed by the agent's `listTools()` and
 * `callTool()` RPC methods.
 */
export function McpToolCatalog({ agent, status }: McpToolCatalogProps) {
  const [tools, setTools] = useState<McpToolDescriptor[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string>("");
  const [input, setInput] = useState<string>("{}");
  const [calling, setCalling] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callResult, setCallResult] = useState<unknown>(undefined);

  /** Load the tool catalog from the agent (MCP `tools/list`). */
  const loadTools = useCallback(async () => {
    if (agent.readyState !== 1) return;
    setLoadingTools(true);
    setCatalogError(null);
    try {
      const res = await agent.call<McpToolDescriptor[]>("listTools");
      const list = Array.isArray(res) ? res : [];
      setTools(list);
      // Auto-select + pre-fill example input for the first tool, once.
      setSelected((prev) => {
        const next = prev || list[0]?.name || "";
        if (!prev && next && EXAMPLE_INPUT[next]) setInput(EXAMPLE_INPUT[next]);
        return next;
      });
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to load tools.");
    } finally {
      setLoadingTools(false);
    }
  }, [agent]);

  useEffect(() => {
    if (status === "connected") void loadTools();
  }, [status, loadTools]);

  /** Select a tool and pre-fill its example input. */
  function selectTool(name: string) {
    setSelected(name);
    setCallResult(undefined);
    setCallError(null);
    if (EXAMPLE_INPUT[name]) setInput(EXAMPLE_INPUT[name]);
  }

  /** Invoke the selected tool with the JSON input (MCP `tools/call`). */
  async function callTool() {
    if (!selected) return;
    setCalling(true);
    setCallError(null);
    setCallResult(undefined);
    let parsed: unknown = {};
    try {
      parsed = input.trim() ? JSON.parse(input) : {};
    } catch {
      setCallError("Input must be valid JSON.");
      setCalling(false);
      return;
    }
    try {
      const res = await agent.call("callTool", [selected, parsed]);
      setCallResult(res);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : "Tool call failed.");
    } finally {
      setCalling(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tool catalog</CardTitle>
          <CardDescription>
            Live from <code className="text-primary">listTools()</code> — the MCP{" "}
            <code className="text-primary">tools/list</code> equivalent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ErrorBanner message={catalogError} />
          {loadingTools && tools.length === 0 ? (
            <LoadingRow label="Loading tools…" />
          ) : tools.length === 0 ? (
            <EmptyState label="No tools reported by the agent." />
          ) : (
            <ul className="divide-y divide-border/40">
              {tools.map((tool) => (
                <li key={tool.name}>
                  <button
                    type="button"
                    onClick={() => selectTool(tool.name)}
                    className={`flex w-full flex-col items-start gap-1 py-2.5 text-left transition-colors ${
                      selected === tool.name
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-semibold text-primary">{tool.name}</code>
                      {selected === tool.name && <Badge variant="secondary">selected</Badge>}
                    </div>
                    <p className="text-xs">{tool.description}</p>
                    {tool.inputShape !== undefined && (
                      <code className="text-[10px] text-muted-foreground">
                        {JSON.stringify(tool.inputShape)}
                      </code>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call a tool</CardTitle>
          <CardDescription>
            Invokes <code className="text-primary">callTool({selected || "name"}, input)</code> —
            the MCP <code className="text-primary">tools/call</code> equivalent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            spellCheck={false}
            className="min-h-20 font-mono text-xs"
            aria-label="Tool input JSON"
          />
          <Button
            size="sm"
            onClick={callTool}
            disabled={calling || !selected || status !== "connected"}
          >
            {calling ? "Calling…" : "Call tool"}
          </Button>
          <ErrorBanner message={callError} />
          {callResult !== undefined && (
            <div>
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-emerald-400 uppercase">
                Result
              </p>
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-emerald-300">
                <code>{JSON.stringify(callResult, null, 2)}</code>
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
