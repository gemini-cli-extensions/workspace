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
