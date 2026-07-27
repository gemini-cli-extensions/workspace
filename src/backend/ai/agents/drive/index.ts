/**
 * @fileoverview DriveAgent — the Google Drive specialist Durable Object.
 *
 * Exposes Drive operations as `@callable()` RPC methods and AI tools. Created
 * folders are persisted to the `driveFolders` D1 table.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { DriveHealth } from "@/backend/ai/agents/drive/types";

import { GoogleDriveClient } from "@/backend/google";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { driveFolders } from "@db/schemas";
import { checkDriveHealth } from "@/backend/ai/agents/drive/health";
import { buildDriveTools } from "@/backend/ai/agents/drive/methods/tools";
import driveSkill from "@/backend/ai/agents/skills/drive/SKILL.md?raw";

/**
 * Durable Object agent for Google Drive.
 */
export class DriveAgent extends BaseGsuiteAgent {
  private clients = new Map<GoogleAccount, GoogleDriveClient>();

  static docsMetadata() {
    return {
      name: "Drive",
      className: "DriveAgent",
      description:
        "Google Drive specialist: search/list files, create/move/rename/copy/delete, manage folders, and inspect permissions.",
      docsPath: "/docs/agents/drive",
      methods: [
        { name: "search", description: "Search files", params: "q, account?", returns: "DriveFile[]" },
        { name: "recent", description: "List recent files", params: "n?, account?", returns: "DriveFile[]" },
        { name: "createFolder", description: "Create a folder", params: "name, parentId?, account?", returns: "DriveFile" },
        { name: "moveFile", description: "Move a file", params: "fileId, folderId, account?", returns: "DriveFile" },
        { name: "renameFile", description: "Rename a file", params: "fileId, newName, account?", returns: "DriveFile" },
      ],
      tools: ["Google Drive API"],
    };
  }

  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /** Resolve/cache a Drive client for an account. */
  private getClient(account: GoogleAccount): GoogleDriveClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new GoogleDriveClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "drive";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildDriveTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Drive method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "listFiles":
        return this.listFiles(params.query != null ? String(params.query) : undefined, account);
      case "search":
        return this.search(String(params.q ?? ""), account);
      case "recent":
        return this.recent(params.n != null ? Number(params.n) : 20, account);
      case "createFolder":
        return this.createFolder(String(params.name ?? ""), params.parentId != null ? String(params.parentId) : undefined, account);
      case "deleteFile":
        return this.deleteFile(String(params.id ?? ""), account);
      default:
        throw new Error(`Unknown drive action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "organize-folders",
        description: "Organize Drive files into a sensible folder structure.",
        content: driveSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** List files (optionally filtered by a Drive query). */
  @callable()
  async listFiles(query?: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).listFiles(query);
  }

  /** Search files. */
  @callable()
  async search(q: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).search(q);
  }

  /** List recent files. */
  @callable()
  async recent(n = 20, account: string = "workspace") {
    return this.getClient(this.resolve(account)).recent(n);
  }

  /** Create a folder, persist it, and record the task. */
  @callable()
  async createFolder(name: string, parentId?: string, account: string = "workspace") {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({ kind: "drive", title: `Create folder: ${name}`, status: "running", account: acct });
    try {
      const folder = await this.getClient(acct).createFolder(name, parentId);
      const url = folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`;
      await this.persistFolder(acct, folder.id, folder.name, url, parentId);
      await this.recordTask({
        id: taskId,
        kind: "drive",
        title: `Create folder: ${name}`,
        status: "done",
        account: acct,
        googleFileId: folder.id,
        googleFileUrl: url,
      });
      await this.logTaskEvent(taskId, "artifact", `Created folder ${name}`, { id: folder.id, url });
      return folder;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "drive", title: `Create folder: ${name}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Move a file into a folder. */
  @callable()
  async moveFile(fileId: string, folderId: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).moveFile(fileId, folderId);
  }

  /** Copy a file. */
  @callable()
  async copyFile(fileId: string, name?: string, parentId?: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).copyFile(fileId, name, parentId);
  }

  /** Rename a file. */
  @callable()
  async renameFile(fileId: string, newName: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).renameFile(fileId, newName);
  }

  /** Delete a file. */
  @callable()
  async deleteFile(fileId: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).deleteFile(fileId);
  }

  /** Probe Drive connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<DriveHealth> {
    const acct = this.resolve(account);
    return checkDriveHealth(this.getClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Upsert a created folder into the `driveFolders` table. */
  private async persistFolder(
    account: GoogleAccount,
    id: string,
    name: string,
    url: string,
    parentId?: string,
  ): Promise<void> {
    const db = getDb(this.env);
    await db
      .insert(driveFolders)
      .values({ id, account, name, url, parentId, createdAt: new Date() })
      .onConflictDoUpdate({ target: driveFolders.id, set: { name } });
  }
}
