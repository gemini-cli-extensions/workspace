/**
 * @fileoverview Step renderers for the TaskWizard (accounts, connection,
 * action, frequency, prompt, indexing, review). The Parameters step lives in
 * `ParamFields.tsx`. Each renderer is a pure presentational component driven by
 * the wizard's draft state + setters from `TaskWizard`.
 */

"use client";

import { CheckIcon, ShieldCheckIcon } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import type { AgentCatalogEntry, SchedulerAccount } from "@/lib/scheduler-api";
import { cn } from "@/lib/utils";

import { ParamFields } from "./ParamFields";
import { findAction, findAgent, type WizardDraft } from "./wizard-types";

/** A selectable tile used by accounts/connection/action steps. */
function SelectTile({
  selected,
  onClick,
  title,
  subtitle,
  badge,
  multi,
}: {
  selected: boolean;
  onClick: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg bg-card p-4 text-left ring-1 ring-border/40 transition-colors hover:ring-ring/50",
        selected && "ring-2 ring-primary/70",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center bg-input/30 text-primary-foreground",
          multi ? "rounded-[5px]" : "rounded-full",
          selected && "bg-primary",
        )}
      >
        {selected ? <CheckIcon className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          {title}
          {badge}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </button>
  );
}

export function AccountsStep({
  accounts,
  selected,
  onToggle,
}: {
  accounts: SchedulerAccount[];
  selected: string[];
  onToggle: (email: string) => void;
}) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border/40">
        No authorized accounts yet. Add one on the{" "}
        <a href="/accounts" className="text-primary underline underline-offset-4">
          Accounts
        </a>{" "}
        page first.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {accounts.map((acct) => {
        const value = acct.email;
        const isWorkspace = acct.kind === "workspace" || value === "workspace";
        return (
          <SelectTile
            key={value}
            multi
            selected={selected.includes(value)}
            onClick={() => onToggle(value)}
            title={acct.label || acct.email}
            subtitle={acct.label && acct.label !== acct.email ? acct.email : undefined}
            badge={
              isWorkspace ? (
                <Badge variant="secondary" className="gap-1 text-foreground">
                  <ShieldCheckIcon className="size-3" />
                  Workspace (DWD)
                </Badge>
              ) : (
                <Badge variant="outline">{acct.kind ?? "oauth"}</Badge>
              )
            }
          />
        );
      })}
    </div>
  );
}

export function ConnectionStep({
  catalog,
  selected,
  onSelect,
}: {
  catalog: AgentCatalogEntry[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {catalog.map((entry) => (
        <SelectTile
          key={entry.id}
          selected={selected === entry.id}
          onClick={() => onSelect(entry.id)}
          title={entry.label}
          subtitle={`${entry.actions.length} action${entry.actions.length === 1 ? "" : "s"}`}
        />
      ))}
    </div>
  );
}

export function ActionStep({
  catalog,
  agentId,
  selected,
  onSelect,
}: {
  catalog: AgentCatalogEntry[];
  agentId: string | null;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const agent = findAgent(catalog, agentId);
  if (!agent) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border/40">
        Pick a connection first.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      {agent.actions.map((action) => (
        <SelectTile
          key={action.name}
          selected={selected === action.name}
          onClick={() => onSelect(action.name)}
          title={action.label}
          subtitle={action.description}
          badge={
            action.readOnly ? (
              <Badge variant="outline" className="text-muted-foreground">
                Read-only
              </Badge>
            ) : null
          }
        />
      ))}
    </div>
  );
}

export function ParamsStep({
  catalog,
  draft,
  onParamChange,
}: {
  catalog: AgentCatalogEntry[];
  draft: WizardDraft;
  onParamChange: (name: string, value: unknown) => void;
}) {
  const action = findAction(catalog, draft.agent, draft.action);
  if (!action) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border/40">
        Pick an action first.
      </p>
    );
  }
  return <ParamFields action={action} values={draft.params} onChange={onParamChange} />;
}

// Frequency, Prompt, Indexing, and Review steps live in WizardStepsB to keep
// each file modular; re-export so consumers import from one place.
export { FrequencyStep, IndexingStep, PromptStep, ReviewStep } from "./WizardStepsB";
