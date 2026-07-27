/**
 * @fileoverview Health probe for the Calendar agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { CalendarClient } from "@/backend/google/calendar";
import type { CalendarHealth } from "@/backend/ai/agents/calendar/types";

/**
 * Probe Calendar connectivity by listing the user's calendars.
 */
export async function checkCalendarHealth(
  client: CalendarClient,
  account: GoogleAccount,
): Promise<CalendarHealth> {
  try {
    await client.listCalendars();
    return { agent: "calendar", ok: true, account };
  } catch (error) {
    return {
      agent: "calendar",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
