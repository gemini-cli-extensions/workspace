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

describe("DriveService.createFile", () => {
  it("posts a multipart/related upload with metadata + media parts", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: "f3", name: "notes.txt", mimeType: "text/plain" }), { status: 200 }),
    );
    const svc = new DriveService({} as any, "s1");
    const out = await svc.createFile("notes.txt", "text/plain", "hello world", "parent1");
    expect(out.id).toBe("f3");
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain("https://www.googleapis.com/upload/drive/v3/files");
    expect(url).toContain("uploadType=multipart");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toContain("multipart/related");
    const body = init.body as string;
    expect(body).toContain(`"name":"notes.txt"`);
    expect(body).toContain(`"parents":["parent1"]`);
    expect(body).toContain("hello world");
  });
});

describe("DriveService.readContent", () => {
  it("exports Google Docs to text/plain", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("/export")) return new Response("exported text", { status: 200 });
      return new Response(JSON.stringify({ mimeType: "application/vnd.google-apps.document", name: "Doc" }), { status: 200 });
    });
    const svc = new DriveService({} as any, "s1");
    const out = await svc.readContent("f1");
    expect(out.exported).toBe(true);
    expect(out.mimeType).toBe("text/plain");
    expect(out.content).toBe("exported text");
    const exportCall = fetchSpy.mock.calls.find((c: any[]) => String(c[0]).includes("/export"))!;
    expect(decodeURIComponent(String(exportCall[0]))).toContain("mimeType=text/plain");
  });

  it("reads binary/plain files via alt=media", async () => {
    fetchSpy.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("alt=media")) return new Response("raw bytes", { status: 200 });
      return new Response(JSON.stringify({ mimeType: "text/plain", name: "file.txt" }), { status: 200 });
    });
    const svc = new DriveService({} as any, "s1");
    const out = await svc.readContent("f2");
    expect(out.exported).toBe(false);
    expect(out.mimeType).toBe("text/plain");
    expect(out.content).toBe("raw bytes");
  });
});

describe("DriveService.listRecent", () => {
  it("orders by modifiedTime desc", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ files: [{ id: "f1", name: "Doc", mimeType: "text/plain" }] }), { status: 200 }));
    const svc = new DriveService({} as any, "s1");
    const out = await svc.listRecent(5);
    expect(out.files[0].id).toBe("f1");
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(decodeURIComponent(url)).toContain("orderBy=modifiedTime desc");
    expect(url).toContain("pageSize=5");
  });
});

describe("DriveService.getPermissions", () => {
  it("gets permissions for a file", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ permissions: [{ id: "p1", type: "user", role: "writer", emailAddress: "a@b.com" }] }), { status: 200 }),
    );
    const svc = new DriveService({} as any, "s1");
    const out = await svc.getPermissions("f1");
    expect(out.permissions[0].id).toBe("p1");
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url).toContain("/files/f1/permissions");
    expect(decodeURIComponent(url)).toContain("permissions(id,type,role,emailAddress,displayName)");
  });
});
