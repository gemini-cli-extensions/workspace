# Google Workspace MCP on Cloudflare Workers — Design

**Date:** 2026-07-25
**Status:** Draft for review
**Repo:** github.com/jmbish04/google-workspace-mcp

## Problem

The current repo is a **Node stdio MCP server** for Google Workspace (11 services:
Docs, Drive, Calendar, Chat, Gmail, Time, People, Slides, Sheets, Tasks). Auth
uses `googleapis` + `google-auth-library` + `keytar` (macOS keychain) + local
file token storage. None of this runs on Cloudflare Workers (native modules,
`fs`, keychain).

We want to:

1. Host the MCP tool as a **remote MCP server on a Cloudflare Worker**.
2. Log in with **Google OAuth**; store the refresh token in **KV** and mint/cache
   access tokens for API calls.
3. Merge in the standard `core-template-cfw-assets-astro-shadcn` Worker template
   so we inherit the full frontend + backend scaffolding.
4. Add frontend pages: setup docs, MCP tools catalog, an **operations log**, and
   a **workspace-asset activity** view — all backed by D1.
5. Keep the template's existing pages; rewire the navbar to this tool and add a
   new landing page.

## Confirmed decisions

- **Scope of first build:** prove the pattern with **4 core services** — Drive,
  Docs, Sheets, Gmail — fully wired (OAuth → KV → REST → D1 logging → MCP). The
  other 7 services follow the same pattern in a later pass.
- **Porting strategy:** **raw REST `fetch`** to Google APIs with a bearer access
  token. Drop `googleapis`/`google-auth-library`/`keytar` entirely on the Worker.
- **Repo merge:** the **template becomes the app base**; the existing
  `workspace-server/` Node code is kept in-tree for reference but is not built by
  the Worker. New Worker-native services live under `src/backend/mcp/`.
- **Auth model:** **multi-user OAuth**, keyed by the Google account `sub`. Any
  user can sign in; their tokens are stored per-`sub` in KV.

## Non-goals (this phase)

- Porting the remaining 7 services (Calendar, Chat, Time, People, Slides, Tasks).
- Deploying to Cloudflare or completing the live Google OAuth consent — these are
  interactive/account-scoped steps the **user** performs; this work delivers the
  code, config, migrations, and setup docs.
- Changing or removing any existing template page.

## Architecture

Single Cloudflare Worker (Astro SSR + Hono API + Durable Objects), deployed with
`[assets]` (not Pages), per the template. New surfaces added on top:

```
Worker fetch router (src/_worker.ts, unchanged routing precedence):
  /agents/*        → Agents SDK (template)
  /auth/google/*   → NEW: Google OAuth login + callback (Hono)
  /mcp             → NEW: remote MCP endpoint (Streamable HTTP)
  /api/*  + docs   → Hono API (template + new routes)
  everything else  → Astro SSR pages (template + new pages)
```

### 1. Google OAuth + KV token store

- **Client credentials** (client_id / client_secret) come from Worker **secrets**,
  sourced from `/Volumes/Projects/gcloud_creds/jmbish04_google_workspace_mcp.json`
  (a standard Google "web" OAuth client). Never committed. Set via
  `wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Login:** `GET /auth/google` → redirect to Google consent (offline access,
  incremental scopes for Drive/Docs/Sheets/Gmail; see `scopes.ts`).
- **Callback:** `GET /auth/google/callback` → exchange code → read `id_token` for
  `sub`, `email` → store in KV:
  - `SESSIONS` binding (reuse existing KV): key `gwsuser:<sub>` →
    `{ sub, email, refresh_token, scopes, updated_at }`.
  - Issue an app session cookie (signed, reuse template `lib/cookies.ts` +
    `lib/crypto.ts`) mapping the browser to `sub` for the frontend pages.
- **Access-token minting:** a `TokenProvider` refreshes `access_token` from the
  stored `refresh_token` on demand and caches it in KV (`gwstok:<sub>`, TTL from
  `expires_in`). All Google REST calls go through it.
- **MCP client auth:** the `/mcp` endpoint authenticates the caller to a `sub`.
  For the first slice we use a **bearer token = the app session token** issued at
  login (documented in the setup page: "sign in, copy your MCP token"). Full
  MCP-native OAuth (dynamic client registration) is noted as a follow-up; it is
  not required to prove the pattern.

### 2. MCP server (`src/backend/mcp/`)

- `server.ts` — builds an MCP server (`@modelcontextprotocol/sdk`) over
  **Streamable HTTP** transport, mounted at `/mcp`. Resolves the caller's `sub`,
  loads their `TokenProvider`, registers tools.
- `services/` — Workers-native rewrites, each a thin class over `fetch`:
  - `DriveService` — list/search/get/create files (Drive v3 REST).
  - `DocsService` — get/create/batchUpdate (Docs v1 REST).
  - `SheetsService` — values get/update/append, create (Sheets v4 REST).
  - `GmailService` — list/get/send/draft (Gmail v1 REST).
  Tool **shapes and Zod schemas are ported from the existing `workspace-server`
  service definitions** so tool names/args stay stable.
- `tools.ts` — registers the tool set; each tool wraps its service call in the
  **logging middleware** (below) so every invocation and asset touch is recorded.

### 3. D1 logging

- **Operations log:** reuse the template's existing `mcp_logs` table
  (`server_name="google-workspace"`, `tool_name`, sanitized `request`/`response`,
  `success`, `latency_ms`, `created_at`). Powers the operations page.
- **Asset activity:** two **new** Drizzle tables under
  `src/backend/db/schemas/`:
  - `workspace_assets` — `id`, `user_sub`, `asset_type`
    (`doc|sheet|drive|gmail`), `google_id`, `title`, `url`, `first_seen_at`,
    `last_touched_at`. Unique on `(user_sub, asset_type, google_id)`.
  - `asset_events` — `id`, `asset_id` (FK), `user_sub`, `action`
    (`read|create|update|modify|delete`), `detail` (JSON: what changed / what was
    created), `tool_name`, `created_at`.
- A `logAssetTouch()` helper is called from each service after a successful call:
  upserts the asset row and appends an event. `db:generate` produces the
  migration under `drizzle/`.

### 4. Frontend pages (Astro SSR, read D1)

New pages, all under a `/gws` prefix; template pages untouched:

- `/gws` — **new landing page** for this tool (what it is, sign-in CTA, status).
- `/gws/setup` — setup + deployment docs (OAuth client setup, `wrangler secret`
  steps, KV/D1 provisioning, how to connect an MCP client).
- `/gws/tools` — MCP tools catalog (name, description, args) generated from the
  registered tool definitions.
- `/gws/operations` — operations log table from `mcp_logs` (tool, status,
  latency, time; filterable).
- `/gws/assets` — workspace-asset activity: assets touched + per-asset event
  timeline (action, detail) from `workspace_assets` + `asset_events`.
- Backend routes to feed them: `GET /api/gws/operations`, `/api/gws/assets`,
  `/api/gws/tools` (Hono, added under `src/backend/api/routes/`).

### 5. Navbar + landing

- Edit `siteConfig` (`src/frontend/lib/config`) to add a **"Google Workspace"**
  nav group linking the 5 new pages, and point the primary landing at `/gws`
  (keep the template landing reachable, e.g. `/template`). Existing template nav
  entries preserved.

## Data flow (one tool call)

```
MCP client → POST /mcp (bearer=session token)
  → resolve sub → TokenProvider.access(sub) [KV: mint/cache]
  → Service.fetch(googleREST, Bearer access_token)
  → on success: logAssetTouch() [D1 upsert asset + event]
  → always: mcp_logs insert (tool, latency, success)
  → MCP result back to client
```

## Toolchain note

The template uses **pnpm + Astro + oxlint + drizzle-kit**; the current repo uses
npm workspaces + jest + esbuild for the Node server. On merge we **adopt the
template's toolchain at the repo root**. The existing `workspace-server/` keeps
its own `package.json` for reference but is excluded from the Worker build.

## Testing

- **Service unit tests** (Vitest, template style): mock `fetch`, assert each
  service builds the right Google REST request and parses responses. Port the
  intent of the existing jest service tests for the 4 services.
- **Logging test:** a tool call inserts one `mcp_logs` row and one `asset_events`
  row; asset upsert is idempotent on repeat.
- **Auth test:** callback stores refresh token under `gwsuser:<sub>`;
  `TokenProvider` refreshes and caches.
- No live Google calls in tests.

## Risks / open points

- **MCP client auth** via session-token bearer is a pragmatic first cut; a
  provider that speaks MCP's OAuth (dynamic registration) is the eventual target.
  Flagged, not built this phase.
- **Template size:** it ships many Durable Objects / AI agents unrelated to this
  tool. We keep them (per "leave existing pages") but they add deploy surface;
  acceptable for now.
- **Scope creep guard:** only 4 services this phase. Remaining 7 are a documented
  follow-up, same pattern.
