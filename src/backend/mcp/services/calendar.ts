import { googleJson } from "../googleClient";

export type CalendarEvent = { id: string; summary?: string; start?: unknown; end?: unknown; htmlLink?: string };

const BASE = "https://www.googleapis.com/calendar/v3";

export class CalendarService {
  constructor(private env: Env, private sub: string) {}

  async listEvents(
    calendarId = "primary",
    opts?: { timeMin?: string; timeMax?: string; q?: string; maxResults?: number },
  ): Promise<{ items: CalendarEvent[] }> {
    const params = new URLSearchParams();
    if (opts?.timeMin) {
      params.set("timeMin", opts.timeMin);
      params.set("singleEvents", "true");
      params.set("orderBy", "startTime");
    }
    if (opts?.timeMax) params.set("timeMax", opts.timeMax);
    if (opts?.q) params.set("q", opts.q);
    if (opts?.maxResults) params.set("maxResults", String(opts.maxResults));
    const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const out = await googleJson<{ items?: CalendarEvent[] }>(this.env, this.sub, url);
    return { items: out.items ?? [] };
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return googleJson<CalendarEvent>(
      this.env,
      this.sub,
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    );
  }

  async createEvent(
    calendarId: string,
    event: { summary: string; description?: string; start: object; end: object; attendees?: { email: string }[] },
  ): Promise<CalendarEvent> {
    return googleJson<CalendarEvent>(
      this.env,
      this.sub,
      `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      { method: "POST", body: JSON.stringify(event) },
    );
  }
}
