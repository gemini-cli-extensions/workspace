/**
 * @fileoverview Orchestrator routing helpers.
 *
 * Resolves a specialist agent stub via `getAgentByName` (the only sanctioned
 * resolution path — raw namespace id lookups and DO fetch dispatch are
 * forbidden) and maps a logical surface to its Durable Object namespace binding.
 */

import { getAgentByName } from "agents";

import type { AppsScriptAgent } from "@/backend/ai/agents/appscript";
import type { DocsAgent } from "@/backend/ai/agents/docs";
import type { DriveAgent } from "@/backend/ai/agents/drive";
import type { GmailAgent } from "@/backend/ai/agents/gmail";
import type { SheetsAgent } from "@/backend/ai/agents/sheets";
import type { SlidesAgent } from "@/backend/ai/agents/slides";
import type { SpecialistKind } from "@/backend/ai/agents/orchestrator/types";

/** Map of specialist kind → the Env binding name that holds its namespace. */
const BINDING_BY_KIND: Record<SpecialistKind, keyof Env> = {
  gmail: "GMAIL_AGENT",
  docs: "DOCS_AGENT",
  sheets: "SHEETS_AGENT",
  slides: "SLIDES_AGENT",
  drive: "DRIVE_AGENT",
  appscript: "APPSSCRIPT_AGENT",
};

/** Union of every specialist agent class for stub typing. */
export type SpecialistAgent =
  | GmailAgent
  | DocsAgent
  | SheetsAgent
  | SlidesAgent
  | DriveAgent
  | AppsScriptAgent;

/**
 * Resolve a typed RPC stub for a specialist agent.
 *
 * @param env  Worker environment bindings.
 * @param kind Which specialist to route to.
 * @param name The DO instance name (typically the user id).
 * @returns A `DurableObjectStub` whose methods are the specialist's `@callable`s.
 */
export async function resolveSpecialist(
  env: Env,
  kind: SpecialistKind,
  name: string,
): Promise<DurableObjectStub<SpecialistAgent>> {
  const namespace = env[BINDING_BY_KIND[kind]] as unknown as DurableObjectNamespace<SpecialistAgent>;
  return getAgentByName<Env, SpecialistAgent>(namespace, name);
}
