/**
 * @fileoverview Types for the Drive specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** Result of a Drive health probe. */
export interface DriveHealth {
  agent: "drive";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
