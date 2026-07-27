/**
 * @fileoverview Minimal client for the D1-backed `/api/threads` surface.
 *
 * Used by the chat sidebar to list / create / rename / delete chat threads.
 * Each thread row carries an opaque `key` (server-minted uuid) that doubles as
 * the Cloudflare Agents Durable Object instance name for that thread, so the
 * chat pane can connect the orchestrator DO at `/agents/orchestrator-agent/<key>`.
 *
 * Every request forwards the session token as `Authorization: Bearer <token>`
 * (harmless no-op if absent — `/api/threads` is an open feature API, see
 * `src/backend/api/index.ts`) plus `credentials: "include"` so the
 * `gsuite_session` cookie rides along. Failures are surfaced through the
 * global `logError` and rethrown so callers can react.
 */

import { logError } from "@/lib/error-log";
import { getSessionToken } from "@/lib/session";

/** A chat thread row as returned by `/api/threads`. */
export type ThreadRow = {
  id: number;
  key: string;
  sessionKey: string;
  title: string;
  agent: string | null;
  account: string | null;
  createdAt: string | number;
  updatedAt: string | number;
};

/** Build fetch init with the session bearer token + JSON headers. */
function authInit(extra?: RequestInit): RequestInit {
  const { token } = getSessionToken();
  return {
    credentials: "include",
    ...extra,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extra?.headers as Record<string, string> | undefined),
    },
  };
}

/** JSON fetch that logs + throws on non-2xx. */
async function requestJson<T>(input: string, init: RequestInit, source: string, friendly: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (networkError) {
    logError({ title: "Network error", message: friendly, detail: networkError, source });
    throw networkError;
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      body = await res.clone().text();
    }
    logError({ title: `Request failed (${res.status})`, message: friendly, detail: body, source });
    throw new Error(`${source}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** List threads for the current browser session, most-recent first. */
export async function listThreads(): Promise<ThreadRow[]> {
  const { chatId } = getSessionToken();
  const params = new URLSearchParams({ sessionKey: chatId, limit: "100" });
  const { data } = await requestJson<{ data: ThreadRow[] }>(
    `/api/threads?${params.toString()}`,
    authInit(),
    "threads-api.list",
    "Could not load your chat threads.",
  );
  return data;
}

/** Create a new thread (server mints the `key`). */
export async function createThread(title = "New chat"): Promise<ThreadRow> {
  const { chatId } = getSessionToken();
  const { data } = await requestJson<{ data: ThreadRow }>(
    "/api/threads",
    authInit({ method: "POST", body: JSON.stringify({ sessionKey: chatId, title }) }),
    "threads-api.create",
    "Could not start a new chat thread.",
  );
  return data;
}

/** Rename a thread by its integer id. */
export async function renameThread(id: number, title: string): Promise<void> {
  await requestJson(
    `/api/threads/${id}`,
    authInit({ method: "PATCH", body: JSON.stringify({ title }) }),
    "threads-api.rename",
    "Could not rename the chat thread.",
  );
}

/** Delete a thread by its integer id (messages cascade server-side). */
export async function deleteThread(id: number): Promise<void> {
  await requestJson(
    `/api/threads/${id}`,
    authInit({ method: "DELETE" }),
    "threads-api.delete",
    "Could not delete the chat thread.",
  );
}
