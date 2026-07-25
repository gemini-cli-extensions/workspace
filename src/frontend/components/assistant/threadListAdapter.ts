/**
 * @fileoverview Persistent `RemoteThreadListAdapter` backed by `/api/threads`.
 *
 * Replaces the ephemeral `InMemoryThreadListAdapter`. The thread INDEX (list,
 * titles, archived state, selected model) is persisted in the `chat_threads` D1
 * table; the per-thread MESSAGES live in each `ChatBroker` Durable Object.
 *
 * The key invariant: the adapter's `remoteId` IS the `chat_threads` row id AND
 * the `ChatBroker` DO `name`. So one id keys both the metadata (D1) and the
 * message log (DO), and they stay linked.
 *
 * Lifecycle the runtime drives (see `RemoteThreadListAdapter`):
 *  - `list()`       → GET /api/threads (non-archived, newest first)
 *  - `initialize()` → POST /api/threads → returns the new row id as `remoteId`
 *  - `rename()`     → PATCH /api/threads/:id { title }
 *  - `archive()`    → PATCH /api/threads/:id { archived: true }
 *  - `unarchive()`  → PATCH /api/threads/:id { archived: false }
 *  - `delete()`     → DELETE /api/threads/:id
 *  - `fetch()`      → GET /api/threads/:id
 *  - `generateTitle()` → POST /api/threads/:id/title, streamed back as a title
 */

import { createAssistantStream } from "assistant-stream";

import type { RemoteThreadListAdapter } from "@assistant-ui/react";

// `@assistant-ui/react` exports the adapter interface but NOT its individual
// response sub-types, so we derive them from the adapter via indexed access.
// This stays correct across minor version bumps without importing internals.
type RemoteThreadListResponse = Awaited<ReturnType<RemoteThreadListAdapter["list"]>>;
type RemoteThreadInitializeResponse = Awaited<ReturnType<RemoteThreadListAdapter["initialize"]>>;
type RemoteThreadMetadata = RemoteThreadListResponse["threads"][number];

/** Shape of a `chat_threads` row as returned by the API. */
interface ThreadRow {
  id: string;
  title: string;
  model: string | null;
  archived: boolean;
  createdAt: string | number;
  updatedAt: string | number;
}

/** Map a D1 thread row into the runtime's `RemoteThreadMetadata`. */
function toMetadata(row: ThreadRow): RemoteThreadMetadata {
  return {
    status: row.archived ? "archived" : "regular",
    remoteId: row.id,
    externalId: undefined,
    title: row.title,
  };
}

/** Extract plain text from a runtime thread message (text parts only). */
function messageText(message: { content?: ReadonlyArray<{ type?: string; text?: string }> }): string {
  return (message.content ?? [])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join(" ")
    .trim();
}

/**
 * The persistent thread-list adapter. A plain object — construct once and pass
 * to `useRemoteThreadListRuntime({ adapter })`.
 */
export const threadListAdapter: RemoteThreadListAdapter = {
  async list(): Promise<RemoteThreadListResponse> {
    const res = await fetch("/api/threads");
    if (!res.ok) return { threads: [] };
    const body = (await res.json()) as { data: ThreadRow[] };
    return { threads: body.data.map(toMetadata) };
  },

  async initialize(): Promise<RemoteThreadInitializeResponse> {
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const row = (await res.json()) as ThreadRow;
    // The row id is BOTH the D1 key and the ChatBroker DO name.
    return { remoteId: row.id, externalId: undefined };
  },

  async rename(remoteId, newTitle): Promise<void> {
    await fetch(`/api/threads/${remoteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
  },

  async archive(remoteId): Promise<void> {
    await fetch(`/api/threads/${remoteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
  },

  async unarchive(remoteId): Promise<void> {
    await fetch(`/api/threads/${remoteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
  },

  async delete(remoteId): Promise<void> {
    await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
  },

  async fetch(remoteId): Promise<RemoteThreadMetadata> {
    const res = await fetch(`/api/threads/${remoteId}`);
    if (!res.ok) {
      return { status: "regular", remoteId, externalId: undefined, title: "New chat" };
    }
    const row = (await res.json()) as ThreadRow;
    return toMetadata(row);
  },

  async generateTitle(remoteId, messages) {
    // Generate + persist the title server-side, then stream it back so the
    // runtime updates the thread's display title. The runtime expects a
    // `Promise<AssistantStream>`, so this method is async.
    return createAssistantStream(async (controller) => {
      try {
        const payload = {
          messages: messages
            .map((m) => ({
              role: m.role as "user" | "assistant" | "system",
              content: messageText(m as { content?: ReadonlyArray<{ type?: string; text?: string }> }),
            }))
            .filter((m) => m.content.length > 0)
            .slice(-6),
        };
        if (payload.messages.length === 0) return;

        const res = await fetch(`/api/threads/${remoteId}/title`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return;
        const { title } = (await res.json()) as { title: string };
        if (title) controller.appendText(title);
      } catch {
        // Title generation is best-effort; leave the existing title in place.
      }
    });
  },
};
