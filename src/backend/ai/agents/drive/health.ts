/**
 * @fileoverview Health probe for the Drive agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GoogleDriveClient } from "@/backend/google";
import type { DriveHealth } from "@/backend/ai/agents/drive/types";

/**
 * Probe Drive connectivity by fetching a single recent file.
 */
export async function checkDriveHealth(
  client: GoogleDriveClient,
  account: GoogleAccount,
): Promise<DriveHealth> {
  try {
    await client.recent(1);
    return { agent: "drive", ok: true, account };
  } catch (error) {
    return {
      agent: "drive",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
