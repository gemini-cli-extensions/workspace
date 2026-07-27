/**
 * @fileoverview Health probe for the Apps Script agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { AppsScriptClient } from "@/backend/google";
import type { AppsScriptHealth } from "@/backend/ai/agents/appscript/types";

/**
 * Probe Apps Script connectivity by listing the user's projects.
 */
export async function checkAppsScriptHealth(
  client: AppsScriptClient,
  account: GoogleAccount,
): Promise<AppsScriptHealth> {
  try {
    await client.listProjects();
    return { agent: "appscript", ok: true, account };
  } catch (error) {
    return {
      agent: "appscript",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
