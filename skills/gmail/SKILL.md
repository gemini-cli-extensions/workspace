---
name: gmail
description: >
  CRITICAL: You MUST activate this skill BEFORE composing, sending, drafting, or
  searching emails. Always trigger this skill as the first step when the user
  mentions "email", "gmail", or sending a message. Contains strict formatting
  mandates that override default email behavior.
---

# Gmail Expert

You are an expert at composing and managing email through the Gmail API. Follow
these guidelines when helping users with email tasks.

## Rich Text Email Formatting

When composing emails (via `gmail.send` or `gmail.createDraft`), **always use
HTML formatting with `isHtml: true`** unless the user explicitly requests plain
text. Rich HTML emails look professional and are the standard for business
communication.

### Supported HTML Tags

Gmail supports a broad set of HTML tags for email bodies. Use these freely:

| Category | Tags                                                              |
| :------- | :---------------------------------------------------------------- |
| Text     | `<p>`, `<br>`, `<span>`, `<div>`, `<blockquote>`, `<pre>`, `<hr>` |
| Headings | `<h1>` through `<h6>`                                             |
| Emphasis | `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<s>`, `<strike>`        |
| Code     | `<code>`, `<pre>`                                                 |
| Lists    | `<ul>`, `<ol>`, `<li>`                                            |
| Tables   | `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>`           |
| Links    | `<a href="...">`                                                  |
| Images   | `<img src="..." alt="...">`                                       |

### Inline CSS Styling

Gmail strips `<style>` blocks and external stylesheets. **Always use inline
CSS** via the `style` attribute:

```html
<!-- ✅ Correct: inline styles -->
<p style="color: #333; font-family: Arial, sans-serif; font-size: 14px;">
  Hello!
</p>

<!-- ❌ Wrong: style block (will be stripped) -->
<style>
  p {
    color: #333;
  }
</style>
```

### Common Inline CSS Properties

These CSS properties work reliably across Gmail clients:

- **Typography**: `font-family`, `font-size`, `font-weight`, `font-style`,
  `color`, `text-align`, `text-decoration`, `line-height`, `letter-spacing`
- **Spacing**: `margin`, `padding` (use on `<td>` for table cell spacing)
- **Borders**: `border`, `border-collapse` (on `<table>`)
- **Background**: `background-color`
- **Layout**: `width`, `max-width`, `height` (on tables and images)

### Things to Avoid

- ❌ `<script>` tags (blocked by all email clients)
- ❌ `<style>` blocks (stripped by Gmail)
- ❌ External stylesheets (`<link rel="stylesheet">`)
- ❌ `position`, `float`, `flexbox`, `grid` (unreliable in email)
- ❌ `background-image` on non-table elements (inconsistent support)
- ❌ JavaScript event handlers (`onclick`, etc.)
- ❌ Form elements (`<input>`, `<select>`, `<textarea>`)

### Email Template Examples

#### Professional Message

```html
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p>Hi Team,</p>

  <p>Please find the <b>Q4 results</b> summarized below:</p>

  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <thead>
      <tr style="background-color: #f2f2f2;">
        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">
          Metric
        </th>
        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">
          Result
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">Revenue</td>
        <td style="border: 1px solid #ddd; padding: 8px;">$1.2M</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">Growth</td>
        <td style="border: 1px solid #ddd; padding: 8px;">+15%</td>
      </tr>
    </tbody>
  </table>

  <p>Key takeaways:</p>
  <ul>
    <li>Revenue exceeded targets by <b>12%</b></li>
    <li>Customer retention improved to <b>94%</b></li>
  </ul>

  <p>
    Best regards,<br />
    <span style="color: #666;">— The Analytics Team</span>
  </p>
</div>
```

#### Styled Action Email

```html
<div
  style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px;"
>
  <h2 style="color: #1a73e8; margin-bottom: 8px;">Action Required</h2>
  <p style="font-size: 14px; color: #555;">
    Your review is needed on the following document:
  </p>
  <p>
    <a
      href="https://docs.google.com/document/d/example"
      style="display: inline-block; background-color: #1a73e8; color: #fff;
              padding: 10px 24px; text-decoration: none; border-radius: 4px;
              font-size: 14px;"
    >
      Open Document
    </a>
  </p>
  <p style="font-size: 12px; color: #999;">
    Please respond by end of business Friday.
  </p>
</div>
```

## Gmail Search Syntax

Use Gmail search operators with `gmail.search` for precise results:

| Operator      | Example                    | Description                     |
| :------------ | :------------------------- | :------------------------------ |
| `from:`       | `from:alice@example.com`   | Sender                          |
| `to:`         | `to:bob@example.com`       | Recipient                       |
| `subject:`    | `subject:quarterly report` | Subject line                    |
| `is:`         | `is:unread`, `is:starred`  | Message state                   |
| `has:`        | `has:attachment`           | Has attachments                 |
| `in:`         | `in:inbox`, `in:trash`     | Location                        |
| `label:`      | `label:work`               | By label                        |
| `before:`     | `before:2025/01/01`        | Before date                     |
| `after:`      | `after:2025/01/01`         | After date                      |
| `newer_than:` | `newer_than:7d`            | Within last N days/months/years |
| `older_than:` | `older_than:1m`            | Older than N days/months/years  |
| `filename:`   | `filename:report.pdf`      | Attachment filename             |
| `size:`       | `size:5m`                  | Larger than size                |
| `larger:`     | `larger:10M`               | Larger than size                |
| `smaller:`    | `smaller:1M`               | Smaller than size               |
| `OR`          | `from:alice OR from:bob`   | Either condition                |
| `-`           | `-from:noreply@`           | Exclude                         |
| `""`          | `"exact phrase"`           | Exact match                     |

Combine operators for precise searches:
`from:alice@example.com has:attachment newer_than:30d subject:report`

## Label Management

### System Labels

System labels use their name directly as the ID. Use `gmail.modify` to apply
these common operations:

| Label       | Add Effect       | Remove Effect               |
| :---------- | :--------------- | :-------------------------- |
| `INBOX`     | Move to inbox    | Archive (remove from inbox) |
| `UNREAD`    | Mark as unread   | Mark as read                |
| `STARRED`   | Star the message | Unstar                      |
| `IMPORTANT` | Mark important   | Mark not important          |
| `SPAM`      | Mark as spam     | Remove spam classification  |
| `TRASH`     | Move to trash    | Remove from trash           |

### Custom Labels

For user-created labels, you must resolve the label ID first:

1. Call `gmail.listLabels()` to get all labels with their IDs
2. Match the desired label by name
3. Use the label ID (e.g., `Label_42`) in `gmail.modify`

## Downloading Attachments

1. Use `gmail.get` with `format: 'full'` to get attachment metadata (IDs and
   filenames)
2. Use `gmail.downloadAttachment` with the `messageId` and `attachmentId`
3. **Always use absolute paths** for `localPath` (e.g.,
   `/Users/username/Downloads/file.pdf`). Relative paths will be rejected.

## Threading and Replies

- Use `threadId` with `gmail.createDraft` to create a reply draft linked to an
  existing conversation
- The service automatically fetches reply headers (`In-Reply-To`, `References`)
  from the thread to maintain proper threading
- Always reference previous messages when replying for context continuity
