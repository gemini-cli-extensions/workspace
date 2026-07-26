/**
 * @fileoverview Health probe for the Slides agent.
 *
 * Slides has no cheap "list" endpoint, so this reports configuration readiness
 * rather than making a live API call (avoids creating throwaway presentations).
 */

import type { GoogleAccount } from "@/backend/auth/provider";
import type { GoogleSlidesClient } from "@/backend/google";
import type { SlidesHealth } from "@/backend/ai/agents/slides/types";

/**
 * Report Slides agent readiness for the given account.
 *
 * @param client  The Slides client (presence implies the binding constructed).
 * @param account The account being probed.
 */
export async function checkSlidesHealth(
  client: GoogleSlidesClient,
  account: GoogleAccount,
): Promise<SlidesHealth> {
  return { agent: "slides", ok: Boolean(client), account };
}
