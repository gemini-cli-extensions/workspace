import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommentsService } from "../comments";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ comments: [] }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("CommentsService.list", () => {
  it("calls comments.list with fields param", async () => {
    const svc = new CommentsService({} as any, "s1");
    await svc.list("f1");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files/f1/comments");
    expect(decodeURIComponent(url)).toContain("fields=comments(id,content,htmlContent,author,resolved,anchor,createdTime,modifiedTime,replies),nextPageToken");
  });
});

describe("CommentsService.create", () => {
  it("posts without anchor for an unanchored comment", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "c1", content: "hi" }), { status: 200 }));
    const svc = new CommentsService({} as any, "s1");
    await svc.create("f1", "hi");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const init = lastCall[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.content).toBe("hi");
    expect(body).not.toHaveProperty("anchor");
  });

  it("posts with anchor when provided", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "c2", content: "hi", anchor: "a1" }), { status: 200 }));
    const svc = new CommentsService({} as any, "s1");
    await svc.create("f1", "hi", "a1");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const init = lastCall[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.anchor).toBe("a1");
  });
});

describe("CommentsService.reply", () => {
  it("posts to the replies endpoint", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "r1", content: "reply" }), { status: 200 }));
    const svc = new CommentsService({} as any, "s1");
    await svc.reply("f1", "c1", "reply");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files/f1/comments/c1/replies");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).content).toBe("reply");
  });
});

describe("CommentsService.resolve", () => {
  it("posts a reply with action resolve", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ id: "r2", action: "resolve" }), { status: 200 }));
    const svc = new CommentsService({} as any, "s1");
    await svc.resolve("f1", "c1");
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = lastCall[0] as string;
    const init = lastCall[1] as RequestInit;
    expect(url).toContain("https://www.googleapis.com/drive/v3/files/f1/comments/c1/replies");
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe("resolve");
    expect(body.content).toBe("Resolved.");
  });
});

describe("CommentsService.findMentions", () => {
  it("filters comments and replies by tag, case-insensitively", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          comments: [
            { id: "c1", content: "hey #colby take a look", replies: [] },
            { id: "c2", content: "unrelated note", replies: [{ content: "no mention here" }] },
            { id: "c3", content: "fyi", replies: [{ content: "cc #COLBY please" }] },
          ],
        }),
        { status: 200 },
      ),
    );
    const svc = new CommentsService({} as any, "s1");
    const out = await svc.findMentions("f1", "#colby");
    expect(out.tag).toBe("#colby");
    expect(out.matches.map((m) => m.id)).toEqual(["c1", "c3"]);
  });
});
