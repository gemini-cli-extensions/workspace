/**
 * @fileoverview Shared client-side types + constants for the Projects & Tasks
 * feature surface.
 *
 * These mirror the API response shapes returned by the backend routers in
 * `src/backend/api/routes/{projects,tasks,team-notes}.ts`, which in turn derive
 * from the Drizzle tables in `src/backend/db/schemas/{projects,tasks}/*`.
 *
 * NOTE on dates: the API serializes the Drizzle `timestamp` columns to JSON.
 * Over the wire these arrive as ISO date strings (or epoch ms). All of our
 * formatting helpers (`relativeTime`, `shortDate`) coerce either form, so we
 * type them loosely as `string | number` and never `new Date()` them directly.
 */

// ---------------------------------------------------------------------------
// Enumerations (kept in sync with the zod enums in the API routers)
// ---------------------------------------------------------------------------

/** Lifecycle status of a project. */
export type ProjectStatus = "active" | "archived" | "on_hold";

/** Workflow column a task lives in. */
export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

/** Urgency level of a task. */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** Board column ordering — matches `BOARD_STATUSES` in `tasks.ts`. */
export const BOARD_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "in_review",
  "done",
];

/** Human labels for each status, matching the server's `COLUMN_LABELS`. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Not Started",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

/** Human labels for project statuses. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  archived: "Archived",
  on_hold: "On Hold",
};

/** Human labels for priorities. */
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

// ---------------------------------------------------------------------------
// Record shapes (response `data[]` entries)
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  owner: string;
  starred: boolean;
  taskCount: number;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface Task {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  labels: string[];
  dueDate: string | number | null;
  progress: number;
  position: number;
  createdAt: string | number;
  updatedAt: string | number;
}

/** A comment in a task's discussion thread (`GET /api/tasks/{id}/comments`). */
export interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string | number;
}

/** A checklist item on a task (`GET /api/tasks/{id}/subtasks`). */
export interface TaskSubtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
  createdAt: string | number;
}

/** File-attachment metadata for a task (`GET /api/tasks/{id}/attachments`). */
export interface TaskAttachment {
  id: string;
  taskId: string;
  filename: string;
  size: number | null;
  contentType: string | null;
  r2Key: string;
  createdAt: string | number;
}

export interface TeamNote {
  id: string;
  projectId: string | null;
  title: string;
  body: string;
  author: string;
  pinned: boolean;
  createdAt: string | number;
  updatedAt: string | number;
}

// ---------------------------------------------------------------------------
// Envelope shapes
// ---------------------------------------------------------------------------

/** Standard paginated list envelope returned by every list endpoint. */
export interface ListEnvelope<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/** A single kanban column from `GET /api/tasks/board`. */
export interface BoardColumn {
  status: TaskStatus;
  label: string;
  tasks: Task[];
}

/** Response from `GET /api/tasks/board`. */
export interface BoardResponse {
  columns: BoardColumn[];
}

// ---------------------------------------------------------------------------
// Misc UI helpers
// ---------------------------------------------------------------------------

/** Derive up-to-two-letter initials from a display name (for avatar fallbacks). */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
