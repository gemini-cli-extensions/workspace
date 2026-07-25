/**
 * @fileoverview NotificationsAgent — realtime, state-synced notification feed.
 *
 * Unlike `ChatBroker` (which extends `AIChatAgent` for streamed LLM chat), this
 * is a plain Cloudflare Agents SDK `Agent` whose entire purpose is **state sync
 * over WebSocket**. There is no inference here. The agent owns a single piece of
 * server-authoritative state — the notification feed plus an unread counter —
 * and every mutation flows through `this.setState(...)`, which the SDK
 * automatically broadcasts to every connected WebSocket client.
 *
 * ## Persistence model
 * The feed is durable in **D1** (the `notifications` table), not in the DO's
 * embedded SQLite. D1 is the source of truth; the in-memory/synced `state` is a
 * hot cache of the latest ~50 rows that `onStart()` rehydrates on cold start.
 * Every `@callable` mutation writes through to D1 *and* updates `state` so the
 * cache and the durable store never diverge.
 *
 * ## Single shared instance
 * This template is single-user, so there is exactly one canonical feed. The
 * orchestrator wires it under the fixed instance name `"global"`:
 *
 * ```ts
 * import { getAgentByName } from "agents";
 * const feed = await getAgentByName(env.NOTIFICATIONS_AGENT, "global");
 * await feed.add({ type: "info", title: "Deploy finished" });
 * ```
 *
 * ## Calling rules (IMPORTANT — Agents SDK)
 * - Server callers MUST use `getAgentByName(env.NOTIFICATIONS_AGENT, "global")`
 *   to obtain a typed stub, then `await stub.add(...)` / `await stub.list()` etc.
 * - NEVER call `stub.fetch(new Request(...))` to reach a method. The HTTP/WS
 *   surface is reserved for the SDK's own routing + the `useAgent` client.
 * - NEVER use `env.NOTIFICATIONS_AGENT.idFromName(name).get()`. That bypasses
 *   the Agents lifecycle (onStart, state hydration, RPC plumbing).
 *
 * ## Frontend pairing
 * `useAgent({ agent: "notifications-agent", name: "global" })` from
 * `agents/react`. The agent name is the **kebab-case of the class name**, so the
 * SDK routes the socket to `/agents/notifications-agent/global`. The client
 * receives `{ notifications, unread }` via `onStateUpdate` and triggers
 * mutations with `agent.call("markAllRead", [])` (etc.).
 *
 * The binding is `NOTIFICATIONS_AGENT`. The DO binding, migration, worker
 * `export`, and `namedExports` are registered by the orchestrator — not here.
 */

import { Agent, callable } from "agents";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import {
  notifications,
  type Notification,
} from "@/backend/db/schemas/notifications/notifications";

// ---------------------------------------------------------------------------
// State + wire types
// ---------------------------------------------------------------------------

/**
 * A single notification as it travels over the WebSocket to clients.
 *
 * This is the D1 row shape with `createdAt` flattened to a Unix-millisecond
 * number so it serializes cleanly through the SDK's JSON state channel (a live
 * `Date` instance would not survive structured-clone over the wire predictably,
 * and a number is trivial for the client to feed into relative-time formatting).
 */
export interface NotificationItem {
  id: string;
  type: Notification["type"];
  title: string;
  body: string | null;
  severity: string;
  read: boolean;
  actor: string | null;
  entityType: string | null;
  entityId: string | null;
  href: string | null;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

/**
 * Server-authoritative state synced to every connected client via `setState`.
 *
 * - `notifications` — newest-first list (the hot cache of recent D1 rows).
 * - `unread` — count of `read === false` items, kept in lockstep with the list.
 */
export interface NotificationsState {
  notifications: NotificationItem[];
  unread: number;
}

/** Shape accepted by {@link NotificationsAgent.add}. Mirrors the insertable columns. */
export interface AddNotificationInput {
  type?: Notification["type"];
  title: string;
  body?: string | null;
  severity?: string;
  actor?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  href?: string | null;
}

/** How many recent rows to hydrate into synced state on cold start. */
const FEED_LIMIT = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a D1 row into the wire-friendly {@link NotificationItem}. */
function toItem(row: Notification): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    severity: row.severity,
    read: row.read,
    actor: row.actor ?? null,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    href: row.href ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/** Count unread items in a list. */
function countUnread(items: NotificationItem[]): number {
  return items.reduce((n, item) => (item.read ? n : n + 1), 0);
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class NotificationsAgent extends Agent<Env, NotificationsState> {
  /** Default state before any D1 hydration runs. */
  initialState: NotificationsState = { notifications: [], unread: 0 };

  /**
   * Documentation metadata consumed by the in-app `/docs/agents` viewer.
   * Mirrors `ChatBroker.docsMetadata()` so the docs UI can render both uniformly.
   */
  static docsMetadata() {
    return {
      name: "NotificationsAgent",
      className: "NotificationsAgent",
      description:
        "Realtime notification feed. A plain Agents SDK `Agent` that syncs `{ notifications, unread }` to every connected WebSocket client via `setState`. D1 (`notifications` table) is the source of truth; the synced state is a hot cache of the latest ~50 rows. Server callers reach it with `getAgentByName(env.NOTIFICATIONS_AGENT, \"global\")` — never `stub.fetch`.",
      docsPath: "/docs/agents/notifications",
      methods: [
        {
          name: "onStart",
          description:
            "Cold-start hydration. Loads the latest ~50 notifications from D1 (createdAt desc) into synced state.",
          params: "()",
          returns: "Promise<void>",
        },
        {
          name: "add",
          description:
            "Inserts a notification into D1, prepends it to synced state, and increments the unread counter.",
          params: "input: AddNotificationInput",
          returns: "Promise<NotificationItem>",
        },
        {
          name: "markRead",
          description:
            "Marks a single notification read in D1 and in synced state, then recomputes the unread counter.",
          params: "id: string",
          returns: "Promise<void>",
        },
        {
          name: "markAllRead",
          description:
            "Marks every notification read in D1 and synced state; unread → 0.",
          params: "()",
          returns: "Promise<void>",
        },
        {
          name: "clearAll",
          description:
            "Deletes all notifications from D1 and resets synced state to empty.",
          params: "()",
          returns: "Promise<void>",
        },
        {
          name: "list",
          description: "Returns the current synced `notifications` array.",
          params: "()",
          returns: "Promise<NotificationItem[]>",
        },
      ],
    };
  }

  /**
   * Cold-start hydration hook.
   *
   * Runs once when the DO is first activated (and on every wake from
   * hibernation). Pulls the most-recent {@link FEED_LIMIT} rows from D1 newest
   * first and publishes them as synced state, so any client that connects sees
   * the feed immediately without a separate fetch.
   */
  async onStart(): Promise<void> {
    const db = getDb(this.env);
    const rows = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(FEED_LIMIT);

    const items = rows.map(toItem);
    this.setState({ notifications: items, unread: countUnread(items) });
  }

  /**
   * Emit a new notification.
   *
   * Inserts the row into D1 (letting the table defaults fill `id`/`createdAt`),
   * prepends the created item to the synced feed, increments `unread`, and
   * broadcasts the new state. Returns the created {@link NotificationItem} so the
   * caller (e.g. an API route) can echo it back.
   */
  @callable()
  async add(input: AddNotificationInput): Promise<NotificationItem> {
    const db = getDb(this.env);
    const [row] = await db
      .insert(notifications)
      .values({
        type: input.type ?? "info",
        title: input.title,
        body: input.body ?? null,
        severity: input.severity ?? input.type ?? "info",
        actor: input.actor ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        href: input.href ?? null,
      })
      .returning();

    const item = toItem(row);
    const next = [item, ...this.state.notifications].slice(0, FEED_LIMIT);
    this.setState({ notifications: next, unread: countUnread(next) });
    return item;
  }

  /**
   * Mark a single notification as read.
   *
   * Writes `read = true` to D1, mirrors the flag in synced state, and recomputes
   * the unread counter. No-op (state-wise) if the id is not in the hot cache,
   * though the D1 write still applies.
   */
  @callable()
  async markRead(id: string): Promise<void> {
    const db = getDb(this.env);
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, id));

    const next = this.state.notifications.map((item) =>
      item.id === id ? { ...item, read: true } : item,
    );
    this.setState({ notifications: next, unread: countUnread(next) });
  }

  /**
   * Mark every notification as read.
   *
   * Bulk-updates D1, flips every cached item to `read = true`, and zeroes the
   * unread counter.
   */
  @callable()
  async markAllRead(): Promise<void> {
    const db = getDb(this.env);
    await db.update(notifications).set({ read: true });

    const next = this.state.notifications.map((item) =>
      item.read ? item : { ...item, read: true },
    );
    this.setState({ notifications: next, unread: 0 });
  }

  /**
   * Delete the entire feed.
   *
   * Truncates the D1 table and resets synced state to empty. Irreversible.
   */
  @callable()
  async clearAll(): Promise<void> {
    const db = getDb(this.env);
    await db.delete(notifications);
    this.setState({ notifications: [], unread: 0 });
  }

  /**
   * Return the current synced feed.
   *
   * Convenience RPC for callers that want a one-shot read without subscribing to
   * the WebSocket state stream. Reads from the hot cache, not D1.
   */
  @callable()
  async list(): Promise<NotificationItem[]> {
    return this.state.notifications;
  }
}
