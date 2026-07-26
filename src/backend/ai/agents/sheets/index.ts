/**
 * @fileoverview SheetsAgent — the Google Sheets specialist Durable Object.
 *
 * Exposes Sheets operations as `@callable()` RPC methods and AI tools. Created
 * spreadsheets are persisted to the `googleSheets` D1 table.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { SheetsHealth } from "@/backend/ai/agents/sheets/types";

import { GoogleSheetsClient } from "@/backend/google";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { googleSheets } from "@db/schemas";
import { checkSheetsHealth } from "@/backend/ai/agents/sheets/health";
import { buildSheetsTools } from "@/backend/ai/agents/sheets/methods/tools";
import sheetsSkill from "@/backend/ai/agents/skills/sheets/SKILL.md?raw";

/**
 * Coerce a catalog `values` parameter (a JSON string or already-parsed value)
 * into a 2D array suitable for the Sheets `write`/`append` methods.
 */
function parseValues(input: unknown): unknown[][] {
  if (Array.isArray(input)) return input as unknown[][];
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed as unknown[][];
    } catch {
      /* fall through */
    }
  }
  return [];
}

/**
 * Durable Object agent for Google Sheets.
 */
export class SheetsAgent extends BaseGsuiteAgent {
  private clients = new Map<GoogleAccount, GoogleSheetsClient>();

  static docsMetadata() {
    return {
      name: "Sheets",
      className: "SheetsAgent",
      description:
        "Google Sheets specialist: create spreadsheets, read/write/append ranges, add sheets, apply filters and formatting.",
      docsPath: "/docs/agents/sheets",
      methods: [
        { name: "createSpreadsheet", description: "Create a spreadsheet", params: "title, account?", returns: "SpreadsheetInfo" },
        { name: "read", description: "Read a range", params: "id, range, account?", returns: "ValueRange" },
        { name: "write", description: "Write a range", params: "id, range, values, account?", returns: "unknown" },
        { name: "append", description: "Append rows", params: "id, range, values, account?", returns: "unknown" },
        { name: "list", description: "List spreadsheets", params: "account?", returns: "SheetListItem[]" },
      ],
      tools: ["Google Sheets API"],
    };
  }

  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /** Resolve/cache a Sheets client for an account. */
  private getClient(account: GoogleAccount): GoogleSheetsClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new GoogleSheetsClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "sheets";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildSheetsTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Sheets method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "createSpreadsheet":
        return this.createSpreadsheet(String(params.title ?? ""), account);
      case "read":
        return this.read(String(params.id ?? ""), String(params.range ?? ""), account);
      case "write":
        return this.write(String(params.id ?? ""), String(params.range ?? ""), parseValues(params.values), account);
      case "append":
        return this.append(String(params.id ?? ""), String(params.range ?? ""), parseValues(params.values), account);
      case "list":
        return this.list(account);
      default:
        throw new Error(`Unknown sheets action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "csv-import",
        description: "Import CSV/tabular data into a Google Sheet cleanly.",
        content: sheetsSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** Create a spreadsheet, persist it, and record the task. */
  @callable()
  async createSpreadsheet(title: string, account: string = "workspace") {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({ kind: "sheets", title: `Create sheet: ${title}`, status: "running", account: acct });
    try {
      const info = await this.getClient(acct).createSpreadsheet(title);
      const url = info.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${info.spreadsheetId}/edit`;
      await this.persistSheet(acct, info.spreadsheetId, info.properties?.title ?? title, url);
      await this.recordTask({
        id: taskId,
        kind: "sheets",
        title: `Create sheet: ${title}`,
        status: "done",
        account: acct,
        googleFileId: info.spreadsheetId,
        googleFileUrl: url,
      });
      await this.logTaskEvent(taskId, "artifact", `Created spreadsheet ${title}`, { id: info.spreadsheetId, url });
      return info;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "sheets", title: `Create sheet: ${title}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Read a range of values. */
  @callable()
  async read(id: string, range: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).read(id, range);
  }

  /** Write values to a range. */
  @callable()
  async write(id: string, range: string, values: unknown[][], account: string = "workspace") {
    return this.getClient(this.resolve(account)).write(id, range, values);
  }

  /** Append rows to a range. */
  @callable()
  async append(id: string, range: string, values: unknown[][], account: string = "workspace") {
    return this.getClient(this.resolve(account)).append(id, range, values);
  }

  /** Clear a range. */
  @callable()
  async clear(id: string, range: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).clear(id, range);
  }

  /** Add a sheet/tab to an existing spreadsheet. */
  @callable()
  async addSheet(id: string, sheetTitle: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).addSheet(id, sheetTitle);
  }

  /** List spreadsheets. */
  @callable()
  async list(account: string = "workspace") {
    return this.getClient(this.resolve(account)).list();
  }

  /** Probe Sheets connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<SheetsHealth> {
    const acct = this.resolve(account);
    return checkSheetsHealth(this.getClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Upsert a created spreadsheet into the `googleSheets` table. */
  private async persistSheet(
    account: GoogleAccount,
    id: string,
    name: string,
    url: string,
  ): Promise<void> {
    const db = getDb(this.env);
    await db
      .insert(googleSheets)
      .values({ id, account, name, url, createdAt: new Date() })
      .onConflictDoUpdate({ target: googleSheets.id, set: { name } });
  }
}
