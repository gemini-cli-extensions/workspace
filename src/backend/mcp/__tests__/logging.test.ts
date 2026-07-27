import { beforeEach, describe, expect, it, vi } from "vitest";

import { assetEvents, mcpLogs, workspaceAssets } from "@db/schemas";

// `getDb` is swapped for a fake whose call shape mirrors the real chain used
// in src/backend/mcp/logging.ts:
//   - insert:  db.insert(table).values(payload)               (awaited directly)
//   - select:  db.select({...}).from(table).where(cond).limit(1)
//   - update:  db.update(table).set(payload).where(cond)       (awaited directly)
let currentDb: ReturnType<typeof createFakeDb>;
vi.mock("@/db", () => ({
  getDb: () => currentDb,
}));

type Call = { op: "insert" | "update"; table: unknown; payload: unknown };

function createFakeDb(existingRows: Array<{ id: string }>) {
  const calls: Call[] = [];
  return {
    calls,
    insert(table: unknown) {
      return {
        values(payload: unknown) {
          calls.push({ op: "insert", table, payload });
          return Promise.resolve();
        },
      };
    },
    select(_cols: unknown) {
      return {
        from(_table: unknown) {
          return {
            where(_cond: unknown) {
              return {
                limit: async (_n: number) => existingRows,
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(payload: unknown) {
          return {
            where(_cond: unknown) {
              calls.push({ op: "update", table, payload });
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
}

// Import after the mock is set up so `logging.ts` picks up the fake getDb.
const { logAssetTouch, logOperation } = await import("../logging");

describe("logAssetTouch", () => {
  beforeEach(() => {
    currentDb = createFakeDb([]);
  });

  it("inserts a new asset row then an asset-event row when no existing asset is found", async () => {
    currentDb = createFakeDb([]); // SELECT finds nothing
    await logAssetTouch({} as Env, {
      userSub: "s1",
      assetType: "doc",
      googleId: "d1",
      action: "create",
      toolName: "docs_create",
    });

    expect(currentDb.calls).toHaveLength(2);
    expect(currentDb.calls[0]).toMatchObject({ op: "insert", table: workspaceAssets });
    expect(currentDb.calls[1]).toMatchObject({ op: "insert", table: assetEvents });
    expect((currentDb.calls[1].payload as { action: string }).action).toBe("create");
  });

  it("updates the existing asset row (no duplicate insert) then inserts an asset-event row", async () => {
    currentDb = createFakeDb([{ id: "existing-asset-id" }]); // SELECT finds a row
    await logAssetTouch({} as Env, {
      userSub: "s1",
      assetType: "doc",
      googleId: "d1",
      action: "update",
      toolName: "docs_update",
    });

    expect(currentDb.calls).toHaveLength(2);
    expect(currentDb.calls[0]).toMatchObject({ op: "update", table: workspaceAssets });
    expect(currentDb.calls[1]).toMatchObject({ op: "insert", table: assetEvents });
    expect((currentDb.calls[1].payload as { assetId: string }).assetId).toBe("existing-asset-id");
    // No workspaceAssets insert should ever occur for an existing row.
    expect(currentDb.calls.some((c) => c.op === "insert" && c.table === workspaceAssets)).toBe(false);
  });
});

describe("logOperation", () => {
  beforeEach(() => {
    currentDb = createFakeDb([]);
  });

  it("inserts one mcp_logs row with serverName 'google-workspace'", async () => {
    await logOperation({} as Env, {
      toolName: "docs_create",
      success: true,
      latencyMs: 42.6,
    });

    expect(currentDb.calls).toHaveLength(1);
    expect(currentDb.calls[0].op).toBe("insert");
    expect(currentDb.calls[0].table).toBe(mcpLogs);
    expect(currentDb.calls[0].payload).toMatchObject({
      serverName: "google-workspace",
      toolName: "docs_create",
      success: true,
      latencyMs: 43,
    });
  });
});
