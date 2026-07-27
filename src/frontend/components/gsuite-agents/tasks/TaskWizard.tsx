/**
 * @fileoverview TaskWizard — multi-step scheduling wizard for /agent-tasks.
 *
 * Walks through Accounts → Connection → Action → Parameters → Frequency →
 * Prompt → Indexing → Review, then POSTs the EXACT contract body to
 * /api/agent-tasks.
 *
 * Data sources: GET /api/accounts, GET /api/catalog (both `{ data: [] }`).
 * Auth: Bearer token from lib/session.ts. Errors via fetchJson/logError.
 * No mock data. Monolith dark; ring/divider separation only.
 */

"use client";

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  getAccounts,
  getCatalog,
  createScheduledTask,
  type AgentCatalogEntry,
  type SchedulerAccount,
} from "@/lib/scheduler-api";
import { cn } from "@/lib/utils";

import {
  AccountsStep,
  ActionStep,
  ConnectionStep,
  FrequencyStep,
  IndexingStep,
  ParamsStep,
  PromptStep,
  ReviewStep,
} from "./WizardSteps";
import {
  buildCreateBody,
  defaultParamValue,
  findAction,
  initialDraft,
  validateFrequency,
  validateParams,
  WIZARD_STEPS,
  type WizardDraft,
} from "./wizard-types";

export function TaskWizard({ onCreated }: { onCreated?: () => void }) {
  const [accounts, setAccounts] = React.useState<SchedulerAccount[]>([]);
  const [catalog, setCatalog] = React.useState<AgentCatalogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [draft, setDraft] = React.useState<WizardDraft>(initialDraft);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [accts, cat] = await Promise.all([getAccounts(), getCatalog()]);
        if (!active) return;
        setAccounts(accts);
        setCatalog(cat);
      } catch {
        /* surfaced by ErrorLogger via fetchJson */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = React.useCallback((patch: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setErrors([]);
  }, []);

  const toggleAccount = React.useCallback((email: string) => {
    setDraft((prev) => ({
      ...prev,
      accounts: prev.accounts.includes(email)
        ? prev.accounts.filter((a) => a !== email)
        : [...prev.accounts, email],
    }));
    setErrors([]);
  }, []);

  const selectConnection = React.useCallback((id: string) => {
    // Changing the connection resets the action + params.
    setDraft((prev) => ({ ...prev, agent: id, action: null, params: {} }));
    setErrors([]);
  }, []);

  const selectAction = React.useCallback(
    (name: string) => {
      const action = findAction(catalog, draft.agent, name);
      const params: Record<string, unknown> = {};
      if (action) {
        for (const p of action.params) params[p.name] = defaultParamValue(p);
      }
      setDraft((prev) => ({ ...prev, action: name, params }));
      setErrors([]);
    },
    [catalog, draft.agent],
  );

  const onParamChange = React.useCallback((name: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, params: { ...prev.params, [name]: value } }));
    setErrors([]);
  }, []);

  const action = findAction(catalog, draft.agent, draft.action);
  const stepKey = WIZARD_STEPS[stepIndex].key;

  /** Validate the current step; returns the list of blocking errors. */
  const validateStep = React.useCallback((): string[] => {
    switch (stepKey) {
      case "accounts":
        return draft.accounts.length ? [] : ["Select at least one account."];
      case "connection":
        return draft.agent ? [] : ["Pick a connection."];
      case "action":
        return draft.action ? [] : ["Pick an action."];
      case "params":
        return validateParams(action, draft);
      case "frequency":
        return validateFrequency(draft);
      case "review":
        return draft.title.trim() ? [] : ["Give the task a title."];
      default:
        return [];
    }
  }, [stepKey, draft, action]);

  const goNext = React.useCallback(() => {
    const stepErrors = validateStep();
    if (stepErrors.length) {
      setErrors(stepErrors);
      return;
    }
    setErrors([]);
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  }, [validateStep]);

  const goBack = React.useCallback(() => {
    setErrors([]);
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const submit = React.useCallback(async () => {
    const stepErrors = validateStep();
    if (stepErrors.length) {
      setErrors(stepErrors);
      return;
    }
    setSubmitting(true);
    try {
      await createScheduledTask(buildCreateBody(draft, action));
      setDraft(initialDraft);
      setStepIndex(0);
      onCreated?.();
    } catch {
      /* surfaced by ErrorLogger */
    } finally {
      setSubmitting(false);
    }
  }, [validateStep, draft, action, onCreated]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-10 ring-1 ring-border/40">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Loading accounts and actions…
        </div>
      </div>
    );
  }

  const isLast = stepIndex === WIZARD_STEPS.length - 1;

  return (
    <div className="rounded-xl bg-card ring-1 ring-border/40">
      {/* Progress indicator */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-4 lg:px-6">
        {WIZARD_STEPS.map((step, i) => {
          const isActive = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <React.Fragment key={step.key}>
              <button
                type="button"
                onClick={() => i < stepIndex && setStepIndex(i)}
                disabled={i > stepIndex}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isDone && "bg-primary/15 text-foreground hover:bg-primary/25",
                  !isActive && !isDone && "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px]",
                    isActive ? "bg-primary-foreground/20" : "bg-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {i < WIZARD_STEPS.length - 1 ? (
                <span className="h-px w-3 shrink-0 bg-border/60" aria-hidden />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>

      <div className="h-px bg-border/40" />

      {/* Step header + body */}
      <div className="px-4 py-6 lg:px-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-tight">
            {WIZARD_STEPS[stepIndex].label}
          </h2>
          <p className="text-sm text-muted-foreground">{stepDescription(stepKey)}</p>
        </div>

        {stepKey === "accounts" ? (
          <AccountsStep
            accounts={accounts}
            selected={draft.accounts}
            onToggle={toggleAccount}
          />
        ) : null}
        {stepKey === "connection" ? (
          <ConnectionStep
            catalog={catalog}
            selected={draft.agent}
            onSelect={selectConnection}
          />
        ) : null}
        {stepKey === "action" ? (
          <ActionStep
            catalog={catalog}
            agentId={draft.agent}
            selected={draft.action}
            onSelect={selectAction}
          />
        ) : null}
        {stepKey === "params" ? (
          <ParamsStep catalog={catalog} draft={draft} onParamChange={onParamChange} />
        ) : null}
        {stepKey === "frequency" ? <FrequencyStep draft={draft} set={set} /> : null}
        {stepKey === "prompt" ? <PromptStep draft={draft} set={set} /> : null}
        {stepKey === "indexing" ? <IndexingStep draft={draft} set={set} /> : null}
        {stepKey === "review" ? <ReviewStep catalog={catalog} draft={draft} set={set} /> : null}

        {errors.length ? (
          <ul className="mt-4 space-y-1 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/30">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="h-px bg-border/40" />

      {/* Footer nav */}
      <div className="flex items-center justify-between px-4 py-4 lg:px-6">
        <Button variant="ghost" onClick={goBack} disabled={stepIndex === 0 || submitting}>
          <ChevronLeftIcon className="size-4" />
          Back
        </Button>
        <span className="text-xs text-muted-foreground">
          Step {stepIndex + 1} of {WIZARD_STEPS.length}
        </span>
        {isLast ? (
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            Create task
          </Button>
        ) : (
          <Button onClick={goNext} disabled={submitting}>
            Next
            <ChevronRightIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function stepDescription(key: string): string {
  switch (key) {
    case "accounts":
      return "Choose which authorized account(s) this task should act on.";
    case "connection":
      return "Pick the Workspace surface the agent will use.";
    case "action":
      return "Select the action to run on each scheduled fire.";
    case "params":
      return "Fill in the inputs for the chosen action.";
    case "frequency":
      return "Decide when and how often this task runs.";
    case "prompt":
      return "Optionally instruct the agent on what to do with the result.";
    case "indexing":
      return "Optionally persist results to D1 and embed into RAG.";
    case "review":
      return "Confirm everything, name the task, and create it.";
    default:
      return "";
  }
}
