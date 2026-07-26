import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangesService } from "../changes";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ startPageToken: "1" }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("ChangesService.getStartPageToken", () => {
  it("calls changes/startPageToken", async () => {
    const svc = new ChangesService({} as any, "s1");
    const out = await svc.getStartPageToken();
    expect(out.startPageToken).toBe("1");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://www.googleapis.com/drive/v3/changes/startPageToken");
    expect(url).toContain("supportsAllDrives=true");
  });
});

describe("ChangesService.list", () => {
  it("calls changes.list with pageToken and fields", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ changes: [{ fileId: "f1", time: "t1" }], newStartPageToken: "2" }), { status: 200 }),
    );
    const svc = new ChangesService({} as any, "s1");
    const out = await svc.list("1");
    expect(out.changes[0].fileId).toBe("f1");
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url).toContain("https://www.googleapis.com/drive/v3/changes?");
    expect(url).toContain("pageToken=1");
    expect(decodeURIComponent(url)).toContain("fields=changes(fileId,time,removed,file(id,name,mimeType,modifiedTime)),newStartPageToken,nextPageToken");
  });
});

describe("ChangesService.watch", () => {
  it("posts to changes/watch with web_hook type and address", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ id: "ch1", resourceId: "r1", resourceUri: "https://example.com/res" }),
        { status: 200 },
      ),
    );
    const svc = new ChangesService({} as any, "s1");
    const out = await svc.watch("1", { id: "ch1", address: "https://example.com/webhook" });
    expect(out.resourceId).toBe("r1");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toContain("https://www.googleapis.com/drive/v3/changes/watch");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe("web_hook");
    expect(body.address).toBe("https://example.com/webhook");
  });
});

describe("ChangesService.stop", () => {
  it("posts to channels/stop with channel id and resourceId", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const svc = new ChangesService({} as any, "s1");
    const out = await svc.stop("ch1", "r1");
    expect(out.ok).toBe(true);
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toBe("https://www.googleapis.com/drive/v3/channels/stop");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ id: "ch1", resourceId: "r1" });
  });
});
