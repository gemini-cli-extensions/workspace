/**
 * @fileoverview Barrel re-export for all Cloudflare Agents SDK Durable Object
 * classes in `core-gsuite-tools`.
 *
 * The Worker entry (`src/_worker.ts`) and `astro.config.ts`
 * `workerEntryPoint.namedExports` must export every one of these classes so the
 * Cloudflare runtime can bind each Durable Object.
 */

export { OrchestratorAgent } from "@/backend/ai/agents/orchestrator";
export { GmailAgent } from "@/backend/ai/agents/gmail";
export { DocsAgent } from "@/backend/ai/agents/docs";
export { SheetsAgent } from "@/backend/ai/agents/sheets";
export { SlidesAgent } from "@/backend/ai/agents/slides";
export { AppsScriptAgent } from "@/backend/ai/agents/appscript";
export { DriveAgent } from "@/backend/ai/agents/drive";
export { CalendarAgent } from "@/backend/ai/agents/calendar";

export { BaseGsuiteAgent } from "@/backend/ai/agents/shared/base-gsuite-agent";
