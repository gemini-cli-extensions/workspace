import { describe, it, expect, vi, afterEach } from "vitest";
import { SlidesService } from "../slides";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("SlidesService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("create posts title to presentations", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ presentationId: "p1", title: "Deck" }), { status: 200 }),
    );
    const out = await new SlidesService({} as any, "s1").create("Deck");
    expect(out.presentationId).toBe("p1");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Deck" });
  });

  it("get fetches presentation by id", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ presentationId: "p1", title: "Deck", slides: [] }), { status: 200 }),
    );
    const out = await new SlidesService({} as any, "s1").get("p1");
    expect(out.presentationId).toBe("p1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1");
  });

  it("batchUpdate posts requests to :batchUpdate", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const requests = [{ createSlide: {} }];
    await new SlidesService({} as any, "s1").batchUpdate("p1", requests);
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://slides.googleapis.com/v1/presentations/p1:batchUpdate");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ requests });
  });
});
