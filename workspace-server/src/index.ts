#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AuthManager } from './auth/AuthManager';
import { DocsService } from './services/DocsService';
import { DriveService } from './services/DriveService';
import { CalendarService } from './services/CalendarService';
import { ChatService } from './services/ChatService';
import { GmailService } from './services/GmailService';
import { TimeService } from './services/TimeService';
import { PeopleService } from './services/PeopleService';
import { SlidesService } from './services/SlidesService';
import { SheetsService } from './services/SheetsService';
import { GMAIL_SEARCH_MAX_RESULTS } from './utils/constants';

import { setLoggingEnabled, logToFile } from './utils/logger';
import { applyToolNameNormalization } from './utils/tool-normalization';
import { SCOPES } from './auth/scopes';
import { resolveFeatures } from './features/index';

// Shared schemas for calendar event tools
const eventDateInputSchema = (fieldName: string) =>
  z
    .object({
      dateTime: z
        .string()
        .optional()
        .describe(
          'Time in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T10:30:00Z or 2024-01-15T10:30:00-05:00).',
        ),
      date: z
        .string()
        .optional()
        .describe('Date in YYYY-MM-DD format. Use for all-day events.'),
    })
    .refine(({ dateTime, date }) => Number(!!dateTime) + Number(!!date) === 1, {
      message: `${fieldName} must have exactly one of "dateTime" (for timed events) or "date" (for all-day events)`,
    });

const eventMeetAndAttachmentsSchema = {
  addGoogleMeet: z
    .boolean()
    .optional()
    .describe(
      "Whether to create a Google Meet link for the event. The Meet URL will be available in the response's hangoutLink field.",
    ),
  attachments: z
    .array(
      z.object({
        fileUrl: z
          .string()
          .url()
          .describe(
            'Google Drive file URL (e.g., https://drive.google.com/file/d/...)',
          ),
        title: z
          .string()
          .optional()
          .describe('Display title for the attachment.'),
        mimeType: z
          .string()
          .optional()
          .describe('MIME type of the attachment.'),
      }),
    )
    .optional()
    .describe(
      'Google Drive file attachments. IMPORTANT: Providing attachments fully REPLACES any existing attachments on the event (not appended). On updates, pass an empty array to clear all attachments.',
    ),
};

// Shared schemas for Gmail tools
const emailComposeSchema = {
  to: z
    .union([z.string(), z.array(z.string())])
    .describe('Recipient email address(es).'),
  subject: z.string().describe('Email subject.'),
  body: z.string().describe('Email body content.'),
  cc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('CC recipient email address(es).'),
  bcc: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe('BCC recipient email address(es).'),
  isHtml: z
    .boolean()
    .optional()
    .describe('Whether the body is HTML (default: false).'),
};

// Dynamically import version from package.json
import { version } from '../package.json';

async function main() {
  // Handle 'login' subcommand for headless OAuth flow
  if (process.argv.includes('login')) {
    await import('./cli/headless-login');
    return;
  }

  // 1. Initialize services
  if (process.argv.includes('--debug')) {
    setLoggingEnabled(true);
  }

  const readOnlyToolProps = {
    annotations: {
      readOnlyHint: true,
    },
  };

  // Resolve enabled features from defaults + env overrides
  const { enabledTools } = resolveFeatures(
    undefined,
    process.env['WORKSPACE_FEATURE_OVERRIDES'],
  );

  logToFile(
    `[features] ${enabledTools.size} tools enabled. Disabled: ${
      process.env['WORKSPACE_FEATURE_OVERRIDES'] || '(none)'
    }`,
  );

  const authManager = new AuthManager(SCOPES);

  // 2. Create the server instance
  const server = new McpServer({
    name: 'google-workspace-server',
    version,
  });

  authManager.setOnStatusUpdate((message) => {
    server
      .sendLoggingMessage({
        level: 'info',
        data: message,
      })
      .catch((err) => {
        console.error('Failed to send logging message:', err);
      });
  });

  const driveService = new DriveService(authManager);
  const docsService = new DocsService(authManager);
  const peopleService = new PeopleService(authManager);
  const calendarService = new CalendarService(authManager);
  const chatService = new ChatService(authManager);
  const gmailService = new GmailService(authManager);
  const timeService = new TimeService();
  const slidesService = new SlidesService(authManager);
  const sheetsService = new SheetsService(authManager);

  // 3. Register tools directly on the server
  // Handle tool name normalization (dots to underscores) by default, or use dots if --use-dot-names is passed.
  const useDotNames = process.argv.includes('--use-dot-names');
  const separator = useDotNames ? '.' : '_';
  applyToolNameNormalization(server, useDotNames);

  // Wrap registerTool to skip tools disabled by feature config.
  // Auth tools are always registered (not gated by features).
  const originalRegisterTool = server.registerTool.bind(server);
  const registerTool: typeof server.registerTool = ((
    name: string,
    config: unknown,
    handler: unknown,
  ) => {
    if (!enabledTools.has(name) && !name.startsWith('auth.')) {
      logToFile(`[features] Skipping disabled tool: ${name}`);
      return server;
    }
    return originalRegisterTool(name, config as never, handler as never);
  }) as typeof server.registerTool;

  registerTool(
    'auth.clear',
    {
      description:
        'Clears the authentication credentials, forcing a re-login on the next request.',
      inputSchema: {},
    },
    async () => {
      await authManager.clearAuth();
      return {
        content: [
          {
            type: 'text',
            text: 'Authentication credentials cleared. You will be prompted to log in again on the next request.',
          },
        ],
      };
    },
  );

  registerTool(
    'auth.refreshToken',
    {
      description: 'Manually triggers the token refresh process.',
      inputSchema: {},
    },
    async () => {
      await authManager.refreshToken();
      return {
        content: [
          {
            type: 'text',
            text: 'Token refresh process triggered successfully.',
          },
        ],
      };
    },
  );

  registerTool(
    'docs.getSuggestions',
    {
      description: 'Retrieves suggested edits from a Google Doc.',
      inputSchema: {
        documentId: z
          .string()
          .describe('The ID of the document to retrieve suggestions from.'),
      },
    },
    docsService.getSuggestions,
  );

  registerTool(
    'drive.getComments',
    {
      description:
        'Retrieves comments from a Google Drive file (Docs, Sheets, Slides, etc.).',
      inputSchema: {
        fileId: z
          .string()
          .describe('The ID of the file to retrieve comments from.'),
      },
    },
    driveService.getComments,
  );

  registerTool(
    'docs.create',
    {
      description:
        'Creates a new Google Doc. Can be blank or with initial text content.',
      inputSchema: {
        title: z.string().describe('The title for the new Google Doc.'),
        content: z
          .string()
          .optional()
          .describe('The text content to create the document with.'),
      },
    },
    docsService.create,
  );

  registerTool(
    'docs.writeText',
    {
      description: 'Writes text to a Google Doc at a specified position.',
      inputSchema: {
        documentId: z.string().describe('The ID of the document to modify.'),
        text: z.string().describe('The text to write to the document.'),
        position: z
          .string()
          .optional()
          .describe(
            'Where to insert the text. Use "beginning" for the start, "end" for the end (default), or a numeric index for a specific position.',
          ),
        tabId: z
          .string()
          .optional()
          .describe(
            'The ID of the tab to modify. If not provided, modifies the first tab.',
          ),
      },
    },
    docsService.writeText,
  );

  registerTool(
    'drive.findFolder',
    {
      description: 'Finds a folder by name in Google Drive.',
      inputSchema: {
        folderName: z.string().describe('The name of the folder to find.'),
      },
      ...readOnlyToolProps,
    },
    driveService.findFolder,
  );

  registerTool(
    'drive.createFolder',
    {
      description: 'Creates a new folder in Google Drive.',
      inputSchema: {
        name: z.string().trim().min(1).describe('The name of the new folder.'),
        parentId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'The ID of the parent folder. If not provided, creates in the root directory.',
          ),
      },
    },
    driveService.createFolder,
  );

  registerTool(
    'docs.getText',
    {
      description: 'Retrieves the text content of a Google Doc.',
      inputSchema: {
        documentId: z.string().describe('The ID of the document to read.'),
        tabId: z
          .string()
          .optional()
          .describe(
            'The ID of the tab to read. If not provided, returns all tabs.',
          ),
      },
      ...readOnlyToolProps,
    },
    docsService.getText,
  );

  registerTool(
    'docs.replaceText',
    {
      description:
        'Replaces all occurrences of a given text with new text in a Google Doc.',
      inputSchema: {
        documentId: z.string().describe('The ID of the document to modify.'),
        findText: z.string().describe('The text to find in the document.'),
        replaceText: z
          .string()
          .describe('The text to replace the found text with.'),
        tabId: z
          .string()
          .optional()
          .describe(
            'The ID of the tab to modify. If not provided, replaces in all tabs (legacy behavior).',
          ),
      },
    },
    docsService.replaceText,
  );

  registerTool(
    'docs.formatText',
    {
      description:
        'Applies formatting (bold, italic, headings, etc.) to text ranges in a Google Doc. Use after inserting text to apply rich formatting.',
      inputSchema: {
        documentId: z.string().describe('The ID of the document to format.'),
        formats: z
          .array(
            z.object({
              startIndex: z
                .number()
                .describe('The start index of the text range (1-based).'),
              endIndex: z
                .number()
                .describe(
                  'The end index of the text range (exclusive, 1-based).',
                ),
              style: z
                .string()
                .describe(
                  'The formatting style to apply. Supported: bold, italic, underline, strikethrough, code, link, heading1, heading2, heading3, heading4, heading5, heading6, normalText.',
                ),
              url: z
                .string()
                .optional()
                .describe(
                  'The URL for link formatting. Required when style is "link".',
                ),
            }),
          )
          .describe('The formatting instructions to apply.'),
        tabId: z
          .string()
          .optional()
          .describe(
            'The ID of the tab to format. If not provided, formats the first tab.',
          ),
      },
    },
    docsService.formatText,
  );

  // Slides tools
  registerTool(
    'slides.getText',
    {
      description:
        'Retrieves the text content of a Google Slides presentation.',
      inputSchema: {
        presentationId: z
          .string()
          .describe('The ID or URL of the presentation to read.'),
      },
      ...readOnlyToolProps,
    },
    slidesService.getText,
  );

  registerTool(
    'slides.getMetadata',
    {
      description: 'Gets metadata about a Google Slides presentation.',
      inputSchema: {
        presentationId: z
          .string()
          .describe('The ID or URL of the presentation.'),
      },
      ...readOnlyToolProps,
    },
    slidesService.getMetadata,
  );

  registerTool(
    'slides.getImages',
    {
      description:
        'Downloads all images embedded in a Google Slides presentation to a local directory.',
      inputSchema: {
        presentationId: z
          .string()
          .describe(
            'The ID or URL of the presentation to extract images from.',
          ),
        localPath: z
          .string()
          .describe(
            'The absolute local directory path to download the images to (e.g., "/Users/name/downloads/images").',
          ),
      },
    },
    slidesService.getImages,
  );

  registerTool(
    'slides.getSlideThumbnail',
    {
      description:
        'Downloads a thumbnail image for a specific slide in a Google Slides presentation to a local path.',
      inputSchema: {
        presentationId: z
          .string()
          .describe('The ID or URL of the presentation.'),
        slideObjectId: z
          .string()
          .describe(
            'The object ID of the slide (can be found via slides.getMetadata or slides.getText).',
          ),
        localPath: z
          .string()
          .describe(
            'The absolute local file path to download the thumbnail to (e.g., "/Users/name/downloads/slide1.png").',
          ),
      },
    },
    slidesService.getSlideThumbnail,
  );

  // Sheets tools
  registerTool(
    'sheets.getText',
    {
      description: 'Retrieves the content of a Google Sheets spreadsheet.',
      inputSchema: {
        spreadsheetId: z
          .string()
          .describe('The ID or URL of the spreadsheet to read.'),
        format: z
          .enum(['text', 'csv', 'json'])
          .optional()
          .describe('Output format (default: text).'),
      },
      ...readOnlyToolProps,
    },
    sheetsService.getText,
  );

  registerTool(
    'sheets.getRange',
    {
      description:
        'Gets values from a specific range in a Google Sheets spreadsheet.',
      inputSchema: {
        spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'),
        range: z
          .string()
          .describe('The A1 notation range to get (e.g., "Sheet1!A1:B10").'),
      },
      ...readOnlyToolProps,
    },
    sheetsService.getRange,
  );

  registerTool(
    'sheets.getMetadata',
    {
      description: 'Gets metadata about a Google Sheets spreadsheet.',
      inputSchema: {
        spreadsheetId: z.string().describe('The ID or URL of the spreadsheet.'),
      },
      ...readOnlyToolProps,
    },
    sheetsService.getMetadata,
  );

  registerTool(
    'drive.search',
    {
      description:
        'Searches for files and folders in Google Drive. The query can be a simple search term, a Google Drive URL, or a full query string. For more information on query strings see: https://developers.google.com/drive/api/guides/search-files',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'A simple search term (e.g., "Budget Q3"), a Google Drive URL, or a full query string (e.g., "name contains \'Budget\' and owners in \'user@example.com\'").',
          ),
        pageSize: z
          .number()
          .optional()
          .describe('The maximum number of results to return.'),
        pageToken: z
          .string()
          .optional()
          .describe('The token for the next page of results.'),
        corpus: z
          .string()
          .optional()
          .describe('The corpus of files to search (e.g., "user", "domain").'),
        unreadOnly: z
          .boolean()
          .optional()
          .describe('Whether to filter for unread files only.'),
        sharedWithMe: z
          .boolean()
          .optional()
          .describe('Whether to search for files shared with the user.'),
      },
      ...readOnlyToolProps,
    },
    driveService.search,
  );

  registerTool(
    'drive.downloadFile',
    {
      description:
        'Downloads the content of a file from Google Drive to a local path. Note: Google Docs, Sheets, and Slides require specialized handling.',
      inputSchema: {
        fileId: z.string().describe('The ID of the file to download.'),
        localPath: z
          .string()
          .describe(
            'The local file path where the content should be saved (e.g., "downloads/report.pdf").',
          ),
      },
    },
    driveService.downloadFile,
  );

  registerTool(
    'drive.moveFile',
    {
      description:
        'Moves a file or folder to a different folder in Google Drive.',
      inputSchema: {
        fileId: z.string().describe('The ID or URL of the file to move.'),
        folderId: z
          .string()
          .optional()
          .describe(
            'The ID of the destination folder. Either folderId or folderName must be provided.',
          ),
        folderName: z
          .string()
          .optional()
          .describe(
            'The name of the destination folder. Either folderId or folderName must be provided.',
          ),
      },
    },
    driveService.moveFile,
  );

  registerTool(
    'drive.trashFile',
    {
      description:
        'Moves a file or folder to the trash in Google Drive. This is a safe, reversible operation.',
      inputSchema: {
        fileId: z.string().describe('The ID or URL of the file to trash.'),
      },
    },
    driveService.trashFile,
  );

  registerTool(
    'drive.renameFile',
    {
      description: 'Renames a file or folder in Google Drive.',
      inputSchema: {
        fileId: z.string().describe('The ID or URL of the file to rename.'),
        newName: z
          .string()
          .trim()
          .min(1)
          .describe('The new name for the file.'),
      },
    },
    driveService.renameFile,
  );

  registerTool(
    'calendar.list',
    {
      description: "Lists all of the user's calendars.",
      inputSchema: {},
      ...readOnlyToolProps,
    },
    calendarService.listCalendars,
  );

  registerTool(
    'calendar.createEvent',
    {
      description:
        "Creates a new event in a calendar. Supports regular events, focus time, out-of-office, and working location event types. Use 'date' for all-day events or 'dateTime' for timed events. Supports optional Google Meet link generation and Google Drive file attachments. When addGoogleMeet is true, the Meet URL will be in the response's hangoutLink field. Attachments fully replace any existing attachments.",
      inputSchema: {
        calendarId: z
          .string()
          .optional()
          .describe(
            'The ID of the calendar to create the event in. Defaults to the primary calendar.',
          ),
        summary: z
          .string()
          .optional()
          .describe(
            'The summary or title of the event. Defaults based on eventType: "Focus Time", "Out of Office", "Working Location".',
          ),
        description: z
          .string()
          .optional()
          .describe('The description of the event.'),
        start: eventDateInputSchema('start'),
        end: eventDateInputSchema('end'),
        attendees: z
          .array(z.string())
          .optional()
          .describe('The email addresses of the attendees.'),
        sendUpdates: z
          .enum(['all', 'externalOnly', 'none'])
          .optional()
          .describe(
            'Whether to send notifications to attendees. Defaults to "all" if attendees are provided, otherwise "none".',
          ),
        ...eventMeetAndAttachmentsSchema,
        eventType: z
          .enum(['default', 'focusTime', 'outOfOffice', 'workingLocation'])
          .optional()
          .describe(
            'The type of event to create. Defaults to "default" (regular event).',
          ),
        focusTimeProperties: z
          .object({
            chatStatus: z
              .enum(['available', 'doNotDisturb'])
              .optional()
              .describe(
                'Chat status during focus time. Defaults to "doNotDisturb".',
              ),
            autoDeclineMode: z
              .enum([
                'declineNone',
                'declineAllConflictingInvitations',
                'declineOnlyNewConflictingInvitations',
              ])
              .optional()
              .describe(
                'How to handle conflicting meeting invitations. Defaults to "declineOnlyNewConflictingInvitations".',
              ),
            declineMessage: z
              .string()
              .optional()
              .describe('Message to send when auto-declining meetings.'),
          })
          .optional()
          .describe(
            'Focus time properties. Only used when eventType is "focusTime".',
          ),
        outOfOfficeProperties: z
          .object({
            autoDeclineMode: z
              .enum([
                'declineNone',
                'declineAllConflictingInvitations',
                'declineOnlyNewConflictingInvitations',
              ])
              .optional()
              .describe(
                'How to handle conflicting meeting invitations. Defaults to "declineOnlyNewConflictingInvitations".',
              ),
            declineMessage: z
              .string()
              .optional()
              .describe('Message to send when auto-declining meetings.'),
          })
          .optional()
          .describe(
            'Out-of-office properties. Only used when eventType is "outOfOffice".',
          ),
        workingLocationProperties: z
          .object({
            type: z
              .enum(['homeOffice', 'officeLocation', 'customLocation'])
              .describe('The type of working location.'),
            officeLocation: z
              .object({
                buildingId: z
                  .string()
                  .optional()
                  .describe('The building ID from the directory.'),
                label: z
                  .string()
                  .optional()
                  .describe('Label for the office location.'),
              })
              .optional()
              .describe(
                'Office location details. Required when type is "officeLocation".',
              ),
            customLocation: z
              .object({
                label: z.string().describe('Label for the custom location.'),
              })
              .optional()
              .describe(
                'Custom location details. Required when type is "customLocation".',
              ),
          })
          .optional()
          .describe(
            'Working location properties. Only used when eventType is "workingLocation".',
          ),
      },
    },
    calendarService.createEvent,
  );

  registerTool(
    'calendar.listEvents',
    {
      description: 'Lists events from a calendar. Defaults to upcoming events.',
      inputSchema: {
        calendarId: z
          .string()
          .describe('The ID of the calendar to list events from.'),
        timeMin: z
          .string()
          .optional()
          .describe(
            'The start time for the event search. Defaults to the current time.',
          ),
        timeMax: z
          .string()
          .optional()
          .describe('The end time for the event search.'),
        attendeeResponseStatus: z
          .array(z.string())
          .optional()
          .describe('The response status of the attendee.'),
        eventTypes: z
          .array(
            z.enum([
              'default',
              'focusTime',
              'outOfOffice',
              'workingLocation',
              'birthday',
              'fromGmail',
            ]),
          )
          .optional()
          .describe(
            'Filter by event types. Possible values: default, focusTime, outOfOffice, workingLocation, birthday, fromGmail.',
          ),
      },
      ...readOnlyToolProps,
    },
    calendarService.listEvents,
  );

  registerTool(
    'calendar.getEvent',
    {
      description: 'Gets the details of a specific calendar event.',
      inputSchema: {
        eventId: z.string().describe('The ID of the event to retrieve.'),
        calendarId: z
          .string()
          .optional()
          .describe(
            'The ID of the calendar the event belongs to. Defaults to the primary calendar.',
          ),
      },
      ...readOnlyToolProps,
    },
    calendarService.getEvent,
  );

  registerTool(
    'calendar.findFreeTime',
    {
      description: 'Finds a free time slot for multiple people to meet.',
      inputSchema: {
        attendees: z
          .array(z.string())
          .describe('The email addresses of the attendees.'),
        timeMin: z
          .string()
          .describe(
            'The start time for the search in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T09:00:00Z or 2024-01-15T09:00:00-05:00).',
          ),
        timeMax: z
          .string()
          .describe(
            'The end time for the search in strict ISO 8601 format with seconds and timezone (e.g., 2024-01-15T18:00:00Z or 2024-01-15T18:00:00-05:00).',
          ),
        duration: z
          .number()
          .describe('The duration of the meeting in minutes.'),
      },
      ...readOnlyToolProps,
    },
    calendarService.findFreeTime,
  );

  registerTool(
    'calendar.updateEvent',
    {
      description:
        "Updates an existing event in a calendar while preserving unspecified fields. Supports both timed events (`dateTime`) and all-day events (`date`), along with Google Meet links and Google Drive file attachments. When addGoogleMeet is true, the Meet URL will be in the response's hangoutLink field. Attachments fully replace any existing attachments (not appended), and an empty attachments array clears them.",
      inputSchema: {
        eventId: z.string().describe('The ID of the event to update.'),
        calendarId: z
          .string()
          .optional()
          .describe('The ID of the calendar to update the event in.'),
        summary: z
          .string()
          .optional()
          .describe('The new summary or title of the event.'),
        description: z
          .string()
          .optional()
          .describe('The new description of the event.'),
        start: eventDateInputSchema('start').optional(),
        end: eventDateInputSchema('end').optional(),
        attendees: z
          .array(z.string())
          .optional()
          .describe('The new list of attendees for the event.'),
        ...eventMeetAndAttachmentsSchema,
      },
    },
    calendarService.updateEvent,
  );

  registerTool(
    'calendar.respondToEvent',
    {
      description:
        'Responds to a meeting invitation (accept, decline, or tentative).',
      inputSchema: {
        eventId: z.string().describe('The ID of the event to respond to.'),
        calendarId: z
          .string()
          .optional()
          .describe('The ID of the calendar containing the event.'),
        responseStatus: z
          .enum(['accepted', 'declined', 'tentative'])
          .describe('Your response to the invitation.'),
        sendNotification: z
          .boolean()
          .optional()
          .describe(
            'Whether to send a notification to the organizer (default: true).',
          ),
        responseMessage: z
          .string()
          .optional()
          .describe('Optional message to include with your response.'),
      },
    },
    calendarService.respondToEvent,
  );

  registerTool(
    'calendar.deleteEvent',
    {
      description: 'Deletes an event from a calendar.',
      inputSchema: {
        eventId: z.string().describe('The ID of the event to delete.'),
        calendarId: z
          .string()
          .optional()
          .describe(
            'The ID of the calendar to delete the event from. Defaults to the primary calendar.',
          ),
      },
    },
    calendarService.deleteEvent,
  );

  registerTool(
    'chat.listSpaces',
    {
      description: 'Lists the spaces the user is a member of.',
      inputSchema: {},
      ...readOnlyToolProps,
    },
    chatService.listSpaces,
  );

  registerTool(
    'chat.findSpaceByName',
    {
      description: 'Finds a Google Chat space by its display name.',
      inputSchema: {
        displayName: z
          .string()
          .describe('The display name of the space to find.'),
      },
      ...readOnlyToolProps,
    },
    chatService.findSpaceByName,
  );

  registerTool(
    'chat.sendMessage',
    {
      description: 'Sends a message to a Google Chat space.',
      inputSchema: {
        spaceName: z
          .string()
          .describe(
            'The name of the space to send the message to (e.g., spaces/AAAAN2J52O8).',
          ),
        message: z.string().describe('The message to send.'),
        threadName: z
          .string()
          .optional()
          .describe(
            'The resource name of the thread to reply to. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"',
          ),
      },
    },
    chatService.sendMessage,
  );

  registerTool(
    'chat.getMessages',
    {
      description: 'Gets messages from a Google Chat space.',
      inputSchema: {
        spaceName: z
          .string()
          .describe(
            'The name of the space to get messages from (e.g., spaces/AAAAN2J52O8).',
          ),
        threadName: z
          .string()
          .optional()
          .describe(
            'The resource name of the thread to filter messages by. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"',
          ),
        unreadOnly: z
          .boolean()
          .optional()
          .describe('Whether to return only unread messages.'),
        pageSize: z
          .number()
          .optional()
          .describe('The maximum number of messages to return.'),
        pageToken: z
          .string()
          .optional()
          .describe('The token for the next page of results.'),
        orderBy: z
          .string()
          .optional()
          .describe('The order to list messages in (e.g., "createTime desc").'),
      },
      ...readOnlyToolProps,
    },
    chatService.getMessages,
  );

  registerTool(
    'chat.sendDm',
    {
      description: 'Sends a direct message to a user.',
      inputSchema: {
        email: z
          .string()
          .email()
          .describe('The email address of the user to send the message to.'),
        message: z.string().describe('The message to send.'),
        threadName: z
          .string()
          .optional()
          .describe(
            'The resource name of the thread to reply to. Example: "spaces/AAAAVJcnwPE/threads/IAf4cnLqYfg"',
          ),
      },
    },
    chatService.sendDm,
  );

  registerTool(
    'chat.findDmByEmail',
    {
      description: "Finds a Google Chat DM space by a user's email address.",
      inputSchema: {
        email: z
          .string()
          .email()
          .describe('The email address of the user to find the DM space with.'),
      },
      ...readOnlyToolProps,
    },
    chatService.findDmByEmail,
  );

  registerTool(
    'chat.listThreads',
    {
      description:
        'Lists threads from a Google Chat space in reverse chronological order.',
      inputSchema: {
        spaceName: z
          .string()
          .describe(
            'The name of the space to get threads from (e.g., spaces/AAAAN2J52O8).',
          ),
        pageSize: z
          .number()
          .optional()
          .describe('The maximum number of threads to return.'),
        pageToken: z
          .string()
          .optional()
          .describe('The token for the next page of results.'),
      },
      ...readOnlyToolProps,
    },
    chatService.listThreads,
  );

  registerTool(
    'chat.setUpSpace',
    {
      description:
        'Sets up a new Google Chat space with a display name and a list of members.',
      inputSchema: {
        displayName: z.string().describe('The display name of the space.'),
        userNames: z
          .array(z.string())
          .describe(
            'The user names of the members to add to the space (e.g. users/12345678)',
          ),
      },
    },
    chatService.setUpSpace,
  );

  // Gmail tools
  registerTool(
    'gmail.search',
    {
      description: 'Search for emails in Gmail using query parameters.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Search query (same syntax as Gmail search box, e.g., "from:someone@example.com is:unread").',
          ),
        maxResults: z
          .number()
          .optional()
          .describe(
            `Maximum number of results to return (default: ${GMAIL_SEARCH_MAX_RESULTS}).`,
          ),
        pageToken: z
          .string()
          .optional()
          .describe('Token for the next page of results.'),
        labelIds: z
          .array(z.string())
          .optional()
          .describe('Filter by label IDs (e.g., ["INBOX", "UNREAD"]).'),
        includeSpamTrash: z
          .boolean()
          .optional()
          .describe('Include messages from SPAM and TRASH (default: false).'),
      },
      ...readOnlyToolProps,
    },
    gmailService.search,
  );

  registerTool(
    'gmail.get',
    {
      description: 'Get the full content of a specific email message.',
      inputSchema: {
        messageId: z.string().describe('The ID of the message to retrieve.'),
        format: z
          .enum(['minimal', 'full', 'raw', 'metadata'])
          .optional()
          .describe('Format of the message (default: full).'),
      },
      ...readOnlyToolProps,
    },
    gmailService.get,
  );

  registerTool(
    'gmail.downloadAttachment',
    {
      description:
        'Downloads an attachment from a Gmail message to a local file.',
      inputSchema: {
        messageId: z
          .string()
          .describe('The ID of the message containing the attachment.'),
        attachmentId: z
          .string()
          .describe('The ID of the attachment to download.'),
        localPath: z
          .string()
          .describe(
            'The absolute local path where the attachment should be saved (e.g., "/Users/name/downloads/report.pdf").',
          ),
      },
    },
    gmailService.downloadAttachment,
  );

  registerTool(
    'gmail.modify',
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
        messageId: z
          .string()
          .describe(
            'The ID of the message to add labels to and/or remove labels from.',
          ),
        addLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to add to the message. Limit to 100 labels.',
          ),
        removeLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to remove from the message. Limit to 100 labels.',
          ),
      },
    },
    gmailService.modify,
  );

  registerTool(
    'gmail.batchModify',
    {
      description: `Bulk modify up to 1,000 Gmail messages at once. Applies the same label changes to all specified messages in a single API call. This is much more efficient than modifying messages individually.
    - Add labels to messages.
    - Remove labels from messages.
System labels that can be modified:
    - INBOX: removing INBOX label archives messages.
    - SPAM: adding SPAM label marks messages as spam.
    - TRASH: adding TRASH label moves messages to trash.
    - UNREAD: removing UNREAD label marks messages as read.
    - STARRED: adding STARRED label marks messages as starred.
    - IMPORTANT: adding IMPORTANT label marks messages as important.`,
      inputSchema: {
        messageIds: z
          .array(z.string())
          .min(1, { message: 'At least one message ID must be provided.' })
          .max(1000)
          .describe(
            'The IDs of the messages to modify. Maximum 1,000 per call.',
          ),
        addLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to add to the messages. Limit to 100 labels.',
          ),
        removeLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to remove from the messages. Limit to 100 labels.',
          ),
      },
    },
    gmailService.batchModify,
  );

  registerTool(
    'gmail.modifyThread',
    {
      description: `Modify labels on all messages in a Gmail thread. This applies label changes to every message in the thread at once, which is useful for operations like marking an entire conversation as read.
System labels that can be modified:
    - INBOX: removing INBOX label archives the thread.
    - SPAM: adding SPAM label marks the thread as spam.
    - TRASH: adding TRASH label moves the thread to trash.
    - UNREAD: removing UNREAD label marks all messages in the thread as read.
    - STARRED: adding STARRED label marks the thread as starred.
    - IMPORTANT: adding IMPORTANT label marks the thread as important.`,
      inputSchema: {
        threadId: z.string().describe('The ID of the thread to modify.'),
        addLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to add to the thread. Limit to 100 labels.',
          ),
        removeLabelIds: z
          .array(z.string())
          .max(100)
          .optional()
          .describe(
            'A list of label IDs to remove from the thread. Limit to 100 labels.',
          ),
      },
    },
    gmailService.modifyThread,
  );

  registerTool(
    'gmail.send',
    {
      description: 'Send an email message.',
      inputSchema: emailComposeSchema,
    },
    gmailService.send,
  );

  registerTool(
    'gmail.createDraft',
    {
      description: 'Create a draft email message.',
      inputSchema: {
        ...emailComposeSchema,
        threadId: z
          .string()
          .optional()
          .describe(
            'The thread ID to create the draft as a reply to. When provided, the draft will be linked to the existing thread with appropriate reply headers.',
          ),
      },
    },
    gmailService.createDraft,
  );

  registerTool(
    'gmail.sendDraft',
    {
      description: 'Send a previously created draft email.',
      inputSchema: {
        draftId: z.string().describe('The ID of the draft to send.'),
      },
    },
    gmailService.sendDraft,
  );

  registerTool(
    'gmail.listLabels',
    {
      description: "List all Gmail labels in the user's mailbox.",
      inputSchema: {},
      ...readOnlyToolProps,
    },
    gmailService.listLabels,
  );

  registerTool(
    'gmail.createLabel',
    {
      description:
        'Create a new Gmail label. Labels help organize emails into categories.',
      inputSchema: {
        name: z.string().min(1).describe('The display name of the label.'),
        labelListVisibility: z
          .enum(['labelShow', 'labelHide', 'labelShowIfUnread'])
          .optional()
          .describe(
            'Visibility of the label in the label list. Defaults to "labelShow".',
          ),
        messageListVisibility: z
          .enum(['show', 'hide'])
          .optional()
          .describe(
            'Visibility of messages with this label in the message list. Defaults to "show".',
          ),
      },
    },
    gmailService.createLabel,
  );

  // Time tools
  registerTool(
    'time.getCurrentDate',
    {
      description:
        'Gets the current date. Returns both UTC (for calendar/API use) and local time (for display to the user), along with the timezone.',
      inputSchema: {},
      ...readOnlyToolProps,
    },
    timeService.getCurrentDate,
  );

  registerTool(
    'time.getCurrentTime',
    {
      description:
        'Gets the current time. Returns both UTC (for calendar/API use) and local time (for display to the user), along with the timezone.',
      inputSchema: {},
      ...readOnlyToolProps,
    },
    timeService.getCurrentTime,
  );

  registerTool(
    'time.getTimeZone',
    {
      description:
        'Gets the local timezone. Note: timezone is also included in getCurrentDate and getCurrentTime responses.',
      inputSchema: {},
      ...readOnlyToolProps,
    },
    timeService.getTimeZone,
  );

  // People tools
  registerTool(
    'people.getUserProfile',
    {
      description: "Gets a user's profile information.",
      inputSchema: {
        userId: z
          .string()
          .optional()
          .describe('The ID of the user to get profile information for.'),
        email: z
          .string()
          .optional()
          .describe(
            'The email address of the user to get profile information for.',
          ),
        name: z
          .string()
          .optional()
          .describe('The name of the user to get profile information for.'),
      },
      ...readOnlyToolProps,
    },
    peopleService.getUserProfile,
  );

  registerTool(
    'people.getMe',
    {
      description: 'Gets the profile information of the authenticated user.',
      inputSchema: {},
      ...readOnlyToolProps,
    },
    peopleService.getMe,
  );

  registerTool(
    'people.getUserRelations',
    {
      description:
        "Gets a user's relations (e.g., manager, spouse, assistant, etc.). Common relation types include: manager, assistant, spouse, partner, relative, mother, father, parent, sibling, child, friend, domesticPartner, referredBy. Defaults to the authenticated user if no userId is provided.",
      inputSchema: {
        userId: z
          .string()
          .optional()
          .describe(
            'The ID of the user to get relations for (e.g., "110001608645105799644" or "people/110001608645105799644"). Defaults to the authenticated user if not provided.',
          ),
        relationType: z
          .string()
          .optional()
          .describe(
            'The type of relation to filter by (e.g., "manager", "spouse", "assistant"). If not provided, returns all relations.',
          ),
      },
      ...readOnlyToolProps,
    },
    peopleService.getUserRelations,
  );

  // 4. Connect the transport layer and start listening
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `Google Workspace MCP Server is running (using ${separator} for tool names). Listening for requests...`,
  );
}

main().catch((error) => {
  console.error('A critical error occurred:', error);
  process.exit(1);
});
