import { describe, it, expect, vi, beforeEach } from "vitest";
import { DriveService } from "../drive";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ files: [{ id: "f1", name: "Doc", mimeType: "application/vnd.google-apps.document" }] }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("DriveService.search", () => {
  it("calls Drive v3 files.list with q and fields", async () => {
    const svc = new DriveService({} as any, "s1");
    const out = await svc.search("name contains 'Doc'");
    expect(out.files[0].id).toBe("f1");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files");
    expect(decodeURIComponent(url)).toContain("name contains 'Doc'");
  });
});

describe("DriveService.copy", () => {
  it("posts to files/{id}/copy with name and parents", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: "f2", name: "Doc copy", mimeType: "application/vnd.google-apps.document" }), { status: 200 }),
    );
    const svc = new DriveService({} as any, "s1");
    const out = await svc.copy("f1", "Doc copy", "parent1");
    expect(out.id).toBe("f2");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files/f1/copy");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe("Doc copy");
    expect(body.parents).toEqual(["parent1"]);
  });
});
