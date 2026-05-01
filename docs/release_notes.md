# Release Notes

## 0.0.8 (2026-05-01)

### New Features

- **Google Calendar**: Added support for `eventType` (Out of Office, Focus Time,
  Working Location) in Calendar Service.
- **Feature Configuration**: Introduced a new feature configuration service for
  scope-based toggles, allowing more granular control over available tools.

### Improvements

- **Authentication**: Refactored OAuth scope management to use a single source
  of truth and deduplicate read scopes, improving security and consistency.
- **Google Calendar**: Refactored validation logic to be independent of the
  service layer.
- **Google Docs**: Improved `getText` and `getSuggestions` tools to include the
  document title in their output.

### Fixes

- **Google Docs**: Resolved API errors in `docs.getText`.
- **Windows Support**: Fixed issues with `npm run clean` and handled `npm.cmd`
  correctly on Windows.
- **Documentation**: Fixed various documentation links and improved clarity of
  API usage.

### Chores

- **Dependencies**: Major update to TypeScript 6.0.3 and various other
  dependency bumps (Vite 8, Hono 4.12, etc.).

## 0.0.7 (2026-03-11)

### Breaking Changes

- **Google Sheets**: Removed `sheets.find` tool. Use `drive.search` with MIME
  type filter instead (e.g.,
  `mimeType='application/vnd.google-apps.spreadsheet'`).
- **Google Slides**: Removed `slides.find` tool. Use `drive.search` with MIME
  type filter instead (e.g.,
  `mimeType='application/vnd.google-apps.presentation'`).

### Improvements

- **Skills**: Renamed all skill directories to `google-*` prefix (e.g.,
  `calendar` → `google-calendar`) to avoid slash command conflicts.
- **Calendar Skill**: Added explicit `calendarId='primary'` mandate to prevent
  agents from omitting the required parameter.

### Skills

- **Sheets Skill**: New skill with `drive.search` guidance for finding
  spreadsheets.
- **Slides Skill**: New skill with `drive.search` guidance for finding
  presentations.
- **Docs Skill**: Updated with `drive.search` guidance and removed stale
  `docs.find`/`docs.move` references from skill and documentation.

## 0.0.6 (2026-03-08)

### New Features

- **Google Docs**: Parse rich smart chips (person, date, rich link) in document
  text output.
- **Google Docs**: Added `getSuggestions` and `getComments` tools for reading
  document suggestions and comments.
- **Google Docs**: Added `formatText` tool for applying rich formatting (bold,
  italic, headings, etc.) to text ranges.
- **Google Calendar**: Added Google Meet link generation and Google Drive file
  attachment support for `createEvent` and `updateEvent`.
- **Google Calendar**: Added `sendUpdates` parameter to `createEvent` for
  controlling attendee notifications.
- **Google Drive**: Added `trashFile` tool to move files and folders to trash.
- **Google Drive**: Added `renameFile` tool to rename files and folders.
- **Gmail**: Added `batchModify` tool for bulk modifying up to 1,000 messages at
  once.
- **Gmail**: Added `modifyThread` tool for modifying all messages in a Gmail
  thread.
- **Gmail**: Added `threadId` support in `createDraft` for creating reply
  drafts.
- **Authentication**: Added headless OAuth login for SSH, WSL, and Cloud Shell
  environments.

### Skills

- **Gmail Skill**: Added rich HTML formatting guidance for email composition.
- **Chat Skill**: Added Google Chat messaging and space management guidance.
- **Docs Skill**: Added document formatting and simplified tool primitives.
- **Calendar Skill**: Added consolidated calendar scheduling guidance.

### Fixes

- **Docs**: Fixed recursion into nested child tabs in DocsService.
- **Docs**: Polished `getSuggestions` and `getComments` output formatting.
- **Drive**: Fixed shared drive file downloads.

### Documentation & Chores

- Documented token storage locations (OS keychain and encrypted file fallback).
- Updated tool reference documentation with latest features.
- **Dependencies**: Updated MCP SDK, Hono, Google APIs, rollup, ajv, qs, and
  minimatch.

## 0.0.5 (2026-02-11)

### New Features

- **Gmail**: Added `createLabel` tool to manage email labels.
- **Slides**: Added `getImages` and `getSlideThumbnail` tools for better visual
  integration, and included slide IDs in `getMetadata` output.
- **Drive**: Enhanced support for shared drives.
- **Calendar**: Added support for event descriptions.
- **GCP**: Added comprehensive documentation and automation for GCP project
  recreation.
- **Logging**: Added authentication status updates via MCP logging for better
  observability.
- **Tools**: Added annotations for read-only tools to improve agent interaction.

### Fixes

- **Security**: Resolved esbuild vulnerability via vite override.
- **Compatibility**: Normalised tool names to underscores for better
  compatibility with other agents (e.g., Cursor).
- **Config**: Removed unused arguments in extension configuration.

### Documentation & Chores

- **Formatting**: Updated context documentation with Chat-specific formatting
  instructions.
- **Infrastructure**: Allowed `.gemini` directory in git and added Prettier to
  CI/CD pipeline.
- **Dependencies**: Updated MCP SDK, Hono, Google APIs, and other core
  libraries.

## 0.0.4 (2026-01-05)

### New Features

- **Google Drive**: Added `drive.createFolder` to create new folders.
- **People**: Added `people.getUserRelations` to retrieve user relationships
  (manager, reports, etc.).
- **Google Chat**: Added threading support to `chat.sendMessage` and
  `chat.sendDm`, and filtering by thread in `chat.getMessages`.
- **Gmail**: Added `gmail.downloadAttachment` to download email attachments.
- **Google Drive**: Added `drive.downloadFile` to download files from Google
  Drive.
- **Calendar**: Added `calendar.deleteEvent` to delete calendar events.
- **Google Docs**: Added support for Tabs in DocsService.

### Improvements

- **Dependencies**: Updated various dependencies including `@googleapis/drive`,
  `google-googleapis`, and `jsdom`.
- **CI/CD**: Added a weekly preview release workflow and updated GitHub Actions
  versions.
- **Testing**: Added documentation for the testing process with Gemini CLI.

### Fixes

- Fixed an issue where the `v` prefix was not stripped correctly in the release
  script.
- Fixed an issue with invalid assignees in dependabot config.
- Fixed log directory creation.

## 0.0.3

- Initial release with support for Google Docs, Sheets, Slides, Drive, Calendar,
  Gmail, Chat, Time, and People.
