/**
 * @fileoverview Inbox REST API router — reads the `email_messages` D1 table
 * populated by the Cloudflare Email Routing `email()` handler.
 *
 * Powers the two-pane inbox showcase (`/inbox`). Every row is a real received
 * email; the only synthetic data is the explicitly-labeled demo seed
 * (`POST /api/inbox/seed`) so the showcase has content before any live mail
 * arrives.
 *
 * Mount this router at `/api/inbox` in `api/index.ts`.
 *
 * Route inventory:
 *   GET   /         – list messages (folder, q, read, limit, offset) → envelope
 *   GET   /{id}     – single message
 *   PATCH /{id}     – partial update (read, starred, folder)
 *   POST  /seed     – idempotent demo seed (~12 realistic emails)
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, like, or, sql } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { emailMessages, selectEmailMessageSchema } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const EMAIL_FOLDERS = ["inbox", "archive", "spam"] as const;

const messageIdParam = z.object({ id: z.string().min(1) });
const notFoundSchema = z.object({ error: z.string() });

const listQuerySchema = z.object({
  folder: z
    .enum(EMAIL_FOLDERS)
    .optional()
    .openapi({ description: "Folder bucket: inbox | archive | spam (default inbox)." }),
  q: z
    .string()
    .optional()
    .openapi({ description: "Search across subject, from, snippet, and body." }),
  read: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Filter by read state." }),
  starred: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "Filter by starred state (e.g. the Starred view)." }),
  limit: z.string().optional().openapi({ description: "Max rows (default 50)." }),
  offset: z.string().optional().openapi({ description: "Skip rows for pagination (default 0)." }),
});

const listResponseSchema = z.object({
  data: z.array(selectEmailMessageSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  unread: z.number().openapi({ description: "Unread count in the inbox folder." }),
});

/** PATCH body — only the user-mutable organization flags. */
const patchBodySchema = z
  .object({
    read: z.boolean().optional(),
    starred: z.boolean().optional(),
    folder: z.enum(EMAIL_FOLDERS).optional(),
  })
  .openapi({ description: "Partial update of read / starred / folder." });

const seedResponseSchema = z.object({
  seeded: z.boolean(),
  message: z.string(),
  count: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const inboxRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET / — list
// ---------------------------------------------------------------------------

inboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Inbox"],
    summary: "List received emails",
    operationId: "inboxList",
    request: { query: listQuerySchema },
    responses: {
      200: {
        description: "Paginated list of email messages (newest first).",
        content: { "application/json": { schema: listResponseSchema } },
      },
    },
  }),
  async (c) => {
    const { folder, q, read, starred, limit: lStr, offset: oStr } = c.req.valid("query");
    const limit = Math.min(parseInt(lStr ?? "50", 10) || 50, 200);
    const offset = parseInt(oStr ?? "0", 10) || 0;
    const db = getDb(c.env);

    const conditions = [];
    // `starred=true` is a cross-folder view; otherwise scope to a folder.
    if (starred === "true") conditions.push(eq(emailMessages.starred, true));
    else conditions.push(eq(emailMessages.folder, folder ?? "inbox"));

    if (read === "true") conditions.push(eq(emailMessages.read, true));
    if (read === "false") conditions.push(eq(emailMessages.read, false));
    if (q) {
      conditions.push(
        or(
          like(emailMessages.subject, `%${q}%`),
          like(emailMessages.fromAddress, `%${q}%`),
          like(emailMessages.fromName, `%${q}%`),
          like(emailMessages.snippet, `%${q}%`),
          like(emailMessages.textBody, `%${q}%`),
        ),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult, unreadResult] = await Promise.all([
      db
        .select()
        .from(emailMessages)
        .where(where)
        .orderBy(desc(emailMessages.receivedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(emailMessages).where(where),
      db
        .select({ count: sql<number>`count(*)` })
        .from(emailMessages)
        .where(and(eq(emailMessages.folder, "inbox"), eq(emailMessages.read, false))),
    ]);

    return c.json(
      {
        data: rows,
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
        unread: unreadResult[0]?.count ?? 0,
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /{id} — single
// ---------------------------------------------------------------------------

inboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Inbox"],
    summary: "Get a single email by ID",
    operationId: "inboxGet",
    request: { params: messageIdParam },
    responses: {
      200: {
        description: "Email message record.",
        content: { "application/json": { schema: selectEmailMessageSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [row] = await db.select().from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
    if (!row) return c.json({ error: "Email not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// PATCH /{id} — mark read / star / move folder
// ---------------------------------------------------------------------------

inboxRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    tags: ["Inbox"],
    summary: "Update an email's read / starred / folder state",
    operationId: "inboxPatch",
    request: {
      params: messageIdParam,
      body: { content: { "application/json": { schema: patchBodySchema } } },
    },
    responses: {
      200: {
        description: "Updated email message.",
        content: { "application/json": { schema: selectEmailMessageSchema } },
      },
      404: {
        description: "Not found.",
        content: { "application/json": { schema: notFoundSchema } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);
    const [row] = await db
      .update(emailMessages)
      .set(body)
      .where(eq(emailMessages.id, id))
      .returning();
    if (!row) return c.json({ error: "Email not found." }, 404);
    return c.json(row, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /seed — idempotent demo data
// ---------------------------------------------------------------------------

inboxRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed",
    tags: ["Inbox"],
    summary: "Seed ~12 realistic demo emails (idempotent — labeled demo data)",
    operationId: "inboxSeed",
    responses: {
      200: {
        description: "Seed result (no-op if the inbox already has messages).",
        content: { "application/json": { schema: seedResponseSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    const existing = await db.select({ id: emailMessages.id }).from(emailMessages).limit(1);
    if (existing.length > 0) {
      return c.json({ seeded: false, message: "Inbox already has messages." });
    }

    const rows = buildSeedMessages();
    // Insert in chunks: each row binds ~14 columns, and D1/SQLite caps a single
    // statement at 100 bound variables. A one-shot insert of all rows
    // (~13 × 14 = 182 params) throws "too many SQL variables", so chunk to keep
    // every statement well under the limit (6 × 14 = 84).
    const CHUNK_SIZE = 6;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await db.insert(emailMessages).values(rows.slice(i, i + CHUNK_SIZE));
    }
    return c.json({ seeded: true, message: "Seeded demo inbox.", count: rows.length });
  },
);

// ---------------------------------------------------------------------------
// Seed data (clearly-labeled demo content)
// ---------------------------------------------------------------------------

/** Epoch Date `mins` minutes (and optional `days`) before now. */
function ago(mins: number, days = 0): Date {
  return new Date(Date.now() - days * 86400000 - mins * 60000);
}

/** Trim a body to a list-pane snippet (mirrors the email() handler logic). */
function snip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

type SeedRow = typeof emailMessages.$inferInsert;

/**
 * Twelve realistic transactional/notification emails spanning folders, read
 * states, stars, and labels — enough to exercise every UI state. The recipient
 * is a stable demo address; in a live deployment real mail replaces these.
 */
function buildSeedMessages(): SeedRow[] {
  const to = "demo@inbox.example.com";
  /** Required fields per seed row; everything else falls back to a sensible default. */
  type SeedInput = Omit<Partial<SeedRow>, "fromAddress" | "subject" | "textBody" | "receivedAt"> & {
    fromAddress: string;
    subject: string;
    textBody: string;
    receivedAt: Date;
  };
  const base = (over: SeedInput): SeedRow => ({
    fromName: null,
    toAddress: to,
    htmlBody: null,
    snippet: snip(over.textBody),
    folder: "inbox",
    labels: [],
    read: false,
    starred: false,
    rawSize: Math.max(512, over.textBody.length + 320),
    ...over,
  });

  return [
    base({
      fromAddress: "security@cloudflare.com",
      fromName: "Cloudflare Security",
      subject: "New login to your Cloudflare account",
      textBody:
        "We noticed a new sign-in to your Cloudflare account from San Francisco, CA (Chrome on macOS). If this was you, no action is needed. If you don't recognize this activity, reset your password and review your account sessions immediately.",
      labels: ["security"],
      receivedAt: ago(8),
    }),
    base({
      fromAddress: "noreply@github.com",
      fromName: "GitHub",
      subject: "[core-template] PR #128 merged into main",
      textBody:
        "Your pull request \"feat: Email Routing inbox showcase\" was merged into main by jmbish04. The deploy workflow has started; you'll get a follow-up once the Worker is live on the edge.",
      htmlBody:
        "<p>Your pull request <strong>feat: Email Routing inbox showcase</strong> was merged into <code>main</code>.</p><p>The deploy workflow has started.</p>",
      labels: ["github", "ci"],
      starred: true,
      receivedAt: ago(42),
    }),
    base({
      fromAddress: "billing@stripe.com",
      fromName: "Stripe",
      subject: "Your receipt for June 2026 — $20.00",
      textBody:
        "Thanks for your payment. Your subscription to Workers Paid renewed for $20.00. This receipt is for your records. You can view invoices anytime from your billing dashboard.",
      labels: ["billing"],
      read: true,
      receivedAt: ago(15, 1),
    }),
    base({
      fromAddress: "team@linear.app",
      fromName: "Linear",
      subject: "3 issues assigned to you this sprint",
      textBody:
        "You have 3 open issues in the current cycle: ENG-204 Wire inbox PATCH endpoint, ENG-205 Mobile single-pane navigation, ENG-211 Empty-state polish. Two are due Friday.",
      labels: ["work"],
      receivedAt: ago(30, 1),
    }),
    base({
      fromAddress: "digest@hackernews.com",
      fromName: "Hacker News Digest",
      subject: "Top stories: edge databases, WASM, and email infra",
      textBody:
        "Today's highlights: \"Building a mailbox on Durable Objects\", \"Why SQLite at the edge changes app architecture\", and a deep dive into MIME parsing pitfalls. 14 comments worth reading.",
      labels: ["newsletter"],
      read: true,
      receivedAt: ago(45, 2),
    }),
    base({
      fromAddress: "jane.doe@acme.dev",
      fromName: "Jane Doe",
      subject: "Re: Demo walkthrough Thursday?",
      textBody:
        "Thursday at 10am works great on my end. I'll send a calendar invite with a link. Could you prepare a short overview of the Email Routing flow — from inbound message to the reading pane? Excited to see it live.",
      labels: ["personal"],
      starred: true,
      receivedAt: ago(55, 2),
    }),
    base({
      fromAddress: "alerts@uptimerobot.com",
      fromName: "UptimeRobot",
      subject: "Monitor UP: core-template-cfw (api.example.com)",
      textBody:
        "Good news — your monitor api.example.com is back UP after 2m 13s of downtime. Average response time is now 84ms. No further action required.",
      labels: ["ops"],
      read: true,
      receivedAt: ago(20, 3),
    }),
    base({
      fromAddress: "no-reply@notion.so",
      fromName: "Notion",
      subject: "Weekly workspace summary",
      textBody:
        "Here's what happened in your workspace this week: 12 pages edited, 4 new comments, and 2 databases updated. Your most active page was \"Inbox design notes\".",
      labels: ["newsletter"],
      read: true,
      folder: "archive",
      receivedAt: ago(10, 5),
    }),
    base({
      fromAddress: "support@vercel.com",
      fromName: "Vercel Support",
      subject: "Ticket #4821 resolved",
      textBody:
        "Your support ticket regarding build cache invalidation has been marked resolved. If you have further questions, just reply to this email and the thread will reopen.",
      labels: ["support"],
      read: true,
      folder: "archive",
      receivedAt: ago(30, 6),
    }),
    base({
      fromAddress: "winner@totally-legit-prize.biz",
      fromName: "Prize Department",
      subject: "Congratulations!!! You have WON a $1000 gift card",
      textBody:
        "Dear winner, you have been selected to receive a $1000 gift card. Click the link below within 24 hours to claim your reward. Act now before it expires!",
      labels: ["spam"],
      folder: "spam",
      receivedAt: ago(5, 1),
    }),
    base({
      fromAddress: "newsletter@producthunt.com",
      fromName: "Product Hunt",
      subject: "🚀 The 5 hottest launches today",
      textBody:
        "Today's top products: an AI changelog generator, a Postgres branching tool, a terminal file manager, an edge cron scheduler, and a privacy-first analytics suite. Tap in before they trend.",
      labels: ["newsletter"],
      receivedAt: ago(12),
    }),
    base({
      fromAddress: "ci@workers.cloudflare.com",
      fromName: "Workers Builds",
      subject: "Deploy succeeded: core-template-cfw-assets-astro-shadcn",
      textBody:
        "Your latest deploy is live. Version 3f9a1c is now serving 100% of traffic across 300+ cities. Bundle size 412kb, cold start 6ms. View the build logs for full details.",
      labels: ["ci", "ops"],
      receivedAt: ago(3),
    }),
  ];
}
