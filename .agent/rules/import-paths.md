# Import Path Alias Rules

## Always Use Path Aliases

NEVER use relative imports (`../../foo`, `../bar`) for backend code. ALWAYS use the tsconfig path aliases defined in `tsconfig.json`:

- `@/backend/*` → `src/backend/*` (general backend code)
- `@/backend/db/*` → `src/backend/db/*` (database utilities)
- `@/backend/ai/*` → `src/backend/ai/*` (AI/ML features)
- `@/backend/logging/*` → `src/backend/logging/*` (logging utilities)
- `@/backend/modules/*` → `src/backend/modules/*` (feature modules)
- `@db/schemas` → `db/schemas` (Drizzle table schemas)

## Examples

**BAD:**

```typescript
import { sessions } from "../../db/schemas";
import { consultNotebook } from "../../../tools/notebooklm";
```

**GOOD:**

```typescript
import { sessions } from "@db/schemas";
import { consultNotebook } from "@/backend/ai/tools/notebooklm";
```

## Migration Script

If you find files using relative imports, run the automated migration script:

```bash
node scripts/migrate-imports.mjs
```

Use `--dry-run` flag to preview changes without applying them.

## When to Add New Aliases

If you create a new major subdirectory in `src/backend/` that will be frequently imported (e.g., `src/backend/services/`), add a new path alias to `tsconfig.json`:

```json
"paths": {
  "@/backend/services/*": ["src/backend/services/*"]
}
```

Then inform future agents by updating this file and AGENTS.md.

## Rationale

- **Readability:** `@/backend/api/lib/auth` is clearer than `../../../../api/lib/auth`
- **Refactoring:** Moving files doesn't break imports throughout the codebase
- **Consistency:** All agents and developers use the same import style
- **Tooling:** IDEs can autocomplete and navigate path aliases efficiently
