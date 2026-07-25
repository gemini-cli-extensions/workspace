/**
 * @fileoverview Isomorphic data/array/object utility toolkit shared by the
 * Cloudflare Worker backend and the Astro/React frontend.
 *
 * This is the template's "Swiss-army-knife" for the boring-but-fiddly data
 * plumbing every project re-implements: find an item in an array, diff two
 * arrays, group/index records, dedupe, toggle membership, reorder, etc.
 *
 * It is built on {@link https://github.com/remeda/remeda | Remeda} — a
 * TypeScript-first, data-first utility library that is fully tree-shakeable
 * and isomorphic (it ships ESM + CJS and uses no Node- or DOM-specific
 * globals), so the exact same module runs inside a Worker and in the browser
 * bundle.
 *
 * ## Two ways to use it
 *
 * 1. **Curated re-exports** — the most common Remeda functions are re-exported
 *    by name so callers can `import { groupBy, unique } from "@/shared/data-utils"`.
 * 2. **Full namespace** — the entire Remeda surface is available as `R` for the
 *    long tail: `import { R } from "@/shared/data-utils"; R.pipe(...)`.
 * 3. **Template helpers** — extra functions (prefixed conceptually as
 *    "things Remeda doesn't ship") like {@link diffArrays}, {@link findWhere},
 *    {@link toggleInArray}, {@link moveItem}, {@link keyBy}, {@link compact}.
 *
 * Prefer importing from the per-surface barrels rather than this path directly:
 * - Backend: `import { ... } from "@/backend/utils/data"`
 * - Frontend: `import { ... } from "@/lib/data"`
 *
 * Both barrels re-export everything here, so the symbols are identical.
 *
 * @see https://github.com/remeda/remeda
 * @see https://remedajs.com/docs
 */

import * as R from "remeda";

/**
 * The full Remeda namespace, for any function not covered by the curated
 * re-exports below. Tree-shakes per-property in production bundles.
 *
 * @example
 * import { R } from "@/shared/data-utils";
 * const top3 = R.pipe([5, 1, 4, 2, 3], R.sortBy((n) => n), R.take(3)); // [1, 2, 3]
 */
export { R };

/**
 * Curated, high-frequency Remeda functions re-exported by name. These are the
 * stable building blocks most code reaches for. Anything else is on `R`.
 *
 * @see https://remedajs.com/docs for the full, searchable reference.
 */
export {
  // composition
  pipe,
  piped,
  // arrays
  unique,
  uniqueBy,
  groupBy,
  partition,
  chunk,
  difference,
  intersection,
  sortBy,
  take,
  drop,
  first,
  last,
  shuffle,
  sample,
  range,
  zip,
  // aggregation
  sumBy,
  meanBy,
  countBy,
  // objects
  pick,
  omit,
  mapValues,
  clone,
  isDeepEqual,
  prop,
  // guards
  isEmpty,
  isNullish,
  isNonNullish,
} from "remeda";

/** A predicate over a single array element. */
export type Predicate<T> = (value: T, index: number) => boolean;

/** Anything that can be used to read a stable key off a record. */
export type KeySelector<T> = (item: T) => PropertyKey;

/**
 * Find the first element matching a partial "shape" — the ergonomic
 * `find({ status: "done" })` pattern without writing the arrow function.
 * Matching is a shallow strict-equality check on each provided key.
 *
 * @param items - The array to search.
 * @param shape - A partial object; an element matches when every listed key is
 *   strictly equal on the element.
 * @returns The first matching element, or `undefined` if none match.
 * @example
 * findWhere(tasks, { status: "done", assignee: "ada" });
 */
export function findWhere<T extends object>(items: readonly T[], shape: Partial<T>): T | undefined {
  const keys = Object.keys(shape) as (keyof T)[];
  return items.find((item) => item != null && keys.every((k) => item[k] === shape[k]));
}

/** The structural result of comparing two arrays. */
export type ArrayDiff<T> = {
  /** Items present in `next` but not in `prev`. */
  added: T[];
  /** Items present in `prev` but not in `next`. */
  removed: T[];
  /** Items present in both. */
  common: T[];
};

/**
 * Diff two arrays into `{ added, removed, common }`. Order follows `next` for
 * `added`/`common` and `prev` for `removed`. By default identity is reference/
 * value equality; pass `keyFn` to diff objects by a stable key.
 *
 * @param prev - The "before" array.
 * @param next - The "after" array.
 * @param keyFn - Optional key selector for comparing objects by identity.
 * @returns The added, removed, and common partitions.
 * @example
 * diffArrays([1, 2, 3], [2, 3, 4]); // { added: [4], removed: [1], common: [2, 3] }
 * diffArrays(oldUsers, newUsers, (u) => u.id);
 */
export function diffArrays<T>(
  prev: readonly T[],
  next: readonly T[],
  keyFn?: KeySelector<T>,
): ArrayDiff<T> {
  const key = keyFn ?? ((x: T) => x as unknown as PropertyKey);
  const prevKeys = new Set(prev.map(key));
  const nextKeys = new Set(next.map(key));
  return {
    added: next.filter((item) => !prevKeys.has(key(item))),
    removed: prev.filter((item) => !nextKeys.has(key(item))),
    common: next.filter((item) => prevKeys.has(key(item))),
  };
}

/**
 * Return a new array with `value` toggled: appended if absent, removed if
 * present. Great for checkbox/tag/selection state. Never mutates the input.
 *
 * @param items - The source array.
 * @param value - The value to toggle.
 * @param keyFn - Optional key selector for object membership.
 * @returns A new array with `value` added or removed.
 * @example
 * toggleInArray(["a", "b"], "b"); // ["a"]
 * toggleInArray(["a"], "b");      // ["a", "b"]
 */
export function toggleInArray<T>(items: readonly T[], value: T, keyFn?: KeySelector<T>): T[] {
  const key = keyFn ?? ((x: T) => x as unknown as PropertyKey);
  const target = key(value);
  const exists = items.some((item) => key(item) === target);
  return exists ? items.filter((item) => key(item) !== target) : [...items, value];
}

/**
 * Move the element at `from` to index `to`, returning a new array. Indices are
 * clamped into range, so it is safe with drag-and-drop deltas. Never mutates.
 *
 * @param items - The source array.
 * @param from - Source index.
 * @param to - Destination index.
 * @returns A new, reordered array.
 * @example
 * moveItem(["a", "b", "c"], 0, 2); // ["b", "c", "a"]
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));
  const next = [...items];
  const [moved] = next.splice(clamp(from), 1);
  if (moved === undefined && next.length === items.length) return next;
  next.splice(clamp(to), 0, moved as T);
  return next;
}

/**
 * Index an array into a `Record` keyed by `keyFn`. Later items win on key
 * collisions. The object-shaped companion to grouping.
 *
 * @param items - The array to index.
 * @param keyFn - Selector returning the key for each item.
 * @returns A record from key to the last item with that key.
 * @example
 * keyBy(users, (u) => u.id); // { "1": user1, "2": user2 }
 */
export function keyBy<T>(items: readonly T[], keyFn: KeySelector<T>): Record<PropertyKey, T> {
  const out: Record<PropertyKey, T> = {};
  for (const item of items) out[keyFn(item)] = item;
  return out;
}

/**
 * Drop `null` and `undefined` from an array, narrowing the element type. Other
 * falsy values (`0`, `""`, `false`) are kept.
 *
 * @param items - The array to compact.
 * @returns A new array without nullish entries.
 * @example
 * compact([1, null, 2, undefined, 0]); // [1, 2, 0]
 */
export function compact<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Wrap a value in an array unless it already is one. `null`/`undefined` become
 * an empty array. Handy for normalizing "one or many" API inputs.
 *
 * @param value - A single value, an array, or nullish.
 * @returns Always an array.
 * @example
 * ensureArray("a");        // ["a"]
 * ensureArray(["a", "b"]); // ["a", "b"]
 * ensureArray(undefined);  // []
 */
export function ensureArray<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? [...value] : [value as T];
}

/**
 * Split an array into evenly distributed buckets (the dual of {@link chunk},
 * which fixes bucket *size*). Useful for column layouts or fan-out batching.
 *
 * @param items - The array to deal out.
 * @param buckets - Number of buckets (>= 1).
 * @returns An array of `buckets` arrays, round-robin filled.
 * @example
 * deal([1, 2, 3, 4, 5], 2); // [[1, 3, 5], [2, 4]]
 */
export function deal<T>(items: readonly T[], buckets: number): T[][] {
  const n = Number.isFinite(buckets) && buckets > 0 ? Math.floor(buckets) : 1;
  const out: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => out[i % n].push(item));
  return out;
}

/**
 * Truncate a string to `max` characters, appending an ellipsis when cut. Counts
 * the ellipsis toward the limit so output never exceeds `max`.
 *
 * @param text - The input string.
 * @param max - Maximum output length including the ellipsis.
 * @param ellipsis - The trailing marker (default `"…"`).
 * @returns The original or truncated string.
 * @example
 * truncate("hello world", 8); // "hello w…"
 */
export function truncate(text: string, max: number, ellipsis = "…"): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - ellipsis.length)) + ellipsis;
}

/**
 * Parse JSON without throwing, returning a typed fallback on failure. The
 * everyday safe-parse for untrusted strings, KV reads, and request bodies.
 *
 * @param raw - The string to parse (or any non-string, which yields fallback).
 * @param fallback - Value returned when parsing fails.
 * @returns The parsed value or `fallback`.
 * @example
 * tryParseJson<{ ok: boolean }>(text, { ok: false });
 */
export function tryParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
