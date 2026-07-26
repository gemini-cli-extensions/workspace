# Skill: schedule-and-summarize

Manage Google Calendar: list calendars/events, create events, and summarize the day/week.

## When to use
The user asks to "what's on my calendar", "schedule a meeting", "block time", or "summarize my week".

## Procedure
1. `listCalendars` to find the target calendar (default `primary`).
2. `listEvents(calendarId)` to read the window of interest.
3. To add: `quickAdd(calendarId, text)` for natural language, or `createEvent` with explicit ISO start/end.
4. For summaries, read events then produce a concise agenda grouped by day.

## Guardrails
- Confirm timezone/duration before creating events when ambiguous.
- Never delete events unless explicitly instructed.

## References
- Calendar events.insert: https://developers.google.com/calendar/api/v3/reference/events/insert
- Quick add: https://developers.google.com/calendar/api/v3/reference/events/quickAdd
