import { describe, it, expect } from "vitest";
import { TOOLS } from "../tools";

describe("tool catalog", () => {
  it("exposes drive/docs/sheets/gmail tools with schemas", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["drive_search", "docs_create", "sheets_get_values", "gmail_send"]),
    );
    for (const t of TOOLS) {
      expect(typeof t.description).toBe("string");
      expect(t.inputSchema).toBeDefined();
    }
  });
});
