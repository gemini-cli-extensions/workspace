/**
 * @fileoverview DocsAgent — the Google Docs specialist Durable Object.
 *
 * Exposes Docs/Drive operations as `@callable()` RPC methods and as AI tools for
 * chat. Created documents are persisted to the `googleDocuments` D1 table.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { DocsHealth } from "@/backend/ai/agents/docs/types";

import { GoogleDocsClient, GoogleDriveClient } from "@/backend/google";
import { accountEmail } from "@/backend/auth/provider";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { googleDocuments } from "@db/schemas";
import { checkDocsHealth } from "@/backend/ai/agents/docs/health";
import { buildDocsTools } from "@/backend/ai/agents/docs/methods/tools";
import docsSkill from "@/backend/ai/agents/skills/docs/SKILL.md?raw";

/**
 * Durable Object agent for Google Docs.
 */
export class DocsAgent extends BaseGsuiteAgent {
  private docsClients = new Map<GoogleAccount, GoogleDocsClient>();
  private driveClients = new Map<GoogleAccount, GoogleDriveClient>();

  static docsMetadata() {
    return {
      name: "Docs",
      className: "DocsAgent",
      description:
        "Google Docs specialist: create, read (as Markdown), append, replace, batch-edit, and manage comments on documents.",
      docsPath: "/docs/agents/docs",
      methods: [
        { name: "createDocument", description: "Create a doc from HTML", params: "name, html?, parentFolderId?, account?", returns: "DriveFile" },
        { name: "readDocument", description: "Read a doc as Markdown", params: "docId, account?", returns: "string" },
        { name: "appendText", description: "Append text to a doc", params: "docId, text, account?", returns: "unknown" },
        { name: "replaceAllText", description: "Replace all text", params: "docId, find, replace, account?", returns: "unknown" },
        { name: "listComments", description: "List comments", params: "docId, filter?, account?", returns: "Comment[]" },
      ],
      tools: ["Google Docs API", "Google Drive API"],
    };
  }

  async onStart(): Promise<void> {
    this.docsClient(this.defaultAccount);
    this.driveClient(this.defaultAccount);
  }

  /** Resolve/cache a Docs client for an account. */
  private docsClient(account: GoogleAccount): GoogleDocsClient {
    let client = this.docsClients.get(account);
    if (!client) {
      client = new GoogleDocsClient(this.env, account);
      this.docsClients.set(account, client);
    }
    return client;
  }

  /** Resolve/cache a Drive client for an account. */
  private driveClient(account: GoogleAccount): GoogleDriveClient {
    let client = this.driveClients.get(account);
    if (!client) {
      client = new GoogleDriveClient(this.env, account);
      this.driveClients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "docs";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildDocsTools(this.docsClient(account), this.driveClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Docs method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "createDocument":
        return this.createDocument(String(params.name ?? ""), params.content != null ? String(params.content) : undefined, undefined, account);
      case "readDocument":
        return this.readDocument(String(params.docId ?? ""), account);
      case "appendText":
        return this.appendText(String(params.docId ?? ""), String(params.text ?? ""), account);
      case "replaceAllText":
        return this.replaceAllText(String(params.docId ?? ""), String(params.find ?? ""), String(params.replace ?? ""), account);
      case "listComments":
        return this.listComments(String(params.docId ?? ""), params.filter != null ? String(params.filter) : undefined, account);
      default:
        throw new Error(`Unknown docs action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "format-from-markdown",
        description: "Create or update a Doc from Markdown, preserving structure.",
        content: docsSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** Create a Google Doc from HTML, persist it, and record the task. */
  @callable()
  async createDocument(
    name: string,
    html = "<p></p>",
    parentFolderId?: string,
    account: string = "workspace",
  ) {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({
      kind: "docs",
      title: `Create doc: ${name}`,
      status: "running",
      account: acct,
    });
    try {
      const file = await this.driveClient(acct).createDocFromHtml(name, html, parentFolderId);
      await this.persistDocument(acct, file, parentFolderId);
      await this.recordTask({
        id: taskId,
        kind: "docs",
        title: `Create doc: ${name}`,
        status: "done",
        account: acct,
        googleFileId: file.id,
        googleFileUrl: file.webViewLink,
      });
      await this.logTaskEvent(taskId, "artifact", `Created doc ${name}`, { id: file.id, url: file.webViewLink });
      return file;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "docs", title: `Create doc: ${name}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Read a doc as Markdown. */
  @callable()
  async readDocument(docId: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).read(docId);
  }

  /** Append text to a doc. */
  @callable()
  async appendText(docId: string, text: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).append(docId, text);
  }

  /** Insert text at an index. */
  @callable()
  async insertText(docId: string, index: number, text: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).insertText(docId, index, text);
  }

  /** Replace all occurrences of text. */
  @callable()
  async replaceAllText(docId: string, find: string, replace: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).replaceAllText(docId, find, replace);
  }

  /** List comments on a doc. */
  @callable()
  async listComments(docId: string, filter?: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).listComments(docId, filter);
  }

  /** Add a comment to a doc. */
  @callable()
  async addComment(docId: string, anchor: string, content: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).addComment(docId, anchor, content);
  }

  /** Reply to a comment. */
  @callable()
  async replyToComment(docId: string, commentId: string, text: string, account: string = "workspace") {
    return this.docsClient(this.resolve(account)).replyToComment(docId, commentId, text);
  }

  /** Probe Docs/Drive connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<DocsHealth> {
    const acct = this.resolve(account);
    return checkDocsHealth(this.driveClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Upsert a created document into the `googleDocuments` table. */
  private async persistDocument(
    account: GoogleAccount,
    file: { id: string; name: string; webViewLink?: string },
    folderId?: string,
  ): Promise<void> {
    const db = getDb(this.env);
    const now = new Date();
    await db
      .insert(googleDocuments)
      .values({
        id: file.id,
        account,
        name: file.name,
        url: file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`,
        folderId,
        createdBy: accountEmail(this.env, account),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: googleDocuments.id,
        set: { name: file.name, updatedAt: now },
      });
  }
}
