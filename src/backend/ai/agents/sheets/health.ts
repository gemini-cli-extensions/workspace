/**
 * @fileoverview Health probe for the Sheets agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GoogleSheetsClient } from "@/backend/google";
import type { SheetsHealth } from "@/backend/ai/agents/sheets/types";

/**
 * Probe Sheets connectivity by listing spreadsheets.
 */
export async function checkSheetsHealth(
  client: GoogleSheetsClient,
  account: GoogleAccount,
): Promise<SheetsHealth> {
  try {
    await client.list();
    return { agent: "sheets", ok: true, account };
  } catch (error) {
    return {
      agent: "sheets",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
