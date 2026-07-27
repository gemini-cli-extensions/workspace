/**
 * @fileoverview Session-cookie authentication middleware.
 *
 * The `/api/auth/login` route issues a signed, HttpOnly session cookie
 * (`createSessionCookie`). This middleware validates that cookie's HMAC
 * signature and expiry on protected routes — no database lookup required, so
 * there is no `sessions` table to maintain. Single-user template auth.
 */

import type { Context, Next } from "hono";

import type { Variables } from "@/backend/api/index";
import { verifySessionCookie } from "@/backend/lib/cookies";

/**
 * Reject the request unless it carries a valid signed session cookie.
 * On success, sets `authed = true` in the Hono context.
 */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next,
) {
  const session = await verifySessionCookie(c.env, c.req.header("Cookie"));

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("authed", true);
  await next();
}
