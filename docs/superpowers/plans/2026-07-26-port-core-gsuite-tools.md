# Port core-gsuite-tools → google-workspace-mcp (Agent Platform)

Merge the full Agents-SDK platform from `github.com/jmbish04/core-gsuite-tools`
into this worker: reintroduce Durable Objects, port the richly-typed `google/`
client layer, per-service AIChat agents + orchestrator, assistant-ui chat, tasks
scheduler, skills, and RAG. Keep everything we already have (78 REST tools, MCP
OAuth, DWD, template registry, comments/changes/events).

Source clone: `…/scratchpad/core-gsuite-tools` (same template lineage).

## Reconciliation decisions (the seams)

1. **DB layout — keep OURS.** Ours is `src/backend/db/schemas/*` with
   `@db/schemas` → `src/backend/db/schema` (barrel). Theirs is a top-level
   `db/schemas/<domain>/` tree. Port their schema files INTO
   `src/backend/db/schemas/` and re-export from our barrel. Their code imports
   `@db/schemas` (same alias) so it resolves to our barrel unchanged as long as
   the exported names match.
2. **Account/token model — adopt THEIRS as the unified seam.** Their
   `getGoogleAccessToken(env, account, scopes)` (account = email or the aliases
   `workspace`/`personal`; auto-routes DWD vs OAuth) is cleaner and is what the
   `google/` layer + agents build on. Port `auth/provider.ts` + `oauth-google.ts`
   + `lib/google-auth.ts` (SA JWT) — BUT bridge the DWD path to our existing
   `mcp/dwd.ts` (jose) rather than duplicating the signer. Our existing
   `mcp/tokenProvider.ts` (sub-keyed KV OAuth for the /mcp tools) stays; the two
   coexist (user chose "pull both"). Later: our 78 tools' `dwd:<email>` refs and
   their `account` strings converge on `getGoogleAccessToken`.
3. **Secrets** — support their names: `GOOGLE_OAUTH_CLIENT_ID/SECRET`,
   `GOOGLE_USER_TO_IMPERSONATE`, `GOOGLE_PERSONAL_ACCOUNT_EMAIL`,
   `GOOGLE_WORKSPACE_ACCOUNT_EMAIL`, plus the existing `GOOGLE_CREDS_SA_*` +
   `GOOGLE_CLIENT_ID/SECRET`. Add to `wrangler.jsonc` + `.dev.vars.example`.
4. **Bindings** — re-add to `wrangler.jsonc`: `ai` (AI), `durable_objects`
   (8 agents), fresh `migrations` (DO `new_sqlite_classes`), `worker_loaders`
   (skills runner), `vectorize` (3 RAG indexes), `CACHE` KV. Keep existing
   `DB`, `SESSIONS`, `ASSETS`, secrets-store.
5. **`_worker.ts`** — re-add the `/agents/*` + WS branch (`routeAgentRequest`,
   auth-gated) and re-export the 8 DO classes + the `GsuiteService` RPC
   entrypoint, alongside our existing `/mcp` + `/auth/google` + Hono + Astro.
6. **Deps** — add: `agents`, `@cloudflare/ai-chat`, `ai`, `@ai-sdk/react`,
   `workers-ai-provider`, `@assistant-ui/react`(+`-ai-sdk`,`-markdown`),
   `mustache`, `notebooklm-sdk`, `zustand`, `slate*`, `radix-ui`, `remark-gfm`,
   `zod-to-json-schema`. Pin to the source repo's versions.

## Phases (each ends tsc + build green)

- **Phase 1 — Google layer + unified auth foundation.** Port `src/backend/google/*`
  (8 clients + `core/{client,ids,markdown}`), `src/backend/auth/*`,
  `lib/google-auth.ts` + `lib/crypto` additions; add the `googleAccounts` (+ any
  auth) schema to our barrel + migration; add the new secrets/vars to wrangler +
  `.dev.vars.example`; bridge DWD to `mcp/dwd.ts`. Build green (NO agents yet).
- **Phase 2 — Durable Object agents.** Port `ai/{providers,models}` + `ai/agents/*`
  (base-gsuite-agent, shared, 7 specialists + orchestrator) + `ai/tools` + `rpc/` +
  `shims/`; add their AIChat D1 schemas (threads, messages, tasks, task_events,
  emailsIndexed, createdDocs, …); add DO bindings + migrations + AI + worker_loaders
  to wrangler; wire `_worker.ts` (`routeAgentRequest` + DO re-exports + RPC). Add
  deps. Build green.
- **Phase 3 — Chat + tasks frontend.** Port assistant-ui components + `chat.astro`,
  `tasks/*`, `accounts.astro`, `health.astro`, chat/tasks API routes, `d1-mirror`;
  nav entries. Build green.
- **Phase 4 — RAG + skills.** Port `ai/rag`, Vectorize bindings, skills
  (`SKILL.md` per agent) + skill runner; embeddings on index. Build green.
- **Phase 5 — Verify + deploy.** Provision the new resources (CACHE KV, 3 Vectorize
  indexes), migrate:remote, deploy, smoke-test agents + chat + tasks. Security
  review of the auth bridge.

## Non-negotiables preserved

Our stateless `/mcp` (78 tools, OAuth 2.1, DWD `as_user`), template registry,
`/gws/*` pages, comments/changes/events, drive webhook — all stay working.
