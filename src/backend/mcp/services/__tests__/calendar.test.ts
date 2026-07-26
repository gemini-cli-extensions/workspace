import { describe, it, expect, vi, afterEach } from "vitest";
import { CalendarService } from "../calendar";
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("CalendarService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listEvents defaults to primary calendar and empty items", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const out = await new CalendarService({} as any, "s1").listEvents();
    expect(out.items).toEqual([]);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  });

  it("listEvents sets singleEvents+orderBy when timeMin given, encodes calendarId", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: "e1" }] }), { status: 200 }),
    );
    const out = await new CalendarService({} as any, "s1").listEvents("a@b.com", { timeMin: "2026-01-01T00:00:00Z", maxResults: 5 });
    expect(out.items[0].id).toBe("e1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent("a@b.com"));
    expect(url).toContain("singleEvents=true");
    expect(url).toContain("orderBy=startTime");
    expect(url).toContain("maxResults=5");
  });

  it("getEvent fetches by calendarId + eventId", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    await new CalendarService({} as any, "s1").getEvent("primary", "e1");
    const url = spy.mock.calls[0][0] as string;
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/e1");
  });

  it("createEvent posts event body to calendar events", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "e2", htmlLink: "http://x" }), { status: 200 }),
    );
    const event = { summary: "Meet", start: { dateTime: "2026-01-01T10:00:00Z" }, end: { dateTime: "2026-01-01T11:00:00Z" } };
    const out = await new CalendarService({} as any, "s1").createEvent("primary", event);
    expect(out.id).toBe("e2");
    const url = spy.mock.calls[0][0] as string;
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(event);
  });
});
