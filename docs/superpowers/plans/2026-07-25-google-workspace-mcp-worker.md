# Google Workspace MCP on Cloudflare Worker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host the Google Workspace MCP as a remote MCP server on a Cloudflare Worker, with Google OAuth login (tokens in KV), 4 services ported to raw REST fetch, D1 operation + asset-activity logging, and frontend pages, built on the `core-template-cfw-assets-astro-shadcn` template stripped of all Durable Objects.

**Architecture:** The cloudflare-jedi template becomes the app base (Astro SSR + Hono API + Drizzle D1 + KV), with every agent/showcase Durable Object and its dependent pages removed. A stateless MCP endpoint at `/mcp` and Google OAuth routes at `/auth/google/*` are added to the Worker fetch handler. Each MCP tool call resolves the caller's Google `sub`, mints a cached access token from KV, calls Google REST APIs via `fetch`, and records the operation (`mcp_logs`) and any asset touch (`workspace_assets` + `asset_events`) in D1. New `/gws/*` Astro pages read that D1 data.

**Tech Stack:** Cloudflare Workers, Astro 5 SSR + React islands + shadcn/ui, Hono + `@hono/zod-openapi`, Drizzle ORM + D1, Workers KV, `@modelcontextprotocol/sdk` (Streamable HTTP, stateless), Zod v4, pnpm, Vitest, drizzle-kit, wrangler.

## Global Constraints

- **Repo:** `github.com/jmbish04/google-workspace-mcp`. Branch: current worktree branch. Frequent commits.
- **No Durable Objects** anywhere in the final Worker. No `agents` / AI-SDK / `routeAgentRequest` wiring.
- **No `googleapis`, `google-auth-library`, `keytar`, `@google-cloud/*`, Node `fs`, or `process.env`** in any Worker-path (`src/`) code. Google access is raw `fetch` only.
- **Google client credentials** are Worker secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), sourced from `/Volumes/Projects/gcloud_creds/jmbish04_google_workspace_mcp.json` (`web.client_id` / `web.client_secret`). NEVER commit secret values; NEVER print `client_secret` / `refresh_token` / `access_token` / `private_key` to logs.
- **KV:** reuse the existing `SESSIONS` binding. Key prefixes: `gwsuser:<sub>` (user + refresh token), `gwstok:<sub>` (cached access token).
- **Multi-user:** everything keyed by Google account `sub` (string). No hard-coded single user.
- **First slice services only:** Drive, Docs, Sheets, Gmail. The other 7 are out of scope.
- **Package manager is pnpm.** Run `pnpm` scripts, never `npm`. Zod is v4.
- **Migrations rewritten fresh** — this Worker was never deployed under its name; do not carry template DO migration history.
- Each task ends with a commit. TDD where a unit test is meaningful; a typecheck/build gate where it is not.

## File Structure

New / modified Worker-path files (all under `src/` unless noted):

- `backend/mcp/googleClient.ts` — thin authed `fetch` wrapper + error type.
- `backend/mcp/tokenProvider.ts` — refresh-token → cached access-token via KV.
- `backend/mcp/scopes.ts` — static scope list for the 4 services.
- `backend/mcp/services/{drive,docs,sheets,gmail}.ts` — REST service classes.
- `backend/mcp/tools.ts` — tool registry + Zod schemas + logging wrapper.
- `backend/mcp/server.ts` — stateless MCP server factory + `/mcp` fetch handler.
- `backend/mcp/logging.ts` — `logOperation()` + `logAssetTouch()` (D1).
- `backend/api/routes/auth-google.ts` — `/auth/google` + `/auth/google/callback` (Hono).
- `backend/api/routes/gws.ts` — `/api/gws/{operations,assets,tools}`.
- `backend/db/schemas/workspace-assets.ts` — `workspace_assets` + `asset_events` tables.
- `backend/lib/cookies.ts` — MODIFY: widen `SessionPayload.sub` to `string`.
- `frontend/pages/gws/{index,setup,tools,operations,assets}.astro` — new pages.
- `frontend/lib/config.ts` — MODIFY: nav group + landing.
- `_worker.ts` — MODIFY: add `/mcp` + `/auth/google/*` routing, remove DO branch.
- `wrangler.jsonc` — MODIFY: strip DO/AI/browser/vectorize/worker_loaders bindings, fresh migrations, add Google secrets.

---

## Task 1: Merge template into repo as the app base

**Files:**
- Create: all template files at repo root (copy from the cloned template), except `.git`, `node_modules`, `dist`, `pnpm-lock.yaml` conflicts resolved in favor of template.
- Preserve: existing `workspace-server/` (reference only), `docs/superpowers/`, `LICENSE`, `README.md` (keep both — rename template's to `README.template.md`).
- Modify: root `package.json` name → `google-workspace-mcp`.

**Interfaces:**
- Produces: a repo whose root is the Cloudflare Worker template (`src/`, `wrangler.jsonc`, `astro.config.ts`, `drizzle/`, `components.json`, `pnpm-workspace.yaml`, `worker-configuration.d.ts`).

- [ ] **Step 1: Copy template files into the repo root**

The template was cloned to the session scratchpad at `…/scratchpad/template`. Copy everything except VCS/build dirs:

```bash
TPL="$(ls -d /private/tmp/claude-*/*/*/scratchpad/template 2>/dev/null | head -1)"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
  --exclude='.astro' "$TPL"/ ./
git status --short | head -40
```

- [ ] **Step 2: Resolve README + package name collisions**

`rsync` overwrote the project `README.md` with the template's. Preserve the
template README under a new name, then restore the original from git:

```bash
cp README.md README.template.md          # keep the template README for reference
git show HEAD:README.md > README.md       # restore the original project README
```
Then set the root `package.json` `"name"` field to `"google-workspace-mcp"`.

- [ ] **Step 3: Install dependencies**

Run: `pnpm install`
Expected: resolves; a `node_modules/` appears. If pnpm is unavailable, `corepack enable && corepack prepare pnpm@latest --activate` first.

- [ ] **Step 4: Verify the template builds before any edits**

Run: `pnpm build`
Expected: Astro + adapter build succeeds (this is the untouched template — it must build green before we start removing pieces). If it fails, capture the error; do not proceed to Task 2 until the pristine template builds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: merge cfw-astro-shadcn template as Worker app base"
```

---

## Task 2: Strip all Durable Objects and DO-dependent surfaces

**Files:**
- Modify: `wrangler.jsonc` (remove `durable_objects`, `ai`, `browser`, `worker_loaders`, `vectorize`, `migrations` → fresh; keep `assets`, `observability`, `vars` minus model vars, `kv_namespaces` SESSIONS, `d1_databases` DB).
- Delete: `src/backend/ai/agents/` (all DO classes), agent-only routes, DO-dependent pages.
- Modify: `src/_worker.ts` (remove DO imports/exports + `/agents/` branch + `routeAgentRequest`), `src/backend/api/index.ts` (drop agent-only routers), `src/frontend/lib/config.ts` (drop dead nav links — final nav set in Task 16).

**Interfaces:**
- Produces: a Worker with zero DO bindings that typechecks and builds; fetch handler routes only `/api/*` + Astro SSR.

- [ ] **Step 1: Remove DO bindings from wrangler.jsonc**

Edit `wrangler.jsonc`: delete the `durable_objects`, `ai`, `browser`, `worker_loaders`, `vectorize` blocks and the model `vars` (`MODEL_*`, `DEFAULT_MODEL_EMBEDDING`, `AI_GATEWAY_ID`). Replace the `migrations` array with a single fresh tag and no classes:

```jsonc
"migrations": [
  { "tag": "v1", "new_sqlite_classes": [] }
],
```
Keep `assets`, `observability`, `kv_namespaces` (SESSIONS), `d1_databases` (DB). Rename `"name"` to `"google-workspace-mcp"`.

- [ ] **Step 2: Delete DO classes and agent-only backend routes**

```bash
rm -rf src/backend/ai/agents
rm -f src/backend/api/routes/threads.ts \
      src/backend/api/routes/notifications.ts \
      src/backend/api/routes/inbox.ts \
      src/backend/api/routes/webhooks.ts \
      src/backend/email/inbound.ts
```

- [ ] **Step 3: Rewrite `src/_worker.ts` to a DO-free handler**

Replace the file body so it imports neither `agents` nor any DO class, drops the `/agents/` branch and the `email` handler, and exports only the default fetch handler + `start`/`createExports`:

```ts
import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import type { ExportedHandler } from "@cloudflare/workers-types";

import { app as honoApp } from "./backend/api/index";
import { handleMcpRequest } from "./backend/mcp/server";        // added in Task 14
import { handleGoogleAuth } from "./backend/api/routes/auth-google"; // added in Task 6

function isApiPath(p: string): boolean {
  return p.startsWith("/api/") || p === "/openapi.json" || p === "/swagger" || p === "/scalar";
}

let astroApp: App | undefined;
let astroManifest: any;
export function start(manifest: any, _args: unknown) { astroManifest = manifest; astroApp = new App(manifest); }

function makeHandler(): ExportedHandler<Env> {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") return handleMcpRequest(request as any, env, ctx);
      if (url.pathname.startsWith("/auth/google")) return handleGoogleAuth(request as any, env);
      if (isApiPath(url.pathname)) return honoApp.fetch(request as any, env, ctx);
      if (astroApp) return handle(astroManifest, astroApp, request as any, env as any, ctx as any);
      return env.ASSETS.fetch(request as any);
    },
  } as unknown as ExportedHandler<Env>;
}
export function createExports() { return { default: makeHandler() }; }
export default makeHandler();
```
Note: `handleMcpRequest` and `handleGoogleAuth` are created in later tasks. Until then, add temporary stubs in those files OR comment the two imports+branches and restore them in Tasks 6/14. Prefer stubs (Task 6 and 14 replace them).

- [ ] **Step 4: Drop agent-only routers from `src/backend/api/index.ts`**

Remove the imports and `.route()` mounts for `inboxRouter`, `notificationsRouter`, `threadsRouter`, `webhooksRouter`, `teamNotesRouter` (if it depends on removed tables), and any `seedRouter` seeds referencing removed tables. Keep `authRouter`, `healthRouter`, `configRouter`/`adminRouter`, `docsRouter`, `activityRouter`, `dashboardRouter`, `projectsRouter`, `tasksRouter`, `settingsRouter`, `clientErrorRouter`, `taskDetailRouter`, `taskHierarchyRouter`. Update the health route's `AGENT_BINDINGS` list to `[]` (no DOs to ping).

- [ ] **Step 5: Delete DO-dependent Astro pages**

```bash
rm -f src/frontend/pages/chat.astro src/frontend/pages/assistant.astro \
      src/frontend/pages/notifications.astro src/frontend/pages/inbox.astro \
      src/frontend/pages/playbook.astro
rm -rf src/frontend/pages/showcase
```

- [ ] **Step 6: Regenerate Env types and typecheck**

Run: `pnpm exec wrangler types` then `pnpm exec tsc --noEmit` (or `pnpm typecheck` if defined).
Expected: no references to removed DO classes/bindings remain. Fix any dangling imports (e.g. `db/schema.ts` barrel re-exporting deleted `inbox`/`chat` schemas — remove those `export *` lines and delete the schema files if agent-only).

- [ ] **Step 7: Build**

Run: `pnpm build`
Expected: green. Then commit.

```bash
git add -A
git commit -m "chore: strip all Durable Objects + DO-dependent pages/routes"
```

---

## Task 3: Widen the session cookie to carry the Google `sub`

**Files:**
- Modify: `src/backend/lib/cookies.ts`
- Test: `src/backend/lib/__tests__/cookies.test.ts`

**Interfaces:**
- Produces: `createSessionCookie(env, { sub, email? })` and `verifySessionCookie(env, cookieHeader) → { sub: string; email?: string; iat; exp } | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createSessionCookie, verifySessionCookie } from "../cookies";

const env = { COOKIE_SIGNING_KEY: "test-key-please-change" } as unknown as Env;

describe("cookies multi-user", () => {
  it("round-trips an arbitrary google sub", async () => {
    const setCookie = await createSessionCookie(env, { sub: "google-sub-123", email: "a@b.com" });
    const raw = setCookie.split(";")[0]; // "cr_session=payload.sig"
    const payload = await verifySessionCookie(env, raw);
    expect(payload?.sub).toBe("google-sub-123");
    expect(payload?.email).toBe("a@b.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/lib/__tests__/cookies.test.ts`
Expected: FAIL — current `SessionPayload.sub` is the literal `"single-user"`, so the round-tripped sub won't equal `"google-sub-123"` (type error or assertion fail).

- [ ] **Step 3: Widen the payload type**

In `src/backend/lib/cookies.ts` change:

```ts
export type SessionPayload = {
  sub: string;        // Google account `sub` (was: "single-user")
  email?: string;
  exp: number;
  iat: number;
};

export async function createSessionCookie(
  env: Env,
  payload: Partial<SessionPayload> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const session: SessionPayload = {
    sub: payload.sub ?? "single-user",
    email: payload.email,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + TWO_YEARS_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(session));
  const signingKey = await getCookieSigningKey(env);
  const signature = await hmacSign(signingKey, encodedPayload);
  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; HttpOnly; Secure; SameSite=Lax; Max-Age=${TWO_YEARS_SECONDS}; Path=/`;
}
```
(`verifySessionCookie` already returns the parsed payload — no change beyond the type.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/lib/__tests__/cookies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/lib/cookies.ts src/backend/lib/__tests__/cookies.test.ts
git commit -m "feat(auth): widen session cookie to carry google sub"
```

---

## Task 4: Scopes module for the 4 services

**Files:**
- Create: `src/backend/mcp/scopes.ts`
- Test: `src/backend/mcp/__tests__/scopes.test.ts`

**Interfaces:**
- Produces: `export const SCOPES: string[]` and `export const SCOPE_STRING: string` (space-joined).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { SCOPES, SCOPE_STRING } from "../scopes";

describe("scopes", () => {
  it("includes drive, docs, sheets, gmail + openid identity", () => {
    expect(SCOPES).toEqual(expect.arrayContaining([
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.modify",
    ]));
    expect(SCOPE_STRING).toContain("spreadsheets");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/scopes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/scopes.ts
export const SCOPES: string[] = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.modify",
];
export const SCOPE_STRING = SCOPES.join(" ");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/scopes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/scopes.ts src/backend/mcp/__tests__/scopes.test.ts
git commit -m "feat(mcp): static OAuth scopes for drive/docs/sheets/gmail"
```

---

## Task 5: TokenProvider — refresh token → cached access token via KV

**Files:**
- Create: `src/backend/mcp/tokenProvider.ts`
- Test: `src/backend/mcp/__tests__/tokenProvider.test.ts`

**Interfaces:**
- Consumes: KV `SESSIONS`; secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Produces:
  - `type GwsUser = { sub: string; email?: string; refreshToken: string; scopes: string[]; updatedAt: number }`
  - `saveUser(env, user): Promise<void>` — writes `gwsuser:<sub>`.
  - `getUser(env, sub): Promise<GwsUser | null>`.
  - `getAccessToken(env, sub): Promise<string>` — returns cached (`gwstok:<sub>`) or refreshes via Google token endpoint and caches with TTL.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAccessToken, saveUser } from "../tokenProvider";

function kvMock() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
    delete: vi.fn(async (k: string) => void store.delete(k)),
  };
}

describe("tokenProvider", () => {
  let env: any;
  beforeEach(() => {
    env = {
      SESSIONS: kvMock(),
      GOOGLE_CLIENT_ID: { get: async () => "cid" },       // secrets-store style
      GOOGLE_CLIENT_SECRET: { get: async () => "secret" },
    };
  });

  it("refreshes and caches an access token when none is cached", async () => {
    await saveUser(env, { sub: "s1", refreshToken: "rt", scopes: [], updatedAt: 0 });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "at-123", expires_in: 3600 }), { status: 200 }),
    );
    const tok = await getAccessToken(env, "s1");
    expect(tok).toBe("at-123");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(await env.SESSIONS.get("gwstok:s1")).toContain("at-123");

    // second call is served from cache (no new fetch)
    const tok2 = await getAccessToken(env, "s1");
    expect(tok2).toBe("at-123");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/tokenProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/tokenProvider.ts
import { getSecret } from "../utils/secrets"; // template helper; if it only has getCookieSigningKey, add a generic getSecret

export type GwsUser = {
  sub: string;
  email?: string;
  refreshToken: string;
  scopes: string[];
  updatedAt: number;
};

const USER_PREFIX = "gwsuser:";
const TOK_PREFIX = "gwstok:";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function saveUser(env: Env, user: GwsUser): Promise<void> {
  await env.SESSIONS.put(USER_PREFIX + user.sub, JSON.stringify(user));
}

export async function getUser(env: Env, sub: string): Promise<GwsUser | null> {
  const raw = await env.SESSIONS.get(USER_PREFIX + sub);
  return raw ? (JSON.parse(raw) as GwsUser) : null;
}

export async function getAccessToken(env: Env, sub: string): Promise<string> {
  const cached = await env.SESSIONS.get(TOK_PREFIX + sub);
  if (cached) {
    const { access_token, exp } = JSON.parse(cached) as { access_token: string; exp: number };
    if (exp - 60 > Math.floor(Date.now() / 1000)) return access_token;
  }
  const user = await getUser(env, sub);
  if (!user) throw new Error(`No Google credentials for sub ${sub}. Sign in at /auth/google.`);

  const clientId = await getSecret(env, "GOOGLE_CLIENT_ID");
  const clientSecret = await getSecret(env, "GOOGLE_CLIENT_SECRET");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: user.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const exp = Math.floor(Date.now() / 1000) + json.expires_in;
  await env.SESSIONS.put(
    TOK_PREFIX + sub,
    JSON.stringify({ access_token: json.access_token, exp }),
    { expirationTtl: Math.max(60, json.expires_in) },
  );
  return json.access_token;
}
```
If `src/backend/utils/secrets.ts` lacks a generic accessor, add:

```ts
// secrets.ts — generic accessor over Secrets Store bindings or plain string vars
export async function getSecret(env: Env, name: keyof Env): Promise<string> {
  const b = env[name] as unknown;
  if (b && typeof (b as any).get === "function") return await (b as any).get();
  if (typeof b === "string") return b;
  throw new Error(`Secret ${String(name)} not configured`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/tokenProvider.test.ts`
Expected: PASS (both calls; second served from cache).

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/tokenProvider.ts src/backend/utils/secrets.ts src/backend/mcp/__tests__/tokenProvider.test.ts
git commit -m "feat(mcp): KV-backed Google token provider (refresh + cache)"
```

---

## Task 6: Google OAuth login + callback

**Files:**
- Create: `src/backend/api/routes/auth-google.ts` (exports `handleGoogleAuth(request, env)`)
- Test: `src/backend/api/routes/__tests__/auth-google.test.ts`

**Interfaces:**
- Consumes: `SCOPE_STRING` (Task 4), `saveUser` (Task 5), `createSessionCookie` (Task 3), `getSecret` (Task 5).
- Produces: `handleGoogleAuth(request: Request, env: Env): Promise<Response>` handling `GET /auth/google` (302 → Google consent) and `GET /auth/google/callback` (code exchange → `saveUser` → Set-Cookie → 302 `/gws`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { handleGoogleAuth } from "../auth-google";

const env: any = {
  SESSIONS: (() => { const s = new Map(); return { get: async (k:string)=>s.get(k)??null, put: async (k:string,v:string)=>void s.set(k,v) }; })(),
  GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret",
  PUBLIC_BASE_URL: "https://example.workers.dev",
  COOKIE_SIGNING_KEY: "k",
};

describe("google auth", () => {
  it("GET /auth/google redirects to Google consent", async () => {
    const res = await handleGoogleAuth(new Request("https://example.workers.dev/auth/google"), env);
    expect(res.status).toBe(302);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("accounts.google.com");
    expect(loc).toContain("access_type=offline");
    expect(loc).toContain("spreadsheets");
  });

  it("callback exchanges code, stores user, sets cookie", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "at", refresh_token: "rt", expires_in: 3600,
      id_token: "h." + btoa(JSON.stringify({ sub: "sub9", email: "x@y.com" })) + ".s",
    }), { status: 200 }));
    const res = await handleGoogleAuth(
      new Request("https://example.workers.dev/auth/google/callback?code=abc&state=xyz"),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("cr_session=");
    expect(await env.SESSIONS.get("gwsuser:sub9")).toContain("rt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/api/routes/__tests__/auth-google.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/api/routes/auth-google.ts
import { SCOPE_STRING } from "@/backend/mcp/scopes";
import { getSecret } from "@/backend/utils/secrets";
import { saveUser } from "@/backend/mcp/tokenProvider";
import { createSessionCookie } from "@/backend/lib/cookies";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function baseUrl(env: Env, req: Request): string {
  return (env as any).PUBLIC_BASE_URL || new URL(req.url).origin;
}
function redirectUri(env: Env, req: Request): string {
  return `${baseUrl(env, req)}/auth/google/callback`;
}
function decodeJwtPayload(idToken: string): { sub: string; email?: string } {
  const part = idToken.split(".")[1];
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );
  return JSON.parse(json);
}

export async function handleGoogleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/auth/google") {
    const clientId = await getSecret(env, "GOOGLE_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(env, request),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: SCOPE_STRING,
    });
    return Response.redirect(`${AUTH_URL}?${params}`, 302);
  }

  if (url.pathname === "/auth/google/callback") {
    const code = url.searchParams.get("code");
    if (!code) return new Response("Missing code", { status: 400 });
    const clientId = await getSecret(env, "GOOGLE_CLIENT_ID");
    const clientSecret = await getSecret(env, "GOOGLE_CLIENT_SECRET");
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri(env, request), grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return new Response(`Token exchange failed: ${res.status}`, { status: 502 });
    const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token: string };
    const { sub, email } = decodeJwtPayload(tok.id_token);
    if (!tok.refresh_token) {
      // Google only returns refresh_token on first consent; prompt=consent forces it.
      return new Response("No refresh_token returned; revoke app access and retry.", { status: 400 });
    }
    await saveUser(env, { sub, email, refreshToken: tok.refresh_token, scopes: SCOPE_STRING.split(" "), updatedAt: Math.floor(Date.now() / 1000) });
    const cookie = await createSessionCookie(env, { sub, email });
    return new Response(null, { status: 302, headers: { location: "/gws", "set-cookie": cookie } });
  }

  return new Response("Not found", { status: 404 });
}
```
Add `PUBLIC_BASE_URL` to `wrangler.jsonc` `vars` (the deployed Worker URL; used to build the redirect URI). Restore the `_worker.ts` `handleGoogleAuth` import/branch stubbed in Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/api/routes/__tests__/auth-google.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/api/routes/auth-google.ts src/backend/api/routes/__tests__/auth-google.test.ts src/_worker.ts wrangler.jsonc
git commit -m "feat(auth): Google OAuth login + callback storing refresh token in KV"
```

---

## Task 7: Authed Google REST fetch client

**Files:**
- Create: `src/backend/mcp/googleClient.ts`
- Test: `src/backend/mcp/__tests__/googleClient.test.ts`

**Interfaces:**
- Consumes: `getAccessToken` (Task 5).
- Produces:
  - `class GoogleApiError extends Error { status: number; body: string }`
  - `googleFetch(env, sub, url, init?): Promise<Response>` — attaches `Authorization: Bearer`, throws `GoogleApiError` on non-2xx.
  - `googleJson<T>(env, sub, url, init?): Promise<T>` — `googleFetch` + `.json()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { googleJson, GoogleApiError } from "../googleClient";

vi.mock("../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at-xyz") }));

describe("googleClient", () => {
  it("attaches bearer token and parses json", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await googleJson<{ ok: number }>({} as any, "s1", "https://www.googleapis.com/x");
    expect(out.ok).toBe(1);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as any).Authorization).toBe("Bearer at-xyz");
  });

  it("throws GoogleApiError on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(googleJson({} as any, "s1", "https://www.googleapis.com/x")).rejects.toBeInstanceOf(GoogleApiError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/googleClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/googleClient.ts
import { getAccessToken } from "./tokenProvider";

export class GoogleApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google API ${status}: ${body.slice(0, 300)}`);
    this.name = "GoogleApiError";
  }
}

export async function googleFetch(env: Env, sub: string, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(env, sub);
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new GoogleApiError(res.status, await res.text());
  return res;
}

export async function googleJson<T>(env: Env, sub: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  const res = await googleFetch(env, sub, url, { ...init, headers });
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/googleClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/googleClient.ts src/backend/mcp/__tests__/googleClient.test.ts
git commit -m "feat(mcp): authed Google REST fetch client"
```

---

## Task 8: DriveService (REST)

**Files:**
- Create: `src/backend/mcp/services/drive.ts`
- Test: `src/backend/mcp/services/__tests__/drive.test.ts`

**Interfaces:**
- Consumes: `googleJson` / `googleFetch` (Task 7).
- Produces `class DriveService(env, sub)` with:
  - `search(q?: string, pageSize?: number): Promise<{ files: DriveFile[] }>`
  - `get(fileId: string): Promise<DriveFile>`
  - `createFolder(name: string, parentId?: string): Promise<DriveFile>`
  - `type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DriveService } from "../drive";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ files: [{ id: "f1", name: "Doc", mimeType: "application/vnd.google-apps.document" }] }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("DriveService.search", () => {
  it("calls Drive v3 files.list with q and fields", async () => {
    const svc = new DriveService({} as any, "s1");
    const out = await svc.search("name contains 'Doc'");
    expect(out.files[0].id).toBe("f1");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files");
    expect(decodeURIComponent(url)).toContain("name contains 'Doc'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/drive.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/services/drive.ts
import { googleJson } from "../googleClient";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string };
const BASE = "https://www.googleapis.com/drive/v3";
const FIELDS = "files(id,name,mimeType,webViewLink),nextPageToken";

export class DriveService {
  constructor(private env: Env, private sub: string) {}

  async search(q?: string, pageSize = 20): Promise<{ files: DriveFile[] }> {
    const params = new URLSearchParams({ pageSize: String(pageSize), fields: FIELDS, spaces: "drive" });
    if (q) params.set("q", q);
    return googleJson<{ files: DriveFile[] }>(this.env, this.sub, `${BASE}/files?${params}`);
  }

  async get(fileId: string): Promise<DriveFile> {
    const params = new URLSearchParams({ fields: "id,name,mimeType,webViewLink" });
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files/${fileId}?${params}`);
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files?fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/drive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/services/drive.ts src/backend/mcp/services/__tests__/drive.test.ts
git commit -m "feat(mcp): Drive REST service (search/get/createFolder)"
```

---

## Task 9: DocsService (REST)

**Files:**
- Create: `src/backend/mcp/services/docs.ts`
- Test: `src/backend/mcp/services/__tests__/docs.test.ts`

**Interfaces:**
- Consumes: `googleJson` (Task 7).
- Produces `class DocsService(env, sub)`:
  - `get(documentId: string): Promise<GoogleDoc>`
  - `create(title: string): Promise<GoogleDoc>`
  - `insertText(documentId: string, text: string, index?: number): Promise<void>`
  - `type GoogleDoc = { documentId: string; title: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { DocsService } from "../docs";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("DocsService", () => {
  it("create posts to docs v1 documents", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ documentId: "d1", title: "T" }), { status: 200 }));
    const svc = new DocsService({} as any, "s1");
    const doc = await svc.create("T");
    expect(doc.documentId).toBe("d1");
    expect(spy.mock.calls[0][0]).toContain("https://docs.googleapis.com/v1/documents");
  });

  it("insertText calls batchUpdate", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new DocsService({} as any, "s1").insertText("d1", "hello");
    expect(spy.mock.calls[0][0]).toContain(":batchUpdate");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/docs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/services/docs.ts
import { googleJson } from "../googleClient";
export type GoogleDoc = { documentId: string; title: string };
const BASE = "https://docs.googleapis.com/v1/documents";

export class DocsService {
  constructor(private env: Env, private sub: string) {}

  async get(documentId: string): Promise<GoogleDoc> {
    return googleJson<GoogleDoc>(this.env, this.sub, `${BASE}/${documentId}`);
  }
  async create(title: string): Promise<GoogleDoc> {
    return googleJson<GoogleDoc>(this.env, this.sub, BASE, { method: "POST", body: JSON.stringify({ title }) });
  }
  async insertText(documentId: string, text: string, index = 1): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [{ insertText: { location: { index }, text } }] }),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/docs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/services/docs.ts src/backend/mcp/services/__tests__/docs.test.ts
git commit -m "feat(mcp): Docs REST service (get/create/insertText)"
```

---

## Task 10: SheetsService (REST)

**Files:**
- Create: `src/backend/mcp/services/sheets.ts`
- Test: `src/backend/mcp/services/__tests__/sheets.test.ts`

**Interfaces:**
- Consumes: `googleJson` (Task 7).
- Produces `class SheetsService(env, sub)`:
  - `create(title: string): Promise<{ spreadsheetId: string }>`
  - `getValues(spreadsheetId: string, range: string): Promise<{ values: string[][] }>`
  - `updateValues(spreadsheetId, range, values): Promise<void>`
  - `appendValues(spreadsheetId, range, values): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { SheetsService } from "../sheets";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("SheetsService", () => {
  it("getValues hits values endpoint", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ values: [["a"]] }), { status: 200 }));
    const out = await new SheetsService({} as any, "s1").getValues("sh1", "A1:B2");
    expect(out.values[0][0]).toBe("a");
    expect(decodeURIComponent(spy.mock.calls[0][0] as string)).toContain("/values/A1:B2");
  });
  it("appendValues uses :append", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SheetsService({} as any, "s1").appendValues("sh1", "A1", [["x"]]);
    expect(spy.mock.calls[0][0]).toContain(":append");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/sheets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/services/sheets.ts
import { googleJson } from "../googleClient";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsService {
  constructor(private env: Env, private sub: string) {}

  async create(title: string): Promise<{ spreadsheetId: string }> {
    return googleJson<{ spreadsheetId: string }>(this.env, this.sub, BASE, {
      method: "POST", body: JSON.stringify({ properties: { title } }),
    });
  }
  async getValues(spreadsheetId: string, range: string): Promise<{ values: string[][] }> {
    const out = await googleJson<{ values?: string[][] }>(this.env, this.sub, `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`);
    return { values: out.values ?? [] };
  }
  async updateValues(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: "PUT", body: JSON.stringify({ values }),
    });
  }
  async appendValues(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
      method: "POST", body: JSON.stringify({ values }),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/sheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/services/sheets.ts src/backend/mcp/services/__tests__/sheets.test.ts
git commit -m "feat(mcp): Sheets REST service (create/get/update/append)"
```

---

## Task 11: GmailService (REST)

**Files:**
- Create: `src/backend/mcp/services/gmail.ts`
- Test: `src/backend/mcp/services/__tests__/gmail.test.ts`

**Interfaces:**
- Consumes: `googleJson` (Task 7).
- Produces `class GmailService(env, sub)`:
  - `listMessages(query?: string, maxResults?: number): Promise<{ messages: { id: string; threadId: string }[] }>`
  - `getMessage(id: string): Promise<GmailMessage>`
  - `send(to: string, subject: string, body: string): Promise<{ id: string }>`
  - `type GmailMessage = { id: string; snippet: string; payload?: unknown }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { GmailService } from "../gmail";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("GmailService", () => {
  it("listMessages queries users/me/messages", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").listMessages("from:x");
    expect(out.messages[0].id).toBe("m1");
    expect(decodeURIComponent(spy.mock.calls[0][0] as string)).toContain("q=from:x");
  });
  it("send posts base64url raw to messages/send", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "sent1" }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").send("a@b.com", "Hi", "Body");
    expect(out.id).toBe("sent1");
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.raw).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/gmail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/services/gmail.ts
import { googleJson } from "../googleClient";
export type GmailMessage = { id: string; snippet: string; payload?: unknown };
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function base64Url(input: string): string {
  return btoa(unescape(encodeURIComponent(input))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class GmailService {
  constructor(private env: Env, private sub: string) {}

  async listMessages(query?: string, maxResults = 20): Promise<{ messages: { id: string; threadId: string }[] }> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (query) params.set("q", query);
    const out = await googleJson<{ messages?: { id: string; threadId: string }[] }>(this.env, this.sub, `${BASE}/messages?${params}`);
    return { messages: out.messages ?? [] };
  }
  async getMessage(id: string): Promise<GmailMessage> {
    return googleJson<GmailMessage>(this.env, this.sub, `${BASE}/messages/${id}?format=full`);
  }
  async send(to: string, subject: string, body: string): Promise<{ id: string }> {
    const mime = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    return googleJson<{ id: string }>(this.env, this.sub, `${BASE}/messages/send`, {
      method: "POST", body: JSON.stringify({ raw: base64Url(mime) }),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/services/__tests__/gmail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/services/gmail.ts src/backend/mcp/services/__tests__/gmail.test.ts
git commit -m "feat(mcp): Gmail REST service (list/get/send)"
```

---

## Task 12: D1 asset-activity schema

**Files:**
- Create: `src/backend/db/schemas/workspace-assets.ts`
- Modify: `src/backend/db/schema.ts` (barrel: add `export * from "./schemas/workspace-assets"`)
- Test: `src/backend/db/schemas/__tests__/workspace-assets.test.ts` (schema shape assertions)

**Interfaces:**
- Produces Drizzle tables + types:
  - `workspaceAssets`: `id` (uuid pk), `userSub`, `assetType` (`doc|sheet|drive|gmail`), `googleId`, `title`, `url`, `firstSeenAt`, `lastTouchedAt`. Unique `(userSub, assetType, googleId)`.
  - `assetEvents`: `id`, `assetId` (fk), `userSub`, `action` (`read|create|update|modify|delete`), `detail` (json), `toolName`, `createdAt`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { workspaceAssets, assetEvents } from "../workspace-assets";
import { getTableColumns } from "drizzle-orm";

describe("workspace-assets schema", () => {
  it("has the expected columns", () => {
    expect(Object.keys(getTableColumns(workspaceAssets))).toEqual(
      expect.arrayContaining(["id", "userSub", "assetType", "googleId", "title", "url", "firstSeenAt", "lastTouchedAt"]),
    );
    expect(Object.keys(getTableColumns(assetEvents))).toEqual(
      expect.arrayContaining(["id", "assetId", "userSub", "action", "detail", "toolName", "createdAt"]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/db/schemas/__tests__/workspace-assets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/db/schemas/workspace-assets.ts
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const workspaceAssets = sqliteTable("workspace_assets", {
  id: text("id").primaryKey(),
  userSub: text("user_sub").notNull(),
  assetType: text("asset_type").notNull(), // doc | sheet | drive | gmail
  googleId: text("google_id").notNull(),
  title: text("title"),
  url: text("url"),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastTouchedAt: integer("last_touched_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => ({ uniq: unique().on(t.userSub, t.assetType, t.googleId) }));

export const assetEvents = sqliteTable("asset_events", {
  id: text("id").primaryKey(),
  assetId: text("asset_id").notNull().references(() => workspaceAssets.id),
  userSub: text("user_sub").notNull(),
  action: text("action").notNull(), // read | create | update | modify | delete
  detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
  toolName: text("tool_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const insertWorkspaceAssetSchema = createInsertSchema(workspaceAssets);
export const selectWorkspaceAssetSchema = createSelectSchema(workspaceAssets);
export const insertAssetEventSchema = createInsertSchema(assetEvents);
export const selectAssetEventSchema = createSelectSchema(assetEvents);
export type WorkspaceAssetRow = typeof workspaceAssets.$inferSelect;
export type AssetEventRow = typeof assetEvents.$inferSelect;
```
Add to `src/backend/db/schema.ts`: `export * from "./schemas/workspace-assets";`

- [ ] **Step 4: Run test + generate migration**

Run: `pnpm exec vitest run src/backend/db/schemas/__tests__/workspace-assets.test.ts` → PASS.
Then regenerate D1 migrations: `pnpm run db:generate` (or `pnpm exec drizzle-kit generate`). Expected: a new file under `drizzle/` creating both tables. Apply locally: `pnpm run migrate:local` (or the template's equivalent) → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/backend/db/schemas/workspace-assets.ts src/backend/db/schema.ts src/backend/db/schemas/__tests__/workspace-assets.test.ts drizzle/
git commit -m "feat(db): workspace_assets + asset_events tables"
```

---

## Task 13: D1 logging helpers

**Files:**
- Create: `src/backend/mcp/logging.ts`
- Test: `src/backend/mcp/__tests__/logging.test.ts`

**Interfaces:**
- Consumes: `getDb` (template), `mcpLogs` (template schema), `workspaceAssets` + `assetEvents` (Task 12).
- Produces:
  - `logOperation(env, { toolName, request, response, success, errorMessage, latencyMs }): Promise<void>` — inserts one `mcp_logs` row (`server_name="google-workspace"`).
  - `logAssetTouch(env, { userSub, assetType, googleId, title?, url?, action, detail?, toolName }): Promise<void>` — upserts the asset row (idempotent on `(userSub, assetType, googleId)`) and appends one `asset_events` row.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { logAssetTouch } from "../logging";

// getDb returns a fake drizzle whose calls we record.
const calls: string[] = [];
const fakeDb = {
  insert: () => ({ values: () => ({ onConflictDoUpdate: async () => { calls.push("upsert"); }, returning: async () => [{ id: "a1" }], run: async () => {} }) }),
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "a1" }] }) }) }),
};
vi.mock("@/db", () => ({ getDb: () => fakeDb }));

describe("logAssetTouch", () => {
  it("upserts an asset and records an event", async () => {
    await logAssetTouch({} as any, { userSub: "s1", assetType: "doc", googleId: "d1", action: "create", toolName: "docs_create" });
    expect(calls).toContain("upsert");
  });
});
```

(The exact drizzle chain mock may need adjusting to your `getDb` shape — the assertion that matters: an upsert and an event insert both happen. Adjust the fake to match the real query builder you write.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/logging.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/mcp/logging.ts
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpLogs } from "@db/schemas";
import { workspaceAssets, assetEvents } from "@db/schemas";

function uuid(): string { return crypto.randomUUID(); }

export async function logOperation(env: Env, o: {
  toolName: string; request?: unknown; response?: unknown; success: boolean; errorMessage?: string; latencyMs: number;
}): Promise<void> {
  const db = getDb(env);
  await db.insert(mcpLogs).values({
    id: uuid(), serverName: "google-workspace", toolName: o.toolName,
    request: (o.request ?? null) as any, response: (o.response ?? null) as any,
    success: o.success, errorMessage: o.errorMessage, latencyMs: Math.round(o.latencyMs),
  }).run();
}

export type AssetAction = "read" | "create" | "update" | "modify" | "delete";
export async function logAssetTouch(env: Env, a: {
  userSub: string; assetType: string; googleId: string; title?: string; url?: string;
  action: AssetAction; detail?: Record<string, unknown>; toolName: string;
}): Promise<void> {
  const db = getDb(env);
  const now = new Date();
  const existing = await db.select({ id: workspaceAssets.id })
    .from(workspaceAssets)
    .where(and(eq(workspaceAssets.userSub, a.userSub), eq(workspaceAssets.assetType, a.assetType), eq(workspaceAssets.googleId, a.googleId)))
    .limit(1);
  let assetId: string;
  if (existing.length) {
    assetId = existing[0].id;
    await db.update(workspaceAssets).set({ lastTouchedAt: now, title: a.title, url: a.url }).where(eq(workspaceAssets.id, assetId)).run();
  } else {
    assetId = uuid();
    await db.insert(workspaceAssets).values({
      id: assetId, userSub: a.userSub, assetType: a.assetType, googleId: a.googleId,
      title: a.title, url: a.url, firstSeenAt: now, lastTouchedAt: now,
    }).run();
  }
  await db.insert(assetEvents).values({
    id: uuid(), assetId, userSub: a.userSub, action: a.action,
    detail: (a.detail ?? null) as any, toolName: a.toolName, createdAt: now,
  }).run();
}
```
(Use whichever import alias the template uses for schemas — `@db/schemas` per `health.ts`. Rewrite the test's `fakeDb` to match this select/update/insert chain.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/logging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/mcp/logging.ts src/backend/mcp/__tests__/logging.test.ts
git commit -m "feat(mcp): D1 operation + asset-touch logging helpers"
```

---

## Task 14: MCP tool registry + stateless `/mcp` endpoint

**Files:**
- Create: `src/backend/mcp/tools.ts`, `src/backend/mcp/server.ts`
- Test: `src/backend/mcp/__tests__/tools.test.ts`
- Modify: `src/_worker.ts` (restore `handleMcpRequest` import + `/mcp` branch)

**Interfaces:**
- Consumes: all 4 services (Tasks 8–11), `logOperation` + `logAssetTouch` (Task 13), `verifySessionCookie` (Task 3).
- Produces:
  - `type ToolDef = { name: string; description: string; inputSchema: z.ZodType; assetType?: string; run(ctx): Promise<{ result: unknown; asset?: {...} }> }`
  - `export const TOOLS: ToolDef[]` — the tool catalog (also consumed by `/api/gws/tools`, Task 15).
  - `buildServer(env, sub): McpServer` — registers each tool wrapped in logging.
  - `handleMcpRequest(request, env, ctx): Promise<Response>` — resolves `sub` from bearer/cookie, runs the stateless Streamable HTTP transport.

- [ ] **Step 1: Write the failing test (tool catalog shape)**

```ts
import { describe, it, expect } from "vitest";
import { TOOLS } from "../tools";

describe("tool catalog", () => {
  it("exposes drive/docs/sheets/gmail tools with schemas", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "drive_search", "docs_create", "sheets_get_values", "gmail_send",
    ]));
    for (const t of TOOLS) {
      expect(typeof t.description).toBe("string");
      expect(t.inputSchema).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool catalog (`tools.ts`)**

```ts
// src/backend/mcp/tools.ts
import { z } from "zod";
import { DriveService } from "./services/drive";
import { DocsService } from "./services/docs";
import { SheetsService } from "./services/sheets";
import { GmailService } from "./services/gmail";
import type { AssetAction } from "./logging";

export type ToolCtx = { env: Env; sub: string };
export type ToolAsset = { assetType: string; googleId: string; title?: string; url?: string; action: AssetAction; detail?: Record<string, unknown> };
export type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  run(ctx: ToolCtx, args: any): Promise<{ result: unknown; asset?: ToolAsset }>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "drive_search",
    description: "Search Google Drive files. Optional query in Drive query syntax.",
    inputSchema: z.object({ query: z.string().optional(), pageSize: z.number().int().min(1).max(100).optional() }),
    async run({ env, sub }, a) {
      const out = await new DriveService(env, sub).search(a.query, a.pageSize);
      return { result: out };
    },
  },
  {
    name: "drive_create_folder",
    description: "Create a Drive folder.",
    inputSchema: z.object({ name: z.string(), parentId: z.string().optional() }),
    async run({ env, sub }, a) {
      const f = await new DriveService(env, sub).createFolder(a.name, a.parentId);
      return { result: f, asset: { assetType: "drive", googleId: f.id, title: f.name, url: f.webViewLink, action: "create", detail: { name: a.name } } };
    },
  },
  {
    name: "docs_get",
    description: "Get a Google Doc by id.",
    inputSchema: z.object({ documentId: z.string() }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, sub).get(a.documentId);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "read" } };
    },
  },
  {
    name: "docs_create",
    description: "Create a Google Doc with a title.",
    inputSchema: z.object({ title: z.string() }),
    async run({ env, sub }, a) {
      const d = await new DocsService(env, sub).create(a.title);
      return { result: d, asset: { assetType: "doc", googleId: d.documentId, title: d.title, action: "create" } };
    },
  },
  {
    name: "docs_insert_text",
    description: "Insert text into a Google Doc at an index (default 1).",
    inputSchema: z.object({ documentId: z.string(), text: z.string(), index: z.number().int().optional() }),
    async run({ env, sub }, a) {
      await new DocsService(env, sub).insertText(a.documentId, a.text, a.index);
      return { result: { ok: true }, asset: { assetType: "doc", googleId: a.documentId, action: "modify", detail: { inserted: a.text.length } } };
    },
  },
  {
    name: "sheets_create",
    description: "Create a spreadsheet with a title.",
    inputSchema: z.object({ title: z.string() }),
    async run({ env, sub }, a) {
      const s = await new SheetsService(env, sub).create(a.title);
      return { result: s, asset: { assetType: "sheet", googleId: s.spreadsheetId, title: a.title, action: "create" } };
    },
  },
  {
    name: "sheets_get_values",
    description: "Read a range of values from a spreadsheet (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string() }),
    async run({ env, sub }, a) {
      const v = await new SheetsService(env, sub).getValues(a.spreadsheetId, a.range);
      return { result: v, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "read", detail: { range: a.range } } };
    },
  },
  {
    name: "sheets_append_values",
    description: "Append rows to a spreadsheet range (A1 notation).",
    inputSchema: z.object({ spreadsheetId: z.string(), range: z.string(), values: z.array(z.array(z.string())) }),
    async run({ env, sub }, a) {
      await new SheetsService(env, sub).appendValues(a.spreadsheetId, a.range, a.values);
      return { result: { ok: true }, asset: { assetType: "sheet", googleId: a.spreadsheetId, action: "update", detail: { rows: a.values.length } } };
    },
  },
  {
    name: "gmail_list",
    description: "List Gmail messages matching an optional query.",
    inputSchema: z.object({ query: z.string().optional(), maxResults: z.number().int().min(1).max(100).optional() }),
    async run({ env, sub }, a) {
      const out = await new GmailService(env, sub).listMessages(a.query, a.maxResults);
      return { result: out };
    },
  },
  {
    name: "gmail_send",
    description: "Send a plain-text email.",
    inputSchema: z.object({ to: z.string().email(), subject: z.string(), body: z.string() }),
    async run({ env, sub }, a) {
      const sent = await new GmailService(env, sub).send(a.to, a.subject, a.body);
      return { result: sent, asset: { assetType: "gmail", googleId: sent.id, title: a.subject, action: "create", detail: { to: a.to } } };
    },
  },
];
```

- [ ] **Step 4: Implement the server + endpoint (`server.ts`)**

```ts
// src/backend/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifySessionCookie } from "@/backend/lib/cookies";
import { logOperation, logAssetTouch } from "./logging";
import { TOOLS } from "./tools";

async function resolveSub(request: Request, env: Env): Promise<string | null> {
  // Bearer token (issued at login) OR session cookie both carry the sub.
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const payload = await verifySessionCookie(env, `cr_session=${auth.slice(7)}`);
    if (payload) return payload.sub;
  }
  const payload = await verifySessionCookie(env, request.headers.get("cookie"));
  return payload?.sub ?? null;
}

export function buildServer(env: Env, sub: string): McpServer {
  const server = new McpServer({ name: "google-workspace-mcp", version: "1.0.0" });
  for (const tool of TOOLS) {
    server.tool(tool.name, tool.description, (tool.inputSchema as any).shape ?? {}, async (args: any) => {
      const started = Date.now();
      try {
        const { result, asset } = await tool.run({ env, sub }, args);
        await logOperation(env, { toolName: tool.name, request: args, response: result, success: true, latencyMs: Date.now() - started });
        if (asset) await logAssetTouch(env, { userSub: sub, toolName: tool.name, ...asset });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logOperation(env, { toolName: tool.name, request: args, success: false, errorMessage: msg, latencyMs: Date.now() - started });
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    });
  }
  return server;
}

export async function handleMcpRequest(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
  const sub = await resolveSub(request, env);
  if (!sub) return new Response(JSON.stringify({ error: "Unauthorized. Sign in at /auth/google." }), { status: 401, headers: { "content-type": "application/json" } });

  const server = buildServer(env, sub);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  await server.connect(transport);
  // Bridge the Web Request/Response to the transport. The MCP SDK's Streamable
  // HTTP transport exposes `handleRequest`; use the fetch-compatible adapter.
  return transport.handleRequest(request as any);
}
```
NOTE: The exact bridge between the SDK transport and a Workers `Request`/`Response` may need a small adapter (the SDK's `StreamableHTTPServerTransport` is Node-oriented). If `handleRequest` is not fetch-native in the installed SDK version, implement a thin stateless JSON-RPC handler instead: parse `await request.json()`, dispatch `initialize` / `tools/list` (return `TOOLS` names + `zodToJsonSchema(inputSchema)`) / `tools/call` (run the tool), and return a JSON response. Verify against the installed `@modelcontextprotocol/sdk` version during implementation and pick whichever the SDK supports on Workers. Add `zod-to-json-schema` if the manual path is used.

Restore in `src/_worker.ts`: `import { handleMcpRequest } from "./backend/mcp/server";` and the `if (url.pathname === "/mcp") return handleMcpRequest(...)` branch.

- [ ] **Step 5: Run tests + typecheck + commit**

Run: `pnpm exec vitest run src/backend/mcp/__tests__/tools.test.ts` → PASS.
Run: `pnpm exec tsc --noEmit` → green.

```bash
git add src/backend/mcp/tools.ts src/backend/mcp/server.ts src/backend/mcp/__tests__/tools.test.ts src/_worker.ts package.json
git commit -m "feat(mcp): stateless /mcp endpoint with logged tool catalog"
```

---

## Task 15: Frontend API routes (`/api/gws/*`)

**Files:**
- Create: `src/backend/api/routes/gws.ts`
- Modify: `src/backend/api/index.ts` (mount `gwsRouter` at `/api/gws`)
- Test: `src/backend/api/routes/__tests__/gws.test.ts`

**Interfaces:**
- Consumes: `getDb`, `mcpLogs`, `workspaceAssets`, `assetEvents`, `TOOLS` (Task 14).
- Produces (all JSON):
  - `GET /api/gws/operations?limit=` → `{ operations: McpLogRow[] }` (latest first).
  - `GET /api/gws/assets` → `{ assets: (WorkspaceAssetRow & { events: AssetEventRow[] })[] }`.
  - `GET /api/gws/tools` → `{ tools: { name; description; inputSchema: JSONSchema }[] }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { gwsRouter } from "../gws";

describe("GET /api/gws/tools", () => {
  it("returns the tool catalog", async () => {
    const res = await gwsRouter.request("/tools");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tools.map((t: any) => t.name)).toContain("gmail_send");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/backend/api/routes/__tests__/gws.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/backend/api/routes/gws.ts
import { OpenAPIHono } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getDb } from "@/db";
import { mcpLogs, workspaceAssets, assetEvents } from "@db/schemas";
import { TOOLS } from "@/backend/mcp/tools";
import type { AppBindings } from "../index";

export const gwsRouter = new OpenAPIHono<AppBindings>();

gwsRouter.get("/tools", (c) =>
  c.json({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: zodToJsonSchema(t.inputSchema as any) })) }),
);

gwsRouter.get("/operations", async (c) => {
  const limit = Number(c.req.query("limit") ?? "100");
  const db = getDb(c.env);
  const rows = await db.select().from(mcpLogs).where(eq(mcpLogs.serverName, "google-workspace")).orderBy(desc(mcpLogs.createdAt)).limit(limit);
  return c.json({ operations: rows });
});

gwsRouter.get("/assets", async (c) => {
  const db = getDb(c.env);
  const assets = await db.select().from(workspaceAssets).orderBy(desc(workspaceAssets.lastTouchedAt)).limit(200);
  const events = await db.select().from(assetEvents).orderBy(desc(assetEvents.createdAt)).limit(1000);
  const byAsset = new Map<string, any[]>();
  for (const e of events) { const arr = byAsset.get(e.assetId) ?? []; arr.push(e); byAsset.set(e.assetId, arr); }
  return c.json({ assets: assets.map((a) => ({ ...a, events: byAsset.get(a.id) ?? [] })) });
});
```
Mount in `src/backend/api/index.ts`: `import { gwsRouter } from "./routes/gws";` then `app.route("/api/gws", gwsRouter);`. Add `zod-to-json-schema` to deps if absent.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/backend/api/routes/__tests__/gws.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/backend/api/routes/gws.ts src/backend/api/index.ts src/backend/api/routes/__tests__/gws.test.ts package.json
git commit -m "feat(api): /api/gws operations, assets, tools endpoints"
```

---

## Task 16: Frontend pages + nav rewire + landing

**Files:**
- Create: `src/frontend/pages/gws/index.astro`, `setup.astro`, `tools.astro`, `operations.astro`, `assets.astro`
- Modify: `src/frontend/lib/config.ts` (nav group + landing), `src/frontend/pages/index.astro` (new landing → redirect or render `/gws`)
- Test: build gate (`pnpm build`) — Astro pages are SSR; the API they consume is unit-tested in Task 15.

**Interfaces:**
- Consumes: `GET /api/gws/{operations,assets,tools}` (Task 15).
- Produces: five reachable pages under `/gws` and a nav "Google Workspace" group.

- [ ] **Step 1: Add the nav group + landing in `config.ts`**

Replace `siteConfig.name`/`description`, set `navItems` to `[{ href: "/gws", label: "Overview" }, { href: "/gws/operations", label: "Operations" }]`, and prepend a nav group:

```ts
navGroups: [
  {
    label: "Google Workspace",
    items: [
      { href: "/gws/setup", label: "Setup & Deploy" },
      { href: "/gws/tools", label: "MCP Tools" },
      { href: "/gws/operations", label: "Operations Log" },
      { href: "/gws/assets", label: "Asset Activity" },
    ],
  },
  // keep the surviving template groups (Workspace: projects/tasks/notes/analytics;
  // System: settings/docs/openapi/swagger/scalar) with dead links (chat/inbox/
  // showcase/*) removed.
],
```
Set `siteConfig.name = "Google Workspace MCP"` and a matching description.

- [ ] **Step 2: Landing page `/gws`**

Create `src/frontend/pages/gws/index.astro` using `BaseLayout`: hero explaining the tool, a "Sign in with Google" button linking `/auth/google`, and cards linking the 4 sub-pages. Point the root `index.astro` at `/gws` (either an Astro redirect `Astro.redirect("/gws")` or render the same content). Keep the template landing reachable at `/template` by moving the old `index.astro` content to `src/frontend/pages/template.astro`.

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
import { Button } from "@/components/ui/button";
---
<BaseLayout title="Google Workspace MCP" description="Remote MCP server for Google Workspace on Cloudflare">
  <section class="mx-auto max-w-3xl px-6 py-16 space-y-6">
    <h1 class="text-4xl font-bold">Google Workspace MCP</h1>
    <p class="text-muted-foreground">A remote MCP server exposing Drive, Docs, Sheets, and Gmail tools. Sign in with Google to connect your account.</p>
    <a href="/auth/google"><Button size="lg">Sign in with Google</Button></a>
    <div class="grid gap-4 sm:grid-cols-2 pt-8">
      <a class="rounded-lg border p-4" href="/gws/setup">Setup &amp; Deploy →</a>
      <a class="rounded-lg border p-4" href="/gws/tools">MCP Tools →</a>
      <a class="rounded-lg border p-4" href="/gws/operations">Operations Log →</a>
      <a class="rounded-lg border p-4" href="/gws/assets">Asset Activity →</a>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Setup docs page `/gws/setup`**

Create `src/frontend/pages/gws/setup.astro` (static content via `BaseLayout` + `CodeBlock`) documenting: (1) create/confirm the Google OAuth "web" client and set the callback `https://<worker>/auth/google/callback`; (2) `wrangler secret put GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (values from the creds JSON); (3) set `PUBLIC_BASE_URL` var; (4) create KV `SESSIONS` + D1 `DB`, run `pnpm run migrate:remote`; (5) `pnpm run deploy`; (6) connect an MCP client to `https://<worker>/mcp` with the bearer token obtained after signing in at `/auth/google`. Use real command strings (no placeholders beyond `<worker>`).

- [ ] **Step 4: Tools / Operations / Assets pages**

Create three pages that fetch their API and render a table. Fetch server-side in the Astro frontmatter so it is SSR (no client secrets). Example `operations.astro`:

```astro
---
import BaseLayout from "@/layouts/BaseLayout.astro";
const res = await fetch(new URL("/api/gws/operations?limit=100", Astro.url));
const { operations } = res.ok ? await res.json() : { operations: [] };
---
<BaseLayout title="Operations Log" description="MCP tool invocation log">
  <section class="mx-auto max-w-5xl px-6 py-10">
    <h1 class="text-2xl font-bold mb-4">Operations Log</h1>
    <table class="w-full text-sm">
      <thead><tr class="text-left text-muted-foreground"><th>Tool</th><th>Status</th><th>Latency</th><th>When</th></tr></thead>
      <tbody>
        {operations.map((o: any) => (
          <tr class="border-t">
            <td class="py-2 font-mono">{o.toolName}</td>
            <td>{o.success ? "ok" : "fail"}</td>
            <td>{o.latencyMs}ms</td>
            <td>{new Date(o.createdAt * 1000).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
</BaseLayout>
```
`tools.astro` renders `name` + `description` + collapsible JSON schema from `/api/gws/tools`. `assets.astro` renders each asset (`title`, `assetType`, link) with its event timeline (`action`, `toolName`, time) from `/api/gws/assets`.

- [ ] **Step 5: Build gate + commit**

Run: `pnpm build`
Expected: all five pages compile; nav shows the "Google Workspace" group; `/` serves the new landing.
Then: `pnpm exec vitest run` (full suite green) and `pnpm exec tsc --noEmit`.

```bash
git add src/frontend/pages/gws src/frontend/pages/index.astro src/frontend/pages/template.astro src/frontend/lib/config.ts
git commit -m "feat(ui): /gws pages (landing, setup, tools, operations, assets) + nav"
```

---

## Final verification

- [ ] `pnpm exec vitest run` — entire suite green.
- [ ] `pnpm exec tsc --noEmit` — no type errors.
- [ ] `pnpm build` — Worker bundle builds.
- [ ] Grep guard: `grep -rE "googleapis|google-auth-library|keytar|from \"fs\"|process\\.env" src/` returns nothing in Worker-path code.
- [ ] Grep guard: no `durable_objects` / `routeAgentRequest` / `agents` import remains in `src/_worker.ts` or `wrangler.jsonc`.
- [ ] Update root `README.md` with a short "Cloudflare Worker MCP" section pointing at `/gws/setup`.
- [ ] Commit any final docs. Deployment + live Google sign-in are performed by the user per `/gws/setup`.

## Deferred (documented follow-ups, not this plan)

- Remaining 7 services (Calendar, Chat, Time, People, Slides, Tasks) — same REST + tool + logging pattern.
- MCP-native OAuth (dynamic client registration) replacing the session-token bearer.
- Per-user rate limiting / quota surfacing on the operations page.
