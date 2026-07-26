/**
 * @fileoverview Types for the Sheets specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** Result of a Sheets health probe. */
export interface SheetsHealth {
  agent: "sheets";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
