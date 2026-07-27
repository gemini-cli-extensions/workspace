/**
 * @fileoverview Typed client for the tasks scheduling surface.
 *
 * Binds to the ported `/api/agent-tasks` REST surface (mounted at
 * `/api/agent-tasks`, not `/api/tasks` — see
 * `src/backend/api/routes/gsuite/agent-tasks.ts` for why):
 *   GET    /api/accounts                  -> { data: Account[] }
 *   GET    /api/catalog                   -> { data: AgentCatalogEntry[] }
 *   GET    /api/agent-tasks               -> { data: ScheduledTask[] }
 *   GET    /api/agent-tasks/:id           -> { data: ScheduledTaskDetail }
 *   POST   /api/agent-tasks               -> { data: ScheduledTask }
 *   POST   /api/agent-tasks/:id/run       -> { data: { ran: true } }
 *   POST   /api/agent-tasks/:id/pause     -> { data: ScheduledTask }
 *   POST   /api/agent-tasks/:id/resume    -> { data: ScheduledTask }
 *   DELETE /api/agent-tasks/:id           -> { data: { deleted: true } }
 *
 * Every call goes through `fetchJson` so failures surface via the global
 * `logError`. Auth is `Authorization: Bearer <token>` from `lib/session.ts`
 * (harmless no-op if absent — these are open feature APIs). No mock data.
 */

import { fetchJson } from "@/lib/error-log";
import { getSessionToken } from "@/lib/session";

/** A single run-progress event for a scheduled task (`task_events` row). */
export type TaskEvent = {
  id: string;
  taskId: string;
  ts: number;
  type: string;
  message: string;
  dataJson?: string | null;
};

/** A single authorized account selectable in step 1. */
export type SchedulerAccount = {
  email: string;
  label?: string | null;
  kind?: string | null;
};

/** Parameter definition for the generated form (step 4). */
export type ParamDef = {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "text" | "enum";
  required: boolean;
  enumValues?: string[];
  placeholder?: string;
  default?: unknown;
};

/** A single action available on a connection (step 3). */
export type ActionDef = {
  name: string;
  label: string;
  description: string;
  readOnly: boolean;
  params: ParamDef[];
};

/** A connection / agent surface from the catalog (step 2). */
export type AgentCatalogEntry = {
  id: string;
  label: string;
  actions: ActionDef[];
};

export type TaskFrequency = "on_demand" | "once" | "interval" | "cron";
export type TaskStatus = "active" | "paused" | "completed" | "error";
export type VectorizeCorpus = "emails" | "docs" | "general";

/** The body POSTed to /api/agent-tasks — EXACT contract shape. */
export type CreateTaskBody = {
  title: string;
  accounts: string[];
  agent: string;
  action: string;
  params: Record<string, unknown>;
  prompt?: string;
  frequency: TaskFrequency;
  scheduleSpec?: string;
  indexToD1: boolean;
  indexVectorizeCorpus: VectorizeCorpus | null;
  source: "ui";
};

/** A saved scheduled task definition (rows in `scheduledTasks`). */
export type ScheduledTask = {
  id: string;
  title: string;
  accounts?: string[];
  accountsJson?: string;
  agent: string;
  action: string;
  params?: Record<string, unknown>;
  paramsJson?: string;
  prompt?: string | null;
  promptText?: string | null;
  frequency: TaskFrequency;
  scheduleSpec?: string | null;
  indexToD1: boolean;
  indexVectorizeCorpus: VectorizeCorpus | null;
  status: TaskStatus;
  source: string;
  lastRunAt?: number | null;
  nextRunAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

/** Detail response: the def plus its run/event timeline. */
export type ScheduledTaskDetail = ScheduledTask & {
  events: TaskEvent[];
  /** When a run produced a Google artifact, the most recent file URL. */
  googleFileUrl?: string | null;
};

function authHeaders(): Record<string, string> {
  const { token } = getSessionToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Normalize a `{ data }` envelope, tolerating bare arrays/objects. */
function unwrap<T>(res: { data?: T } | T): T {
  if (res && typeof res === "object" && "data" in (res as { data?: T })) {
    return (res as { data: T }).data;
  }
  return res as T;
}

export async function getAccounts(): Promise<SchedulerAccount[]> {
  const res = await fetchJson<{ data?: SchedulerAccount[] }>(
    "/api/accounts",
    { headers: authHeaders() },
    { source: "scheduler-api.getAccounts", friendly: "Could not load your Google accounts." },
  );
  return res.data ?? [];
}

export async function getCatalog(): Promise<AgentCatalogEntry[]> {
  const res = await fetchJson<{ data?: AgentCatalogEntry[] }>(
    "/api/catalog",
    { headers: authHeaders() },
    { source: "scheduler-api.getCatalog", friendly: "Could not load the action catalog." },
  );
  return res.data ?? [];
}

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const res = await fetchJson<{ data?: ScheduledTask[] }>(
    "/api/agent-tasks",
    { headers: authHeaders() },
    { source: "scheduler-api.listScheduledTasks", friendly: "Could not load your tasks." },
  );
  return res.data ?? [];
}

export async function getScheduledTask(id: string): Promise<ScheduledTaskDetail> {
  const res = await fetchJson<{ data: ScheduledTaskDetail } | ScheduledTaskDetail>(
    `/api/agent-tasks/${encodeURIComponent(id)}`,
    { headers: authHeaders() },
    { source: "scheduler-api.getScheduledTask", friendly: "Could not load the task." },
  );
  return unwrap(res);
}

export async function createScheduledTask(body: CreateTaskBody): Promise<ScheduledTask> {
  const res = await fetchJson<{ data: ScheduledTask } | ScheduledTask>(
    "/api/agent-tasks",
    { method: "POST", headers: authHeaders(), body: JSON.stringify(body) },
    { source: "scheduler-api.createScheduledTask", friendly: "Could not create the task." },
  );
  return unwrap(res);
}

export async function runScheduledTask(id: string): Promise<void> {
  await fetchJson(
    `/api/agent-tasks/${encodeURIComponent(id)}/run`,
    { method: "POST", headers: authHeaders() },
    { source: "scheduler-api.runScheduledTask", friendly: "Could not run the task." },
  );
}

export async function pauseScheduledTask(id: string): Promise<void> {
  await fetchJson(
    `/api/agent-tasks/${encodeURIComponent(id)}/pause`,
    { method: "POST", headers: authHeaders() },
    { source: "scheduler-api.pauseScheduledTask", friendly: "Could not pause the task." },
  );
}

export async function resumeScheduledTask(id: string): Promise<void> {
  await fetchJson(
    `/api/agent-tasks/${encodeURIComponent(id)}/resume`,
    { method: "POST", headers: authHeaders() },
    { source: "scheduler-api.resumeScheduledTask", friendly: "Could not resume the task." },
  );
}

export async function deleteScheduledTask(id: string): Promise<void> {
  await fetchJson(
    `/api/agent-tasks/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: authHeaders() },
    { source: "scheduler-api.deleteScheduledTask", friendly: "Could not delete the task." },
  );
}

/** Parse the accounts list from either the array or json column form. */
export function taskAccounts(task: ScheduledTask): string[] {
  if (Array.isArray(task.accounts)) return task.accounts;
  if (task.accountsJson) {
    try {
      const parsed = JSON.parse(task.accountsJson);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
