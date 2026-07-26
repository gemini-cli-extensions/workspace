/**
 * @fileoverview Dynamic Google account registry routes (`/api/accounts`),
 * ported from `core-gsuite-tools` Phase 3.
 *
 * The OAuth consent kickoff + callback live in `auth-google-oauth.ts` and are
 * auth-exempt.
 *
 * Routes:
 *  GET    /api/accounts            — list registry + synthetic workspace account
 *  DELETE /api/accounts/:email     — revoke an OAuth account
 *  POST   /api/accounts/:email/default — set the default account (clear others)
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { googleAccounts } from "@db/schemas";
import { listAuthorizedAccounts } from "@/backend/auth/provider";
import { revokeAccount } from "@/backend/auth/oauth-google";

const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const accountsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET /api/accounts
accountsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Accounts"],
    summary: "List authorized Google accounts",
    operationId: "accountsList",
    responses: {
      // z.any() so Date/union fields don't fight the handler type.
      200: { description: "Accounts", content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const accounts = await listAuthorizedAccounts(c.env);
    return c.json({ data: accounts } as { data: any[] }, 200);
  },
);

// DELETE /api/accounts/:email
accountsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:email",
    tags: ["Accounts"],
    summary: "Revoke a Google account",
    operationId: "accountsRevoke",
    request: { params: z.object({ email: z.string().min(1) }) },
    responses: {
      200: { description: "Revoked", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
      400: { description: "Bad request", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { email } = c.req.valid("param");
    if (email.toLowerCase() === "workspace") {
      return c.json(
        { error: { code: "CANNOT_REVOKE", message: "The synthetic workspace account cannot be revoked." } } as {
          error: { code: string; message: string };
        },
        400,
      );
    }
    await revokeAccount(c.env, email);
    return c.json({ ok: true } as { ok: boolean }, 200);
  },
);

// POST /api/accounts/:email/default
accountsRouter.openapi(
  createRoute({
    method: "post",
    path: "/:email/default",
    tags: ["Accounts"],
    summary: "Set the default Google account",
    operationId: "accountsSetDefault",
    request: { params: z.object({ email: z.string().min(1) }) },
    responses: {
      // z.any() so Date fields don't fight the handler type.
      200: { description: "Default set", content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } } },
      404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
      500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
    },
  }),
  async (c) => {
    const { email } = c.req.valid("param");
    const db = getDb(c.env);
    const target = email.toLowerCase();

    // Clear every existing default first.
    await db.update(googleAccounts).set({ isDefault: false, updatedAt: new Date() });

    if (target !== "workspace") {
      const rows = await db
        .select()
        .from(googleAccounts)
        .where(eq(googleAccounts.email, target))
        .limit(1);
      if (!rows.length) {
        return c.json(
          { error: { code: "NOT_FOUND", message: `Account ${target} not found` } } as {
            error: { code: string; message: string };
          },
          404,
        );
      }
      await db
        .update(googleAccounts)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(googleAccounts.email, target));
    }
    // For "workspace", clearing all explicit defaults makes the synthetic
    // workspace account the implicit default (see listAuthorizedAccounts).

    const accounts = await listAuthorizedAccounts(c.env);
    return c.json({ data: accounts } as { data: any[] }, 200);
  },
);
