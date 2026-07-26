/**
 * @fileoverview Workers-native Google Calendar REST client.
 *
 * `CalendarClient` extends {@link GoogleApiClient} and wraps the Calendar v3 API
 * (`https://www.googleapis.com/calendar/v3`). It ports calendar/event listing,
 * event CRUD, quick-add, and free/busy from the legacy `calendarApiHelpers.ts`
 * onto pure `fetch` — no Node `googleapis`. `suggestTime` is net-new: it derives
 * candidate free slots from a free/busy query.
 *
 * Event/calendar IDs are used verbatim (they are not Drive file IDs).
 */

import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";
const PRIMARY = "primary";

/** A calendar list entry (subset). */
export interface CalendarInfo {
  id: string;
  summary?: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
}

/** A start/end specifier for an event. */
export interface EventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

/** A calendar event (passed through largely verbatim from the API). */
export interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: EventDateTime;
  end?: EventDateTime;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: Array<{ email?: string; responseStatus?: string }>;
  recurrence?: string[];
  [key: string]: unknown;
}

/** Options for creating an event. */
export interface CreateEventOptions {
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: string[];
  sendUpdates?: "all" | "externalOnly" | "none";
  conferenceType?: "hangoutsMeet";
  recurrence?: string[];
  reminders?: { useDefault?: boolean; overrides?: { method: "email" | "popup"; minutes: number }[] };
  visibility?: "default" | "public" | "private" | "confidential";
  colorId?: string;
}

/** Options for listing events. */
export interface ListEventsOptions {
  timeMin?: string;
  timeMax?: string;
  query?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: "startTime" | "updated";
  showDeleted?: boolean;
}

/** A busy interval. */
export interface BusyInterval {
  start: string;
  end: string;
}

/**
 * Account-bound client for the Google Calendar API v3.
 *
 * @example
 * ```ts
 * const cal = new CalendarClient(env, "workspace");
 * const { events } = await cal.listEvents("primary", { maxResults: 10 });
 * ```
 */
export class CalendarClient extends GoogleApiClient {
  /**
   * List all accessible calendars.
   *
   * @returns The calendar list
   * @throws If the request fails
   */
  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await this.request<{ items?: CalendarInfo[] }>(
      `${CAL_BASE}/users/me/calendarList`,
      { query: { maxResults: 250 }, scopes: [GoogleScope.Calendar] },
    );
    return res.items ?? [];
  }

  /**
   * List events from a calendar.
   *
   * @param calendarId - Calendar ID (default `"primary"`)
   * @param opts - Filtering/paging options
   * @returns Events plus an optional `nextPageToken`
   * @throws If the calendar is missing or access is denied
   */
  async listEvents(
    calendarId: string = PRIMARY,
    opts: ListEventsOptions = {},
  ): Promise<{ events: CalendarEvent[]; nextPageToken?: string }> {
    const res = await this.request<{ items?: CalendarEvent[]; nextPageToken?: string }>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          timeMin: opts.timeMin,
          timeMax: opts.timeMax,
          q: opts.query,
          maxResults: opts.maxResults ?? 250,
          singleEvents: opts.singleEvents ?? true,
          orderBy: opts.orderBy ?? "startTime",
          showDeleted: opts.showDeleted ?? false,
        },
        scopes: [GoogleScope.Calendar],
      },
    );
    return { events: res.items ?? [], nextPageToken: res.nextPageToken };
  }

  /**
   * Get a single event.
   *
   * @param eventId - Event ID
   * @param calendarId - Calendar ID (default `"primary"`)
   * @returns The {@link CalendarEvent}
   * @throws If the event is missing or access is denied
   */
  async getEvent(eventId: string, calendarId: string = PRIMARY): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { scopes: [GoogleScope.Calendar] },
    );
  }

  /**
   * Create an event.
   *
   * @param options - Event creation options
   * @param calendarId - Calendar ID (default `"primary"`)
   * @returns The created {@link CalendarEvent}
   * @throws If the data is invalid or access is denied
   */
  async createEvent(
    options: CreateEventOptions,
    calendarId: string = PRIMARY,
  ): Promise<CalendarEvent> {
    const event: Record<string, unknown> = {
      summary: options.summary,
      description: options.description,
      location: options.location,
      start: options.start,
      end: options.end,
      visibility: options.visibility,
      colorId: options.colorId,
    };
    if (options.attendees?.length) {
      event.attendees = options.attendees.map((email) => ({ email }));
    }
    if (options.recurrence) event.recurrence = options.recurrence;
    if (options.reminders) {
      event.reminders = {
        useDefault: options.reminders.useDefault ?? false,
        overrides: options.reminders.overrides,
      };
    }
    let conferenceDataVersion = 0;
    if (options.conferenceType === "hangoutsMeet") {
      event.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
      conferenceDataVersion = 1;
    }
    return this.request<CalendarEvent>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        query: {
          sendUpdates: options.sendUpdates ?? "none",
          conferenceDataVersion: conferenceDataVersion || undefined,
        },
        body: event,
        scopes: [GoogleScope.Calendar],
      },
    );
  }

  /**
   * Patch an existing event.
   *
   * @param eventId - Event ID
   * @param updates - Partial event fields to change
   * @param calendarId - Calendar ID (default `"primary"`)
   * @returns The updated {@link CalendarEvent}
   * @throws If the event is missing or the data is invalid
   */
  async updateEvent(
    eventId: string,
    updates: Partial<CreateEventOptions>,
    calendarId: string = PRIMARY,
  ): Promise<CalendarEvent> {
    const patch: Record<string, unknown> = {};
    if (updates.summary !== undefined) patch.summary = updates.summary;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.location !== undefined) patch.location = updates.location;
    if (updates.start) patch.start = updates.start;
    if (updates.end) patch.end = updates.end;
    if (updates.visibility) patch.visibility = updates.visibility;
    if (updates.colorId) patch.colorId = updates.colorId;
    if (updates.attendees) patch.attendees = updates.attendees.map((email) => ({ email }));
    if (updates.recurrence) patch.recurrence = updates.recurrence;
    if (updates.reminders) {
      patch.reminders = {
        useDefault: updates.reminders.useDefault ?? false,
        overrides: updates.reminders.overrides,
      };
    }
    return this.request<CalendarEvent>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        query: { sendUpdates: updates.sendUpdates ?? "none" },
        body: patch,
        scopes: [GoogleScope.Calendar],
      },
    );
  }

  /**
   * Delete an event.
   *
   * @param eventId - Event ID
   * @param calendarId - Calendar ID (default `"primary"`)
   * @param sendUpdates - Notification policy (default `"none"`)
   * @throws If the event is missing or access is denied
   */
  async deleteEvent(
    eventId: string,
    calendarId: string = PRIMARY,
    sendUpdates: "all" | "externalOnly" | "none" = "none",
  ): Promise<void> {
    await this.request<void>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", query: { sendUpdates }, scopes: [GoogleScope.Calendar] },
    );
  }

  /**
   * Create an event from natural-language text.
   *
   * @param calendarId - Calendar ID (default `"primary"`)
   * @param text - Natural-language description (e.g. `"Lunch tomorrow 12pm"`)
   * @returns The created {@link CalendarEvent}
   * @throws If the text cannot be parsed
   */
  async quickAdd(calendarId: string = PRIMARY, text: string): Promise<CalendarEvent> {
    return this.request<CalendarEvent>(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/quickAdd`,
      { method: "POST", query: { text }, body: {}, scopes: [GoogleScope.Calendar] },
    );
  }

  /**
   * Query free/busy intervals for one or more calendars.
   *
   * @param items - Calendar IDs to query
   * @param timeMin - RFC3339 range start
   * @param timeMax - RFC3339 range end
   * @returns Map of calendarId → busy intervals
   * @throws If the request fails
   */
  async freeBusy(
    items: string[],
    timeMin: string,
    timeMax: string,
  ): Promise<Record<string, BusyInterval[]>> {
    const res = await this.request<{
      calendars?: Record<string, { busy?: BusyInterval[] }>;
    }>(`${CAL_BASE}/freeBusy`, {
      method: "POST",
      body: { timeMin, timeMax, items: items.map((id) => ({ id })) },
      scopes: [GoogleScope.Calendar],
    });
    const out: Record<string, BusyInterval[]> = {};
    for (const [id, data] of Object.entries(res.calendars ?? {})) {
      out[id] = data.busy ?? [];
    }
    return out;
  }

  /**
   * Suggest open meeting slots within a window using free/busy data.
   *
   * Computes the gaps between busy intervals (merged across the given
   * calendars) that are at least `durationMinutes` long.
   *
   * @param items - Calendar IDs whose busyness must be respected
   * @param timeMin - RFC3339 window start
   * @param timeMax - RFC3339 window end
   * @param durationMinutes - Minimum slot length (default 30)
   * @returns Candidate free slots as `{ start, end }` ISO strings
   * @throws If the free/busy request fails
   */
  async suggestTime(
    items: string[],
    timeMin: string,
    timeMax: string,
    durationMinutes = 30,
  ): Promise<{ start: string; end: string }[]> {
    const busyByCal = await this.freeBusy(items, timeMin, timeMax);
    const merged = mergeIntervals(
      Object.values(busyByCal)
        .flat()
        .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
        .filter((b) => !Number.isNaN(b.start) && !Number.isNaN(b.end)),
    );

    const windowStart = Date.parse(timeMin);
    const windowEnd = Date.parse(timeMax);
    const durationMs = durationMinutes * 60_000;
    const slots: { start: string; end: string }[] = [];

    let cursor = windowStart;
    for (const interval of merged) {
      if (interval.start - cursor >= durationMs) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(interval.start).toISOString(),
        });
      }
      cursor = Math.max(cursor, interval.end);
    }
    if (windowEnd - cursor >= durationMs) {
      slots.push({ start: new Date(cursor).toISOString(), end: new Date(windowEnd).toISOString() });
    }
    return slots;
  }
}

/** Merge overlapping `{ start, end }` (epoch-ms) intervals, sorted ascending. */
function mergeIntervals(
  intervals: { start: number; end: number }[],
): { start: number; end: number }[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}
