import { describe, it, expect } from "vitest";
import { gwsRouter } from "../gws";

describe("GET /api/gws/tools", () => {
  it("returns the tool catalog with JSON-Schema input shapes", async () => {
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
