import { describe, it, expect, vi, afterEach } from "vitest";
import { AppsScriptService } from "../appsscript";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("AppsScriptService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createProject posts title+parentId to /projects", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ scriptId: "sc1", title: "My Script" }), { status: 200 }),
    );
    const out = await new AppsScriptService({} as any, "s1").createProject("My Script", "parent1");
    expect(out.scriptId).toBe("sc1");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://script.googleapis.com/v1/projects");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "My Script", parentId: "parent1" });
  });

  it("getContent fetches /projects/{id}/content", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new AppsScriptService({} as any, "s1").getContent("sc1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://script.googleapis.com/v1/projects/sc1/content");
  });

  it("updateContent PUTs files to /projects/{id}/content", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const files = [{ name: "Code", type: "SERVER_JS", source: "function f(){}" }];
    await new AppsScriptService({} as any, "s1").updateContent("sc1", files);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://script.googleapis.com/v1/projects/sc1/content");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ files });
  });

  it("run posts function+parameters+devMode to /scripts/{id}:run", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new AppsScriptService({} as any, "s1").run("sc1", "doThing", [1, 2]);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://script.googleapis.com/v1/scripts/sc1:run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ function: "doThing", parameters: [1, 2], devMode: true });
  });

  it("listProcesses fetches /processes", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new AppsScriptService({} as any, "s1").listProcesses();
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://script.googleapis.com/v1/processes");
  });
});
