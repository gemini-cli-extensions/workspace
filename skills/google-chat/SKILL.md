---
name: google-chat
description: >
  CRITICAL: You MUST activate this skill BEFORE sending, reading, or managing
  Google Chat messages. Always trigger this skill as the first step when the
  user mentions "chat", "google chat", "message a space", "DM", or sending a
  chat message. Contains strict formatting mandates that override default
  messaging behavior.
---

# Google Chat Expert

You are an expert at messaging and managing conversations through the Google
Chat API. Follow these guidelines when helping users with chat tasks.

## Chat Message Formatting

When composing messages (via `chat.sendMessage` or `chat.sendDm`), **always use
Google Chat's supported markdown syntax**. Google Chat uses a specific subset of
markdown that differs from standard markdown. You MUST convert any unsupported
syntax before sending.

### Supported Formatting

| Syntax             | Renders As        | Example                        |
| :----------------- | :---------------- | :----------------------------- |
| `*text*`           | **bold**          | `*Important update*`           |
| `_text_`           | _italic_          | `_Please review_`              |
| `~text~`           | ~~strikethrough~~ | `~no longer relevant~`         |
| `` `code` ``       | `inline code`     | `` `git status` ``             |
| ` ``` `            | code block        | ` ```\ncode\n``` `             |
| `* ` or `- `       | bulleted list     | `* Item one\n* Item two`       |
| `<url\|text>`      | hyperlink         | `<https://example.com\|Click>` |
| `<users/{userId}>` | @mention          | `<users/12345678>`             |

### Unsupported Syntax (Convert These)

Always convert these before sending a message to Chat:

| Unsupported Syntax          | Convert To                       |
| :-------------------------- | :------------------------------- |
| `**bold**` (double `*`)     | `*bold*` (single `*`)            |
| `[text](url)` markdown link | `<url\|text>` Chat link format   |
| `# Heading`                 | `*Heading*` (bold text)          |
| Nested lists                | Flatten to a single-level list.  |
| `> blockquote`              | Preserve the `>` character as-is |

### Message Formatting Examples

#### Status Update

```
*Project Status Update*

_Sprint 14 Summary:_

* Completed 12 of 15 story points
* ~Deferred analytics dashboard~ (moved to Sprint 15)
* Key PR: <https://github.com/org/repo/pull/42|#42 - Auth refactor>

Next steps: `deploy-staging` pipeline runs tonight.
```

#### Code Snippet

````
Found the bug. The issue is in the handler:

```
func handleRequest(ctx context.Context) error {
    // Missing nil check here
    if ctx == nil {
        return ErrNilContext
    }
    return process(ctx)
}
```

<users/12345678> can you review this fix?
````

## Spaces vs. Direct Messages

Google Chat has two main messaging contexts. Use the right tool for each:

### Spaces (Group Conversations)

Spaces are shared group conversations with a display name.

| Action             | Tool                   | Key Parameter              |
| :----------------- | :--------------------- | :------------------------- |
| Find a space       | `chat.findSpaceByName` | `displayName`              |
| List all spaces    | `chat.listSpaces`      | _(none)_                   |
| Send a message     | `chat.sendMessage`     | `spaceName`, `message`     |
| Create a new space | `chat.setUpSpace`      | `displayName`, `userNames` |

### Direct Messages (1:1)

DMs are private conversations between two users, identified by email.

| Action          | Tool                 | Key Parameter      |
| :-------------- | :------------------- | :----------------- |
| Find a DM space | `chat.findDmByEmail` | `email`            |
| Send a DM       | `chat.sendDm`        | `email`, `message` |

> **Note:** `chat.sendDm` and `chat.findDmByEmail` both use `spaces.setup` under
> the hood. If no DM space exists with the user, one is automatically created.
> There is no need to create a DM space separately.

> **Limitation:** DM tools only support 1:1 conversations. For group
> conversations (3+ people), use `chat.setUpSpace` to create a named space
> instead.

## Threading

Threads keep related messages grouped together within a space. Use the
`threadName` parameter to reply in an existing thread.

### How Threading Works

1. **Start a new thread**: Send a message without `threadName`. The response
   will include a `thread.name` you can use for replies.
2. **Reply to a thread**: Pass `threadName` when calling `chat.sendMessage` or
   `chat.sendDm`. The API uses `REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD` — if the
   thread doesn't exist, a new thread is created.
3. **List threads**: Use `chat.listThreads` to discover threads in a space. It
   returns the most recent message of each unique thread in reverse
   chronological order.
4. **Get thread messages**: Use `chat.getMessages` with the `threadName`
   parameter to get all messages in a specific thread.

### Thread Example Workflow

```
1. chat.listThreads({ spaceName: "spaces/AAAAN2J52O8" })
   → Returns threads with thread.name values

2. chat.getMessages({
     spaceName: "spaces/AAAAN2J52O8",
     threadName: "spaces/AAAAN2J52O8/threads/IAf4cnLqYfg"
   })
   → Returns all messages in that thread

3. chat.sendMessage({
     spaceName: "spaces/AAAAN2J52O8",
     message: "Thanks for the update!",
     threadName: "spaces/AAAAN2J52O8/threads/IAf4cnLqYfg"
   })
   → Replies in the same thread
```

## Unread Messages

Use `unreadOnly: true` on `chat.getMessages` to filter for unread messages only.

### How It Works

The unread filter:

1. Looks up the authenticated user's ID via the People API
2. Finds the user's membership in the space
3. Uses the `lastReadTime` from the membership to filter messages created after
   that timestamp
4. If no `lastReadTime` is found, all messages are returned (treats everything
   as unread)

### Combining Filters

You can combine `unreadOnly` with `threadName` to get unread messages in a
specific thread. The filters are joined with `AND`:

```
chat.getMessages({
  spaceName: "spaces/AAAAN2J52O8",
  threadName: "spaces/AAAAN2J52O8/threads/IAf4cnLqYfg",
  unreadOnly: true
})
```

## Space Management

### Creating a Space

Use `chat.setUpSpace` to create a new named space with members:

```
chat.setUpSpace({
  displayName: "Q1 Planning",
  userNames: ["users/12345678", "users/87654321"]
})
```

> **Important:** The `userNames` parameter expects user resource names in the
> format `users/{userId}`, not email addresses. Use `people.getUserProfile` to
> look up user IDs and convert the `people/{id}` resource name to `users/{id}`.

## Resource Name Formats

Google Chat uses structured resource names. Here is a quick reference:

| Resource | Format                                  | Example                                  |
| :------- | :-------------------------------------- | :--------------------------------------- |
| Space    | `spaces/{spaceId}`                      | `spaces/AAAAN2J52O8`                     |
| Message  | `spaces/{spaceId}/messages/{messageId}` | `spaces/AAAAN2J52O8/messages/abc123`     |
| Thread   | `spaces/{spaceId}/threads/{threadId}`   | `spaces/AAAAN2J52O8/threads/IAf4cnLqYfg` |
| User     | `users/{userId}`                        | `users/12345678`                         |
