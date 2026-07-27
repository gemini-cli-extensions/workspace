/**
 * @fileoverview Service-binding RPC entrypoint for core-gsuite-tools.
 *
 * `GsuiteService` extends `WorkerEntrypoint<Env>` from `cloudflare:workers`.
 * Service-binding consumers call these typed methods without needing to know
 * about the underlying Durable Object routing.
 *
 * All heavy lifting delegates to the appropriate specialist agent via
 * `getAgentByName` — never direct namespace id lookups.
 *
 * ## Usage from a consumer Worker
 * ```ts
 * // wrangler.jsonc binding:
 * // { "name": "GSUITE", "service": "core-gsuite-tools" }
 *
 * const gsuite = env.GSUITE as GsuiteService;
 * const results = await gsuite.gmailSearch("is:unread", 5);
 * ```
 *
 * ## Method list
 * - gmailSearch
 * - gmailSend
 * - gmailGetMessage
 * - docsCreate
 * - docsRead
 * - docsAppend
 * - docsReplaceText
 * - sheetsCreate
 * - sheetsRead
 * - sheetsWrite
 * - sheetsAppend
 * - slidesCreate
 * - slidesRead
 * - slidesReplaceText
 * - driveSearch
 * - driveRecent
 * - driveCreateFolder
 * - driveMoveFile
 * - driveDeleteFile
 * - appscriptCreateBound
 * - appscriptGetContent
 * - appscriptRun
 * - runTask
 * - orchestratorRoute
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import { getAgentByName } from "agents";

import type { GmailAgent } from "@/backend/ai/agents/gmail";
import type { DocsAgent } from "@/backend/ai/agents/docs";
import type { SheetsAgent } from "@/backend/ai/agents/sheets";
import type { SlidesAgent } from "@/backend/ai/agents/slides";
import type { DriveAgent } from "@/backend/ai/agents/drive";
import type { AppsScriptAgent } from "@/backend/ai/agents/appscript";
import type { OrchestratorAgent } from "@/backend/ai/agents/orchestrator";
import type { SpecialistKind } from "@/backend/ai/agents/orchestrator/types";

import { resolveAccount } from "@/backend/auth/provider";
import type { GoogleAccount } from "@/backend/auth/provider";

import { getDb } from "@/backend/db";
// ponytail: SRC's `tasks` table renamed to `agentTasks` here — this worker's
// `tasks` D1 table is already a distinct project-management domain.
import { agentTasks, taskEvents } from "@db/schemas";

/**
 * Typed service-binding RPC class for the Google Workspace Hub.
 *
 * Extend this pattern for any new agent callable you want to expose over
 * service bindings. Always prefer these methods over constructing a raw
 * `fetch()` call to the Worker.
 */
export class GsuiteService extends WorkerEntrypoint<Env> {

  // ---------------------------------------------------------------------------
  // Gmail
  // ---------------------------------------------------------------------------

  /**
   * Search Gmail messages by query string.
   *
   * @param query - Gmail search query (e.g. `"is:unread from:boss"`)
   * @param maxResults - Maximum number of messages to return (default 10)
   * @param account - `"workspace"` or `"personal"` (default `"workspace"`)
   * @returns Raw Gmail message list from the API
   */
  async gmailSearch(query: string, maxResults = 10, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.GMAIL_AGENT as unknown as unknown as DurableObjectNamespace<GmailAgent>,
      "default",
    );
    return stub.searchMessages(query, maxResults, acct);
  }

  /**
   * Send a Gmail message.
   *
   * @param to - Recipient email address
   * @param subject - Message subject
   * @param body - Message body (plain text or HTML)
   * @param opts - Optional cc, bcc, html flag, account override
   * @returns Sent message metadata
   */
  async gmailSend(
    to: string,
    subject: string,
    body: string,
    opts?: { cc?: string; bcc?: string; html?: boolean; account?: string },
  ): Promise<unknown> {
    const acct = resolveAccount(this.env, opts?.account);
    const stub = await getAgentByName(
      this.env.GMAIL_AGENT as unknown as unknown as DurableObjectNamespace<GmailAgent>,
      "default",
    );
    return stub.sendMessage({ to, subject, body, cc: opts?.cc, bcc: opts?.bcc, html: opts?.html }, acct);
  }

  /**
   * Get a single Gmail message by ID.
   *
   * @param id - Message ID
   * @param account - Account selector (default `"workspace"`)
   * @returns Raw message object
   */
  async gmailGetMessage(id: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.GMAIL_AGENT as unknown as unknown as DurableObjectNamespace<GmailAgent>,
      "default",
    );
    return stub.getMessage(id, acct);
  }

  // ---------------------------------------------------------------------------
  // Docs
  // ---------------------------------------------------------------------------

  /**
   * Create a Google Doc from HTML.
   *
   * @param name - Document name
   * @param html - HTML content (default `"<p></p>"`)
   * @param parentFolderId - Optional parent Drive folder ID
   * @param account - Account selector
   * @returns Created file metadata including `id` and `webViewLink`
   */
  async docsCreate(
    name: string,
    html?: string,
    parentFolderId?: string,
    account?: string,
  ): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DOCS_AGENT as unknown as DurableObjectNamespace<DocsAgent>,
      "default",
    );
    return stub.createDocument(name, html, parentFolderId, acct);
  }

  /**
   * Read a Google Doc as Markdown text.
   *
   * @param docId - Document ID or URL
   * @param account - Account selector
   * @returns Markdown string
   */
  async docsRead(docId: string, account?: string): Promise<string> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DOCS_AGENT as unknown as DurableObjectNamespace<DocsAgent>,
      "default",
    );
    return stub.readDocument(docId, acct);
  }

  /**
   * Append text to an existing Google Doc.
   *
   * @param docId - Document ID or URL
   * @param text - Text to append
   * @param account - Account selector
   */
  async docsAppend(docId: string, text: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DOCS_AGENT as unknown as DurableObjectNamespace<DocsAgent>,
      "default",
    );
    return stub.appendText(docId, text, acct);
  }

  /**
   * Replace all occurrences of a string in a Google Doc.
   *
   * @param docId - Document ID or URL
   * @param find - Text to find
   * @param replace - Replacement text
   * @param account - Account selector
   */
  async docsReplaceText(docId: string, find: string, replace: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DOCS_AGENT as unknown as DurableObjectNamespace<DocsAgent>,
      "default",
    );
    return stub.replaceAllText(docId, find, replace, acct);
  }

  // ---------------------------------------------------------------------------
  // Sheets
  // ---------------------------------------------------------------------------

  /**
   * Create a Google Spreadsheet.
   *
   * @param title - Spreadsheet title
   * @param account - Account selector
   * @returns Spreadsheet metadata including `spreadsheetId`
   */
  async sheetsCreate(title: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SHEETS_AGENT as unknown as DurableObjectNamespace<SheetsAgent>,
      "default",
    );
    return stub.createSpreadsheet(title, acct);
  }

  /**
   * Read a range from a Google Spreadsheet.
   *
   * @param id - Spreadsheet ID or URL
   * @param range - A1 notation range (e.g. `"Sheet1!A1:D10"`)
   * @param account - Account selector
   * @returns `{ values: string[][] }`
   */
  async sheetsRead(id: string, range: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SHEETS_AGENT as unknown as DurableObjectNamespace<SheetsAgent>,
      "default",
    );
    return stub.read(id, range, acct);
  }

  /**
   * Write values to a Google Spreadsheet range.
   *
   * @param id - Spreadsheet ID
   * @param range - A1 notation range
   * @param values - 2D array of values
   * @param account - Account selector
   */
  async sheetsWrite(id: string, range: string, values: unknown[][], account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SHEETS_AGENT as unknown as DurableObjectNamespace<SheetsAgent>,
      "default",
    );
    return stub.write(id, range, values, acct);
  }

  /**
   * Append rows to a Google Spreadsheet range.
   *
   * @param id - Spreadsheet ID
   * @param range - A1 notation range
   * @param values - 2D array of values
   * @param account - Account selector
   */
  async sheetsAppend(id: string, range: string, values: unknown[][], account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SHEETS_AGENT as unknown as DurableObjectNamespace<SheetsAgent>,
      "default",
    );
    return stub.append(id, range, values, acct);
  }

  // ---------------------------------------------------------------------------
  // Slides
  // ---------------------------------------------------------------------------

  /**
   * Create a Google Slides presentation.
   *
   * @param title - Presentation title
   * @param account - Account selector
   * @returns `{ presentationId, title }`
   */
  async slidesCreate(title: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SLIDES_AGENT as unknown as DurableObjectNamespace<SlidesAgent>,
      "default",
    );
    return stub.createPresentation(title, acct);
  }

  /**
   * Read a Google Slides presentation.
   *
   * @param id - Presentation ID or URL
   * @param account - Account selector
   */
  async slidesRead(id: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SLIDES_AGENT as unknown as DurableObjectNamespace<SlidesAgent>,
      "default",
    );
    return stub.read(id, acct);
  }

  /**
   * Replace all text in a Google Slides presentation.
   *
   * @param id - Presentation ID
   * @param find - Text to find
   * @param replace - Replacement text
   * @param account - Account selector
   */
  async slidesReplaceText(id: string, find: string, replace: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.SLIDES_AGENT as unknown as DurableObjectNamespace<SlidesAgent>,
      "default",
    );
    return stub.replaceAllText(id, find, replace, acct);
  }

  // ---------------------------------------------------------------------------
  // Drive
  // ---------------------------------------------------------------------------

  /**
   * Search Drive files by query.
   *
   * @param q - Drive query (e.g. `"mimeType='application/vnd.google-apps.document'"`)
   * @param account - Account selector
   */
  async driveSearch(q: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DRIVE_AGENT as unknown as DurableObjectNamespace<DriveAgent>,
      "default",
    );
    return stub.search(q, acct);
  }

  /**
   * List recently modified Drive files.
   *
   * @param n - Number of files to return (default 20)
   * @param account - Account selector
   */
  async driveRecent(n = 20, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DRIVE_AGENT as unknown as DurableObjectNamespace<DriveAgent>,
      "default",
    );
    return stub.recent(n, acct);
  }

  /**
   * Create a Drive folder.
   *
   * @param name - Folder name
   * @param parentId - Optional parent folder ID
   * @param account - Account selector
   * @returns Folder metadata including `id` and `webViewLink`
   */
  async driveCreateFolder(name: string, parentId?: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DRIVE_AGENT as unknown as DurableObjectNamespace<DriveAgent>,
      "default",
    );
    return stub.createFolder(name, parentId, acct);
  }

  /**
   * Move a Drive file to a folder.
   *
   * @param fileId - File ID
   * @param folderId - Target folder ID
   * @param account - Account selector
   */
  async driveMoveFile(fileId: string, folderId: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DRIVE_AGENT as unknown as DurableObjectNamespace<DriveAgent>,
      "default",
    );
    return stub.moveFile(fileId, folderId, acct);
  }

  /**
   * Delete a Drive file.
   *
   * @param fileId - File ID
   * @param account - Account selector
   */
  async driveDeleteFile(fileId: string, account?: string): Promise<void> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.DRIVE_AGENT as unknown as DurableObjectNamespace<DriveAgent>,
      "default",
    );
    await stub.deleteFile(fileId, acct);
  }

  // ---------------------------------------------------------------------------
  // Apps Script
  // ---------------------------------------------------------------------------

  /**
   * Create a container-bound Apps Script project.
   *
   * @param parentId - ID of the bound container (Doc, Sheet, Slide)
   * @param title - Script project title
   * @param account - Account selector
   * @returns Script project metadata including `scriptId`
   */
  async appscriptCreateBound(parentId: string, title: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.APPSSCRIPT_AGENT as unknown as DurableObjectNamespace<AppsScriptAgent>,
      "default",
    );
    return stub.createBoundScript(parentId, title, acct);
  }

  /**
   * Get the source files of an Apps Script project.
   *
   * @param scriptId - Script project ID
   * @param account - Account selector
   * @returns Content object with `files[]`
   */
  async appscriptGetContent(scriptId: string, account?: string): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.APPSSCRIPT_AGENT as unknown as DurableObjectNamespace<AppsScriptAgent>,
      "default",
    );
    return stub.getContent(scriptId, acct);
  }

  /**
   * Run a function in an Apps Script project.
   *
   * @param scriptId - Script project ID
   * @param functionName - Name of the Apps Script function to run
   * @param params - Positional arguments to pass to the function
   * @param account - Account selector
   * @returns Script execution response
   */
  async appscriptRun(
    scriptId: string,
    functionName: string,
    params?: unknown[],
    account?: string,
  ): Promise<unknown> {
    const acct = resolveAccount(this.env, account);
    const stub = await getAgentByName(
      this.env.APPSSCRIPT_AGENT as unknown as DurableObjectNamespace<AppsScriptAgent>,
      "default",
    );
    return stub.run(scriptId, functionName, params, acct);
  }

  // ---------------------------------------------------------------------------
  // Orchestrator
  // ---------------------------------------------------------------------------

  /**
   * Route a method call through the orchestrator to the appropriate specialist.
   *
   * @param kind - Specialist kind (`"gmail" | "docs" | "sheets" | "slides" | "drive" | "appscript"`)
   * @param method - Specialist method name
   * @param args - Positional arguments
   * @returns Method return value
   */
  async orchestratorRoute(kind: SpecialistKind, method: string, args: unknown[] = []): Promise<unknown> {
    const stub = await getAgentByName(
      this.env.ORCHESTRATOR_AGENT as unknown as DurableObjectNamespace<OrchestratorAgent>,
      "default",
    );
    return stub.route(kind, method, args);
  }

  // ---------------------------------------------------------------------------
  // Task management
  // ---------------------------------------------------------------------------

  /**
   * Create a task row and return its ID for external observability.
   *
   * @param kind - Task kind
   * @param title - Human-readable task title
   * @param agent - Agent class name handling the task
   * @param account - Account selector (default `"workspace"`)
   * @param source - Task source (default `"rpc"`)
   * @returns Created task ID
   */
  async runTask(params: {
    kind: "docs" | "sheets" | "slides" | "drive" | "gmail" | "appscript" | "chat";
    title: string;
    agent: string;
    account?: string;
    source?: "ui" | "mcp" | "api" | "rpc";
    sessionId?: string;
    threadId?: string;
  }): Promise<string> {
    const db = getDb(this.env);
    const id = crypto.randomUUID();
    const now = new Date();
    const acct: GoogleAccount = resolveAccount(this.env, params.account);

    await db.insert(agentTasks).values({
      id,
      kind: params.kind,
      title: params.title,
      status: "pending",
      account: acct,
      agent: params.agent,
      source: params.source ?? "rpc",
      sessionId: params.sessionId ?? null,
      threadId: params.threadId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(taskEvents).values({
      id: crypto.randomUUID(),
      taskId: id,
      ts: now,
      type: "created",
      message: `Task created via RPC: ${params.title}`,
      dataJson: null,
    });

    return id;
  }
}
