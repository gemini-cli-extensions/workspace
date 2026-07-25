/**
 * @fileoverview Notifications REST API router.
 *
 * Proxies all mutations through the `NotificationsAgent` Durable Object so
 * that REST mutations are reflected in real-time to every connected WebSocket
 * client. The agent is reached with `getAgentByName(env.NOTIFICATIONS_AGENT,
 * "global")` — never with `stub.fetch(new Request(...))`.
 *
 * Mount this router at `/api/notifications` in `api/index.ts`.
 *
 * Route inventory:
 *   GET    /           – list notifications (via stub.list())
 *   POST   /           – create notification (via stub.add(body))
 *   POST   /{id}/read  – mark one notification read (via stub.markRead(id))
 *   POST   /read-all   – mark all notifications read (via stub.markAllRead())
 *   DELETE /           – clear all notifications (via stub.clearAll())
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";

import {
  NotificationsAgent,
  type AddNotificationInput,
  type NotificationItem,
} from "../../ai/agents/NotificationsAgent";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

/**
 * Wire-format notification item (createdAt is epoch millis, not a Date).
 * Mirrors `NotificationItem` from the NotificationsAgent but expressed as a
 * Zod schema for OpenAPI registration.
 */
const notificationItemSchema = z.object({
  id: z.string(),
  type: z.enum(["info", "success", "warning", "error", "mention", "system"]),
  title: z.string(),
  body: z.string().nullable(),
  severity: z.string(),
  read: z.boolean(),
  actor: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  href: z.string().nullable(),
  createdAt: z.number().openapi({ description: "Unix epoch milliseconds." }),
});

const addNotificationBody = z.object({
  type: z
    .enum(["info", "success", "warning", "error", "mention", "system"])
    .optional()
    .openapi({ description: "Notification kind (default: info)." }),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  severity: z.string().optional(),
  actor: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
});

const notifIdParam = z.object({ id: z.string().min(1) });

const okResponseSchema = z.object({ ok: z.boolean() });

// ---------------------------------------------------------------------------
// Helper — resolve the singleton NotificationsAgent stub
// ---------------------------------------------------------------------------

/**
 * Obtain the "global" NotificationsAgent stub via native DO RPC.
 *
 * `getAgentByName` resolves the single shared notification feed for this
 * single-user template. Callers then invoke `await stub.add(...)` etc. — never
 * `stub.fetch(new Request(...))`.
 */
async function getNotificationsStub(env: Env) {
  // `wrangler types` emits the DO namespace as `DurableObjectNamespace<undefined>`
  // (it can't infer the class), so cast to the real class to recover typed RPC.
  const ns = env.NOTIFICATIONS_AGENT as unknown as DurableObjectNamespace<NotificationsAgent>;
  return getAgentByName(ns, "global");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const notificationsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Notifications"],
    summary: "List notifications (reads from the agent hot-cache)",
    operationId: "notificationsList",
    responses: {
      200: {
        description: "Current notification feed (newest first).",
        content: { "application/json": { schema: z.array(notificationItemSchema) } },
      },
    },
  }),
  async (c) => {
    const stub = await getNotificationsStub(c.env);
    const items = await stub.list() as NotificationItem[];
    return c.json(items, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Notifications"],
    summary: "Create notification (also pushes to WebSocket clients)",
    operationId: "notificationsCreate",
    request: {
      body: { content: { "application/json": { schema: addNotificationBody } } },
    },
    responses: {
      201: {
        description: "Created notification item.",
        content: { "application/json": { schema: notificationItemSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json") as AddNotificationInput;
    const stub = await getNotificationsStub(c.env);
    const item = await stub.add(body) as NotificationItem;
    return c.json(item, 201);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/read
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/read",
    tags: ["Notifications"],
    summary: "Mark a single notification as read",
    operationId: "notificationsMarkRead",
    request: { params: notifIdParam },
    responses: {
      200: {
        description: "Read acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const stub = await getNotificationsStub(c.env);
    await stub.markRead(id);
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /read-all
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "post",
    path: "/read-all",
    tags: ["Notifications"],
    summary: "Mark all notifications as read",
    operationId: "notificationsMarkAllRead",
    responses: {
      200: {
        description: "All-read acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const stub = await getNotificationsStub(c.env);
    await stub.markAllRead();
    return c.json({ ok: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// DELETE /
// ---------------------------------------------------------------------------

notificationsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/",
    tags: ["Notifications"],
    summary: "Clear all notifications",
    operationId: "notificationsClearAll",
    responses: {
      200: {
        description: "Clear acknowledgement.",
        content: { "application/json": { schema: okResponseSchema } },
      },
    },
  }),
  async (c) => {
    const stub = await getNotificationsStub(c.env);
    await stub.clearAll();
    return c.json({ ok: true }, 200);
  },
);
