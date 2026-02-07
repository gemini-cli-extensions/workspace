# Release Notes

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
