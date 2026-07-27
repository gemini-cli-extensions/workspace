/**
 * @fileoverview Public push-notification receiver for Drive events.
 *
 * Two producers land here:
 *   - Classic Drive `changes.watch` channels POST with X-Goog-* headers and an
 *     empty body.
 *   - A Cloud Pub/Sub push subscription (fed by the Workspace Events API) POSTs
 *     a JSON envelope `{ message: { data: <base64 CloudEvent>, ... } }`.
 *
 * Both are recorded to `drive_notifications` so agents can poll them via the
 * `list_notifications` MCP tool. Always returns 200/204 quickly so the producer
 * doesn't retry. No auth gate — Google/Pub/Sub call this directly; it only
 * records metadata.
 */
import { OpenAPIHono } from "@hono/zod-openapi";

import { getDb } from "@/db";
import { driveNotifications } from "@db/schemas";
import type { AppBindings } from "../index";

export const driveWebhookRouter = new OpenAPIHono<AppBindings>();

driveWebhookRouter.post("/", async (c) => {
  const h = c.req.header.bind(c.req);
  const channelId = h("X-Goog-Channel-ID") ?? null;
  const resourceState = h("X-Goog-Resource-State") ?? null;

  let source = "changes";
  let payload: Record<string, unknown> | null = null;

  // Pub/Sub push (Workspace Events) sends a JSON body; classic watch is empty.
  if (!channelId) {
    try {
      const body = (await c.req.json()) as { message?: { data?: string } };
      source = "events";
      if (body?.message?.data) {
        try {
          payload = JSON.parse(atob(body.message.data)) as Record<string, unknown>;
        } catch {
          payload = { raw: body.message.data };
        }
      } else {
        payload = body as Record<string, unknown>;
      }
    } catch {
      // no/invalid body — treat as a classic ping
    }
  }

  // Only record real notifications — a bare empty POST (probe/spam) with no
  // channel header and no payload is dropped so it can't fill the table.
  if (!channelId && !payload) {
    return c.body(null, 200);
  }

  try {
    await getDb(c.env)
      .insert(driveNotifications)
      .values({
        id: crypto.randomUUID(),
        source,
        channelId,
        resourceId: h("X-Goog-Resource-ID") ?? null,
        resourceState,
        resourceUri: h("X-Goog-Resource-URI") ?? null,
        messageNumber: h("X-Goog-Message-Number") ?? null,
        payload,
      });
  } catch {
    // Never fail the webhook on a logging error — the producer would retry.
  }

  return c.body(null, 200);
});
