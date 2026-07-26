/**
 * @fileoverview Types for the Calendar specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** Result of a Calendar health probe. */
export interface CalendarHealth {
  agent: "calendar";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
