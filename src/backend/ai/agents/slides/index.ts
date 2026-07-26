/**
 * @fileoverview SlidesAgent — the Google Slides specialist Durable Object.
 *
 * Exposes Slides operations as `@callable()` RPC methods and AI tools. Created
 * presentations are persisted to the `googleSlides` D1 table.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { SlideLayout, SlidesHealth } from "@/backend/ai/agents/slides/types";

import { GoogleSlidesClient } from "@/backend/google";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { getDb } from "@/backend/db";
import { googleSlides } from "@db/schemas";
import { checkSlidesHealth } from "@/backend/ai/agents/slides/health";
import { buildSlidesTools } from "@/backend/ai/agents/slides/methods/tools";
import slidesSkill from "@/backend/ai/agents/skills/slides/SKILL.md?raw";

/** Loose shape of a created presentation response. */
interface PresentationResult {
  presentationId: string;
  title?: string;
}

/**
 * Durable Object agent for Google Slides.
 */
export class SlidesAgent extends BaseGsuiteAgent {
  private clients = new Map<GoogleAccount, GoogleSlidesClient>();

  static docsMetadata() {
    return {
      name: "Slides",
      className: "SlidesAgent",
      description:
        "Google Slides specialist: create presentations, add slides, insert/replace text, add images, and build decks from templates.",
      docsPath: "/docs/agents/slides",
      methods: [
        { name: "createPresentation", description: "Create a presentation", params: "title, account?", returns: "Presentation" },
        { name: "read", description: "Read a presentation", params: "id, account?", returns: "Presentation" },
        { name: "createSlide", description: "Add a slide", params: "id, layout?, account?", returns: "unknown" },
        { name: "insertText", description: "Insert text", params: "id, objectId, text, account?", returns: "unknown" },
        { name: "replaceAllText", description: "Replace all text", params: "id, find, replace, account?", returns: "unknown" },
      ],
      tools: ["Google Slides API"],
    };
  }

  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /** Resolve/cache a Slides client for an account. */
  private getClient(account: GoogleAccount): GoogleSlidesClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new GoogleSlidesClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "slides";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildSlidesTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Slides method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "createPresentation":
        return this.createPresentation(String(params.title ?? ""), account);
      case "read":
        return this.read(String(params.id ?? ""), account);
      case "createSlide":
        return this.createSlide(String(params.id ?? ""), (params.layout as SlideLayout) ?? "BLANK", account);
      case "replaceAllText":
        return this.replaceAllText(String(params.id ?? ""), String(params.find ?? ""), String(params.replace ?? ""), account);
      default:
        throw new Error(`Unknown slides action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "deck-from-outline",
        description: "Generate a Google Slides deck from a bullet outline.",
        content: slidesSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** Create a presentation, persist it, and record the task. */
  @callable()
  async createPresentation(title: string, account: string = "workspace") {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({ kind: "slides", title: `Create deck: ${title}`, status: "running", account: acct });
    try {
      const result = (await this.getClient(acct).createPresentation(title)) as PresentationResult;
      const url = `https://docs.google.com/presentation/d/${result.presentationId}/edit`;
      await this.persistSlides(acct, result.presentationId, result.title ?? title, url);
      await this.recordTask({
        id: taskId,
        kind: "slides",
        title: `Create deck: ${title}`,
        status: "done",
        account: acct,
        googleFileId: result.presentationId,
        googleFileUrl: url,
      });
      await this.logTaskEvent(taskId, "artifact", `Created presentation ${title}`, { id: result.presentationId, url });
      return result;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "slides", title: `Create deck: ${title}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Read a presentation. */
  @callable()
  async read(id: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).read(id);
  }

  /** Add a slide. */
  @callable()
  async createSlide(id: string, layout: SlideLayout = "BLANK", account: string = "workspace") {
    return this.getClient(this.resolve(account)).createSlide(id, layout);
  }

  /** Insert text into a slide object. */
  @callable()
  async insertText(id: string, objectId: string, text: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).insertText(id, objectId, text);
  }

  /** Replace all text across the presentation. */
  @callable()
  async replaceAllText(id: string, find: string, replace: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).replaceAllText(id, find, replace);
  }

  /** Add an image to a page. */
  @callable()
  async addImage(id: string, pageObjectId: string, url: string, account: string = "workspace") {
    return this.getClient(this.resolve(account)).addImage(id, pageObjectId, url);
  }

  /** Probe Slides readiness. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<SlidesHealth> {
    const acct = this.resolve(account);
    return checkSlidesHealth(this.getClient(acct), acct);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Upsert a created presentation into the `googleSlides` table. */
  private async persistSlides(
    account: GoogleAccount,
    id: string,
    name: string,
    url: string,
  ): Promise<void> {
    const db = getDb(this.env);
    await db
      .insert(googleSlides)
      .values({ id, account, name, url, createdAt: new Date() })
      .onConflictDoUpdate({ target: googleSlides.id, set: { name } });
  }
}
