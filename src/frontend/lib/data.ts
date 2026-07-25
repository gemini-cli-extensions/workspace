/**
 * @fileoverview Frontend entry point for the shared, isomorphic data toolkit.
 *
 * React islands and Astro pages should import data/array/object helpers here:
 *
 * @example
 * import { sortBy, toggleInArray, diffArrays, R } from "@/lib/data";
 *
 * // selection state in a list/checkbox island
 * const next = toggleInArray(selectedIds, id);
 * // stable column ordering
 * const ordered = sortBy(rows, (r) => r.createdAt);
 *
 * Everything is re-exported verbatim from `@/shared/data-utils`, which is built
 * on Remeda and is fully isomorphic — the same symbols are available on the
 * backend via `@/backend/utils/data`. Add genuinely-shared helpers to the
 * shared module; keep only frontend-only helpers in this file.
 *
 * @see https://github.com/remeda/remeda
 */

export * from "@/shared/data-utils";
