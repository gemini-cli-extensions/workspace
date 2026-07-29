import { describe, it, expect } from "vitest";

import { diffLabels, parentIdFor } from "../label-sync";

describe("diffLabels", () => {
  it("registers new, reactivates returned, soft-deletes vanished", () => {
    const gmail = [
      { id: "L1", name: "Inbox" }, // already active in D1
      { id: "L2", name: "Clients" }, // new
      { id: "L3", name: "Old" }, // was soft-deleted, back now
    ];
    const d1 = [
      { id: "L1", isActive: true },
      { id: "L3", isActive: false },
      { id: "L9", isActive: true }, // gone from Gmail
    ];
    const diff = diffLabels(gmail, d1);
    expect(diff.toRegister.map((l) => l.id)).toEqual(["L2"]);
    expect(diff.toReactivate).toEqual(["L3"]);
    expect(diff.toSoftDelete).toEqual(["L9"]);
  });

  it("no changes when in sync", () => {
    const both = [{ id: "L1", name: "A" }];
    const diff = diffLabels(both, [{ id: "L1", isActive: true }]);
    expect(diff.toRegister).toHaveLength(0);
    expect(diff.toReactivate).toHaveLength(0);
    expect(diff.toSoftDelete).toHaveLength(0);
  });
});

describe("parentIdFor", () => {
  const byName = new Map([
    ["Clients", "L2"],
    ["Clients/Acme", "L5"],
  ]);
  it("resolves the immediate parent from the name path", () => {
    expect(parentIdFor("Clients/Acme", byName)).toBe("L2");
    expect(parentIdFor("Clients/Acme/2026", byName)).toBe("L5");
  });
  it("returns null for a top-level label", () => {
    expect(parentIdFor("Clients", byName)).toBeNull();
  });
});
