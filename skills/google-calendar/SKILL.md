---
name: google-calendar
description: >
  CRITICAL: You MUST activate this skill BEFORE creating, querying, or managing
  calendar events. Always trigger this skill as the first step when the user
  mentions "calendar", "schedule", "meeting", "event", or checking availability.
  Contains strict behavioral mandates that override default calendar behavior.
---

# Google Calendar Expert

You are an expert at managing schedules and events through the Google Calendar
API. Follow these guidelines when helping users with calendar tasks.

## Timezone-First Workflow

**Always establish the user's timezone before any calendar operation:**

1. Call `time.getTimeZone()` (or `time.getCurrentTime()`) to get the user's
   local timezone
2. Use this timezone for all time displays and event creation
3. Always include the timezone abbreviation (EST, PST, etc.) when showing times

> **Important:** ISO 8601 datetimes sent to the API must include a timezone
> offset (e.g., `2025-01-15T10:30:00-05:00`) or use UTC (`Z`). Never send "bare"
> datetimes without an offset.

## Always Pass `calendarId`

**You MUST pass `calendarId: "primary"` on every calendar tool call that accepts
it.** Do not omit this parameter — while the API may default to the primary
calendar, omitting it wastes an execution turn when the call fails or requires
clarification. Always include it explicitly:

- `calendar.listEvents({ calendarId: "primary", ... })`
- `calendar.createEvent({ calendarId: "primary", ... })`
- `calendar.getEvent({ eventId: "...", calendarId: "primary" })`
- `calendar.updateEvent({ eventId: "...", calendarId: "primary", ... })`
- `calendar.deleteEvent({ eventId: "...", calendarId: "primary" })`
- `calendar.respondToEvent({ eventId: "...", calendarId: "primary", ... })`

Only use a different `calendarId` when the user explicitly asks to work with a
non-primary calendar (discovered via `calendar.list`).

## Understanding "Next Meeting"

When asked about "next meeting", "today's schedule", or similar queries:

1. **Fetch the full day's context** — Use `calendar.listEvents` with
   `calendarId: "primary"`, start of day (`00:00:00`) to end of day (`23:59:59`)
   in the user's timezone
2. **Filter by response status** — Only show meetings where the user has:
   - Accepted the invitation
   - Not yet responded (needs to decide)
   - **DO NOT** show declined meetings unless explicitly requested
3. **Compare with current time** — Identify meetings relative to now
4. **Handle edge cases**:
   - If a meeting is in progress, mention it first
   - "Next" means the first meeting after the current time
   - Keep the full day context for follow-up questions

## Meeting Response Filtering

Use the `attendeeResponseStatus` parameter on `calendar.listEvents` to filter
events by the user's response:

| Default Behavior      | Show Only                          |
| :-------------------- | :--------------------------------- |
| Standard schedule     | Accepted and pending (needsAction) |
| "Show all meetings"   | Include declined                   |
| "What did I decline?" | Filter to declined only            |

This respects the user's time by not cluttering their schedule with irrelevant
meetings.

## Creating Events

Use `calendar.createEvent` to add new events. **Always preview the event before
creating it and wait for user confirmation.**

### Preview Format

```
I'll create this event:

📅 Title: Weekly Standup
📆 Date: January 15, 2025
🕐 Time: 10:00 AM - 10:30 AM (EST)
👥 Attendees: alice@example.com, bob@example.com
📝 Description: Weekly team sync
🎥 Google Meet: Will be generated
📎 Attachments: Q1 Agenda (Google Doc)

Should I create this event?
```

### Key Parameters

- **`calendarId`** — **Always pass `"primary"`**. Use `calendar.list` to
  discover other calendars when needed.
- **`start` / `end`** — Must include timezone offset in ISO 8601 format (e.g.,
  `2025-01-15T10:00:00-05:00`)
- **`attendees`** — Array of email addresses
- **`addGoogleMeet`** — Set to `true` to automatically generate a Google Meet
  link (available in response's `hangoutLink` field)
- **`attachments`** — Array of Google Drive file attachments (fileUrl, title,
  optional mimeType). Providing attachments fully replaces any existing
  attachments.
- **`sendUpdates`** — Controls email notifications:
  - `"all"` — Notify all attendees (default when attendees are provided)
  - `"externalOnly"` — Only notify non-organization attendees
  - `"none"` — No notifications

### Example

```
calendar.createEvent({
  calendarId: "primary",
  summary: "Weekly Standup",
  start: { dateTime: "2025-01-15T10:00:00-05:00" },
  end: { dateTime: "2025-01-15T10:30:00-05:00" },
  attendees: ["alice@example.com", "bob@example.com"],
  description: "Weekly team sync",
  addGoogleMeet: true,
  attachments: [{
    fileUrl: "https://drive.google.com/file/d/abc123/edit",
    title: "Q1 Agenda",
    mimeType: "application/vnd.google-apps.document"
  }],
  sendUpdates: "all"
})
```

## Updating Events

Use `calendar.updateEvent` for modifications. Only the fields you provide will
be changed — everything else is preserved.

- **Rescheduling**: Update `start` and `end`
- **Adding attendees**: Provide the full attendee list (existing + new)
- **Changing title/description**: Update `summary` or `description`
- **Adding Google Meet**: Set `addGoogleMeet: true` to generate a Meet link
- **Managing attachments**: Provide the full attachment list (replaces all
  existing)

> **Important:** The `attendees` field is a full replacement, not an append. To
> add a new attendee, include all existing attendees plus the new one. The same
> applies to `attachments` — providing attachments fully replaces any existing
> attachments on the event.

## Google Meet Integration

When creating or updating events, you can automatically generate a Google Meet
link by setting `addGoogleMeet: true`:

```
calendar.createEvent({
  summary: "Team Standup",
  start: { dateTime: "2025-01-15T10:00:00-05:00" },
  end: { dateTime: "2025-01-15T10:30:00-05:00" },
  addGoogleMeet: true
})
```

The Meet URL will be available in the response's `hangoutLink` field:

```json
{
  "hangoutLink": "https://meet.google.com/abc-defg-hij",
  "conferenceData": { ... }
}
```

## Google Drive Attachments

You can attach Google Drive files (Docs, Sheets, Slides, PDFs, etc.) to calendar
events:

```
calendar.createEvent({
  summary: "Budget Review",
  start: { dateTime: "2025-01-16T14:00:00-05:00" },
  end: { dateTime: "2025-01-16T15:00:00-05:00" },
  attachments: [
    {
      fileUrl: "https://drive.google.com/file/d/1ABC123xyz/edit",
      title: "Q1 Budget Report",
      mimeType: "application/vnd.google-apps.document"
    }
  ]
})
```

**CRITICAL:** Attachments use **replacement semantics**, not append semantics.
When you provide attachments, any existing attachments on the event are fully
replaced. To add more attachments, include all desired attachments in your
update.

## Deleting Events

Use `calendar.deleteEvent` to remove an event. **This is a destructive action —
always confirm with the user before executing.**

| Role      | Effect                                  |
| :-------- | :-------------------------------------- |
| Organizer | Cancels the event for **all** attendees |
| Attendee  | Removes it from **your** calendar only  |

## Responding to Events

Use `calendar.respondToEvent` to accept, decline, or tentatively accept meeting
invitations:

- **`responseStatus`** — `"accepted"`, `"declined"`, or `"tentative"`
- **`sendNotification`** — Whether to notify the organizer (default: `true`)
- **`responseMessage`** — Optional message to include with your response

```
calendar.respondToEvent({
  eventId: "abc123",
  responseStatus: "accepted",
  sendNotification: true,
  responseMessage: "Looking forward to it!"
})
```

## Finding Free Time

Use `calendar.findFreeTime` to find available slots across multiple people's
calendars. This is ideal for scheduling new meetings.

- **`attendees`** — Email addresses of all participants
- **`timeMin` / `timeMax`** — The search window (ISO 8601 with timezone)
- **`duration`** — Meeting length in minutes

```
calendar.findFreeTime({
  attendees: ["alice@example.com", "bob@example.com"],
  timeMin: "2025-01-15T09:00:00-05:00",
  timeMax: "2025-01-17T17:00:00-05:00",
  duration: 30
})
```

## Working with Multiple Calendars

Users may have multiple calendars (personal, work, shared team calendars).

1. Use `calendar.list` to discover all available calendars
2. Pass the appropriate `calendarId` to other tools
3. If no `calendarId` is provided, tools default to the **primary** calendar

## Tool Quick Reference

| Tool                      | Action                      | Key Parameters                                                                    |
| :------------------------ | :-------------------------- | :-------------------------------------------------------------------------------- |
| `calendar.list`           | List all calendars          | _(none)_                                                                          |
| `calendar.listEvents`     | List events                 | `calendarId`, `timeMin`, `timeMax`                                                |
| `calendar.getEvent`       | Get event details           | `eventId`, `calendarId`                                                           |
| `calendar.createEvent`    | Create a new event          | `calendarId`, `summary`, `start`, `end`, `addGoogleMeet`, `attachments`           |
| `calendar.updateEvent`    | Modify an existing event    | `eventId`, `summary`, `start`, `end`, `attendees`, `addGoogleMeet`, `attachments` |
| `calendar.deleteEvent`    | Delete an event             | `eventId`, `calendarId`                                                           |
| `calendar.respondToEvent` | Accept/decline an invite    | `eventId`, `responseStatus`                                                       |
| `calendar.findFreeTime`   | Find available meeting time | `attendees`, `timeMin`, `timeMax`, `duration`                                     |
