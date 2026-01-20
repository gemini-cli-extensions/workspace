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

import { version } from '../package.json';

async function main() {
    if (process.argv.includes('--debug')) { setLoggingEnabled(true); }
    const authManager = new AuthManager(SCOPES);
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

    const server = new McpServer({ name: "google-workspace-server", version });

    server.registerTool("auth.clear", { description: 'Clears the authentication credentials, forcing a re-login on the next request.', inputSchema: {} }, async () => { await authManager.clearAuth(); return { content: [{ type: "text", text: "Authentication credentials cleared. You will be prompted to log in again on the next request." }] }; });
    server.registerTool("auth.refreshToken", { description: 'Manually triggers the token refresh process.', inputSchema: {} }, async () => { await authManager.refreshToken(); return { content: [{ type: "text", text: "Token refresh process triggered successfully." }] }; });
    server.registerTool("docs.create", { description: 'Creates a new Google Doc. Can be blank or with Markdown content.', inputSchema: { title: z.string().describe('The title for the new Google Doc.'), folderName: z.string().optional().describe('The name of the folder to create the document in.'), markdown: z.string().optional().describe('The Markdown content to create the document from.') } }, docsService.create);
    server.registerTool("docs.insertText", { description: 'Inserts text at the beginning of a Google Doc.', inputSchema: { documentId: z.string().describe('The ID of the document to modify.'), text: z.string().describe('The text to insert at the beginning of the document.'), tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, modifies the first tab.') } }, docsService.insertText);
    server.registerTool("docs.find", { description: 'Finds Google Docs by searching for a query in their title. Supports pagination.', inputSchema: { query: z.string().describe('The text to search for in the document titles.'), pageToken: z.string().optional().describe('The token for the next page of results.'), pageSize: z.number().optional().describe('The maximum number of results to return.') } }, docsService.find);
    server.registerTool("drive.findFolder", { description: 'Finds a folder by name in Google Drive.', inputSchema: { folderName: z.string().describe('The name of the folder to find.') } }, driveService.findFolder);
    server.registerTool("drive.createFolder", { description: 'Creates a new folder in Google Drive.', inputSchema: { name: z.string().trim().min(1).describe('The name of the new folder.'), parentId: z.string().trim().min(1).optional().describe('The ID of the parent folder. If not provided, creates in the root directory.') } }, driveService.createFolder);
    server.registerTool("docs.move", { description: 'Moves a document to a specified folder.', inputSchema: { documentId: z.string().describe('The ID of the document to move.'), folderName: z.string().describe('The name of the destination folder.') } }, docsService.move);
    server.registerTool("docs.getText", { description: 'Retrieves the text content of a Google Doc.', inputSchema: { documentId: z.string().describe('The ID of the document to read.'), tabId: z.string().optional().describe('The ID of the tab to read. If not provided, returns all tabs.') } }, docsService.getText);
    server.registerTool("docs.appendText", { description: 'Appends text to the end of a Google Doc.', inputSchema: { documentId: z.string().describe('The ID of the document to modify.'), text: z.string().describe('The text to append to the document.'), tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, modifies the first tab.') } }, docsService.appendText);
    server.registerTool("docs.replaceText", { description: 'Replaces all occurrences of a given text with new text in a Google Doc.', inputSchema: { documentId: z.string().describe('The ID of the document to modify.'), findText: z.string().describe('The text to find in the document.'), replaceText: z.string().describe('The text to replace the found text with.'), tabId: z.string().optional().describe('The ID of the tab to modify. If not provided, replaces in all tabs (legacy behavior).') } }, docsService.replaceText);
    server.registerTool("docs.extractIdFromUrl", { description: 'Extracts the document ID from a Google Workspace URL.', inputSchema: { url: z.string().describe('The URL of the Google Workspace document.') } }, async (input: { url: string }) => { const result = extractDocId(input.url); return { content: [{ type: "text" as const, text: result || '' }] }; });
    server.registerTool("slides.getText", { description: 'Retrieves the text content of a Google Slides presentation.', inputSchema: { presentationId: z.string().describe('The ID or URL of the presentation to read.') } }, slidesService.getText);
    server.registerTool("slides.find", { description: 'Finds Google Slides presentations by searching for a query. Supports pagination.', inputSchema: { query: z.string().describe('The text to search for in presentations.'), pageToken: z.string().optional().describe('The token for the next page of results.'), pageSize: z.number().optional().describe('The maximum number of results to return.') } }, slidesService.find);
    server.registerTool("slides.getMetadata", { description: 'Gets metadata about a Google Slides presentation.', inputSchema: { presentationId: z.string().describe('The ID or URL of the presentation.') } }, slidesService.getMetadata);
    server.registerTool("sheets.getText", { description: 'Retrieves the content of a Google Sheets spreadsheet.', inputSchema: { spreadsheetId: z.string().describe('The ID or URL of the spreadsheet to read.'), format: z.enum(['text', 'csv', 'json']).optional().describe('Output format (default: text).') } }, sheetsService.getText);
    server.registerTool("sheets.getRange", { description: 'Gets values from a specific range in a Google Sheets spreadsheet.', inputSchema: { spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'), range: z.string().describe('The A1 notation range to get (e.g., "Sheet1!A1:B10").') } }, sheetsService.getRange);
    server.registerTool("sheets.find", { description: 'Finds Google Sheets spreadsheets by searching for a query. Supports pagination.', inputSchema: { query: z.string().describe('The text to search for in spreadsheets.'), pageToken: z.string().optional().describe('The token for the next page of results.'), pageSize: z.number().optional().describe('The maximum number of results to return.') } }, sheetsService.find);
    server.registerTool("sheets.getMetadata", { description: 'Gets metadata about a Google Sheets spreadsheet.', inputSchema: { spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.') } }, sheetsService.getMetadata);
    server.registerTool("drive.search", { description: 'Searches for files and folders in Google Drive.', inputSchema: { query: z.string().optional().describe('A simple search term, a Google Drive URL, or a full query string.'), pageSize: z.number().optional().describe('The maximum number of results to return.'), pageToken: z.string().optional().describe('The token for the next page of results.'), corpus: z.string().optional().describe('The corpus of files to search.'), unreadOnly: z.boolean().optional().describe('Whether to filter for unread files only.'), sharedWithMe: z.boolean().optional().describe('Whether to search for files shared with the user.') } }, driveService.search);
    server.registerTool("drive.downloadFile", { description: 'Downloads the content of a file from Google Drive to a local path.', inputSchema: { fileId: z.string().describe('The ID of the file to download.'), localPath: z.string().describe('The local file path where the content should be saved.') } }, driveService.downloadFile);
    server.registerTool("calendar.list", { description: "Lists all of the user's calendars.", inputSchema: {} }, calendarService.listCalendars);
    server.registerTool("calendar.createEvent", { description: 'Creates a new event in a calendar.', inputSchema: { calendarId: z.string().describe('The ID of the calendar to create the event in.'), summary: z.string().describe('The summary or title of the event.'), start: z.object({ dateTime: z.string().describe('The start time in strict ISO 8601 format.') }), end: z.object({ dateTime: z.string().describe('The end time in strict ISO 8601 format.') }), attendees: z.array(z.string()).optional().describe('The email addresses of the attendees.') } }, calendarService.createEvent);
    server.registerTool("calendar.listEvents", { description: 'Lists events from a calendar. Defaults to upcoming events.', inputSchema: { calendarId: z.string().describe('The ID of the calendar to list events from.'), timeMin: z.string().optional().describe('The start time for the event search.'), timeMax: z.string().optional().describe('The end time for the event search.'), attendeeResponseStatus: z.array(z.string()).optional().describe('The response status of the attendee.') } }, calendarService.listEvents);
    server.registerTool("calendar.getEvent", { description: 'Gets the details of a specific calendar event.', inputSchema: { eventId: z.string().describe('The ID of the event to retrieve.'), calendarId: z.string().optional().describe('The ID of the calendar the event belongs to.') } }, calendarService.getEvent);
    server.registerTool("calendar.findFreeTime", { description: 'Finds a free time slot for multiple people to meet.', inputSchema: { attendees: z.array(z.string()).describe('The email addresses of the attendees.'), timeMin: z.string().describe('The start time for the search in strict ISO 8601 format.'), timeMax: z.string().describe('The end time for the search in strict ISO 8601 format.'), duration: z.number().describe('The duration of the meeting in minutes.') } }, calendarService.findFreeTime);
    server.registerTool("calendar.updateEvent", { description: 'Updates an existing event in a calendar.', inputSchema: { eventId: z.string().describe('The ID of the event to update.'), calendarId: z.string().optional().describe('The ID of the calendar to update the event in.'), summary: z.string().optional().describe('The new summary or title of the event.'), start: z.object({ dateTime: z.string().describe('The new start time in strict ISO 8601 format.') }).optional(), end: z.object({ dateTime: z.string().describe('The new end time in strict ISO 8601 format.') }).optional(), attendees: z.array(z.string()).optional().describe('The new list of attendees for the event.') } }, calendarService.updateEvent);
    server.registerTool("calendar.respondToEvent", { description: 'Responds to a meeting invitation (accept, decline, or tentative).', inputSchema: { eventId: z.string().describe('The ID of the event to respond to.'), calendarId: z.string().optional().describe('The ID of the calendar containing the event.'), responseStatus: z.enum(['accepted', 'declined', 'tentative']).describe('Your response to the invitation.'), sendNotification: z.boolean().optional().describe('Whether to send a notification to the organizer.'), responseMessage: z.string().optional().describe('Optional message to include with your response.') } }, calendarService.respondToEvent);
    server.registerTool("calendar.deleteEvent", { description: 'Deletes an event from a calendar.', inputSchema: { eventId: z.string().describe('The ID of the event to delete.'), calendarId: z.string().optional().describe('The ID of the calendar to delete the event from.') } }, calendarService.deleteEvent);
    server.registerTool("chat.listSpaces", { description: 'Lists the spaces the user is a member of.', inputSchema: {} }, chatService.listSpaces);
    server.registerTool("chat.findSpaceByName", { description: 'Finds a Google Chat space by its display name.', inputSchema: { displayName: z.string().describe('The display name of the space to find.') } }, chatService.findSpaceByName);
    server.registerTool("chat.sendMessage", { description: 'Sends a message to a Google Chat space.', inputSchema: { spaceName: z.string().describe('The name of the space to send the message to.'), message: z.string().describe('The message to send.'), threadName: z.string().optional().describe('The resource name of the thread to reply to.') } }, chatService.sendMessage);
    server.registerTool("chat.getMessages", { description: 'Gets messages from a Google Chat space.', inputSchema: { spaceName: z.string().describe('The name of the space to get messages from.'), threadName: z.string().optional().describe('The resource name of the thread to filter messages by.'), unreadOnly: z.boolean().optional().describe('Whether to return only unread messages.'), pageSize: z.number().optional().describe('The maximum number of messages to return.'), pageToken: z.string().optional().describe('The token for the next page of results.'), orderBy: z.string().optional().describe('The order to list messages in.') } }, chatService.getMessages);
    server.registerTool("chat.sendDm", { description: 'Sends a direct message to a user.', inputSchema: { email: z.string().email().describe('The email address of the user to send the message to.'), message: z.string().describe('The message to send.'), threadName: z.string().optional().describe('The resource name of the thread to reply to.') } }, chatService.sendDm);
    server.registerTool("chat.findDmByEmail", { description: "Finds a Google Chat DM space by a user's email address.", inputSchema: { email: z.string().email().describe('The email address of the user to find the DM space with.') } }, chatService.findDmByEmail);
    server.registerTool("chat.listThreads", { description: 'Lists threads from a Google Chat space in reverse chronological order.', inputSchema: { spaceName: z.string().describe('The name of the space to get threads from.'), pageSize: z.number().optional().describe('The maximum number of threads to return.'), pageToken: z.string().optional().describe('The token for the next page of results.') } }, chatService.listThreads);
    server.registerTool("chat.setUpSpace", { description: 'Sets up a new Google Chat space with a display name and a list of members.', inputSchema: { displayName: z.string().describe('The display name of the space.'), userNames: z.array(z.string()).describe('The user names of the members to add to the space.') } }, chatService.setUpSpace);
    server.registerTool("gmail.search", { description: 'Search for emails in Gmail using query parameters.', inputSchema: { query: z.string().optional().describe('Search query (same syntax as Gmail search box).'), maxResults: z.number().optional().describe(`Maximum number of results to return (default: ${GMAIL_SEARCH_MAX_RESULTS}).`), pageToken: z.string().optional().describe('Token for the next page of results.'), labelIds: z.array(z.string()).optional().describe('Filter by label IDs.'), includeSpamTrash: z.boolean().optional().describe('Include messages from SPAM and TRASH.') } }, gmailService.search);
    server.registerTool("gmail.get", { description: 'Get the full content of a specific email message.', inputSchema: { messageId: z.string().describe('The ID of the message to retrieve.'), format: z.enum(['minimal', 'full', 'raw', 'metadata']).optional().describe('Format of the message.') } }, gmailService.get);
    server.registerTool("gmail.downloadAttachment", { description: 'Downloads an attachment from a Gmail message to a local file.', inputSchema: { messageId: z.string().describe('The ID of the message containing the attachment.'), attachmentId: z.string().describe('The ID of the attachment to download.'), localPath: z.string().describe('The absolute local path where the attachment should be saved.') } }, gmailService.downloadAttachment);
    server.registerTool("gmail.modify", { description: 'Modify a Gmail message. Add or remove labels. System labels: INBOX, SPAM, TRASH, UNREAD, STARRED, IMPORTANT.', inputSchema: { messageId: z.string().describe('The ID of the message to modify.'), addLabelIds: z.array(z.string()).max(100).optional().describe('Label IDs to add.'), removeLabelIds: z.array(z.string()).max(100).optional().describe('Label IDs to remove.') } }, gmailService.modify);
    server.registerTool("gmail.send", { description: 'Send an email message.', inputSchema: emailComposeSchema }, gmailService.send);
    server.registerTool("gmail.createDraft", { description: 'Create a draft email message.', inputSchema: emailComposeSchema }, gmailService.createDraft);
    server.registerTool("gmail.sendDraft", { description: 'Send a previously created draft email.', inputSchema: { draftId: z.string().describe('The ID of the draft to send.') } }, gmailService.sendDraft);
    server.registerTool("gmail.listLabels", { description: "List all Gmail labels in the user's mailbox.", inputSchema: {} }, gmailService.listLabels);
    server.registerTool("gmail.getLabel", { description: 'Get details of a specific Gmail label, including message/thread counts.', inputSchema: { labelId: z.string().describe('The ID of the label to retrieve.') } }, gmailService.getLabel);
    server.registerTool("gmail.createLabel", { description: 'Create a new Gmail label. Labels help organize emails and can have custom colors. Both backgroundColor and textColor must be provided together when setting colors.', inputSchema: { name: z.string().describe('The display name of the label.'), labelListVisibility: labelListVisibilitySchema.optional(), messageListVisibility: messageListVisibilitySchema.optional(), backgroundColor: z.string().optional().describe('Background color hex code. Must provide textColor as well.'), textColor: z.string().optional().describe('Text color hex code. Must provide backgroundColor as well.') } }, gmailService.createLabel);
    server.registerTool("gmail.updateLabel", { description: 'Update an existing Gmail label. Can modify name, visibility settings, and colors. Only user-created labels can be updated. Both backgroundColor and textColor must be provided together when updating colors.', inputSchema: { labelId: z.string().describe('The ID of the label to update.'), name: z.string().optional().describe('New display name for the label.'), labelListVisibility: labelListVisibilitySchema.optional(), messageListVisibility: messageListVisibilitySchema.optional(), backgroundColor: z.string().optional().describe('New background color hex code. Must provide textColor as well.'), textColor: z.string().optional().describe('New text color hex code. Must provide backgroundColor as well.') } }, gmailService.updateLabel);
    server.registerTool("gmail.deleteLabel", { description: 'Delete a Gmail label. Only user-created labels can be deleted. Messages with this label will not be deleted.', inputSchema: { labelId: z.string().describe('The ID of the label to delete.') } }, gmailService.deleteLabel);
    server.registerTool("time.getCurrentDate", { description: 'Gets the current date. Returns both UTC and local time, along with the timezone.', inputSchema: {} }, timeService.getCurrentDate);
    server.registerTool("time.getCurrentTime", { description: 'Gets the current time. Returns both UTC and local time, along with the timezone.', inputSchema: {} }, timeService.getCurrentTime);
    server.registerTool("time.getTimeZone", { description: 'Gets the local timezone.', inputSchema: {} }, timeService.getTimeZone);
    server.registerTool("people.getUserProfile", { description: "Gets a user's profile information.", inputSchema: { userId: z.string().optional().describe('The ID of the user.'), email: z.string().optional().describe('The email address of the user.'), name: z.string().optional().describe('The name of the user.') } }, peopleService.getUserProfile);
    server.registerTool("people.getMe", { description: 'Gets the profile information of the authenticated user.', inputSchema: {} }, peopleService.getMe);
    server.registerTool("people.getUserRelations", { description: "Gets a user's relations (e.g., manager, spouse, assistant, etc.).", inputSchema: { userId: z.string().optional().describe('The ID of the user to get relations for.'), relationType: z.string().optional().describe('The type of relation to filter by.') } }, peopleService.getUserRelations);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Google Workspace MCP Server is running (registerTool). Listening for requests...");
}

main().catch(error => { console.error('A critical error occurred:', error); process.exit(1); });
