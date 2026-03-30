# Feature Configuration

The extension provides a feature configuration system that lets you control
which services and scopes are enabled. Each Google Workspace service is split
into **read** and **write** feature groups, giving you granular control over
what the extension can access.

## Feature Groups

| Service    | Group | Scopes                                                                        | Default |
| ---------- | ----- | ----------------------------------------------------------------------------- | ------- |
| `docs`     | read  | `documents`                                                                   | ON      |
| `docs`     | write | `documents`                                                                   | ON      |
| `drive`    | read  | `drive.readonly`                                                              | ON      |
| `drive`    | write | `drive`                                                                       | ON      |
| `calendar` | read  | `calendar.readonly`                                                           | ON      |
| `calendar` | write | `calendar`                                                                    | ON      |
| `chat`     | read  | `chat.spaces.readonly`, `chat.messages.readonly`, `chat.memberships.readonly` | ON      |
| `chat`     | write | `chat.spaces`, `chat.messages`, `chat.memberships`                            | ON      |
| `gmail`    | read  | `gmail.readonly`                                                              | ON      |
| `gmail`    | write | `gmail.modify`                                                                | ON      |
| `people`   | read  | `userinfo.profile`, `directory.readonly`                                      | ON      |
| `slides`   | read  | `presentations.readonly`                                                      | ON      |
| `slides`   | write | `presentations`                                                               | **OFF** |
| `sheets`   | read  | `spreadsheets.readonly`                                                       | ON      |
| `sheets`   | write | `spreadsheets`                                                                | **OFF** |
| `time`     | read  | _(none)_                                                                      | ON      |
| `tasks`    | read  | `tasks.readonly`                                                              | **OFF** |
| `tasks`    | write | `tasks`                                                                       | **OFF** |

**Read** groups contain tools with no side effects (search, get, list).
**Write** groups contain tools that perform mutations (create, update, delete,
send).

Services whose write scopes aren't in the published GCP project (Slides write,
Sheets write, Tasks) default to **OFF**. These can be enabled by contributors
using their own GCP projects.

## Configuration via `WORKSPACE_FEATURE_OVERRIDES`

Use the `WORKSPACE_FEATURE_OVERRIDES` environment variable to enable or disable
feature groups and individual tools.

### Syntax

```
WORKSPACE_FEATURE_OVERRIDES="key:on|off,key:on|off,..."
```

Each entry is a comma-separated `key:value` pair where:

- `key` is a feature group (e.g., `gmail.write`) or a tool name (e.g.,
  `calendar.deleteEvent`)
- `value` is `on` or `off`

### Group-Level Overrides

Disable or enable entire feature groups:

```bash
# Disable Gmail write tools (send, createDraft, modify, etc.)
export WORKSPACE_FEATURE_OVERRIDES="gmail.write:off"

# Disable all of Chat
export WORKSPACE_FEATURE_OVERRIDES="chat.read:off,chat.write:off"

# Enable experimental features (Slides write, Tasks)
export WORKSPACE_FEATURE_OVERRIDES="slides.write:on,tasks.read:on,tasks.write:on"
```

### Tool-Level Overrides

Disable specific tools within an enabled group (subtractive only):

```bash
# Keep calendar.write enabled but disable delete
export WORKSPACE_FEATURE_OVERRIDES="calendar.deleteEvent:off"

# Disable destructive Gmail tools while keeping modify/label tools
export WORKSPACE_FEATURE_OVERRIDES="gmail.send:off,gmail.sendDraft:off"

# Combine group and tool overrides
export WORKSPACE_FEATURE_OVERRIDES="gmail.write:off,calendar.deleteEvent:off,slides.write:on"
```

::: warning Tool-level overrides are **subtractive only**. You cannot use
`tool:on` to enable a tool whose feature group is disabled. To enable tools,
enable their parent feature group. :::

### Precedence

The configuration follows a three-layer precedence model:

1. **Baked-in defaults** — Current services default ON; experimental services
   default OFF
2. **Settings** — Future: overrides from the install-time settings UI
3. **`WORKSPACE_FEATURE_OVERRIDES`** — Highest precedence; overrides everything

### Effects

When a feature group is disabled:

- Its **tools are not registered** with the MCP server (clients won't see them)
- Its **OAuth scopes are not requested** during authentication
- If you re-enable a previously disabled feature, you may need to
  re-authenticate to grant the new scopes

## Tools by Feature Group

### `docs.read`

- `docs.getSuggestions`
- `docs.getText`

### `docs.write`

- `docs.create`
- `docs.writeText`
- `docs.replaceText`
- `docs.formatText`

### `drive.read`

- `drive.getComments`
- `drive.findFolder`
- `drive.search`
- `drive.downloadFile`

### `drive.write`

- `drive.createFolder`
- `drive.moveFile`
- `drive.trashFile`
- `drive.renameFile`

### `calendar.read`

- `calendar.list`
- `calendar.listEvents`
- `calendar.getEvent`
- `calendar.findFreeTime`

### `calendar.write`

- `calendar.createEvent`
- `calendar.updateEvent`
- `calendar.respondToEvent`
- `calendar.deleteEvent`

### `chat.read`

- `chat.listSpaces`
- `chat.findSpaceByName`
- `chat.getMessages`
- `chat.findDmByEmail`
- `chat.listThreads`

### `chat.write`

- `chat.sendMessage`
- `chat.sendDm`
- `chat.setUpSpace`

### `gmail.read`

- `gmail.search`
- `gmail.get`
- `gmail.downloadAttachment`
- `gmail.listLabels`

### `gmail.write`

- `gmail.modify`
- `gmail.batchModify`
- `gmail.modifyThread`
- `gmail.send`
- `gmail.createDraft`
- `gmail.sendDraft`
- `gmail.createLabel`

### `people.read`

- `people.getUserProfile`
- `people.getMe`
- `people.getUserRelations`

### `slides.read`

- `slides.getText`
- `slides.getMetadata`
- `slides.getImages`
- `slides.getSlideThumbnail`

### `sheets.read`

- `sheets.getText`
- `sheets.getRange`
- `sheets.getMetadata`

### `time.read`

- `time.getCurrentDate`
- `time.getCurrentTime`
- `time.getTimeZone`

## For Contributors

When adding a new service or tools:

1. Define read and write feature group entries in
   `workspace-server/src/features/feature-config.ts`
2. Set the default state — **ON** for scopes in the published GCP project,
   **OFF** otherwise
3. Register your tools in `index.ts` as usual — the feature config wrapper
   automatically skips disabled tools

This lets contributors develop and merge new features without being blocked by
the published GCP project's scope configuration. Contributors can test with
their own GCP projects by enabling the feature via
`WORKSPACE_FEATURE_OVERRIDES`.
