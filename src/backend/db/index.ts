/**
 * @fileoverview Database utilities and Drizzle ORM initialization
 *
 * This module provides a centralized database client factory for use across
 * the backend, ensuring consistent database access patterns.
 *
 * @example
 * ```typescript
 * const db = getDb(env);
 * const results = await db.select().from(users);
 * ```
 */

import type { DrizzleD1Database } from "drizzle-orm/d1";

import { drizzle } from "drizzle-orm/d1";

/**
 * Creates and returns a Drizzle ORM database client for D1.
 *
 * @param env - The Cloudflare Workers environment bindings containing the D1 database binding
 * @returns A configured Drizzle ORM client for querying the D1 database
 *
 * @example
 * ```typescript
 * // In a Durable Object
 * const db = getDb(this.env);
 * const threads = await db.select().from(threadsTable);
 *
 * // In a Hono route
 * const db = getDb(c.env);
 * const messages = await db.select().from(messagesTable);
 * ```
 */
export function getDb(env: Env): DrizzleD1Database {
  return drizzle(env.DB);
}
