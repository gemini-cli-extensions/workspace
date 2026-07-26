/**
 * @fileoverview Shared types + pure helpers for the TaskWizard steps.
 *
 * Keeps the wizard's draft state, frequency/cron derivation, and validation in
 * one place so each step subcomponent stays small (<400 lines) and testable.
 */

import type {
  ActionDef,
  AgentCatalogEntry,
  CreateTaskBody,
  ParamDef,
  TaskFrequency,
  VectorizeCorpus,
} from "@/lib/scheduler-api";

export type IntervalUnit = "seconds" | "minutes" | "hours" | "days";

export type CronPreset = "hourly" | "daily8" | "weeklyMon9" | "custom";

export const CRON_PRESETS: Record<Exclude<CronPreset, "custom">, { label: string; expr: string }> =
  {
    hourly: { label: "Hourly (top of the hour)", expr: "0 * * * *" },
    daily8: { label: "Daily at 8:00am", expr: "0 8 * * *" },
    weeklyMon9: { label: "Weekly — Mondays at 9:00am", expr: "0 9 * * 1" },
  };

export const INTERVAL_UNIT_SECONDS: Record<IntervalUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

/** Mutable draft state across all eight wizard steps. */
export type WizardDraft = {
  title: string;
  accounts: string[];
  agent: string | null;
  action: string | null;
  params: Record<string, unknown>;
  prompt: string;
  frequency: TaskFrequency;
  // Once
  onceDateTime: string; // datetime-local value
  // Interval
  intervalCount: string;
  intervalUnit: IntervalUnit;
  // Cron
  cronPreset: CronPreset;
  cronCustom: string;
  // Indexing
  indexToD1: boolean;
  indexVectorizeCorpus: VectorizeCorpus | "none";
};

export const initialDraft: WizardDraft = {
  title: "",
  accounts: [],
  agent: null,
  action: null,
  params: {},
  prompt: "",
  frequency: "on_demand",
  onceDateTime: "",
  intervalCount: "1",
  intervalUnit: "hours",
  cronPreset: "daily8",
  cronCustom: "",
  indexToD1: false,
  indexVectorizeCorpus: "none",
};

export const WIZARD_STEPS = [
  { key: "accounts", label: "Accounts" },
  { key: "connection", label: "Connection" },
  { key: "action", label: "Action" },
  { key: "params", label: "Parameters" },
  { key: "frequency", label: "Frequency" },
  { key: "prompt", label: "Prompt" },
  { key: "indexing", label: "Indexing" },
  { key: "review", label: "Review" },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];

export function findAgent(
  catalog: AgentCatalogEntry[],
  agentId: string | null,
): AgentCatalogEntry | undefined {
  return catalog.find((a) => a.id === agentId);
}

export function findAction(
  catalog: AgentCatalogEntry[],
  agentId: string | null,
  actionName: string | null,
): ActionDef | undefined {
  return findAgent(catalog, agentId)?.actions.find((a) => a.name === actionName);
}

/** Derive a sensible default value for a param based on its definition. */
export function defaultParamValue(param: ParamDef): unknown {
  if (param.default !== undefined) return param.default;
  switch (param.type) {
    case "boolean":
      return false;
    case "number":
      return "";
    default:
      return "";
  }
}

/** Basic 5-field cron validation (allows the usual *, ranges, lists, steps). */
export function isValidCron(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldRe = /^[\d*/,\-]+$/;
  return fields.every((f) => fieldRe.test(f));
}

/** Compute the scheduleSpec string for the current frequency selection. */
export function deriveScheduleSpec(draft: WizardDraft): string | undefined {
  switch (draft.frequency) {
    case "on_demand":
      return undefined;
    case "once": {
      if (!draft.onceDateTime) return undefined;
      const d = new Date(draft.onceDateTime);
      if (Number.isNaN(d.getTime())) return undefined;
      return d.toISOString();
    }
    case "interval": {
      const n = Number(draft.intervalCount);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return String(Math.round(n * INTERVAL_UNIT_SECONDS[draft.intervalUnit]));
    }
    case "cron": {
      const expr =
        draft.cronPreset === "custom" ? draft.cronCustom.trim() : CRON_PRESETS[draft.cronPreset].expr;
      return expr || undefined;
    }
    default:
      return undefined;
  }
}

/** Coerce a raw form value into the typed value the contract expects. */
export function coerceParam(param: ParamDef, raw: unknown): unknown {
  switch (param.type) {
    case "number": {
      if (raw === "" || raw == null) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      return Boolean(raw);
    default:
      return raw === "" ? undefined : raw;
  }
}

/** Validate the params step against the selected action's required fields. */
export function validateParams(action: ActionDef | undefined, draft: WizardDraft): string[] {
  if (!action) return ["Select an action first."];
  const errors: string[] = [];
  for (const param of action.params) {
    if (!param.required) continue;
    const value = coerceParam(param, draft.params[param.name]);
    if (param.type === "boolean") continue; // a false boolean is still a valid answer
    if (value === undefined || value === "" || value === null) {
      errors.push(`${param.label} is required.`);
    }
  }
  return errors;
}

/** Validate the frequency step. */
export function validateFrequency(draft: WizardDraft): string[] {
  const errors: string[] = [];
  switch (draft.frequency) {
    case "once":
      if (!draft.onceDateTime) errors.push("Pick a date and time.");
      else if (Number.isNaN(new Date(draft.onceDateTime).getTime()))
        errors.push("That date/time is not valid.");
      break;
    case "interval": {
      const n = Number(draft.intervalCount);
      if (!Number.isFinite(n) || n <= 0) errors.push("Enter an interval greater than zero.");
      break;
    }
    case "cron": {
      const expr =
        draft.cronPreset === "custom" ? draft.cronCustom : CRON_PRESETS[draft.cronPreset].expr;
      if (!isValidCron(expr)) errors.push("Enter a valid 5-field cron expression.");
      break;
    }
    default:
      break;
  }
  return errors;
}

/** Build the EXACT POST body from the draft. */
export function buildCreateBody(draft: WizardDraft, action: ActionDef | undefined): CreateTaskBody {
  const params: Record<string, unknown> = {};
  if (action) {
    for (const param of action.params) {
      const coerced = coerceParam(param, draft.params[param.name]);
      if (coerced !== undefined) params[param.name] = coerced;
    }
  }

  const prompt = draft.prompt.trim();

  return {
    title: draft.title.trim(),
    accounts: draft.accounts,
    agent: draft.agent ?? "",
    action: draft.action ?? "",
    params,
    ...(prompt ? { prompt } : {}),
    frequency: draft.frequency,
    ...(() => {
      const spec = deriveScheduleSpec(draft);
      return spec ? { scheduleSpec: spec } : {};
    })(),
    indexToD1: draft.indexToD1,
    indexVectorizeCorpus:
      draft.indexVectorizeCorpus === "none" ? null : draft.indexVectorizeCorpus,
    source: "ui",
  };
}

/** Human-readable summary of the chosen frequency (for the review step). */
export function frequencySummary(draft: WizardDraft): string {
  switch (draft.frequency) {
    case "on_demand":
      return "On demand (manual runs only)";
    case "once": {
      const spec = deriveScheduleSpec(draft);
      return spec ? `Once at ${new Date(spec).toLocaleString()}` : "Once (no time set)";
    }
    case "interval":
      return `Every ${draft.intervalCount} ${draft.intervalUnit}`;
    case "cron": {
      const expr =
        draft.cronPreset === "custom" ? draft.cronCustom : CRON_PRESETS[draft.cronPreset].expr;
      return `Cron: ${expr}`;
    }
    default:
      return "";
  }
}
