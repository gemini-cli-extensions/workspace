/**
 * @fileoverview Step renderers (part B) for the TaskWizard: Frequency, Prompt,
 * Indexing, and Review. Split from WizardSteps.tsx to keep each file modular.
 */

"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { AgentCatalogEntry } from "@/lib/scheduler-api";
import { cn } from "@/lib/utils";

import {
  CRON_PRESETS,
  findAction,
  findAgent,
  frequencySummary,
  type CronPreset,
  type IntervalUnit,
  type WizardDraft,
} from "./wizard-types";

const FREQUENCY_OPTIONS: { value: WizardDraft["frequency"]; label: string; hint: string }[] = [
  { value: "on_demand", label: "On demand", hint: "Run manually whenever you want." },
  { value: "once", label: "Once", hint: "Run a single time at a specific moment." },
  { value: "interval", label: "Every N", hint: "Run on a repeating interval." },
  { value: "cron", label: "Cron", hint: "Run on a cron schedule." },
];

export function FrequencyStep({
  draft,
  set,
}: {
  draft: WizardDraft;
  set: (patch: Partial<WizardDraft>) => void;
}) {
  return (
    <div className="grid gap-5">
      <RadioGroup
        value={draft.frequency}
        onValueChange={(v) => set({ frequency: v as WizardDraft["frequency"] })}
        className="grid gap-3"
      >
        {FREQUENCY_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg bg-card p-4 ring-1 ring-border/40 transition-colors hover:ring-ring/50",
              draft.frequency === opt.value && "ring-2 ring-primary/70",
            )}
          >
            <RadioGroupItem value={opt.value} className="mt-0.5" />
            <span>
              <span className="block font-medium text-foreground">{opt.label}</span>
              <span className="block text-sm text-muted-foreground">{opt.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>

      {draft.frequency === "once" ? (
        <div className="grid gap-2">
          <Label htmlFor="once-dt" className="text-foreground">
            Date &amp; time
          </Label>
          <Input
            id="once-dt"
            type="datetime-local"
            value={draft.onceDateTime}
            onChange={(e) => set({ onceDateTime: e.target.value })}
            className="w-full sm:max-w-xs"
          />
        </div>
      ) : null}

      {draft.frequency === "interval" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label htmlFor="interval-n" className="text-foreground">
              Every
            </Label>
            <Input
              id="interval-n"
              type="number"
              min={1}
              value={draft.intervalCount}
              onChange={(e) => set({ intervalCount: e.target.value })}
              className="w-28"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-foreground">Unit</Label>
            <Select
              value={draft.intervalUnit}
              onValueChange={(v) => set({ intervalUnit: v as IntervalUnit })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["seconds", "minutes", "hours", "days"] as IntervalUnit[]).map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {draft.frequency === "cron" ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label className="text-foreground">Preset</Label>
            <Select
              value={draft.cronPreset}
              onValueChange={(v) => set({ cronPreset: v as CronPreset })}
            >
              <SelectTrigger className="w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CRON_PRESETS) as (keyof typeof CRON_PRESETS)[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {CRON_PRESETS[key].label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom expression…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.cronPreset === "custom" ? (
            <div className="grid gap-2">
              <Label htmlFor="cron-custom" className="text-foreground">
                Cron expression (5 fields)
              </Label>
              <Input
                id="cron-custom"
                value={draft.cronCustom}
                placeholder="*/15 * * * *"
                onChange={(e) => set({ cronCustom: e.target.value })}
                className="w-full font-mono sm:max-w-sm"
              />
            </div>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              {CRON_PRESETS[draft.cronPreset as keyof typeof CRON_PRESETS]?.expr}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PromptStep({
  draft,
  set,
}: {
  draft: WizardDraft;
  set: (patch: Partial<WizardDraft>) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="prompt" className="text-foreground">
        Instruction (optional)
      </Label>
      <p className="text-sm text-muted-foreground">
        When this task runs, the action result is given to the agent as context. Tell it what to do
        with that result — summarize, draft a reply, extract data, etc.
      </p>
      <Textarea
        id="prompt"
        value={draft.prompt}
        placeholder="What should the agent do when this runs?"
        onChange={(e) => set({ prompt: e.target.value })}
        className="min-h-28"
      />
    </div>
  );
}

export function IndexingStep({
  draft,
  set,
}: {
  draft: WizardDraft;
  set: (patch: Partial<WizardDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4 rounded-lg bg-card p-4 ring-1 ring-border/40">
        <div className="min-w-0">
          <p className="font-medium text-foreground">Index results in D1</p>
          <p className="text-sm text-muted-foreground">
            Store each run&apos;s raw result in the database for querying and history.
          </p>
        </div>
        <Switch checked={draft.indexToD1} onCheckedChange={(checked) => set({ indexToD1: checked })} />
      </div>

      <div className="grid gap-2 rounded-lg bg-card p-4 ring-1 ring-border/40">
        <p className="font-medium text-foreground">Embed into RAG</p>
        <p className="text-sm text-muted-foreground">
          Optionally embed results into a Vectorize corpus for retrieval-augmented answers.
        </p>
        <Select
          value={draft.indexVectorizeCorpus}
          onValueChange={(v) => set({ indexVectorizeCorpus: v as WizardDraft["indexVectorizeCorpus"] })}
        >
          <SelectTrigger className="mt-1 w-full sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No embedding</SelectItem>
            <SelectItem value="emails">emails</SelectItem>
            <SelectItem value="docs">docs</SelectItem>
            <SelectItem value="general">general</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-foreground break-words">
        {value}
      </span>
    </div>
  );
}

export function ReviewStep({
  catalog,
  draft,
  set,
}: {
  catalog: AgentCatalogEntry[];
  draft: WizardDraft;
  set: (patch: Partial<WizardDraft>) => void;
}) {
  const agent = findAgent(catalog, draft.agent);
  const action = findAction(catalog, draft.agent, draft.action);
  const paramEntries = action
    ? action.params
        .map((p) => [p.label, draft.params[p.name]] as const)
        .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    : [];

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="task-title" className="text-foreground">
          Task title<span className="text-destructive">*</span>
        </Label>
        <Input
          id="task-title"
          value={draft.title}
          placeholder="e.g. Daily Gmail label sweep"
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>

      <div className="divide-y divide-border/40 rounded-lg bg-card px-4 py-1 ring-1 ring-border/40">
        <ReviewRow
          label="Accounts"
          value={draft.accounts.length ? draft.accounts.join(", ") : "—"}
        />
        <ReviewRow label="Connection" value={agent?.label ?? draft.agent ?? "—"} />
        <ReviewRow label="Action" value={action?.label ?? draft.action ?? "—"} />
        {paramEntries.length ? (
          <ReviewRow
            label="Parameters"
            value={
              <span className="grid gap-0.5">
                {paramEntries.map(([k, v]) => (
                  <span key={k}>
                    {k}: {String(v)}
                  </span>
                ))}
              </span>
            }
          />
        ) : null}
        <ReviewRow label="Frequency" value={frequencySummary(draft)} />
        {draft.prompt.trim() ? <ReviewRow label="Prompt" value={draft.prompt.trim()} /> : null}
        <ReviewRow label="Index in D1" value={draft.indexToD1 ? "Yes" : "No"} />
        <ReviewRow
          label="RAG corpus"
          value={draft.indexVectorizeCorpus === "none" ? "None" : draft.indexVectorizeCorpus}
        />
      </div>
    </div>
  );
}
