import { describe, it, expect, vi, afterEach } from "vitest";
import { SheetsService } from "../sheets";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("SheetsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
