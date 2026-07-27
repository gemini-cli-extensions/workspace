/**
 * @fileoverview Health probe for the Docs agent — verifies Drive reachability,
 * which the Docs agent depends on for create/list operations.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GoogleDriveClient } from "@/backend/google";
import type { DocsHealth } from "@/backend/ai/agents/docs/types";

/**
 * Probe Docs/Drive connectivity for the given account.
 */
export async function checkDocsHealth(
  drive: GoogleDriveClient,
  account: GoogleAccount,
): Promise<DocsHealth> {
  try {
    await drive.recent(1);
    return { agent: "docs", ok: true, account };
  } catch (error) {
    return {
      agent: "docs",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
