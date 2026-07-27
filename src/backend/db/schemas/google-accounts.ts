/**
 * @file src/backend/db/schemas/google-accounts.ts
 * @description Drizzle schema for the `google_accounts` table — the dynamic
 * multi-account registry. Each row records a Google identity the worker can act
 * as, regardless of mechanism:
 *
 *   - `kind: "workspace_dwd"` — a Workspace user reached via the service
 *     account's Domain-Wide Delegation (no stored refresh token).
 *   - `kind: "oauth"`         — any Google account (consumer or external)
 *     authorized through the OAuth2 consent flow (refresh token in KV).
 *
 * The primary key is the account `email`; rows are upserted by the OAuth
 * callback and by default-account selection. The synthetic `workspace` (DWD
 * primary impersonation) account is surfaced by the API even when it has no row.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Registry of authorized Google accounts.
 * `email` is the natural primary key (one row per identity).
 */
export const googleAccounts = sqliteTable("google_accounts", {
  /** Account email address — natural primary key. */
  email: text("email").primaryKey(),
  /** Auth mechanism: "workspace_dwd" (DWD impersonation) or "oauth" (refresh token). */
  kind: text("kind").notNull(),
  /** Human-readable label shown in the frontend account picker. */
  label: text("label").notNull(),
  /** Whether this account is the default selection (integer boolean 0/1). */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  /** Lifecycle status: "active" | "revoked" | "pending". */
  status: text("status").notNull().default("active"),
  /** JSON-encoded array of granted OAuth scopes (nullable). */
  scopesJson: text("scopes_json", { mode: "json" }),
  /** Unix-epoch timestamp of when consent/authorization completed (nullable). */
  authorizedAt: integer("authorized_at", { mode: "timestamp" }),
  /** Unix-epoch timestamp of row creation. */
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  /** Unix-epoch timestamp of the last update. */
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Zod schema for selecting rows from `google_accounts`. */
export const selectGoogleAccountSchema = createSelectSchema(googleAccounts);
/** Zod schema for inserting rows into `google_accounts`. */
export const insertGoogleAccountSchema = createInsertSchema(googleAccounts);
