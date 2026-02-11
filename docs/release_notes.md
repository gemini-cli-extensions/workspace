# Release Notes

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
