/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feature Configuration Registry
 *
 * Defines read/write feature groups for each Google Workspace service.
 * Each group specifies:
 * - The OAuth scopes it requires
 * - The tools it contains
 * - Whether it's enabled by default
 *
 * Services whose write scopes aren't in the published GCP project
 * (slides.write, sheets.write, tasks) default to OFF.
 */

const SCOPE_PREFIX = 'https://www.googleapis.com/auth/';

function scopes(...names: string[]): string[] {
  return names.map((name) => `${SCOPE_PREFIX}${name}`);
}

export type ServiceName =
  | 'docs'
  | 'drive'
  | 'calendar'
  | 'chat'
  | 'gmail'
  | 'people'
  | 'slides'
  | 'sheets'
  | 'time'
  | 'tasks';

export interface FeatureGroup {
  /** Service name (e.g., 'docs', 'gmail') */
  readonly service: ServiceName;
  /** Group type: read (no side effects) or write (mutations) */
  readonly group: 'read' | 'write';
  /** OAuth scopes required by this feature group */
  readonly scopes: readonly string[];
  /** Tool names belonging to this feature group */
  readonly tools: readonly string[];
  /** Whether this feature group is enabled by default */
  readonly defaultEnabled: boolean;
}

/**
 * Canonical feature group key, e.g. "docs.read", "gmail.write"
 */
export function featureGroupKey(fg: FeatureGroup): string {
  return `${fg.service}.${fg.group}`;
}

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  // Docs
  {
    service: 'docs',
    group: 'read',
    scopes: scopes('documents'),
    tools: ['docs.getSuggestions', 'docs.getText'],
    defaultEnabled: true,
  },
  {
    service: 'docs',
    group: 'write',
    scopes: scopes('documents'),
    tools: [
      'docs.create',
      'docs.writeText',
      'docs.replaceText',
      'docs.formatText',
    ],
    defaultEnabled: true,
  },

  // Drive
  {
    service: 'drive',
    group: 'read',
    scopes: scopes('drive.readonly'),
    tools: [
      'drive.getComments',
      'drive.findFolder',
      'drive.search',
      'drive.downloadFile',
    ],
    defaultEnabled: true,
  },
  {
    service: 'drive',
    group: 'write',
    scopes: scopes('drive'),
    tools: [
      'drive.createFolder',
      'drive.moveFile',
      'drive.trashFile',
      'drive.renameFile',
    ],
    defaultEnabled: true,
  },

  // Calendar
  {
    service: 'calendar',
    group: 'read',
    scopes: scopes('calendar.readonly'),
    tools: [
      'calendar.list',
      'calendar.listEvents',
      'calendar.getEvent',
      'calendar.findFreeTime',
    ],
    defaultEnabled: true,
  },
  {
    service: 'calendar',
    group: 'write',
    scopes: scopes('calendar'),
    tools: [
      'calendar.createEvent',
      'calendar.updateEvent',
      'calendar.respondToEvent',
      'calendar.deleteEvent',
    ],
    defaultEnabled: true,
  },

  // Chat
  {
    service: 'chat',
    group: 'read',
    scopes: scopes(
      'chat.spaces.readonly',
      'chat.messages.readonly',
      'chat.memberships.readonly',
    ),
    tools: [
      'chat.listSpaces',
      'chat.findSpaceByName',
      'chat.getMessages',
      'chat.findDmByEmail',
      'chat.listThreads',
    ],
    defaultEnabled: true,
  },
  {
    service: 'chat',
    group: 'write',
    scopes: scopes('chat.spaces', 'chat.messages', 'chat.memberships'),
    tools: ['chat.sendMessage', 'chat.sendDm', 'chat.setUpSpace'],
    defaultEnabled: true,
  },

  // Gmail
  {
    service: 'gmail',
    group: 'read',
    scopes: scopes('gmail.readonly'),
    tools: [
      'gmail.search',
      'gmail.get',
      'gmail.downloadAttachment',
      'gmail.listLabels',
    ],
    defaultEnabled: true,
  },
  {
    service: 'gmail',
    group: 'write',
    scopes: scopes('gmail.modify'),
    tools: [
      'gmail.modify',
      'gmail.batchModify',
      'gmail.modifyThread',
      'gmail.send',
      'gmail.createDraft',
      'gmail.sendDraft',
      'gmail.createLabel',
    ],
    defaultEnabled: true,
  },

  // People
  {
    service: 'people',
    group: 'read',
    scopes: scopes('userinfo.profile', 'directory.readonly'),
    tools: ['people.getUserProfile', 'people.getMe', 'people.getUserRelations'],
    defaultEnabled: true,
  },

  // Slides
  {
    service: 'slides',
    group: 'read',
    scopes: scopes('presentations.readonly'),
    tools: [
      'slides.getText',
      'slides.getMetadata',
      'slides.getImages',
      'slides.getSlideThumbnail',
    ],
    defaultEnabled: true,
  },
  {
    service: 'slides',
    group: 'write',
    scopes: scopes('presentations'),
    tools: [],
    defaultEnabled: false,
  },

  // Sheets
  {
    service: 'sheets',
    group: 'read',
    scopes: scopes('spreadsheets.readonly'),
    tools: ['sheets.getText', 'sheets.getRange', 'sheets.getMetadata'],
    defaultEnabled: true,
  },
  {
    service: 'sheets',
    group: 'write',
    scopes: scopes('spreadsheets'),
    tools: [],
    defaultEnabled: false,
  },

  // Time (no scopes needed)
  {
    service: 'time',
    group: 'read',
    scopes: [],
    tools: ['time.getCurrentDate', 'time.getCurrentTime', 'time.getTimeZone'],
    defaultEnabled: true,
  },

  // Tasks (experimental — not in published GCP project)
  {
    service: 'tasks',
    group: 'read',
    scopes: scopes('tasks.readonly'),
    tools: [],
    defaultEnabled: false,
  },
  {
    service: 'tasks',
    group: 'write',
    scopes: scopes('tasks'),
    tools: [],
    defaultEnabled: false,
  },
] as const satisfies readonly FeatureGroup[];
