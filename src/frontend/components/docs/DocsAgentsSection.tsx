/**
 * @fileoverview DocsAgentsSection — the per-agent capability grid for the docs
 * landing page.
 *
 * Binds to the live `GET /api/docs/agents` metadata served by
 * `src/backend/api/routes/docs.ts` (real data, no mocks). Renders explicit
 * LOADING, ERROR, and EMPTY states; errors route through the project's
 * frontend error handler (`useFrontendErrorHandler`) and surface in the shared
 * `FrontendErrorDialog`, never a browser alert.
 *
 * Monolith styling: dark, ring-based separation (`ring-1 ring-border/40`),
 * `bg-card` surfaces, no 1px borders.
 */

"use client";

import * as React from "react";

import { FrontendErrorDialog } from "@/components/FrontendErrorDialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { useFrontendErrorHandler } from "@/lib/error-handler";

/** One agent method descriptor, mirrored from the docs router response. */
type AgentMethod = {
  name: string;
  description: string;
  params?: string;
  returns?: string;
};

/** Agent metadata as returned by `GET /api/docs/agents`. */
type AgentMetadata = {
  name: string;
  className: string;
  description: string;
  docsPath: string;
  methods: AgentMethod[];
  tools: string[];
};

type AgentsResponse = { agents: AgentMetadata[] };

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; agents: AgentMetadata[] };

/** Maps an agent class to its live showcase route, where one exists. */
const SHOWCASE_ROUTES: Record<string, string> = {
  CodeModeAgent: "/showcase/code-mode",
  BrowserHitlAgent: "/showcase/browser-hitl",
  WorkflowsAgent: "/showcase/workflows",
  ArtifactAgent: "/showcase/artifacts",
  McpAgent: "/showcase/mcp",
  ThinkingAgent: "/showcase/thinking",
  SkillsAgent: "/showcase/skills",
  ChatBroker: "/chat",
};

/**
 * Renders the documented agent fleet, fetched once on mount. Shows skeletons
 * while loading, an inline retry on failure, and a card per agent on success.
 */
export function DocsAgentsSection() {
  const [state, setState] = React.useState<LoadState>({ status: "loading" });
  const { activeError, copyState, clearError, copyErrorPrompt, handleError } =
    useFrontendErrorHandler();

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await apiGet<AgentsResponse>("docs/agents");
      setState({ status: "ready", agents: data.agents ?? [] });
    } catch (error) {
      setState({ status: "error" });
      handleError({
        sourcePage: { url: "/docs", file: "src/frontend/pages/docs/index.astro" },
        codeSource: {
          file: "src/frontend/components/docs/DocsAgentsSection.tsx",
          functionName: "load",
          description: "Fetches agent metadata from GET /api/docs/agents for the docs landing page.",
        },
        errorDetails: {
          friendlyError: "Couldn't load the agent catalog from the API. Retry below.",
          serverError: error,
        },
      });
    }
  }, [handleError]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl bg-card p-6 ring-1 ring-border/40">
            <Skeleton className="mb-3 h-5 w-40" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-border/40">
          <p className="text-sm text-muted-foreground">
            The agent catalog failed to load.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
        <FrontendErrorDialog
          error={activeError}
          copyState={copyState}
          onCopyPrompt={copyErrorPrompt}
          onOpenChange={(open) => {
            if (!open) clearError();
          }}
        />
      </>
    );
  }

  if (state.agents.length === 0) {
    return (
      <div className="rounded-xl bg-card p-8 text-center ring-1 ring-border/40">
        <p className="text-sm text-muted-foreground">No agents are documented yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {state.agents.map((agent) => {
          const route = SHOWCASE_ROUTES[agent.className];
          return (
            <div
              key={agent.className}
              className="flex flex-col rounded-xl bg-card p-6 ring-1 ring-border/40 transition-colors hover:ring-border/70"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-semibold tracking-tight">{agent.name}</h3>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {agent.className}
                </Badge>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                {agent.description}
              </p>

              {agent.methods.length > 0 ? (
                <div className="mt-4 space-y-1.5">
                  {agent.methods.map((method) => (
                    <div key={method.name} className="flex items-start gap-2 text-xs">
                      <code className="shrink-0 font-mono text-primary">{method.name}()</code>
                      <span className="text-muted-foreground">{method.description}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {agent.tools.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {agent.tools.map((tool) => (
                    <Badge key={tool} variant="secondary" className="font-mono text-[10px]">
                      {tool}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {route ? (
                <a
                  href={route}
                  className="mt-5 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  View live showcase
                  <span aria-hidden>→</span>
                </a>
              ) : null}
            </div>
          );
        })}
      </div>

      <FrontendErrorDialog
        error={activeError}
        copyState={copyState}
        onCopyPrompt={copyErrorPrompt}
        onOpenChange={(open) => {
          if (!open) clearError();
        }}
      />
    </>
  );
}

export default DocsAgentsSection;
