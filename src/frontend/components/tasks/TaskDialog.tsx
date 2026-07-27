/**
 * @fileoverview TaskDialog — the shared create/edit task form (covers the
 * hextaui "task-create" block). Reused on the board and the list pages via a
 * trigger element passed as `children`.
 *
 * On submit it POSTs `/api/tasks` (create) or PATCHes `/api/tasks/{id}` (edit)
 * and calls `onSaved(task)` so the host island can optimistically refresh. When
 * a `parentId` is supplied the created task is POSTed pre-linked as a child of
 * that parent (used by the Subtasks "Create new subtask" flow).
 *
 * The Description field is a {@link TaskRichEditor} (PlateJS): `task.description`
 * now stores **sanitized HTML**, and legacy Plate-envelope / markdown /
 * plain-text descriptions are upgraded on load. PlateJS is browser-only; the
 * editor is only ever rendered inside the opened Dialog and behind a `mounted`
 * guard, so it never runs during Astro SSR / first hydration paint (avoiding
 * React #418/#425).
 *
 * Validation errors and API failures are surfaced inline (no alert()).
 */

import { useEffect, useState, type ReactElement } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend, ApiError } from "@/lib/api";

import { ErrorState } from "./Shared";
import { TaskRichEditor } from "./TaskRichEditor";
import { useProjects } from "./useProjects";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  BOARD_STATUSES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./types";

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

export interface TaskDialogProps {
  /** Trigger element (e.g. a <Button>) — merged into the Base-UI trigger. */
  trigger: ReactElement;
  /** When set, the dialog edits this task; otherwise it creates a new one. */
  task?: Task;
  /** Default status applied to a newly created task (board column context). */
  defaultStatus?: TaskStatus;
  /** Default project applied to a newly created task. */
  defaultProjectId?: string;
  /**
   * When set on a create, the new task is POSTed pre-linked as a child of this
   * parent task id (the Subtasks "Create new subtask" flow). Ignored on edit.
   */
  parentId?: string;
  /** Called with the persisted task after a successful save. */
  onSaved: (task: Task) => void;
}

/** Convert an ISO/epoch due date into a yyyy-mm-dd value for <input type=date>. */
function toDateInput(value: Task["dueDate"]): string {
  if (value == null) return "";
  const d = new Date(typeof value === "number" ? value : value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function TaskDialog({
  trigger,
  task,
  defaultStatus,
  defaultProjectId,
  parentId,
  onSaved,
}: TaskDialogProps) {
  const editing = Boolean(task);
  const { options: projectOptions } = useProjects();

  // PlateJS is browser-only; gate the editor behind a mounted flag so it never
  // renders during SSR / first hydration paint on this `client:load` page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [labelsText, setLabelsText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)seed the form whenever the dialog opens so each open starts clean.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? defaultStatus ?? "todo");
    setPriority(task?.priority ?? "medium");
    setAssignee(task?.assignee ?? "");
    setProjectId(task?.projectId ?? defaultProjectId ?? "");
    setLabelsText((task?.labels ?? []).join(", "));
    setDueDate(toDateInput(task?.dueDate ?? null));
  }, [open, task, defaultStatus, defaultProjectId]);

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const labels = labelsText
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      assignee: assignee.trim() || null,
      projectId: projectId || null,
      labels,
      dueDate: dueDate ? new Date(dueDate).getTime() : null,
    };
    try {
      const saved = editing
        ? await apiSend<Task>("PATCH", `tasks/${task!.id}`, body)
        : await apiSend<Task>("POST", "tasks", parentId ? { ...body, parentId } : body);
      onSaved(saved);
      setOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit task" : parentId ? "New subtask" : "New task"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the task details below."
              : parentId
                ? "Create a task linked as a subtask of the current task."
                : "Create a task and drop it into a board column."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, action-oriented headline"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            {mounted ? (
              <TaskRichEditor
                valueHtml={description}
                onChangeHtml={setDescription}
                placeholder="Optional details, acceptance criteria, links…"
              />
            ) : (
              <div className="min-h-40 rounded-md bg-input/30 ring-1 ring-border/40" />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TaskStatus)}
                items={STATUS_LABELS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOARD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
                items={PRIORITY_LABELS}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={projectId || "__none__"}
                onValueChange={(v) => setProjectId(v === "__none__" ? "" : String(v))}
                items={{
                  __none__: "No project",
                  ...Object.fromEntries(projectOptions.map((o) => [o.value, o.label])),
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projectOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Input
                id="task-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Display name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-labels">Labels</Label>
              <Input
                id="task-labels"
                value={labelsText}
                onChange={(e) => setLabelsText(e.target.value)}
                placeholder="Comma-separated, e.g. ui, urgent"
              />
            </div>
          </div>

          {error ? <ErrorState message={error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
