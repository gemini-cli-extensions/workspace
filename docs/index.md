# Google Workspace Extension Documentation

This document provides an overview of the Google Workspace extension for Gemini CLI.

## Available Tools

The extension provides the following tools:

### Google Docs
- `docs.create`: Creates a new Google Doc.
- `docs.insertText`: Inserts text at the beginning of a Google Doc.
- `docs.find`: Finds Google Docs by searching for a query in their title.
- `docs.move`: Moves a document to a specified folder.
- `docs.getText`: Retrieves the text content of a Google Doc.
- `docs.appendText`: Appends text to the end of a Google Doc.
- `docs.replaceText`: Replaces all occurrences of a given text with new text in a Google Doc.
- `docs.extractIdFromUrl`: Extracts the document ID from a Google Workspace URL.

### Google Slides
- `slides.getText`: Retrieves the text content of a Google Slides presentation.
- `slides.find`: Finds Google Slides presentations by searching for a query.
- `slides.getMetadata`: Gets metadata about a Google Slides presentation.

### Google Sheets
- `sheets.getText`: Retrieves the content of a Google Sheets spreadsheet.
- `sheets.getRange`: Gets values from a specific range in a Google Sheets spreadsheet.
- `sheets.find`: Finds Google Sheets spreadsheets by searching for a query.
- `sheets.getMetadata`: Gets metadata about a Google Sheets spreadsheet.

### Google Drive
- `drive.search`: Searches for files and folders in Google Drive.
- `drive.findFolder`: Finds a folder by name in Google Drive.
- `drive.downloadFile`: Downloads a file from Google Drive to a local path.

### Google Calendar
- `calendar.list`: Lists all of the user's calendars.
- `calendar.createEvent`: Creates a new event in a calendar.
- `calendar.listEvents`: Lists events from a calendar.
- `calendar.getEvent`: Gets the details of a specific calendar event.
- `calendar.findFreeTime`: Finds a free time slot for multiple people to meet.
- `calendar.updateEvent`: Updates an existing event in a calendar.
- `calendar.respondToEvent`: Responds to a meeting invitation (accept, decline, or tentative).

### Google Chat
- `chat.listSpaces`: Lists the spaces the user is a member of.
- `chat.findSpaceByName`: Finds a Google Chat space by its display name.
- `chat.sendMessage`: Sends a message to a Google Chat space.
- `chat.getMessages`: Gets messages from a Google Chat space.
- `chat.sendDm`: Sends a direct message to a user.
- `chat.findDmByEmail`: Finds a Google Chat DM space by a user's email address.
- `chat.listThreads`: Lists threads from a Google Chat space in reverse chronological order.
- `chat.setUpSpace`: Sets up a new Google Chat space with a display name and a list of members.

### Gmail
- `gmail.search`: Search for emails in Gmail using query parameters.
- `gmail.get`: Get the full content of a specific email message.
- `gmail.modify`: Modify a Gmail message.
- `gmail.send`: Send an email message.
- `gmail.createDraft`: Create a draft email message.
- `gmail.sendDraft`: Send a previously created draft email.
- `gmail.listLabels`: List all Gmail labels in the user's mailbox.

### Time
- `time.getCurrentDate`: Gets the current date. Returns both UTC (for API use) and local time (for user display), along with the timezone.
- `time.getCurrentTime`: Gets the current time. Returns both UTC (for API use) and local time (for user display), along with the timezone.
- `time.getTimeZone`: Gets the local timezone.

### People
- `people.getUserProfile`: Gets a user's profile information.
- `people.getMe`: Gets the profile information of the authenticated user.

