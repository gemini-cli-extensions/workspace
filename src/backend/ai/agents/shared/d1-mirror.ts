/**
 * @fileoverview Mirror a chat agent's turn into the D1 `threads`/`messages`
 * tables.
 *
 * The Cloudflare `AIChatAgent` already persists conversation history in its own
 * Durable Object SQLite. That storage is authoritative for the live chat, but it
 * is per-DO and ephemeral relative to D1 — it can be lost if the DO is reset and
 * it is not queryable by the REST API or other surfaces. This helper mirrors
 * every turn into D1 so history survives DO resets and is served via
 * `/api/threads/:id/messages`.
 *
 * Invoked from `OrchestratorAgent.onChatResponse` (fired after each turn once the
 * turn lock is released, so D1 writes never block streaming). The mirror is
 * idempotent: messages are upserted on the unique `(thread_id, message_id)`
 * index, so reconnects/replays never create duplicates.
 */

import type { UIMessage } from "ai";

import { threads, messages as messagesTable } from "@db/schemas";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";

/** Roles persisted to D1 (matches the `messages.role` enum). */
type PersistRole = "user" | "assistant" | "system" | "tool";

/**
 * Flatten a UIMessage's text parts into a plain-text string for the `content`
 * column. Non-text parts (tool calls, files, reasoning) are preserved in full in
 * `metadataJson`; this is only the human-readable summary.
 *
 * @param message - The UIMessage to summarize.
 * @returns Concatenated text, or an empty string when the message has no text.
 */
function extractText(message: UIMessage): string {
  const parts = (message as { parts?: Array<{ type?: string; text?: string }> }).parts;
  if (!Array.isArray(parts)) {
    // Older shape: a top-level string content.
    const content = (message as { content?: unknown }).content;
    return typeof content === "string" ? content : "";
  }
  return parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");
}

/**
 * Resolve the D1 thread row for a DO instance, creating it if absent.
 *
 * Threads are normally created by the frontend via `POST /api/threads` (which
 * mints the `key` used as the DO instance name) before the chat connects, so the
 * row usually already exists. We still create a minimal fallback row when a DO is
 * used directly (e.g. server-to-server) so mirroring never silently drops turns.
 *
 * @param db - Drizzle D1 client.
 * @param doName - The DO instance name (== `threads.key`).
 * @returns The thread's integer primary key.
 */
async function resolveThreadId(db: ReturnType<typeof getDb>, doName: string): Promise<number> {
  const existing = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.key, doName))
    .limit(1);
  if (existing.length) return existing[0].id;

  const now = new Date();
  const inserted = await db
    .insert(threads)
    .values({
      key: doName,
      // No external session context at the DO layer — fall back to the key so the
      // NOT NULL constraint holds. API-created threads carry the real sessionKey.
      sessionKey: doName,
      title: "New chat",
      agent: "OrchestratorAgent",
      createdAt: now,
      updatedAt: now,
    })
    // Race-safe: concurrent reconnects / rapid messages can try to insert the same
    // `key` at once. `onConflictDoNothing` makes the losing insert a no-op (no
    // UNIQUE-constraint throw); we then re-select the row the winner created.
    .onConflictDoNothing()
    .returning({ id: threads.id });
  if (inserted.length > 0) return inserted[0].id;

  const fallback = await db
    .select({ id: threads.id })
    .from(threads)
    .where(eq(threads.key, doName))
    .limit(1);
  if (!fallback.length) {
    throw new Error(`Could not resolve or create thread for DO "${doName}".`);
  }
  return fallback[0].id;
}

/**
 * Mirror the full current message list of a chat turn into D1.
 *
 * @param env - Worker env (D1 binding).
 * @param doName - DO instance name (== `threads.key`).
 * @param allMessages - The agent's complete `this.messages` after the turn.
 * @returns The number of new message rows written (0 when all were already present).
 */
export async function mirrorTurnToD1(
  env: Env,
  doName: string,
  allMessages: readonly UIMessage[],
): Promise<number> {
  if (!doName || allMessages.length === 0) return 0;

  const db = getDb(env);
  const threadId = await resolveThreadId(db, doName);
  const now = new Date();

  let written = 0;
  for (const message of allMessages) {
    const messageId = (message as { id?: string }).id;
    if (!messageId) continue; // UIMessages always carry an id; skip malformed.

    const role = message.role as PersistRole;
    const parts = (message as { parts?: unknown }).parts ?? null;

    // Idempotent: the unique (thread_id, message_id) index makes re-mirrors of an
    // already-stored message a no-op.
    const res = await db
      .insert(messagesTable)
      .values({
        threadId,
        messageId,
        role,
        content: extractText(message),
        agent: role === "assistant" ? "OrchestratorAgent" : null,
        metadataJson: parts,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: messagesTable.id });
    written += res.length;
  }

  // Bump the thread's updatedAt so thread lists order by most-recent activity.
  await db.update(threads).set({ updatedAt: now }).where(eq(threads.id, threadId));

  // Best-effort: set a title from the first user message when still default.
  await maybeSetTitle(db, threadId, allMessages);

  return written;
}

/**
 * Set the thread title from the first user message when the title is still the
 * default placeholder. Best-effort; failures are non-fatal.
 *
 * @param db - Drizzle D1 client.
 * @param threadId - Thread primary key.
 * @param allMessages - The full message list.
 */
async function maybeSetTitle(
  db: ReturnType<typeof getDb>,
  threadId: number,
  allMessages: readonly UIMessage[],
): Promise<void> {
  const row = await db
    .select({ title: threads.title })
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);
  if (!row.length) return;
  if (row[0].title && row[0].title !== "New chat") return;

  const firstUser = allMessages.find((m) => m.role === "user");
  if (!firstUser) return;
  const text = extractText(firstUser).trim();
  if (!text) return;
  const title = text.length > 80 ? `${text.slice(0, 77)}…` : text;
  await db.update(threads).set({ title }).where(eq(threads.id, threadId));
}
