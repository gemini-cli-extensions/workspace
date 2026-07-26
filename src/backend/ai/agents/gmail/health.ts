/**
 * @fileoverview Health probe implementation for the Gmail agent.
 *
 * Verifies the agent can authenticate and reach the Gmail API by listing labels.
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GmailClient } from "@/backend/google";
import type { GmailHealth } from "@/backend/ai/agents/gmail/types";

/**
 * Probe Gmail connectivity for the given account.
 *
 * @param client  A Gmail client already bound to `account`.
 * @param account The account being probed (reported back for clarity).
 * @returns A {@link GmailHealth} result; never throws.
 */
export async function checkGmailHealth(
  client: GmailClient,
  account: GoogleAccount,
): Promise<GmailHealth> {
  try {
    const labels = (await client.listLabels()) as { labels?: unknown[] } | unknown[];
    const labelCount = Array.isArray(labels)
      ? labels.length
      : Array.isArray(labels?.labels)
        ? labels.labels.length
        : undefined;
    return { agent: "gmail", ok: true, account, labelCount };
  } catch (error) {
    return {
      agent: "gmail",
      ok: false,
      account,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
