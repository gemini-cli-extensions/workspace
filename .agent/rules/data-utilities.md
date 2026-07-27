# Shared Data Utilities Toolkit

This template ships a single **isomorphic** data/array/object utility toolkit so
agents don't re-implement the same fiddly plumbing on every project. It is built
on [Remeda](https://github.com/remeda/remeda) — a TypeScript-first, tree-shakeable,
data-first utility library that runs unchanged in a Cloudflare Worker and in the
browser bundle.

## Where it lives

| Path | Alias | Use from |
| --- | --- | --- |
| `src/shared/data-utils.ts` | `@/shared/data-utils` | the isomorphic core (edit here) |
| `src/backend/utils/data.ts` | `@/backend/utils/data` | Worker / Hono / Drizzle code |
| `src/frontend/lib/data.ts` | `@/lib/data` | React islands / Astro pages |

The two barrels `export * from "@/shared/data-utils"`, so the symbols are
identical on both surfaces. **Always import from the per-surface barrel**, not
`remeda` directly — that keeps one curated, documented surface.

## What it exposes

1. **Curated Remeda re-exports** (by name): `pipe`, `piped`, `unique`, `uniqueBy`,
   `groupBy`, `partition`, `chunk`, `difference`, `intersection`, `sortBy`, `take`,
   `drop`, `first`, `last`, `shuffle`, `sample`, `range`, `zip`, `sumBy`, `meanBy`,
   `countBy`, `pick`, `omit`, `mapValues`, `clone`, `isDeepEqual`, `prop`,
   `isEmpty`, `isNullish`, `isNonNullish`.
2. **Full Remeda surface** as `R` for the long tail: `R.mapToObj`, `R.setPath`, …
3. **Template helpers** Remeda doesn't ship: `findWhere`, `diffArrays`,
   `toggleInArray`, `moveItem`, `keyBy`, `compact`, `ensureArray`, `deal`,
   `truncate`, `tryParseJson`.

## Usage

```typescript
// backend — @/backend/utils/data
import { diffArrays, groupBy, keyBy } from "@/backend/utils/data";
const { added, removed } = diffArrays(existingRows, incoming, (r) => r.id);

// frontend — @/lib/data
import { sortBy, toggleInArray, R } from "@/lib/data";
const next = toggleInArray(selected, id);
const page = R.pipe(rows, sortBy((r) => -r.createdAt), R.take(20));
```

## Rules for extending it

- Add **genuinely shared** helpers to `src/shared/data-utils.ts` only. Never
  duplicate a helper in the backend and frontend barrels.
- Only add a helper if Remeda doesn't already provide it (search
  https://remedajs.com/docs first). Prefer building on Remeda over reinventing.
- Keep the core isomorphic: no Node-only (`node:fs`) or DOM-only (`window`,
  `document`) APIs in `data-utils.ts`.
- Every exported helper needs JSDoc with `@param`, `@returns`, and `@example`
  (see `.agent/rules/docstrings.md`).
- Keep the curated re-export list in sync with the `/showcase/utilities` demo
  page (`src/frontend/pages/showcase/utilities.astro`) and its island
  (`components/showcase/UtilitiesDemo.tsx`) when you add commonly-used functions.

## Demo

A live, interactive demo (the helpers actually run in-browser) plus the full
reference and links to the Remeda repo/docs live at **`/showcase/utilities`**.
