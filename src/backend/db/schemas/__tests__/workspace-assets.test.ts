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
