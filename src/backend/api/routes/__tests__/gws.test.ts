import { describe, it, expect, vi } from "vitest";

import { createSessionCookie } from "@/backend/lib/cookies";
import { assetEvents, mcpLogs, workspaceAssets } from "@db/schemas";

// `getDb` is swapped for a fake that filters rows by the `eq(column, value)`
// condition passed to `.where(...)`, so `/assets` scoping-to-caller is a real
// assertion, not a vacuous one. drizzle's `eq()` produces an SQL object whose
// `queryChunks` include a `Param` chunk carrying the raw compared value.
function paramValue(cond: unknown): unknown {
  const chunks = (cond as { queryChunks?: unknown[] })?.queryChunks ?? [];
  for (const chunk of chunks) {
    // drizzle's `StringChunk` also carries a `value` (an array of raw SQL
    // text fragments) — only `Param` carries the bound scalar we compared
    // against, so skip anything array-valued.
    if (chunk && typeof chunk === "object" && "value" in chunk && !Array.isArray((chunk as { value: unknown }).value)) {
      return (chunk as { value: unknown }).value;
    }
  }
  return undefined;
}

type Row = Record<string, unknown>;

function createFakeDb(rowsByTable: Map<object, Row[]>) {
  return {
    select() {
      return {
        from(table: object) {
          const rows = rowsByTable.get(table) ?? [];
          return {
            where(cond: unknown) {
              const value = paramValue(cond);
              const filtered = rows.filter((r) => Object.values(r).includes(value));
              return {
                orderBy: () => ({ limit: async () => filtered }),
              };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/db", () => ({ getDb: () => currentDb }));
let currentDb: ReturnType<typeof createFakeDb>;

// `getCookieSigningKey(env)` reads `env.SESSIONS.get("COOKIE_SIGNING_KEY")` (a KV
// binding), not a plain env var — mock the KV shape (matches server.test.ts).
const env = { SESSIONS: { get: async () => "test-key-please-change" } } as unknown as Env;

const { gwsRouter } = await import("../gws");

describe("GET /api/gws/tools", () => {
  it("returns the tool catalog with JSON-Schema input shapes, no auth required", async () => {
    const res = await gwsRouter.request("/tools");
    expect(res.status).toBe(200);
    const json: any = await res.json();
    const names = json.tools.map((t: any) => t.name);
    expect(names).toContain("gmail_send");

    const gmailSend = json.tools.find((t: any) => t.name === "gmail_send");
    expect(typeof gmailSend.description).toBe("string");
    expect(gmailSend.inputSchema).toBeTypeOf("object");
    expect(gmailSend.inputSchema.properties).toHaveProperty("to");
    expect(gmailSend.inputSchema.properties).toHaveProperty("subject");
    expect(gmailSend.inputSchema.properties).toHaveProperty("body");
  });
});

describe("GET /api/gws/operations", () => {
  it("401s without a valid session cookie", async () => {
    currentDb = createFakeDb(new Map());
    const res = await gwsRouter.request("/operations", {}, env);
    expect(res.status).toBe(401);
  });

  it("returns operations for an authenticated caller", async () => {
    currentDb = createFakeDb(
      new Map([[mcpLogs, [{ id: "op1", serverName: "google-workspace", toolName: "drive_search" }]]]),
    );
    const cookie = (await createSessionCookie(env, { sub: "s1" })).split(";")[0];
    const res = await gwsRouter.request("/operations", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.operations).toHaveLength(1);
  });
});

describe("GET /api/gws/assets", () => {
  it("401s without a valid session cookie", async () => {
    currentDb = createFakeDb(new Map());
    const res = await gwsRouter.request("/assets", {}, env);
    expect(res.status).toBe(401);
  });

  it("only returns the caller's own assets and events, not other users'", async () => {
    currentDb = createFakeDb(
      new Map<object, Row[]>([
        [
          workspaceAssets,
          [
            { id: "a1", userSub: "s1", assetType: "doc", title: "mine" },
            { id: "a2", userSub: "s2", assetType: "doc", title: "not mine" },
          ],
        ],
        [
          assetEvents,
          [
            { id: "e1", assetId: "a1", userSub: "s1", action: "read" },
            { id: "e2", assetId: "a2", userSub: "s2", action: "read" },
          ],
        ],
      ]),
    );
    const cookie = (await createSessionCookie(env, { sub: "s1" })).split(";")[0];
    const res = await gwsRouter.request("/assets", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.assets).toHaveLength(1);
    expect(json.assets[0].id).toBe("a1");
    expect(json.assets[0].events).toHaveLength(1);
    expect(json.assets[0].events[0].id).toBe("e1");
  });
});
