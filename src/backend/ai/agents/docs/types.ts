/**
 * @fileoverview Types for the Docs specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** Result of a Docs health probe. */
export interface DocsHealth {
  agent: "docs";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
