/**
 * @fileoverview ProgressCard — the task viewport's dedicated completion card,
 * pinned as the FIRST card in the right column (directly above the Properties
 * card in {@link TaskDetailSidebar}). It owns the task's `progress` (0–100):
 *
 *   Display view → a {@link RadialGauge} sweeping `task.progress / 100`, with the
 *                  center reading "{n}%" over a "Complete" caption. A small pencil
 *                  button in the header toggles the edit view.
 *   Edit view    → a row of milestone buttons: 25% · 50% · 75% · 100% · Other.
 *                  Any NUMERIC milestone whose value is ≤ the current progress is
 *                  disabled + greyed (you cannot "re-complete" a milestone you've
 *                  already passed). "Other" is ALWAYS enabled so an arbitrary
 *                  value — including a LOWER one — can be set. Picking a numeric
 *                  milestone PATCHes `{ progress: <value> }` and exits edit mode.
 *                  "Other" reveals a clamped 0–100 number input + confirm; submit
 *                  PATCHes the entered value and exits.
 *
 * All writes route through the parent's `onSetProgress` (→ `PATCH /api/tasks/{id}
 * {progress}`), so optimistic state + error handling stay centralized in
 * {@link TaskDetail}. Pure Base-UI + Monolith dark theme; the card shell matches
 * the Properties card (`bg-card`, ring-based, no 1px borders).
 */

"use client";

import { useState } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { RadialGauge } from "@/components/dashboard/RadialGauge";

/** Numeric completion milestones surfaced as quick-set buttons in the edit view. */
const MILESTONES = [25, 50, 75, 100] as const;

/** Clamp an arbitrary number into the inclusive 0–100 progress range. */
function clampProgress(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface ProgressCardProps {
  /** The task's current completion percentage (0–100). */
  progress: number;
  /** True while a parent PATCH is in flight (disables the controls). */
  saving?: boolean;
  /** PATCH the task's `progress` directly (→ `PATCH /api/tasks/{id} {progress}`). */
  onSetProgress: (progress: number) => void;
}

/**
 * Completion card: a radial gauge plus an inline milestone editor. Numeric
 * milestones at or below the current progress are disabled; "Other" always
 * allows setting an arbitrary (or lower) value.
 */
export function ProgressCard({ progress, saving = false, onSetProgress }: ProgressCardProps) {
  const [editing, setEditing] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");

  /** Leave edit mode and reset the transient "Other" sub-state. */
  function closeEdit() {
    setEditing(false);
    setOtherOpen(false);
    setOtherDraft("");
  }

  /** Set a milestone value, then exit edit mode. */
  function pick(value: number) {
    onSetProgress(clampProgress(value));
    closeEdit();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Progress
          </h2>
          {editing ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Close progress editor"
              onClick={closeEdit}
            >
              <XIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Edit progress"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
        </div>

        <div className="mx-auto w-full max-w-[170px]">
          <RadialGauge
            value={progress}
            max={100}
            label="Progress"
            caption="Complete"
            chartKey="chart-2"
            className="mx-auto aspect-square max-h-[170px]"
          />
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            {/* Numeric milestones: any value ≤ current progress is disabled. */}
            <div className="flex flex-wrap gap-2">
              {MILESTONES.map((m) => {
                const reached = m <= progress;
                return (
                  <Button
                    key={m}
                    size="sm"
                    variant={reached ? "ghost" : "outline"}
                    disabled={saving || reached}
                    className={reached ? "text-muted-foreground/50" : undefined}
                    aria-label={`Set progress to ${m}%`}
                    onClick={() => pick(m)}
                  >
                    {m}%
                  </Button>
                );
              })}
              {/* "Other" is always enabled — lets the user set any value (incl. lower). */}
              <Button
                size="sm"
                variant={otherOpen ? "secondary" : "outline"}
                disabled={saving}
                aria-label="Set a custom progress value"
                onClick={() => {
                  setOtherDraft(String(progress));
                  setOtherOpen((o) => !o);
                }}
              >
                Other
              </Button>
            </div>

            {/* Custom value: clamped 0–100 number input + confirm. */}
            {otherOpen ? (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={otherDraft}
                  onChange={(e) => setOtherDraft(e.target.value)}
                  className="h-8"
                  aria-label="Custom progress percentage"
                  autoFocus
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Save custom progress"
                  disabled={saving || otherDraft.trim() === ""}
                  onClick={() => pick(clampProgress(Number(otherDraft)))}
                >
                  <CheckIcon className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
