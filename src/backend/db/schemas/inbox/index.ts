/**
 * @fileoverview Barrel for the inbox (Email Routing) schema domain.
 *
 * Re-exported by the schemas root barrel (`src/backend/db/schema.ts`) so the
 * `email_messages` table, its drizzle-zod schemas, inferred types, and the
 * documentation constants are available via `@/backend/db/schema`.
 */

export * from "./messages";
