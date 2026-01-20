#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from 'zod';
import { AuthManager } from './auth/AuthManager';
import { DocsService } from './services/DocsService';
import { DriveService } from "./services/DriveService";
import { CalendarService } from "./services/CalendarService";
import { ChatService } from "./services/ChatService";
import { GmailService } from "./services/GmailService";
import { TimeService } from "./services/TimeService";
import { PeopleService } from "./services/PeopleService";
import { SlidesService } from "./services/SlidesService";
import { SheetsService } from "./services/SheetsService";
import { GMAIL_SEARCH_MAX_RESULTS } from "./utils/constants";
import { extractDocId } from "./utils/IdUtils";

import { setLoggingEnabled } from "./utils/logger";

// Shared schemas for Gmail tools
const emailComposeSchema = {
    to: z.union([z.string(), z.array(z.string())]).describe('Recipient email address(es).'),
    subject: z.string().describe('Email subject.'),
    body: z.string().describe('Email body content.'),
    cc: z.union([z.string(), z.array(z.string())]).optional().describe('CC recipient email address(es).'),
    bcc: z.union([z.string(), z.array(z.string())]).optional().describe('BCC recipient email address(es).'),
    isHtml: z.boolean().optional().describe('Whether the body is HTML (default: false).'),
};

// Shared schema for label visibility options
const labelListVisibilitySchema = z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).describe(
    'Visibility in label list: labelShow (always visible), labelShowIfUnread (visible if unread), labelHide (hidden).'
);
const messageListVisibilitySchema = z.enum(['show', 'hide']).describe(
    'Visibility in message list: show (visible) or hide (hidden).'
);

const SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/chat.spaces',
    'https://www.googleapis.com/auth/chat.messages',
    'https://www.googleapis.com/auth/chat.memberships',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/directory.readonly',
    'https://www.googleapis.com/auth/presentations.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
];

// Dynamically import version from package.json
import { version } from '../package.json';

async function main() {
    // 1. Initialize services
    if (process.argv.includes('--debug')) {
        setLoggingEnabled(true);
    }

    const authManager = new AuthManager(SCOPES);
    // Trigger auth flow immediately on startup
    await authManager.getAuthenticatedClient();

    const driveService = new DriveService(authManager);
    const docsService = new DocsService(authManager, driveService);
    const peopleService = new PeopleService(authManager);
    const calendarService = new CalendarService(authManager);
    const chatService = new ChatService(authManager);
    const gmailService = new GmailService(authManager);
    const timeService = new TimeService();
    const slidesService = new SlidesService(authManager);
    const sheetsService = new SheetsService(authManager);

    // 2. Create the server instance
    const server = new McpServer({
        name: "google-workspace-server",
        version,
    });

    // 3. Register tools directly on the server
    server.registerTool(
        "auth.clear",
        {
            description: 'Clears the authentication credentials, forcing a re-login on the next request.',
            inputSchema: {}
        },
        async () => {
            await authManager.clearAuth();
            return {
                content: [{
                    type: "text",
                    text: "Authentication credentials cleared. You will be prompted to log in again on the next request."
                }]
            };
        }
    );

    server.registerTool(
        "auth.refreshToken",
        {
            description: 'Manually triggers the token refresh process.',
            inputSchema: {}
        },
        async () => {
            await authManager.refreshToken();
            return {
                content: [{
                    type: "text",
                    text: "Token refresh process triggered successfully."
                }]
            };
        }
    );

    server.registerTool(
        "docs.create",
        {
            description: 'Creates a new Google Doc. Can be blank or with Markdown content.',
            inputSchema: {
                title: z.string().describe('The title for the new Google Doc.'),
                folderName: z.string().optional().describe('The name of the folder to create the document in.'),
                markdown: z.string().optional().describe('The Markdown content to create the document from.'),
            }
        },
        docsService.create
    );

    server.registerTool(
        "docs.insertText",
        {
            description: 'Inserts text at the beginning of a Google Doc.',
            inputSchema: {
                documentId: z.string().describe('The ID of the document to modify.'),
                text: z.string().describe('The text to insert at the beginning of the document.'),
                tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, modifies the first tab.'),
            }
        },
        docsService.insertText
    );

    server.registerTool(
        "docs.find",
        {
            description: 'Finds Google Docs by searching for a query in their title. Supports pagination.',
            inputSchema: {
                query: z.string().describe('The text to search for in the document titles.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
                pageSize: z.number().optional().describe('The maximum number of results to return.'),
            }
        },
        docsService.find
    );

    server.registerTool(
        "drive.findFolder",
        {
            description: 'Finds a folder by name in Google Drive.',
            inputSchema: {
                folderName: z.string().describe('The name of the folder to find.'),
            }
        },
        driveService.findFolder
    );

    server.registerTool(
        "drive.createFolder",
        {
            description: 'Creates a new folder in Google Drive.',
            inputSchema: {
                name: z.string().trim().min(1).describe('The name of the new folder.'),
                parentId: z.string().trim().min(1).optional().describe('The ID of the parent folder. If not provided, creates in the root directory.'),
            }
        },
        driveService.createFolder
    );

    server.registerTool(
        "docs.move",
        {
            description: 'Moves a document to a specified folder.',
            inputSchema: {
                documentId: z.string().describe('The ID of the document to move.'),
                folderName: z.string().describe('The name of the destination folder.'),
            }
        },
        docsService.move
    );

    server.registerTool(
        "docs.getText",
        {
            description: 'Retrieves the text content of a Google Doc.',
            inputSchema: {
                documentId: z.string().describe('The ID of the document to read.'),
                tabId: z.string().optional().describe('The ID of the tab to read. If not provided, returns all tabs.'),
            }
        },
        docsService.getText
    );

    server.registerTool(
        "docs.appendText",
        {
            description: 'Appends text to the end of a Google Doc.',
            inputSchema: {
                documentId: z.string().describe('The ID of the document to modify.'),
                text: z.string().describe('The text to append to the document.'),
                tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, modifies the first tab.'),
            }
        },
        docsService.appendText
    );

    server.registerTool(
        "docs.replaceText",
        {
            description: 'Replaces all occurrences of a given text with new text in a Google Doc.',
            inputSchema: {
                documentId: z.string().describe('The ID of the document to modify.'),
                findText: z.string().describe('The text to find in the document.'),
                replaceText: z.string().describe('The text to replace the found text with.'),
                tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, replaces in all tabs (legacy behavior).'),
            }
        },
        docsService.replaceText
    );

    server.registerTool(
        "docs.extractIdFromUrl",
        {
            description: 'Extracts the document ID from a Google Workspace URL.',
            inputSchema: {
                url: z.string().describe('The URL of the Google Workspace document.'),
            }
        },
        async (input: { url: string }) => {
            const result = extractDocId(input.url);
            return {
                content: [{
                    type: "text" as const,
                    text: result || ''
                }]
            };
        }
    );

    // Slides tools
    server.registerTool(
        "slides.getText",
        {
            description: 'Retrieves the text content of a Google Slides presentation.',
            inputSchema: {
                presentationId: z.string().describe('The ID or URL of the presentation to read.'),
            }
        },
        slidesService.getText
    );

    server.registerTool(
        "slides.find",
        {
            description: 'Finds Google Slides presentations by searching for a query. Supports pagination.',
            inputSchema: {
                query: z.string().describe('The text to search for in presentations.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
                pageSize: z.number().optional().describe('The maximum number of results to return.'),
            }
        },
        slidesService.find
    );

    server.registerTool(
        "slides.getMetadata",
        {
            description: 'Gets metadata about a Google Slides presentation.',
            inputSchema: {
                presentationId: z.string().describe('The ID or URL of the presentation.'),
            }
        },
        slidesService.getMetadata
    );

    // Sheets tools
    server.registerTool(
        "sheets.getData",
        {
            description: 'Retrieves data from a Google Sheets spreadsheet.',
            inputSchema: {
                spreadsheetId: z.string().describe('The ID or URL of the spreadsheet to read.'),
                range: z.string().optional().describe('The A1 notation range to read (e.g., "Sheet1!A1:D10"). If not provided, reads the entire first sheet.'),
            }
        },
        sheetsService.getData
    );

    server.registerTool(
        "sheets.find",
        {
            description: 'Finds Google Sheets spreadsheets by searching for a query. Supports pagination.',
            inputSchema: {
                query: z.string().describe('The text to search for in spreadsheets.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
                pageSize: z.number().optional().describe('The maximum number of results to return.'),
            }
        },
        sheetsService.find
    );

    server.registerTool(
        "sheets.getMetadata",
        {
            description: 'Gets metadata about a Google Sheets spreadsheet, including sheet names and properties.',
            inputSchema: {
                spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'),
            }
        },
        sheetsService.getMetadata
    );

    // Calendar tools
    server.registerTool(
        "calendar.list",
        {
            description: 'Lists calendars available in the user\'s account. This can be used to get calendars and their IDs in preparation for using other calendar tools.',
            inputSchema: {}
        },
        calendarService.list
    );

    server.registerTool(
        "calendar.getEvents",
        {
            description: 'Gets events from a calendar. Filters by time range and search query.',
            inputSchema: {
                calendarId: z.string().optional().describe('The calendar ID. Defaults to "primary" (the user\'s main calendar).'),
                timeMin: z.string().optional().describe('Start of the time range (RFC3339 timestamp, e.g., "2024-01-01T00:00:00Z"). Defaults to now.'),
                timeMax: z.string().optional().describe('End of the time range (RFC3339 timestamp). Defaults to 7 days from now.'),
                q: z.string().optional().describe('Free-text search query to filter events.'),
                maxResults: z.number().optional().describe('Maximum number of events to return. Defaults to 10.'),
                singleEvents: z.boolean().optional().describe('Whether to expand recurring events. Defaults to true.'),
            }
        },
        calendarService.getEvents
    );

    server.registerTool(
        "calendar.createEvent",
        {
            description: 'Creates a new event on a calendar.',
            inputSchema: {
                calendarId: z.string().optional().describe('The calendar ID. Defaults to "primary".'),
                summary: z.string().describe('The title of the event.'),
                description: z.string().optional().describe('The description of the event.'),
                location: z.string().optional().describe('The location of the event.'),
                start: z.string().describe('Start time (RFC3339 timestamp, e.g., "2024-01-15T10:00:00-05:00").'),
                end: z.string().describe('End time (RFC3339 timestamp).'),
                attendees: z.array(z.string()).optional().describe('Email addresses of attendees.'),
                timeZone: z.string().optional().describe('Timezone for the event (e.g., "America/New_York"). Defaults to UTC.'),
            }
        },
        calendarService.createEvent
    );

    server.registerTool(
        "calendar.updateEvent",
        {
            description: 'Updates an existing event on a calendar.',
            inputSchema: {
                calendarId: z.string().optional().describe('The calendar ID. Defaults to "primary".'),
                eventId: z.string().describe('The ID of the event to update.'),
                summary: z.string().optional().describe('The new title of the event.'),
                description: z.string().optional().describe('The new description of the event.'),
                location: z.string().optional().describe('The new location of the event.'),
                start: z.string().optional().describe('New start time (RFC3339 timestamp).'),
                end: z.string().optional().describe('New end time (RFC3339 timestamp).'),
                attendees: z.array(z.string()).optional().describe('New list of attendee email addresses.'),
                timeZone: z.string().optional().describe('Timezone for the event.'),
            }
        },
        calendarService.updateEvent
    );

    server.registerTool(
        "calendar.deleteEvent",
        {
            description: 'Deletes an event from a calendar.',
            inputSchema: {
                calendarId: z.string().optional().describe('The calendar ID. Defaults to "primary".'),
                eventId: z.string().describe('The ID of the event to delete.'),
            }
        },
        calendarService.deleteEvent
    );

    // Chat tools
    server.registerTool(
        "chat.listSpaces",
        {
            description: 'Lists Google Chat spaces (rooms and DMs) the user has access to.',
            inputSchema: {
                pageSize: z.number().optional().describe('The maximum number of spaces to return. Defaults to 100.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
            }
        },
        chatService.listSpaces
    );

    server.registerTool(
        "chat.sendMessage",
        {
            description: 'Sends a message to a Google Chat space.',
            inputSchema: {
                spaceName: z.string().describe('The name of the space to send the message to (e.g., spaces/AAAAN2J52O8).'),
                message: z.string().describe('The message to send.'),
                threadName: z.string().optional().describe('The resource name of the thread to reply to. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"'),
            }
        },
        chatService.sendMessage
    );

    server.registerTool(
        "chat.getMessages",
        {
            description: 'Gets messages from a Google Chat space.',
            inputSchema: {
                spaceName: z.string().describe('The name of the space to get messages from (e.g., spaces/AAAAN2J52O8).'),
                threadName: z.string().optional().describe('The resource name of the thread to filter messages by. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"'),
                unreadOnly: z.boolean().optional().describe('Whether to return only unread messages.'),
                pageSize: z.number().optional().describe('The maximum number of messages to return.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
                orderBy: z.string().optional().describe('The order to list messages in (e.g., "createTime desc").'),
            }
        },
        chatService.getMessages
    );

    server.registerTool(
        "chat.sendDm",
        {
            description: 'Sends a direct message to a user.',
            inputSchema: {
                email: z.string().email().describe('The email address of the user to send the message to.'),
                message: z.string().describe('The message to send.'),
                threadName: z.string().optional().describe('The resource name of the thread to reply to. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"'),
            }
        },
        chatService.sendDm
    );

    server.registerTool(
        "chat.findDmByEmail",
        {
            description: 'Finds a Google Chat DM space by a user\'s email address.',
            inputSchema: {
                email: z.string().email().describe('The email address of the user to find the DM space with.'),
            }
        },
        chatService.findDmByEmail
    );

    server.registerTool(
        "chat.listThreads",
        {
            description: 'Lists threads from a Google Chat space in reverse chronological order.',
            inputSchema: {
                spaceName: z.string().describe('The name of the space to get threads from (e.g., spaces/AAAAN2J52O8).'),
                pageSize: z.number().optional().describe('The maximum number of threads to return.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
            }
        },
        chatService.listThreads
    );

    server.registerTool(
      'chat.setUpSpace',
      {
        description: 'Sets up a new Google Chat space with a display name and a list of members.',
        inputSchema: {
            displayName: z.string().describe('The display name of the space.'),
            userNames: z.array(z.string()).describe('The user names of the members to add to the space (e.g. users/12345678)'),
        }
      },
      chatService.setUpSpace
    );


    // Gmail tools
    server.registerTool(
        "gmail.search",
        {
            description: 'Search for emails in Gmail using query parameters.',
            inputSchema: {
                query: z.string().optional().describe('Search query (same syntax as Gmail search box, e.g., "from:someone@example.com is:unread").'),
                maxResults: z.number().optional().describe(`Maximum number of results to return (default: ${GMAIL_SEARCH_MAX_RESULTS}).`),
                pageToken: z.string().optional().describe('Token for the next page of results.'),
                labelIds: z.array(z.string()).optional().describe('Filter by label IDs (e.g., ["INBOX", "UNREAD"]).'),
                includeSpamTrash: z.boolean().optional().describe('Include messages from SPAM and TRASH (default: false).'),
            }
        },
        gmailService.search
    );

    server.registerTool(
        "gmail.get",
        {
            description: 'Get the full content of a specific email message.',
            inputSchema: {
                messageId: z.string().describe('The ID of the message to retrieve.'),
                format: z.enum(['minimal', 'full', 'raw', 'metadata']).optional().describe('Format of the message (default: full).'),
            }
        },
        gmailService.get
    );

    server.registerTool(
        "gmail.downloadAttachment",
        {
            description: 'Downloads an attachment from a Gmail message to a local file.',
            inputSchema: {
                messageId: z.string().describe('The ID of the message containing the attachment.'),
                attachmentId: z.string().describe('The ID of the attachment to download.'),
                localPath: z.string().describe('The absolute local path where the attachment should be saved (e.g., "/Users/name/downloads/report.pdf").'),
            }
        },
        gmailService.downloadAttachment
    );

    server.registerTool(
        "gmail.modify",
        {
            description: `Modify a Gmail message. Supported modifications include:
    - Add labels to a message.
    - Remove labels from a message.
There are a list of system labels that can be modified on a message:
    - INBOX: removing INBOX label removes the message from inbox and archives the message.
    - SPAM: adding SPAM label marks a message as spam.
    - TRASH: adding TRASH label moves a message to trash.
    - UNREAD: removing UNREAD label marks a message as read.
    - STARRED: adding STARRED label marks a message as starred.
    - IMPORTANT: adding IMPORTANT label marks a message as important.`,
            inputSchema: {
                messageId: z.string().describe('The ID of the message to add labels to and/or remove labels from.'),
                addLabelIds: z.array(z.string()).max(100).optional().describe('A list of label IDs to add to the message. Limit to 100 labels.'),
                removeLabelIds: z.array(z.string()).max(100).optional().describe('A list of label IDs to remove from the message. Limit to 100 labels.'),
            }
        },
        gmailService.modify
    );

    server.registerTool(
        "gmail.send",
        {
            description: 'Send an email message.',
            inputSchema: emailComposeSchema
        },
        gmailService.send
    );

    server.registerTool(
        "gmail.createDraft",
        {
            description: 'Create a draft email message.',
            inputSchema: emailComposeSchema
        },
        gmailService.createDraft
    );

    server.registerTool(
        "gmail.sendDraft",
        {
            description: 'Send a previously created draft email.',
            inputSchema: {
                draftId: z.string().describe('The ID of the draft to send.'),
            }
        },
        gmailService.sendDraft
    );

    server.registerTool(
        "gmail.listLabels",
        {
            description: 'List all Gmail labels in the user\'s mailbox.',
            inputSchema: {}
        },
        gmailService.listLabels
    );

    server.registerTool(
        "gmail.getLabel",
        {
            description: 'Get details of a specific Gmail label, including message/thread counts.',
            inputSchema: {
                labelId: z.string().describe('The ID of the label to retrieve (e.g., "Label_1234567890" or system labels like "INBOX", "SENT").'),
            }
        },
        gmailService.getLabel
    );

    server.registerTool(
        "gmail.createLabel",
        {
            description: `Create a new Gmail label. Labels help organize emails and can have custom colors.
Valid background colors: #000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff,
#fb4c2f, #ffad47, #fad165, #16a765, #43d692, #4a86e8, #a479e2, #f691b3,
#f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8,
#efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9,
#e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0,
#cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798,
#ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775,
#822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c`,
            inputSchema: {
                name: z.string().describe('The display name of the label.'),
                labelListVisibility: labelListVisibilitySchema.optional(),
                messageListVisibility: messageListVisibilitySchema.optional(),
                backgroundColor: z.string().optional().describe('Background color hex code (e.g., "#16a765"). Must be from Gmail\'s valid color palette.'),
                textColor: z.string().optional().describe('Text color hex code (e.g., "#ffffff"). Must be from Gmail\'s valid color palette.'),
            }
        },
        gmailService.createLabel
    );

    server.registerTool(
        "gmail.updateLabel",
        {
            description: 'Update an existing Gmail label. Can modify name, visibility settings, and colors. Only user-created labels can be updated (not system labels like INBOX, SENT, etc.).',
            inputSchema: {
                labelId: z.string().describe('The ID of the label to update.'),
                name: z.string().optional().describe('New display name for the label.'),
                labelListVisibility: labelListVisibilitySchema.optional(),
                messageListVisibility: messageListVisibilitySchema.optional(),
                backgroundColor: z.string().optional().describe('New background color hex code.'),
                textColor: z.string().optional().describe('New text color hex code.'),
            }
        },
        gmailService.updateLabel
    );

    server.registerTool(
        "gmail.deleteLabel",
        {
            description: 'Delete a Gmail label. Only user-created labels can be deleted (not system labels like INBOX, SENT, etc.). Messages with this label will not be deleted, only the label will be removed from them.',
            inputSchema: {
                labelId: z.string().describe('The ID of the label to delete.'),
            }
        },
        gmailService.deleteLabel
    );

    // Time tools
    server.registerTool(
        "time.getCurrentDate",
        {
            description: 'Gets the current date. Returns both UTC (for calendar/API use) and local time (for display to the user), along with the timezone.',
            inputSchema: {}
        },
        timeService.getCurrentDate
    );

    server.registerTool(
        "time.getCurrentTime",
        {
            description: 'Gets the current time. Returns both UTC (for calendar/API use) and local time (for display to the user), along with the timezone.',
            inputSchema: {}
        },
        timeService.getCurrentTime
    );

    server.registerTool(
        "time.getTimeZone",
        {
            description: 'Gets the local timezone. Note: timezone is also included in getCurrentDate and getCurrentTime responses.',
            inputSchema: {}
        },
        timeService.getTimeZone
    );

    // People tools
    server.registerTool(
        "people.getUserProfile",
        {
            description: 'Gets a user\'s profile information.',
            inputSchema: {
                userId: z.string().optional().describe('The ID of the user to get profile information for.'),
                email: z.string().optional().describe('The email address of the user to get profile information for.'),
                name: z.string().optional().describe('The name of the user to get profile information for.'),
            }
        },
        peopleService.getUserProfile
    );

    server.registerTool(
        "people.getMe",
        {
            description: 'Gets the profile information of the authenticated user.',
            inputSchema: {}
        },
        peopleService.getMe
    );

    server.registerTool(
        "people.getUserRelations",
        {
            description: 'Gets a user\'s relations (e.g., manager, spouse, assistant, etc.). Common relation types include: manager, assistant, spouse, partner, relative, mother, father, parent, sibling, child, friend, domesticPartner, referredBy. Defaults to the authenticated user if no userId is provided.',
            inputSchema: {
                userId: z.string().optional().describe('The ID of the user to get relations for (e.g., "110001608645105799644" or "people/110001608645105799644"). Defaults to the authenticated user if not provided.'),
                relationType: z.string().optional().describe('The type of relation to filter by (e.g., "manager", "spouse", "assistant"). If not provided, returns all relations.'),
            }
        },
        peopleService.getUserRelations
    );

    // 4. Connect the transport layer and start listening
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Google Workspace MCP Server is running (registerTool). Listening for requests...");
}

main().catch(error => {
    console.error('A critical error occurred:', error);
    process.exit(1);
});
