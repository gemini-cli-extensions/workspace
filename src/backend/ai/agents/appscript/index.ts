/**
 * @fileoverview AppsScriptAgent — the Google Apps Script specialist Durable
 * Object.
 *
 * Exposes Apps Script operations as `@callable()` RPC methods and AI tools.
 * Created script projects are persisted to the `appscriptProjects` D1 table.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { AppsScriptHealth, ScriptFile } from "@/backend/ai/agents/appscript/types";

import { AppsScriptClient } from "@/backend/google";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { appscriptProjects } from "@db/schemas";
import { checkAppsScriptHealth } from "@/backend/ai/agents/appscript/health";
import { buildAppsScriptTools } from "@/backend/ai/agents/appscript/methods/tools";
import appscriptSkill from "@/backend/ai/agents/skills/appscript/SKILL.md?raw";

/** Loose shape of a created script project response. */
interface ScriptProjectResult {
  scriptId: string;
  title?: string;
  parentId?: string;
}

/**
 * Coerce a catalog `params` value (JSON string or array) into the positional
 * argument array expected by the Apps Script `run` method.
 */
function parseRunParams(input: unknown): unknown[] | undefined {
  if (Array.isArray(input)) return input as unknown[];
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed as unknown[];
    } catch {
      /* fall through */
    }
  }
  return undefined;
}

/**
 * Durable Object agent for Google Apps Script.
 */
export class AppsScriptAgent extends BaseGsuiteAgent {
  private clients = new Map<GoogleAccount, AppsScriptClient>();

  static docsMetadata() {
    return {
      name: "Apps Script",
      className: "AppsScriptAgent",
      description:
        "Google Apps Script specialist: scaffold bound/standalone projects, read/update source files, and run functions.",
      docsPath: "/docs/agents/appscript",
      methods: [
        { name: "createBoundScript", description: "Create a container-bound script", params: "parentId, title, account?", returns: "ScriptProject" },
        { name: "createStandalone", description: "Create a standalone script", params: "title, account?", returns: "ScriptProject" },
        { name: "getContent", description: "Read script source", params: "scriptId, account?", returns: "Content" },
        { name: "updateContent", description: "Replace script source", params: "scriptId, files, account?", returns: "Content" },
        { name: "run", description: "Run a script function", params: "scriptId, functionName, params?, account?", returns: "unknown" },
      ],
      tools: ["Apps Script API"],
    };
  }

  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /** Resolve/cache an Apps Script client for an account. */
  private getClient(account: GoogleAccount): AppsScriptClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new AppsScriptClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "appscript";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildAppsScriptTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Apps Script method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "listProjects":
        return this.listProjects(account);
      case "getContent":
        return this.getContent(String(params.scriptId ?? ""), account);
      case "createStandalone":
        return this.createStandalone(String(params.title ?? ""), account);
      case "run":
        return this.run(String(params.scriptId ?? ""), String(params.functionName ?? ""), parseRunParams(params.params), account);
      default:
        throw new Error(`Unknown appscript action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "bound-script-scaffold",
        description: "Scaffold a container-bound Apps Script for a Doc/Sheet/Slide.",
        content: appscriptSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** Create a container-bound script, persist it, and record the task. */
  @callable()
  async createBoundScript(parentId: string, title: string, account: string = "workspace") {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({ kind: "appscript", title: `Bound script: ${title}`, status: "running", account: acct });
    try {
      const result = (await this.getClient(acct).createBoundScript(parentId, title)) as ScriptProjectResult;
      await this.persistProject(acct, result.scriptId, result.title ?? title, result.parentId ?? parentId);
      await this.recordTask({
        id: taskId,
        kind: "appscript",
        title: `Bound script: ${title}`,
        status: "done",
        account: acct,
        googleFileId: result.scriptId,
      });
      await this.logTaskEvent(taskId, "artifact", `Created bound script ${title}`, { scriptId: result.scriptId });
      return result;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "appscript", title: `Bound script: ${title}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Create a standalone script, persist it, and record the task. */
  @callable()
  async createStandalone(title: string, account: string = "workspace") {
    const acct = this.resolve(account);
    const result = (await this.getClient(acct).createStandalone(title)) as ScriptProjectResult;
    await this.persistProject(acct, result.scriptId, result.title ?? title);
    return result;
  }

  /** Read a script's source files. */
  @callable()
  async getContent(scriptId: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).getContent(scriptId);
  }

  /** Replace a script's source files. */
  @callable()
  async updateContent(scriptId: string, files: ScriptFile[], account: string = "workspace") {
    return this.getClient(this.resolve(account)).updateContent(scriptId, files);
  }

  /** List Apps Script projects. */
  @callable()
  async listProjects(account: string = "workspace") {
    return this.getClient(this.resolve(account)).listProjects();
  }

  /** Run a script function. */
  @callable()
  async run(scriptId: string, functionName: string, params?: unknown[], account: string = "workspace") {
    return this.getClient(this.resolve(account)).run(scriptId, functionName, params);
  }

  /** Probe Apps Script connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<AppsScriptHealth> {
    const acct = this.resolve(account);
    return checkAppsScriptHealth(this.getClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Upsert a created project into the `appscriptProjects` table. */
  private async persistProject(
    account: GoogleAccount,
    scriptId: string,
    title: string,
    parentId?: string,
  ): Promise<void> {
    const db = getDb(this.env);
    await db
      .insert(appscriptProjects)
      .values({
        id: scriptId,
        account,
        title,
        parentId,
        url: `https://script.google.com/d/${scriptId}/edit`,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({ target: appscriptProjects.id, set: { title } });
  }
}
