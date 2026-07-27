/**
 * @fileoverview Frontend login for the ported chat/tasks surfaces: exchanges
 * the `WORKER_API_KEY` for a signed `gsuite_session` cookie that authorizes
 * the `/agents/*` Durable Object connections (see `isAuthorizedAgentRequest`
 * in `src/_worker.ts`). Ported from `core-gsuite-tools` Phase 3.
 *
 * MOUNTED AT `/api/agent-session` (not `/api/auth`): this Worker already has
 * its own `/api/auth` (`authRouter`), a DIFFERENT login flow that mints an
 * unrelated, HttpOnly `cr_session` cookie gating `/api/admin/*`. The two
 * cookies serve different consumers and are kept independent rather than
 * merged, so this router lives at its own prefix.
 *
 *  POST /api/agent-session/login  — body `{ key }`. If `key` matches the
 *    `WORKER_API_KEY`, set a signed, short-lived `gsuite_session` cookie (the
 *    same HMAC session token `/agents/*` accepts) and return `{ ok: true }`.
 *    Otherwise 401.
 *  GET  /api/agent-session/session — report whether the request carries a
 *    valid, unexpired `gsuite_session` cookie. This is the server-side source
 *    of truth `AuthGate` calls to re-confirm auth before showing the login
 *    modal.
 *
 * The cookie is intentionally NOT HttpOnly: the browser islands read the
 * session token (`src/frontend/lib/session.ts`) to authenticate the agent
 * WebSocket. The raw `WORKER_API_KEY` is never stored client-side — only the
 * derived, expiring token.
 *
 * Both routes are auth-exempt (this is how a client becomes authenticated).
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { setCookie } from "hono/cookie";

import { readVerifiedSession } from "@/backend/auth/read-session";
import { mintSessionToken } from "@/backend/auth/session-token";
import { constantTimeEqual } from "@/backend/lib/crypto";
import { getWorkerApiKey } from "@/backend/utils/secrets";

/** Cookie name holding the signed session token. Mirrors `read-session.ts`. */
const SESSION_COOKIE = "gsuite_session";

/** Session lifetime in seconds (matches the minted token TTL: 12h). */
const SESSION_MAX_AGE = 12 * 60 * 60;

export const agentSessionRouter = new OpenAPIHono<{ Bindings: Env }>();

agentSessionRouter.openapi(
  createRoute({
    method: "post",
    path: "/login",
    tags: ["Auth"],
    summary: "Exchange the worker API key for a gsuite_session cookie",
    operationId: "gsuiteAgentSessionLogin",
    request: {
      body: {
        content: { "application/json": { schema: z.object({ key: z.string().min(1) }) } },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Authenticated",
        content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      },
      401: {
        description: "Invalid key",
        content: {
          "application/json": {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { key } = c.req.valid("json");
    const workerKey = await getWorkerApiKey(c.env);

    if (!workerKey || !constantTimeEqual(key, workerKey)) {
      return c.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid worker API key." } } as {
          error: { code: string; message: string };
        },
        401,
      );
    }

    const token = await mintSessionToken(c.env, SESSION_MAX_AGE);
    if (!token) {
      return c.json(
        { error: { code: "SERVER", message: "Could not mint a session token." } } as {
          error: { code: string; message: string };
        },
        401,
      );
    }

    setCookie(c, SESSION_COOKIE, token, {
      // NOT httpOnly: the client reads the session token to auth the agent WS.
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return c.json({ ok: true } as const, 200);
  },
);

agentSessionRouter.openapi(
  createRoute({
    method: "get",
    path: "/session",
    tags: ["Auth"],
    summary: "Report whether the request carries a valid gsuite_session cookie",
    operationId: "gsuiteAgentSessionCheck",
    responses: {
      200: {
        description: "Session status",
        content: {
          "application/json": {
            schema: z.object({ authed: z.boolean(), exp: z.number().nullable() }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { authed, exp } = await readVerifiedSession(c.env, c.req.raw);
    return c.json({ authed, exp }, 200);
  },
);
