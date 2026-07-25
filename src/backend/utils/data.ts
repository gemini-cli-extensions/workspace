/**
 * @fileoverview Backend entry point for the shared, isomorphic data toolkit.
 *
 * Worker/Hono/Drizzle code should import data/array/object helpers from here:
 *
 * @example
 * import { groupBy, diffArrays, keyBy, R } from "@/backend/utils/data";
 *
 * const byProject = groupBy(tasks, (t) => t.projectId);
 * const delta = diffArrays(existingRows, incomingRows, (r) => r.id);
 *
 * Everything is re-exported verbatim from `@/shared/data-utils`, which is built
 * on Remeda and is fully isomorphic — the same symbols are available on the
 * frontend via `@/lib/data`. Keep new genuinely-shared helpers in the shared
 * module so both surfaces stay in sync; only add backend-only helpers here.
 *
 * @see https://github.com/remeda/remeda
 */

export * from "@/shared/data-utils";
