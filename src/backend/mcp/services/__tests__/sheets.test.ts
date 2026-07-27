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

  it("getMetadata fetches spreadsheet with tabs fields", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ spreadsheetId: "sh1", properties: { title: "T" }, sheets: [] }), { status: 200 }),
    );
    const out = await new SheetsService({} as any, "s1").getMetadata("sh1");
    expect(out.spreadsheetId).toBe("sh1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("/spreadsheets/sh1?fields=");
    expect(decodeURIComponent(url)).toContain("sheets(properties(sheetId,title,index))");
  });

  it("batchUpdate posts raw requests array", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const requests = [{ addSheet: { properties: { title: "New" } } }];
    await new SheetsService({} as any, "s1").batchUpdate("sh1", requests);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toContain(":batchUpdate");
    expect(JSON.parse(init.body as string)).toEqual({ requests });
  });

  it("addSheet convenience wraps addSheet request", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new SheetsService({} as any, "s1").addSheet("sh1", "New Tab");
    const init = spy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.requests[0].addSheet.properties.title).toBe("New Tab");
  });
});
