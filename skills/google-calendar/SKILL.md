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
- **`start` / `end`** — Two formats:
  - **Timed events**: `{ dateTime: "2025-01-15T10:00:00-05:00" }` — ISO 8601
    with timezone offset
  - **All-day events**: `{ date: "2025-01-15" }` — YYYY-MM-DD format. The end
    date is exclusive (use the next day).
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
- **`eventType`** — The type of event (see
  [Calendar Status Events](#calendar-status-events) below):
  - `"default"` — Regular event (default if omitted)
  - `"focusTime"` — Focus time block
  - `"outOfOffice"` — Out-of-office event
  - `"workingLocation"` — Working location indicator

### Example — Regular Timed Event

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

### Example — All-Day Event

```
calendar.createEvent({
  calendarId: "primary",
  summary: "Team Offsite",
  start: { date: "2025-01-15" },
  end: { date: "2025-01-17" },
  description: "Two-day team offsite"
})
```

## Calendar Status Events

`calendar.createEvent` supports creating focus time, out-of-office, and working
location events via the `eventType` parameter. These are all created through the
same tool — there are no separate tools for each type.

### Focus Time

Blocks concentrated work periods. Can auto-decline conflicting meetings.

> **Constraint:** Focus time events **cannot be all-day events** — they must use
> `dateTime`, not `date`.

```
calendar.createEvent({
  calendarId: "primary",
  eventType: "focusTime",
  start: { dateTime: "2025-01-15T09:00:00-05:00" },
  end: { dateTime: "2025-01-15T12:00:00-05:00" },
  focusTimeProperties: {
    chatStatus: "doNotDisturb",
    autoDeclineMode: "declineOnlyNewConflictingInvitations",
    declineMessage: "In focus mode, will respond later"
  }
})
```

- **`summary`** defaults to `"Focus Time"` if omitted
- **`focusTimeProperties.chatStatus`** — `"doNotDisturb"` (default) or
  `"available"`
- **`focusTimeProperties.autoDeclineMode`** —
  `"declineOnlyNewConflictingInvitations"` (default),
  `"declineAllConflictingInvitations"`, or `"declineNone"`
- **`focusTimeProperties.declineMessage`** — optional message sent when
  declining

### Out of Office

Signals unavailability and auto-declines conflicting meetings.

> **Constraint:** Out-of-office events **cannot be all-day events** — they must
> use `dateTime`, not `date`.

```
calendar.createEvent({
  calendarId: "primary",
  eventType: "outOfOffice",
  summary: "Vacation",
  start: { dateTime: "2025-01-15T00:00:00-05:00" },
  end: { dateTime: "2025-01-19T00:00:00-05:00" },
  outOfOfficeProperties: {
    autoDeclineMode: "declineAllConflictingInvitations",
    declineMessage: "I am on vacation until Jan 19"
  }
})
```

- **`summary`** defaults to `"Out of Office"` if omitted
- **`outOfOfficeProperties.autoDeclineMode`** —
  `"declineOnlyNewConflictingInvitations"` (default),
  `"declineAllConflictingInvitations"`, or `"declineNone"`
- **`outOfOfficeProperties.declineMessage`** — optional message sent when
  declining

### Working Location

Indicates where the user is working from. Supports both timed and all-day
events.

```
calendar.createEvent({
  calendarId: "primary",
  eventType: "workingLocation",
  start: { date: "2025-01-15" },
  end: { date: "2025-01-16" },
  workingLocationProperties: {
    type: "homeOffice"
  }
})
```

- **`summary`** defaults to `"Working Location"` if omitted
- **All-day working location events** must span **exactly one day**. Use the
  next day as the exclusive `end` date.
- **`workingLocationProperties`** is **required** when `eventType` is
  `"workingLocation"`
- **`workingLocationProperties.type`** — `"homeOffice"`, `"officeLocation"`, or
  `"customLocation"`
- **`officeLocation`** — `{ buildingId?: string, label?: string }` (when type is
  `"officeLocation"`)
- **`customLocation`** — `{ label: string }` (when type is `"customLocation"`)

### Listing Events by Type

Use the `eventTypes` parameter on `calendar.listEvents` to filter by event type:

```
calendar.listEvents({
  calendarId: "primary",
  timeMin: "2025-01-15T00:00:00-05:00",
  timeMax: "2025-01-17T23:59:59-05:00",
  eventTypes: ["focusTime", "outOfOffice", "workingLocation"]
})
```

Available types: `"default"`, `"focusTime"`, `"outOfOffice"`,
`"workingLocation"`, `"birthday"`, `"fromGmail"`.

## Updating Events

Use `calendar.updateEvent` for modifications. Only the fields you provide will
be changed — everything else is preserved.

- **Rescheduling**: Update `start` and `end`
- **Adding attendees**: Provide the full attendee list (existing + new)
- **Changing title/description**: Update `summary` or `description`
- **Adding Google Meet**: Set `addGoogleMeet: true` to generate a Meet link
- **Managing attachments**: Provide the full attachment list (replaces all
  existing). Pass `attachments: []` to clear all attachments.

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

| Tool                      | Action                           | Key Parameters                                                                       |
| :------------------------ | :------------------------------- | :----------------------------------------------------------------------------------- |
| `calendar.list`           | List all calendars               | _(none)_                                                                             |
| `calendar.listEvents`     | List events (filterable by type) | `calendarId`, `timeMin`, `timeMax`, `eventTypes`                                     |
| `calendar.getEvent`       | Get event details                | `eventId`, `calendarId`                                                              |
| `calendar.createEvent`    | Create event (all types)         | `calendarId`, `summary`, `start`, `end`, `eventType`, `addGoogleMeet`, `attachments` |
| `calendar.updateEvent`    | Modify an existing event         | `eventId`, `summary`, `start`, `end`, `attendees`, `addGoogleMeet`, `attachments`    |
| `calendar.deleteEvent`    | Delete an event                  | `eventId`, `calendarId`                                                              |
| `calendar.respondToEvent` | Accept/decline an invite         | `eventId`, `responseStatus`                                                          |
| `calendar.findFreeTime`   | Find available meeting time      | `attendees`, `timeMin`, `timeMax`, `duration`                                        |
