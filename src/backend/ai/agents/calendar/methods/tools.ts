/**
 * @fileoverview AI SDK tool definitions for the Calendar agent chat surface.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import type { CalendarClient } from "@/backend/google/calendar";

/**
 * Build the Calendar chat tool set bound to a client instance.
 */
export function buildCalendarTools(client: CalendarClient): ToolSet {
  return {
    listCalendars: tool({
      description: "List the user's Google calendars.",
      inputSchema: z.object({}),
      execute: async () => client.listCalendars(),
    }),
    listEvents: tool({
      description: "List upcoming events on a calendar (default 'primary').",
      inputSchema: z.object({ calendarId: z.string().default("primary") }),
      execute: async ({ calendarId }) => client.listEvents(calendarId, {}),
    }),
    quickAddEvent: tool({
      description: "Create an event from natural-language text (Google Quick Add).",
      inputSchema: z.object({ calendarId: z.string().default("primary"), text: z.string() }),
      execute: async ({ calendarId, text }) => client.quickAdd(calendarId, text),
    }),
    createEvent: tool({
      description: "Create a calendar event with explicit start/end ISO datetimes.",
      inputSchema: z.object({
        calendarId: z.string().default("primary"),
        summary: z.string(),
        start: z.string(),
        end: z.string(),
      }),
      execute: async ({ calendarId, summary, start, end }) =>
        client.createEvent(
          { summary, start: { dateTime: start }, end: { dateTime: end } },
          calendarId,
        ),
    }),
  };
}
