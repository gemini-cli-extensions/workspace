/**
 * @fileoverview Types for the Apps Script specialist agent.
 */

import type { GoogleAccount } from "@/backend/auth/provider";

/** An Apps Script source file entry. */
export interface ScriptFile {
  name: string;
  type: "SERVER_JS" | "HTML" | "JSON";
  source: string;
}

/** Result of an Apps Script health probe. */
export interface AppsScriptHealth {
  agent: "appscript";
  ok: boolean;
  account: GoogleAccount;
  error?: string;
}
