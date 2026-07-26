/**
 * @fileoverview GmailAgent — the Gmail specialist Durable Object.
 *
 * Exposes Gmail operations both as type-safe `@callable()` RPC methods (invoked
 * by the orchestrator, Hono routes, MCP tools, and service bindings) and as AI
 * SDK tools for the chat surface. Search/index operations persist message
 * metadata to the `emailsIndexed` D1 table.
 *
 * Built on {@link BaseGsuiteAgent}, which provides chat streaming, skills, task
 * telemetry, and account resolution.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GmailHealth, SendMessageInput } from "@/backend/ai/agents/gmail/types";

import { GmailClient } from "@/backend/google";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { emailsIndexed } from "@db/schemas";
import { checkGmailHealth } from "@/backend/ai/agents/gmail/health";
import { buildGmailTools } from "@/backend/ai/agents/gmail/methods/tools";
import gmailSkill from "@/backend/ai/agents/skills/gmail/SKILL.md?raw";

/**
 * Durable Object agent for Gmail. One instance per `name` (typically user id).
 */
export class GmailAgent extends BaseGsuiteAgent {
  /** Lazily-built per-account client cache. */
  private clients = new Map<GoogleAccount, GmailClient>();

  /**
   * Static documentation metadata for the agent catalog / docs UI.
   */
  static docsMetadata() {
    return {
      name: "Gmail",
      className: "GmailAgent",
      description:
        "Gmail specialist: search, read, send, draft, and label messages; manage labels and filters; index messages for retrieval.",
      docsPath: "/docs/agents/gmail",
      methods: [
        { name: "searchMessages", description: "Search messages by Gmail query", params: "query: string, maxResults?, account?", returns: "Message[]" },
        { name: "getMessage", description: "Fetch a single message", params: "id: string, account?", returns: "Message" },
        { name: "sendMessage", description: "Send an email", params: "input: SendMessageInput, account?", returns: "SendResult" },
        { name: "listLabels", description: "List labels", params: "account?", returns: "Label[]" },
        { name: "modifyMessageLabels", description: "Add/remove labels on a message", params: "id, add[], remove[], account?", returns: "Message" },
      ],
      tools: ["Gmail API"],
    };
  }

  /**
   * Initialize the default-account client on cold start.
   */
  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /**
   * Resolve (and cache) a Gmail client bound to the requested account.
   */
  private getClient(account: GoogleAccount): GmailClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new GmailClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  // -------------------------------------------------------------------------
  // BaseGsuiteAgent overrides
  // -------------------------------------------------------------------------

  protected getAgentName(): string {
    return "gmail";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildGmailTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Gmail method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "searchMessages":
        return this.searchMessages(String(params.query ?? ""), params.maxResults != null ? Number(params.maxResults) : 10, account);
      case "listLabels":
        return this.listLabels(account);
      case "sendMessage":
        return this.sendMessage(
          { to: String(params.to ?? ""), subject: String(params.subject ?? ""), body: String(params.body ?? ""), html: Boolean(params.html) },
          account,
        );
      case "modifyMessageLabels":
        return this.modifyMessageLabels(
          String(params.id ?? ""),
          params.add ? [String(params.add)] : [],
          params.remove ? [String(params.remove)] : [],
          account,
        );
      case "trashMessage":
        return this.trashMessage(String(params.id ?? ""), account);
      default:
        throw new Error(`Unknown gmail action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "triage-and-label",
        description: "Triage the inbox and apply labels based on sender and intent.",
        content: gmailSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /**
   * Search Gmail and index the matched message metadata into D1.
   */
  @callable()
  async searchMessages(query: string, maxResults = 10, account: string = "workspace") {
    const acct = this.resolve(account);
    const results = (await this.getClient(acct).searchMessages(query, maxResults)) as {
      messages?: Array<{ id: string; threadId?: string }>;
    };
    await this.indexMessages(acct, results?.messages ?? []);
    return results;
  }

  /** Fetch a single message by id. */
  @callable()
  async getMessage(id: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).getMessage(id);
  }

  /** Send an email and record the action as a task. */
  @callable()
  async sendMessage(input: SendMessageInput, account: string = "workspace") {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({
      kind: "gmail",
      title: `Send email: ${input.subject}`,
      status: "running",
      account: acct,
    });
    try {
      const result = await this.getClient(acct).sendMessage(input);
      await this.recordTask({ id: taskId, kind: "gmail", title: `Send email: ${input.subject}`, status: "done", account: acct });
      await this.logTaskEvent(taskId, "sent", `Sent email to ${input.to}`);
      return result;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "gmail", title: `Send email: ${input.subject}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** List all labels. */
  @callable()
  async listLabels(account: string = "workspace") {
    return this.getClient(this.resolve(account)).listLabels();
  }

  /** Create a label. */
  @callable()
  async createLabel(name: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).createLabel(name);
  }

  /** Add/remove labels on a message. */
  @callable()
  async modifyMessageLabels(
    id: string,
    add: string[] = [],
    remove: string[] = [],
    account: string = "workspace",
  ) {
    return this.getClient(this.resolve(account)).modifyMessageLabels(id, add, remove);
  }

  /** Move a message to trash. */
  @callable()
  async trashMessage(id: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).trashMessage(id);
  }

  /** Probe Gmail connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<GmailHealth> {
    const acct = this.resolve(account);
    return checkGmailHealth(this.getClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Upsert lightweight message metadata into the `emailsIndexed` table so the
   * search/index surface and Vectorize pipeline can act on it later.
   */
  private async indexMessages(
    account: GoogleAccount,
    messages: Array<{ id: string; threadId?: string }>,
  ): Promise<void> {
    if (!messages.length) return;
    const db = getDb(this.env);
    const now = new Date();
    for (const m of messages) {
      await db
        .insert(emailsIndexed)
        .values({
          id: m.id,
          account,
          threadId: m.threadId ?? m.id,
          subject: "",
          from: "",
          to: "",
          snippet: "",
          internalDate: now.getTime(),
          vectorized: false,
          createdAt: now,
        })
        .onConflictDoNothing();
    }
  }
}
