import { describe, it, expect, vi } from "vitest";
import { googleJson, GoogleApiError } from "../googleClient";

vi.mock("../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at-xyz") }));

describe("googleClient", () => {
  it("attaches bearer token and parses json", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await googleJson<{ ok: number }>({} as any, "s1", "https://www.googleapis.com/x");
    expect(out.ok).toBe(1);
    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as any).Authorization).toBe("Bearer at-xyz");
  });

  it("throws GoogleApiError on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(googleJson({} as any, "s1", "https://www.googleapis.com/x")).rejects.toBeInstanceOf(GoogleApiError);
  });
});
