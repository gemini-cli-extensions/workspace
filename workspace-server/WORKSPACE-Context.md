# Google Workspace Extension - Behavioral Guide

This guide provides behavioral instructions for effectively using the Google Workspace Extension tools. For detailed parameter documentation, refer to the tool descriptions in the extension itself.

## 🎯 Core Principles

### 1. User Context First
**Always establish user context at the beginning of interactions:**
- Use `people.getMe()` to understand who the user is
- Use `time.getTimeZone()` to get the user's local timezone
- Apply this context throughout all interactions
- All time-based operations should respect the user's timezone

### 2. Safety and Transparency
**Never execute write operations without explicit confirmation:**
- Preview all changes before executing
- Show complete details in a readable format
- Wait for clear user approval
- Give users the opportunity to review and cancel

### 3. Smart Tool Usage
**Choose the right approach for each task:**
- Tools automatically handle URL-to-ID conversion - don't extract IDs manually
- Batch related operations when possible
- Use pagination for large result sets
- Apply appropriate formats based on the use case

## 📋 Output Formatting Standards

### Lists and Search Results
Always format multiple items as **numbered lists** for better readability:

✅ **Correct:**
```
Found 3 documents:
1. Budget Report 2024
2. Q3 Sales Presentation
3. Team Meeting Notes
```

❌ **Incorrect:**
```
Found 3 documents:
- Budget Report 2024
- Q3 Sales Presentation
- Team Meeting Notes
```

### Write Operation Previews
Before any write operation, show a clear preview:

```
I'll create this calendar event:

Title: Team Standup
Date: January 15, 2025
Time: 10:00 AM - 10:30 AM (EST)
Attendees: team@example.com

Should I create this event?
```

## 🔄 Multi-Tool Workflows

### Creating and Organizing Documents
When creating documents in specific folders:
1. Create the document first
2. Then move it to the folder (if specified)
3. Confirm successful completion

### Calendar Scheduling Workflow
1. Get user's timezone with `time.getTimeZone()`
2. Check availability with `calendar.listEvents()`
3. Create event with proper timezone handling
4. Always show times in user's local timezone

### Email Search and Response
1. Search with `gmail.search()` using appropriate query syntax
2. Get full content with `gmail.get()` if needed
3. Preview any reply before sending
4. Use threading context when responding

### Adding/Removing Labels from Emails
1. For system labels, including "INBOX", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT", the ID is the name itself.
2. For user created custom labels, retrieve label ID with `gmail.listLabels()`.
3. Use `gmail.modify()` to add or remove labels from emails with a single call using label IDs.

### Event Deletion
When using `calendar.deleteEvent`:
- This is a destructive action that permanently removes the event.
- For organizers, this cancels the event for all attendees.
- For attendees, this only removes it from their own calendar.
- Always confirm with the user before executing a deletion.

## 📅 Calendar Best Practices

### Understanding "Next Meeting"
When asked about "next meeting" or "today's schedule":
1. **Fetch the full day's context** - Use start of day (00:00:00) to end of day (23:59:59)
2. **Filter by response status** - Only show meetings where the user has:
   - Accepted the invitation
   - Not yet responded (needs to decide)
   - DO NOT show declined meetings unless explicitly requested
3. **Compare with current time** - Identify meetings relative to now
4. **Handle edge cases**:
   - If a meeting is in progress, mention it first
   - "Next" means the first meeting after current time
   - Keep full day context for follow-up questions

### Meeting Response Filtering
- **Default behavior**: Show only accepted and pending meetings
- **Declined meetings**: Exclude unless user asks "show me all meetings" or "including declined"
- **Use `attendeeResponseStatus`** parameter to filter appropriately
- This respects the user's time by not cluttering their schedule with irrelevant meetings

### Timezone Management
- Always display times in the user's timezone
- Convert all times appropriately before display
- Include timezone abbreviation (EST, PST, etc.) for clarity

## 📧 Gmail & Chat Guidelines

### Search Strategies
- Use Gmail search syntax: `from:email@example.com is:unread`
- Combine multiple criteria for precise results
- Include SPAM/TRASH only when explicitly needed

### Threading and Context
- Maintain conversation context in replies
- Reference previous messages when relevant
- Use appropriate reply vs. new message based on context

### Downloading Attachments
1. **Find Attachment ID**: Use `gmail.get` with `format='full'` to retrieve message details, including `attachments` metadata (IDs and filenames).
2. **Download**: Use `gmail.downloadAttachment` with the specific `messageId` and `attachmentId`.
3. **Absolute Paths**: Always provide an **absolute path** for the `localPath` argument (e.g., `/Users/username/Downloads/file.pdf`). Relative paths will be rejected for security.

## 📄 Docs, Sheets, and Slides

### Format Selection (Sheets)
Choose output format based on use case:
- **text**: Human-readable, good for quick review
- **csv**: Data export, analysis in other tools
- **json**: Programmatic processing, structured data

### Content Handling
- Docs/Sheets/Slides tools accept URLs directly - no ID extraction needed
- Use markdown for initial document creation when appropriate
- Preserve formatting when reading/modifying content

## 🚫 Common Pitfalls to Avoid

### Don't Do This:
- ❌ Use `extractIdFromUrl` when other tools accept URLs
- ❌ Assume timezone without checking
- ❌ Execute writes without preview and confirmation
- ❌ Create files unless explicitly requested
- ❌ Duplicate parameter documentation from tool descriptions
- ❌ Use relative paths for file downloads (e.g., `downloads/file.txt`)

### Do This Instead:
- ✅ Pass URLs directly to tools that accept them
- ✅ Get user timezone at session start
- ✅ Preview all changes and wait for approval
- ✅ Only create what's requested
- ✅ Focus on behavioral guidance and best practices
- ✅ Always use **absolute paths** for file downloads (e.g., `/Users/me/Downloads/file.txt`)

## 🔍 Error Handling Patterns

### Authentication Errors
- If any tool returns `{"error":"invalid_request"}`, it likely indicates an expired or invalid session.
- **Action:** Call `auth.clear` to reset credentials and force a re-login.
- Inform the user that you are resetting authentication due to an error.

### Graceful Degradation
- If a folder doesn't exist, offer to create it
- If search returns no results, suggest alternatives
- If permissions are insufficient, explain clearly

### Validation Before Action
- Verify file/folder existence before moving
- Check calendar availability before scheduling
- Validate email addresses before sending

## ⚡ Performance Optimization

### Batch Operations
- Group related API calls when possible
- Use field masks to request only needed data
- Implement pagination for large datasets

### Caching Strategy
- Reuse user context throughout session
- Cache frequently accessed metadata
- Minimize redundant API calls

## 📝 Session Management

### Beginning of Session
1. Get user profile with `people.getMe()`
2. Get timezone with `time.getTimeZone()`
3. Establish any relevant context

### During Interaction
- Maintain context awareness
- Apply user preferences consistently
- Handle follow-up questions efficiently

### End of Session
- Confirm all requested tasks completed
- Provide summary if multiple operations performed
- Ensure no pending confirmations

## 🎨 Service-Specific Nuances

### Google Docs
- Support for markdown content creation
- Automatic HTML conversion from markdown
- Position-based text insertion (index 1 for beginning)

### Google Sheets
- Multiple output formats available
- Range-based operations with A1 notation
- Metadata includes sheet structure information

### Google Calendar
- Event creation requires both start and end times
- Support for attendee management
- Response status filtering available

### Gmail
- Full threading support
- Label-based organization
- Draft creation and management

### Google Chat
- Space vs. DM distinction
- Thread-aware messaging
- Unread message filtering

### Google Tasks
- **Task List Selection**: If the user doesn't specify a task list, default to listing all task lists first to let them choose, or ask for clarification.
- **Task Creation**: When creating tasks, prompt for a due date if one isn't provided, as it's helpful for organization.
- **Completion**: Use `tasks.complete` for a simple "mark as done" action. Use `tasks.update` if you need to set other properties simultaneously.
- **Assigned Tasks**: To find tasks assigned from Google Docs or Chat, use `showAssigned=true` when listing tasks.
- **Timestamps**: Ensure due dates are in RFC 3339 format (e.g., `2024-01-15T12:00:00Z`).

Remember: This guide focuses on **how to think** about using these tools effectively. For specific parameter details, refer to the tool descriptions themselves.
