/**
 * @fileoverview CalendarAgent — the Google Calendar specialist Durable Object.
 *
 * Exposes Calendar operations as `@callable()` RPC methods and AI tools, and
 * participates in the scheduling system (on-demand + interval/cron/once) like
 * the other surface agents via `BaseGsuiteAgent`.
 */

import { callable } from "agents";
import type { ToolSet } from "ai";

import type { GoogleAccount } from "@/backend/auth/provider";
import type { CalendarHealth } from "@/backend/ai/agents/calendar/types";

import { CalendarClient } from "@/backend/google/calendar";
import { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
import { checkCalendarHealth } from "@/backend/ai/agents/calendar/health";
import { buildCalendarTools } from "@/backend/ai/agents/calendar/methods/tools";
import calendarSkill from "@/backend/ai/agents/skills/calendar/SKILL.md?raw";

/**
 * Durable Object agent for Google Calendar.
 */
export class CalendarAgent extends BaseGsuiteAgent {
  private clients = new Map<GoogleAccount, CalendarClient>();

  static docsMetadata() {
    return {
      name: "Calendar",
      className: "CalendarAgent",
      description:
        "Google Calendar specialist: list calendars/events, create events (explicit or quick-add), and summarize schedules.",
      docsPath: "/docs/agents/calendar",
      methods: [
        { name: "listCalendars", description: "List calendars", params: "account?", returns: "CalendarInfo[]" },
        { name: "listEvents", description: "List events", params: "calendarId?, account?", returns: "CalendarEvent[]" },
        { name: "createEvent", description: "Create an event", params: "summary, start, end, calendarId?, account?", returns: "CalendarEvent" },
        { name: "quickAdd", description: "Quick-add from text", params: "text, calendarId?, account?", returns: "CalendarEvent" },
      ],
      tools: ["Google Calendar API"],
    };
  }

  async onStart(): Promise<void> {
    this.getClient(this.defaultAccount);
  }

  /** Resolve/cache a Calendar client for an account. */
  private getClient(account: GoogleAccount): CalendarClient {
    let client = this.clients.get(account);
    if (!client) {
      client = new CalendarClient(this.env, account);
      this.clients.set(account, client);
    }
    return client;
  }

  protected getAgentName(): string {
    return "calendar";
  }

  protected getChatTools(account: GoogleAccount): ToolSet {
    return buildCalendarTools(this.getClient(account));
  }

  /**
   * Dispatch a catalog action to the corresponding Calendar method.
   */
  protected async executeAction(
    action: string,
    params: Record<string, unknown>,
    account: string,
  ): Promise<unknown> {
    switch (action) {
      case "listCalendars":
        return this.listCalendars(account);
      case "listEvents":
        return this.listEvents(params.calendarId != null ? String(params.calendarId) : "primary", account);
      case "createEvent":
        return this.createEvent(
          String(params.summary ?? ""),
          String(params.start ?? ""),
          String(params.end ?? ""),
          params.calendarId != null ? String(params.calendarId) : "primary",
          account,
        );
      case "quickAdd":
        return this.quickAdd(String(params.text ?? ""), params.calendarId != null ? String(params.calendarId) : "primary", account);
      default:
        throw new Error(`Unknown calendar action: ${action}`);
    }
  }

  protected getBundledSkills() {
    return [
      {
        name: "schedule-and-summarize",
        description: "List/create calendar events and summarize schedules.",
        content: calendarSkill,
        source: "bundled" as const,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Callable RPC methods
  // -------------------------------------------------------------------------

  /** List the user's calendars. */
  @callable()
  async listCalendars(account: string = "workspace") {
    return this.getClient(this.resolve(account)).listCalendars();
  }

  /** List events on a calendar. */
  @callable()
  async listEvents(calendarId = "primary", account: string = "workspace") {
    return this.getClient(this.resolve(account)).listEvents(calendarId, {});
  }

  /** Get a single event. */
  @callable()
  async getEvent(eventId: string, calendarId = "primary", account: string = "workspace") {
    return this.getClient(this.resolve(account)).getEvent(eventId, calendarId);
  }

  /** Create an event with explicit ISO start/end datetimes. */
  @callable()
  async createEvent(
    summary: string,
    start: string,
    end: string,
    calendarId = "primary",
    account: string = "workspace",
  ) {
    const acct = this.resolve(account);
    const taskId = await this.recordTask({ kind: "chat", title: `Create event: ${summary}`, status: "running", account: acct });
    try {
      const event = await this.getClient(acct).createEvent(
        { summary, start: { dateTime: start }, end: { dateTime: end } },
        calendarId,
      );
      await this.recordTask({ id: taskId, kind: "chat", title: `Create event: ${summary}`, status: "done", account: acct });
      await this.logTaskEvent(taskId, "artifact", `Created event ${summary}`, { id: event.id });
      return event;
    } catch (error) {
      await this.recordTask({ id: taskId, kind: "chat", title: `Create event: ${summary}`, status: "error", account: acct });
      await this.logTaskEvent(taskId, "error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /** Quick-add an event from natural-language text. */
  @callable()
  async quickAdd(text: string, calendarId = "primary", account: string = "workspace") {
    return this.getClient(this.resolve(account)).quickAdd(calendarId, text);
  }

  /** Delete an event. */
  @callable()
  async deleteEvent(eventId: string, calendarId = "primary", account: string = "workspace") {
    return this.getClient(this.resolve(account)).deleteEvent(eventId, calendarId);
  }

  /** Probe Calendar connectivity. */
  @callable()
  async healthProbe(account: string = "workspace"): Promise<CalendarHealth> {
    const acct = this.resolve(account);
    return checkCalendarHealth(this.getClient(acct), acct);
  }
}
