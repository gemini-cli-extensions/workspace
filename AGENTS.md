# AGENTS

- At the start of every turn, use the `cloudflare-docs` MCP server to verify Cloudflare assumptions, architecture, and deprecations before writing or changing code.
- Review and apply the best practices in `.agents/skills/` and `.github/skills/` before implementing changes.
- Build new views as React islands on top of the existing Astro + Shadcn foundation, using the dark/moody theme system and subtle contrast instead of heavy borders.
- Enforce Zod validation on backend endpoints, expose OpenAPI v3.1.0 at `/openapi.json`, `/swagger`, and `/scalar`, and keep endpoints strongly typed.
- Every new service or view must expose `/health` and emit structured logs/metrics into the mirrored D1 logging layer.
# Agent Workspace Overview

Welcome to the `core-template-cfw-assets-astro-shadcn` template. This is a unified full-stack template combining Cloudflare Workers (Backend & Assets) with Astro and React + Shadcn/ui (Frontend).

## Core Architecture

- **Backend:** Cloudflare Workers, Hono (Routing), D1 (Database with Drizzle ORM).
- **Frontend:** Astro (SSR/Static Hybrid), React (Interactive Islands), Tailwind CSS, Shadcn/ui.
- **Deployment:** Deployed using Cloudflare Workers Assets via `wrangler.jsonc`.

## Mandatory Agent Directives

This repository relies heavily on AI agents for rapid prototyping and feature generation. If you are an AI agent, you must strictly follow these directives:

1. **Read Startup Rules:** Immediately review `.agent/rules/startup.md` before writing any code. It contains critical instructions for your first steps.
2. **Clean State Execution:** The template's default UI has been deliberately wiped clean and replaced with a temporary template-routing warning. Build the user's requested frontend directly from `src/frontend/pages/index.astro` or the route structure you introduce, and keep the shared header available on every page.
3. **Environment Strictness:** We use `worker-configuration.d.ts` for Cloudflare types. Never manually define `interface Bindings`. Always use `Bindings: Env` on Hono applications.
4. **Runtime Baseline:** Use Node.js 22+ when working with Wrangler or regenerating `worker-configuration.d.ts`.
5. **Package Management:** Default to `pnpm` for package installation and script execution.
6. **Authentication Rule:** Use the Secrets Store binding `WORKER_API_KEY` for protected API authentication and session creation. Do not add a `users` table back into this template.
7. **Schema Layout:** Keep Drizzle tables under `db/schemas/${useCase}/${tableName}.ts` and use Drizzle-Zod for API typing where table schemas are involved.
8. **Modularization:** Keep new code modular. Split helpers, components, routes, and persistence code by concern instead of adding large multipurpose files.
9. **Template Replacement Prompt:** If the user gives you the landing-page replacement prompt, replace the starter frontend, preserve the shared header, and keep the dynamic docs pointers to `/openapi.json`, `/swagger`, and `/scaler`.
10. **Frontend Errors:** Never use Chrome/browser alerts. Route every frontend error through the centralized frontend error handling utility and keep the copy-to-clipboard success/error feedback within shadcn components.
11. **Dependency Hygiene:** Follow `.agent/rules/dependency-maintenance.md` whenever dependencies, Wrangler, or generated Cloudflare types may be stale.
12. **Architecture Rules:** Follow `.agent/rules/architecture.md` and `.agent/rules/frontend-error-handling.md` for auth, modularization, and frontend error UX conventions.
13. **CI Ownership:** If GitHub Actions or Cloudflare PR deployment checks fail because of frozen lockfiles, outdated dependencies, or stale Wrangler types, fix them in the same turn by refreshing pnpm dependencies and re-running validation before handing work back.
14. **Import Path Aliases:** ALWAYS use tsconfig path aliases (`@/backend/*`, `@/backend/db/*`, `@/backend/ai/*`, etc.) for all backend imports. Never use relative imports (`../../foo`). Run `node scripts/migrate-imports.mjs` to convert existing relative imports. See `.agent/rules/import-paths.md` for details.
15. **Comprehensive Documentation:** Every backend TypeScript file must have a file-level JSDoc comment explaining its purpose, key features, and usage. Every exported function/class must have JSDoc with `@param`, `@returns`, `@throws`, and `@example` tags where applicable. See `.agent/rules/docstrings.md` for standards.
16. **Agent Meta-Maintenance:** Update `AGENTS.md` and `.agent/rules` files when you add/modify features that future agents should know about. Keep rules concise (<12,000 chars per file), avoid duplication, and resolve conflicts. See `.agent/rules/meta-maintenance.md` for guidelines.
17. **Shared Data Toolkit:** This template ships an isomorphic data/array/object utility toolkit built on [Remeda](https://github.com/remeda/remeda). Reach for it before hand-rolling array/object plumbing. Import from `@/backend/utils/data` on the Worker side and `@/lib/data` on the frontend — both re-export the same isomorphic core at `@/shared/data-utils`. It exposes curated Remeda re-exports (`pipe`, `groupBy`, `unique`, `sortBy`, `pick`, `difference`, …), the full Remeda surface as `R`, and template helpers Remeda doesn't ship (`diffArrays`, `findWhere`, `toggleInArray`, `moveItem`, `keyBy`, `compact`, `ensureArray`, `deal`, `truncate`, `tryParseJson`). Add genuinely-shared helpers to the shared core (never duplicate per-surface). Live demo + docs at `/showcase/utilities`. See `.agent/rules/data-utilities.md`.

## Template App Surface (reference implementation)

This template ships a real, running app so new projects inherit working patterns
(extend or delete the pieces you don't need). All of it is wired to D1 via Hono;
no mock data.

- **CRITICAL — Agents SDK islands must mount `client:only="react"`, never `client:load`.**
  Any React island using `useAgent`/`useAgentChat`/assistant-ui (the
  agents/PartySocket stack) is browser-only. `client:load` server-renders it
  first, and `useAgent`'s `useMemo` hits a null React dispatcher in the SSR
  worker → `Cannot read properties of null (reading 'useMemo')`, which fails the
  whole route. This was the original "chat not working" bug. Plain fetch-based
  islands (inbox, dashboard, tasks) may use `client:load`. Note: the `ai` binding
  is remote-only, so `wrangler.jsonc` sets `"ai": { "binding": "AI", "remote": true }`.
- **Pages** (Astro SSR + React islands, Monolith dark theme):
  - `/dashboard` — admin dashboard: radial-gauge KPIs + grouped-bar, interactive
    donut, and polished time-series recharts (all OKLCH palette via `ui/chart.tsx`)
    with search + range + status filters. Components under `components/dashboard/`.
  - `/projects`, `/tasks/board` (kanban), `/tasks` (table with **faceted
    multi-select chip filters** — `components/tasks/FacetFilter.tsx`), `/tasks/[id]`.
    Task/kanban/project cards open preview modals. Components under `components/tasks/`.
  - `/notes` — **PlateJS** rich-text editor (`components/notes/`); bodies persist as
    a versioned `{v,format:"plate",value}` JSON envelope in the team-notes `body`
    column, with legacy plain-text fallback.
  - `/inbox` — two-pane inbox backed by Cloudflare **Email Routing**: the Worker
    `email()` handler (`backend/email/inbound.ts`) stores inbound mail in the
    `email_messages` D1 table; UI under `components/inbox/`, API at `/api/inbox`.
  - `/chat` + `/showcase/{code-mode,browser-hitl,multi-agent,workflows,artifacts,
    mcp,thinking,skills,features}` — every Agents page mounts a LIVE interactive
    island (`components/showcase/`) wired to its Durable Object, not a static doc.
  - `/docs` (docs home, bound to `/api/docs/*`) + `/playbook` — documentation using
    the Shiki-backed `ui/code-block.tsx` (kibo-ui-style, base-ui, copy + tabs).
  - `/settings/{preferences,notifications,webhooks,activity,advanced}` (shared
    sub-nav) and `/notifications` (realtime). Components under `components/settings/`.
- **Schemas** live in `db/schemas/{projects,tasks,stats,settings,notifications}/`
  (drizzle-zod + `*_TABLE_DESCRIPTION`/`*_COLUMN_DESCRIPTIONS` for `/docs`).
- **APIs**: `/api/{projects,tasks,team-notes,settings,webhooks,activity,
  notifications,dashboard}` — CRUD + `?q=` search + filters + pagination. The
  dashboard exposes `/stats`, `/charts`, `/insights` (Workers AI via
  `ai/providers/ai-sdk.ts#getChatModel`).
- **Agents (Durable Objects, all bound + functional)**: `ChatBroker` (assistant-ui
  chat), `OrchestratorAgent` + `ResearcherAgent` + `CoderAgent` (real `getAgentByName`
  RPC delegation), `CodeModeAgent` (executes via `WORKER_LOADERS`), `WorkflowsAgent`
  (live progress via `setState`), `BrowserHitlAgent` (`MYBROWSER`; HITL approval gate),
  `McpAgent` (tool catalog + `callTool`), `ThinkingAgent` (streams reasoning then text),
  `SkillsAgent` (skills registry), `ArtifactAgent` (SQLite versioning), `NotificationsAgent`.
  Invoke via RPC (`getAgentByName`) or `@callable` + client `agent.call` — NEVER
  `stub.fetch`. Migrations are additive (v1→v3); never rewrite a shipped tag.
- **Realtime**: the `NotificationsAgent` Durable Object (`NOTIFICATIONS_AGENT`,
  instance `"global"`) syncs notification state over WebSocket. The client island
  is `components/NotificationsFeed.tsx` (`useAgent` + `onStateUpdate`); REST
  mutations proxy to it via `getAgentByName` (never `stub.fetch`).
- **Shared frontend helpers**: `lib/api.ts` (`apiGet`/`apiSend`/`ApiError`) and
  `lib/format.ts` (`relativeTime`/`shortDate`/`compactNumber`). Charts use the
  shadcn `ui/chart.tsx` wrapper + the OKLCH `--chart-1..5` palette in `global.css`.
- **Shared data toolkit** (isomorphic, Remeda-backed): one core at
  `shared/data-utils.ts`, re-exported by `lib/data.ts` (frontend, `@/lib/data`)
  and `backend/utils/data.ts` (`@/backend/utils/data`). Curated Remeda re-exports
  + full `R` namespace + template helpers (`diffArrays`, `findWhere`,
  `toggleInArray`, `moveItem`, `keyBy`, `compact`, `ensureArray`, `deal`,
  `truncate`, `tryParseJson`). Live demo: `/showcase/utilities`.
- **Seed demo data**: `POST /api/seed` (idempotent). Locally:
  `pnpm run migrate:local` then `curl -X POST http://localhost:8787/api/seed`.
- **SSR note**: `src/_worker.ts` exports `start(manifest)` + `createExports()`;
  page requests are rendered via `@astrojs/cloudflare/handler#handle`. Do NOT
  revert this to a bare `env.ASSETS.fetch()` fallback — that 404s every SSR page.
- **Auth**: signed session cookie only (no `users`/`sessions` table). Auth gates
  `/api/admin/*`; the feature APIs are intentionally open so the template runs
  out of the box. Tighten before production.
