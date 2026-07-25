import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocsService } from "../docs";

let fetchSpy: any;
beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ documentId: "d1", title: "T" }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("DocsService", () => {
  it("create posts to docs v1 documents", async () => {
    const svc = new DocsService({} as any, "s1");
    const doc = await svc.create("T");
    expect(doc.documentId).toBe("d1");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://docs.googleapis.com/v1/documents");
  });

  it("insertText calls batchUpdate", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await new DocsService({} as any, "s1").insertText("d1", "hello");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(":batchUpdate");
  });
});
