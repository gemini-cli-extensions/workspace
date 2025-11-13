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

async function main() {
    // 1. Initialize services
    if (process.argv.includes('--debug')) {
        setLoggingEnabled(true);
    }

    const authManager = new AuthManager(SCOPES);
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
        version: "1.0.0",
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
        "sheets.getText",
        {
            description: 'Retrieves the content of a Google Sheets spreadsheet.',
            inputSchema: {
                spreadsheetId: z.string().describe('The ID or URL of the spreadsheet to read.'),
                format: z.enum(['text', 'csv', 'json']).optional().describe('Output format (default: text).'),
            }
        },
        sheetsService.getText
    );

    server.registerTool(
        "sheets.getRange",
        {
            description: 'Gets values from a specific range in a Google Sheets spreadsheet.',
            inputSchema: {
                spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'),
                range: z.string().describe('The A1 notation range to get (e.g., "Sheet1!A1:B10").'),
            }
        },
        sheetsService.getRange
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
            description: 'Gets metadata about a Google Sheets spreadsheet.',
            inputSchema: {
                spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'),
            }
        },
        sheetsService.getMetadata
    );

    server.registerTool(
        "drive.search",
        {
            description: 'Searches for files and folders in Google Drive. The query can be a simple search term, a Google Drive URL, or a full query string. For more information on query strings see: https://developers.google.com/drive/api/guides/search-files',
            inputSchema: {
                query: z.string().optional().describe('A simple search term (e.g., "Budget Q3"), a Google Drive URL, or a full query string (e.g., "name contains \'Budget\' and owners in \'user@example.com\'").'),
                pageSize: z.number().optional().describe('The maximum number of results to return.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
                corpus: z.string().optional().describe('The corpus of files to search (e.g., "user", "domain").'),
                unreadOnly: z.boolean().optional().describe('Whether to filter for unread files only.'),
                sharedWithMe: z.boolean().optional().describe('Whether to search for files shared with the user.'),
            }
        },
        driveService.search
    );

    server.registerTool(
        "calendar.list",
        {
            description: 'Lists all of the user\'s calendars.',
            inputSchema: {}
        },
        calendarService.listCalendars
    );

    server.registerTool(
        "calendar.createEvent",
        {
            description: 'Creates a new event in a calendar.',
            inputSchema: {
                calendarId: z.string().describe('The ID of the calendar to create the event in.'),
                summary: z.string().describe('The summary or title of the event.'),
                start: z.object({
                    dateTime: z.string().describe('The start time in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T10:30:00Z or 2024-01-15T10:30:00-05:00).'),
                }),
                end: z.object({
                    dateTime: z.string().describe('The end time in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T11:30:00Z or 2024-01-15T11:30:00-05:00).'),
                }),
                attendees: z.array(z.string()).optional().describe('The email addresses of the attendees.'),
            }
        },
        calendarService.createEvent
    );

    server.registerTool(
        "calendar.listEvents",
        {
            description: 'Lists events from a calendar. Defaults to upcoming events.',
            inputSchema: {
                calendarId: z.string().describe('The ID of the calendar to list events from.'),
                timeMin: z.string().optional().describe('The start time for the event search. Defaults to the current time.'),
                timeMax: z.string().optional().describe('The end time for the event search.'),
                attendeeResponseStatus: z.array(z.string()).optional().describe('The response status of the attendee.'),
            }
        },
        calendarService.listEvents
    );

    server.registerTool(
        "calendar.getEvent",
        {
            description: 'Gets the details of a specific calendar event.',
            inputSchema: {
                eventId: z.string().describe('The ID of the event to retrieve.'),
                calendarId: z.string().optional().describe('The ID of the calendar the event belongs to. Defaults to the primary calendar.'),
            }
        },
        calendarService.getEvent
    );

    server.registerTool(
        "calendar.findFreeTime",
        {
            description: 'Finds a free time slot for multiple people to meet.',
            inputSchema: {
                attendees: z.array(z.string()).describe('The email addresses of the attendees.'),
                timeMin: z.string().describe('The start time for the search in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T09:00:00Z or 2024-01-15T09:00:00-05:00).'),
                timeMax: z.string().describe('The end time for the search in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T18:00:00Z or 2024-01-15T18:00:00-05:00).'),
                duration: z.number().describe('The duration of the meeting in minutes.'),
            }
        },
        calendarService.findFreeTime
    );

    server.registerTool(
        "calendar.updateEvent",
        {
            description: 'Updates an existing event in a calendar.',
            inputSchema: {
                eventId: z.string().describe('The ID of the event to update.'),
                calendarId: z.string().optional().describe('The ID of the calendar to update the event in.'),
                summary: z.string().optional().describe('The new summary or title of the event.'),
                start: z.object({
                    dateTime: z.string().describe('The new start time in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T10:30:00Z or 2024-01-15T10:30:00-05:00).'),
                }).optional(),
                end: z.object({
                    dateTime: z.string().describe('The new end time in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T11:30:00Z or 2024-01-15T11:30:00-05:00).'),
                }).optional(),
                attendees: z.array(z.string()).optional().describe('The new list of attendees for the event.'),
            }
        },
        calendarService.updateEvent
    );

    server.registerTool(
        "calendar.respondToEvent",
        {
            description: 'Responds to a meeting invitation (accept, decline, or tentative).',
            inputSchema: {
                eventId: z.string().describe('The ID of the event to respond to.'),
                calendarId: z.string().optional().describe('The ID of the calendar containing the event.'),
                responseStatus: z.enum(['accepted', 'declined', 'tentative']).describe('Your response to the invitation.'),
                sendNotification: z.boolean().optional().describe('Whether to send a notification to the organizer (default: true).'),
                responseMessage: z.string().optional().describe('Optional message to include with your response.'),
            }
        },
        calendarService.respondToEvent
    );

    server.registerTool(
        "chat.listSpaces",
        {
            description: 'Lists the spaces the user is a member of.',
            inputSchema: {}
        },
        chatService.listSpaces
    );

    server.registerTool(
        "chat.findSpaceByName",
        {
            description: 'Finds a Google Chat space by its display name.',
            inputSchema: {
                displayName: z.string().describe('The display name of the space to find.'),
            }
        },
        chatService.findSpaceByName
    );

    server.registerTool(
        "chat.sendMessage",
        {
            description: 'Sends a message to a Google Chat space.',
            inputSchema: {
                spaceName: z.string().describe('The name of the space to send the message to (e.g., spaces/AAAAN2J52O8).'),
                message: z.string().describe('The message to send.'),
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
                unreadOnly: z.boolean().optional().describe('Whether to return only unread messages.'),
                pageSize: z.number().optional().describe('The maximum number of messages to return.'),
                pageToken: z.string().optional().describe('The token for the next page of results.'),
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

    // Time tools
    server.registerTool(
        "time.getCurrentDate",
        {
            description: 'Gets the current date.',
            inputSchema: {}
        },
        timeService.getCurrentDate
    );

    server.registerTool(
        "time.getCurrentTime",
        {
            description: 'Gets the current time.',
            inputSchema: {}
        },
        timeService.getCurrentTime
    );

    server.registerTool(
        "time.getTimeZone",
        {
            description: 'Gets the local timezone.',
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

    // 4. Connect the transport layer and start listening
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Google Workspace MCP Server is running (registerTool). Listening for requests...");
}

main().catch(error => {
    console.error('A critical error occurred:', error);
    process.exit(1);
});
