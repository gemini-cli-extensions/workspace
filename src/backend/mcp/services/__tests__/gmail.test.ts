import { describe, it, expect, vi, afterEach } from "vitest";
import { GmailService } from "../gmail";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("GmailService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listMessages queries users/me/messages", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "m1", threadId: "t1" }] }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").listMessages("from:x");
    expect(out.messages[0].id).toBe("m1");
    expect(decodeURIComponent(spy.mock.calls[0][0] as string)).toContain("q=from:x");
  });
  it("send posts base64url raw to messages/send", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "sent1" }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").send("a@b.com", "Hi", "Body");
    expect(out.id).toBe("sent1");
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.raw).toBe("string");
  });
});
