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

  it("createDraft posts message.raw to drafts", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "draft1" }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").createDraft("a@b.com", "Hi", "Body");
    expect(out.id).toBe("draft1");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toContain("/drafts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(typeof body.message.raw).toBe("string");
  });

  function mockHeadersAndProfile(spy: ReturnType<typeof vi.spyOn>) {
    spy.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("/profile")) {
        return new Response(JSON.stringify({ emailAddress: "me@self.com" }), { status: 200 });
      }
      if (u.includes("/messages/")) {
        return new Response(
          JSON.stringify({
            threadId: "thread1",
            payload: {
              headers: [
                { name: "From", value: "Alice <alice@x.com>" },
                { name: "To", value: "me@self.com, Bob <bob@y.com>" },
                { name: "Cc", value: "carol@z.com" },
                { name: "Subject", value: "Hello" },
                { name: "Message-ID", value: "<orig-id@mail.gmail.com>" },
                { name: "References", value: "<prev@mail.gmail.com>" },
              ],
            },
          }),
          { status: 200 },
        );
      }
      // drafts POST
      return new Response(JSON.stringify({ id: "draft2", message: { id: "m2", threadId: "thread1" } }), { status: 200 });
    });
  }

  it("createReplyDraft defaults to reply-all in the same thread", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    mockHeadersAndProfile(spy);
    const out = await new GmailService({} as any, "s1").createReplyDraft("msg1", "Thanks!");
    expect(out.id).toBe("draft2");

    const draftCall = spy.mock.calls.find((c: any[]) => String(c[0]).includes("/drafts"))!;
    const draftInit = draftCall[1] as RequestInit;
    expect(draftInit.method).toBe("POST");
    const draftBody = JSON.parse(draftInit.body as string);
    expect(draftBody.message.threadId).toBe("thread1");

    const raw = draftBody.message.raw as string;
    const mime = decodeURIComponent(escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))));
    expect(mime).toContain("In-Reply-To: <orig-id@mail.gmail.com>");
    expect(mime).toContain("References: <prev@mail.gmail.com> <orig-id@mail.gmail.com>");
    expect(mime).toContain("Subject: Re: Hello");
    expect(mime).toContain("alice@x.com");
    expect(mime).toContain("bob@y.com");
    expect(mime).toContain("carol@z.com");
    expect(mime).not.toContain("me@self.com");
  });

  it("createReplyDraft honors opts.to override", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    mockHeadersAndProfile(spy);
    await new GmailService({} as any, "s1").createReplyDraft("msg1", "Thanks!", { to: ["x@y.com"] });

    const draftCall = spy.mock.calls.find((c: any[]) => String(c[0]).includes("/drafts"))!;
    const draftInit = draftCall[1] as RequestInit;
    const draftBody = JSON.parse(draftInit.body as string);
    const raw = draftBody.message.raw as string;
    const mime = decodeURIComponent(escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))));
    expect(mime).toContain("To: x@y.com");
    expect(mime).not.toContain("alice@x.com");
  });

  it("listLabels fetches users/me/labels", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ labels: [{ id: "l1", name: "Work" }] }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").listLabels();
    expect(out.labels).toEqual([{ id: "l1", name: "Work" }]);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/labels");
  });

  it("createLabel posts name with visibility defaults", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "l2", name: "Urgent" }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").createLabel("Urgent");
    expect(out.id).toBe("l2");
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ name: "Urgent", labelListVisibility: "labelShow", messageListVisibility: "show" });
  });

  it("modifyMessageLabels posts add/remove label ids", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    await new GmailService({} as any, "s1").modifyMessageLabels("m1", ["LABEL_A"], ["LABEL_B"]);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/modify");
    expect(JSON.parse(init.body as string)).toEqual({ addLabelIds: ["LABEL_A"], removeLabelIds: ["LABEL_B"] });
  });

  it("getThread fetches thread with format=full", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "t1", messages: [] }), { status: 200 }));
    const out = await new GmailService({} as any, "s1").getThread("t1");
    expect(out.id).toBe("t1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/threads/t1?format=full");
  });

  it("trashMessage posts to messages/{id}/trash", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
    await new GmailService({} as any, "s1").trashMessage("m1");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1/trash");
    expect(init.method).toBe("POST");
  });
});
