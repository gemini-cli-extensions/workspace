/**
 * @fileoverview ACTION_CATALOG — the canonical registry of schedulable agent
 * actions surfaced by the Tasks scheduling wizard.
 *
 * Each entry maps a specialist agent surface to the subset of its `@callable`
 * methods that are safe and meaningful to schedule as a saved task. The catalog
 * drives:
 *  - `GET /api/catalog` (the wizard's Action + Parameters steps), and
 *  - `executeAction` dispatch on each specialist agent (catalog action → method).
 *
 * Action names here MUST match real `@callable` method names on the agent class.
 * Parameter `name`s MUST match the positional argument order consumed by each
 * agent's `executeAction` switch in `base-gsuite-agent.ts`.
 */

/**
 * A single configurable parameter for a catalog action. Drives the wizard's
 * generated parameter form and validates the saved `paramsJson`.
 */
export type ParamDef = {
  /** Stable key used in `paramsJson` and passed to `executeAction`. */
  name: string;
  /** Human-readable form label. */
  label: string;
  /** Input affordance the wizard renders. */
  type: "string" | "number" | "boolean" | "text" | "enum";
  /** Whether the wizard requires a value before allowing task creation. */
  required: boolean;
  /** Allowed values when `type === "enum"`. */
  enumValues?: string[];
  /** Placeholder / hint text for string/number/text inputs. */
  placeholder?: string;
  /** Default value pre-filled in the form. */
  default?: unknown;
};

/**
 * A schedulable action exposed by an agent surface.
 */
export type ActionDef = {
  /** Catalog action id — matches a `@callable` method name on the agent. */
  name: string;
  /** Human-readable label for the wizard. */
  label: string;
  /** Short description of what the action does. */
  description: string;
  /** Whether the action only reads (no side effects); used for UI hinting. */
  readOnly: boolean;
  /** Ordered parameter definitions (order matters for positional dispatch). */
  params: ParamDef[];
};

/**
 * The catalog grouping for one agent surface.
 */
export type AgentCatalogEntry = {
  /** Agent surface id (gmail | docs | sheets | slides | drive | appscript | calendar). */
  id: string;
  /** Human-readable surface label. */
  label: string;
  /** Schedulable actions for this surface. */
  actions: ActionDef[];
};

/**
 * The full action catalog, keyed by agent surface id.
 *
 * NOTE: parameter order within each action mirrors the positional argument order
 * each agent's `executeAction` switch passes through to the underlying method.
 */
export const ACTION_CATALOG: Record<string, AgentCatalogEntry> = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    actions: [
      {
        name: "searchMessages",
        label: "Search messages",
        description: "Search Gmail for messages matching a query.",
        readOnly: true,
        params: [
          { name: "query", label: "Search query", type: "string", required: true, placeholder: "is:unread newer_than:1d" },
          { name: "maxResults", label: "Max results", type: "number", required: false, default: 10 },
        ],
      },
      {
        name: "listLabels",
        label: "List labels",
        description: "List all Gmail labels.",
        readOnly: true,
        params: [],
      },
      {
        name: "sendMessage",
        label: "Send message",
        description: "Send an email.",
        readOnly: false,
        params: [
          { name: "to", label: "To", type: "string", required: true, placeholder: "someone@example.com" },
          { name: "subject", label: "Subject", type: "string", required: true },
          { name: "body", label: "Body", type: "text", required: true },
          { name: "html", label: "Send as HTML", type: "boolean", required: false, default: false },
        ],
      },
      {
        name: "modifyMessageLabels",
        label: "Modify message labels",
        description: "Add and/or remove labels on a message.",
        readOnly: false,
        params: [
          { name: "id", label: "Message ID", type: "string", required: true },
          { name: "add", label: "Label to add", type: "string", required: false, placeholder: "Label_1" },
          { name: "remove", label: "Label to remove", type: "string", required: false },
        ],
      },
      {
        name: "trashMessage",
        label: "Trash message",
        description: "Move a message to the trash.",
        readOnly: false,
        params: [{ name: "id", label: "Message ID", type: "string", required: true }],
      },
    ],
  },

  docs: {
    id: "docs",
    label: "Google Docs",
    actions: [
      {
        name: "createDocument",
        label: "Create document",
        description: "Create a new Google Doc.",
        readOnly: false,
        params: [
          { name: "name", label: "Document name", type: "string", required: true },
          { name: "content", label: "Initial content", type: "text", required: false, placeholder: "Optional HTML/text content" },
        ],
      },
      {
        name: "readDocument",
        label: "Read document",
        description: "Read a document as Markdown.",
        readOnly: true,
        params: [{ name: "docId", label: "Document ID or URL", type: "string", required: true }],
      },
      {
        name: "appendText",
        label: "Append text",
        description: "Append text to the end of a document.",
        readOnly: false,
        params: [
          { name: "docId", label: "Document ID or URL", type: "string", required: true },
          { name: "text", label: "Text to append", type: "text", required: true },
        ],
      },
      {
        name: "replaceAllText",
        label: "Replace all text",
        description: "Replace all occurrences of a string in a document.",
        readOnly: false,
        params: [
          { name: "docId", label: "Document ID or URL", type: "string", required: true },
          { name: "find", label: "Find", type: "string", required: true },
          { name: "replace", label: "Replace with", type: "string", required: true },
        ],
      },
      {
        name: "listComments",
        label: "List comments",
        description: "List comments on a document.",
        readOnly: true,
        params: [
          { name: "docId", label: "Document ID or URL", type: "string", required: true },
          { name: "filter", label: "Filter", type: "string", required: false },
        ],
      },
    ],
  },

  sheets: {
    id: "sheets",
    label: "Google Sheets",
    actions: [
      {
        name: "createSpreadsheet",
        label: "Create spreadsheet",
        description: "Create a new spreadsheet.",
        readOnly: false,
        params: [{ name: "title", label: "Title", type: "string", required: true }],
      },
      {
        name: "read",
        label: "Read range",
        description: "Read values from a range.",
        readOnly: true,
        params: [
          { name: "id", label: "Spreadsheet ID or URL", type: "string", required: true },
          { name: "range", label: "Range (A1)", type: "string", required: true, placeholder: "Sheet1!A1:D10" },
        ],
      },
      {
        name: "write",
        label: "Write range",
        description: "Write values to a range (JSON 2D array).",
        readOnly: false,
        params: [
          { name: "id", label: "Spreadsheet ID or URL", type: "string", required: true },
          { name: "range", label: "Range (A1)", type: "string", required: true },
          { name: "values", label: "Values (JSON 2D array)", type: "text", required: true, placeholder: '[["a","b"],["c","d"]]' },
        ],
      },
      {
        name: "append",
        label: "Append rows",
        description: "Append rows to a range (JSON 2D array).",
        readOnly: false,
        params: [
          { name: "id", label: "Spreadsheet ID or URL", type: "string", required: true },
          { name: "range", label: "Range (A1)", type: "string", required: true },
          { name: "values", label: "Values (JSON 2D array)", type: "text", required: true, placeholder: '[["a","b"]]' },
        ],
      },
      {
        name: "list",
        label: "List spreadsheets",
        description: "List spreadsheets in Drive.",
        readOnly: true,
        params: [],
      },
    ],
  },

  slides: {
    id: "slides",
    label: "Google Slides",
    actions: [
      {
        name: "createPresentation",
        label: "Create presentation",
        description: "Create a new presentation.",
        readOnly: false,
        params: [{ name: "title", label: "Title", type: "string", required: true }],
      },
      {
        name: "read",
        label: "Read presentation",
        description: "Read a presentation.",
        readOnly: true,
        params: [{ name: "id", label: "Presentation ID or URL", type: "string", required: true }],
      },
      {
        name: "createSlide",
        label: "Add slide",
        description: "Add a slide to a presentation.",
        readOnly: false,
        params: [
          { name: "id", label: "Presentation ID or URL", type: "string", required: true },
          {
            name: "layout",
            label: "Layout",
            type: "enum",
            required: false,
            enumValues: ["BLANK", "TITLE", "TITLE_AND_BODY", "SECTION_HEADER"],
            default: "BLANK",
          },
        ],
      },
      {
        name: "replaceAllText",
        label: "Replace all text",
        description: "Replace all occurrences of a string across the deck.",
        readOnly: false,
        params: [
          { name: "id", label: "Presentation ID or URL", type: "string", required: true },
          { name: "find", label: "Find", type: "string", required: true },
          { name: "replace", label: "Replace with", type: "string", required: true },
        ],
      },
    ],
  },

  drive: {
    id: "drive",
    label: "Google Drive",
    actions: [
      {
        name: "listFiles",
        label: "List files",
        description: "List files, optionally filtered by a Drive query.",
        readOnly: true,
        params: [{ name: "query", label: "Drive query", type: "string", required: false, placeholder: "mimeType='application/pdf'" }],
      },
      {
        name: "search",
        label: "Search files",
        description: "Full-text search across Drive files.",
        readOnly: true,
        params: [{ name: "q", label: "Search text", type: "string", required: true }],
      },
      {
        name: "recent",
        label: "Recent files",
        description: "List the most recently modified files.",
        readOnly: true,
        params: [{ name: "n", label: "Count", type: "number", required: false, default: 20 }],
      },
      {
        name: "createFolder",
        label: "Create folder",
        description: "Create a new folder.",
        readOnly: false,
        params: [
          { name: "name", label: "Folder name", type: "string", required: true },
          { name: "parentId", label: "Parent folder ID", type: "string", required: false },
        ],
      },
      {
        name: "deleteFile",
        label: "Delete file",
        description: "Delete a file by id.",
        readOnly: false,
        params: [{ name: "id", label: "File ID or URL", type: "string", required: true }],
      },
    ],
  },

  appscript: {
    id: "appscript",
    label: "Apps Script",
    actions: [
      {
        name: "listProjects",
        label: "List projects",
        description: "List Apps Script projects.",
        readOnly: true,
        params: [],
      },
      {
        name: "getContent",
        label: "Get content",
        description: "Read a script project's source files.",
        readOnly: true,
        params: [{ name: "scriptId", label: "Script ID", type: "string", required: true }],
      },
      {
        name: "createStandalone",
        label: "Create standalone script",
        description: "Create a new standalone Apps Script project.",
        readOnly: false,
        params: [{ name: "title", label: "Title", type: "string", required: true }],
      },
      {
        name: "run",
        label: "Run function",
        description: "Run a function in a script project.",
        readOnly: false,
        params: [
          { name: "scriptId", label: "Script ID", type: "string", required: true },
          { name: "functionName", label: "Function name", type: "string", required: true },
          { name: "params", label: "Params (JSON array)", type: "text", required: false, placeholder: "[]" },
        ],
      },
    ],
  },

  calendar: {
    id: "calendar",
    label: "Google Calendar",
    actions: [
      {
        name: "listCalendars",
        label: "List calendars",
        description: "List accessible calendars.",
        readOnly: true,
        params: [],
      },
      {
        name: "listEvents",
        label: "List events",
        description: "List events from a calendar.",
        readOnly: true,
        params: [{ name: "calendarId", label: "Calendar ID", type: "string", required: false, placeholder: "primary" }],
      },
      {
        name: "createEvent",
        label: "Create event",
        description: "Create a calendar event.",
        readOnly: false,
        params: [
          { name: "calendarId", label: "Calendar ID", type: "string", required: false, placeholder: "primary" },
          { name: "summary", label: "Summary", type: "string", required: true },
          { name: "start", label: "Start (ISO datetime)", type: "string", required: true, placeholder: "2026-06-08T09:00:00-07:00" },
          { name: "end", label: "End (ISO datetime)", type: "string", required: true, placeholder: "2026-06-08T10:00:00-07:00" },
        ],
      },
      {
        name: "quickAdd",
        label: "Quick add",
        description: "Create an event from natural-language text.",
        readOnly: false,
        params: [
          { name: "calendarId", label: "Calendar ID", type: "string", required: false, placeholder: "primary" },
          { name: "text", label: "Text", type: "string", required: true, placeholder: "Lunch with Sam tomorrow at noon" },
        ],
      },
    ],
  },
};

/**
 * Look up a single action definition for an agent surface.
 *
 * @param agent  Agent surface id (e.g. "gmail").
 * @param action Catalog action name (e.g. "listLabels").
 * @returns The {@link ActionDef}, or `undefined` when not found.
 */
export function getActionDef(agent: string, action: string): ActionDef | undefined {
  return ACTION_CATALOG[agent]?.actions.find((a) => a.name === action);
}
