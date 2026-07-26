/**
 * @fileoverview Agent + task-kind registry — the single source of truth the
 * frontend uses to render the agent picker, the task-type chooser, and to map
 * each task to its backing Durable Object agent.
 *
 * The `agent` slug here is the kebab-case agent name expected by the Cloudflare
 * Agents `routeAgentRequest` router. The Agents SDK derives the connection path
 * `/agents/<agent-slug>/<instance-name>` from the DO binding's class name in
 * kebab-case. The backend re-exports these classes in `src/_worker.ts`:
 *
 *   OrchestratorAgent  -> "orchestrator-agent"
 *   GmailAgent         -> "gmail-agent"
 *   DocsAgent          -> "docs-agent"
 *   SheetsAgent        -> "sheets-agent"
 *   SlidesAgent        -> "slides-agent"
 *   DriveAgent         -> "drive-agent"
 *   AppsScriptAgent    -> "apps-script-agent"
 *
 * WIRE CONTRACT ASSUMPTION: the connection slug equals the class name in
 * kebab-case. If the backend registers a different prefix (e.g. plain
 * "orchestrator"), update `connectionSlug` here to match.
 */

import {
  Bot,
  FileText,
  FolderOpen,
  Mail,
  Presentation,
  Sheet,
  Terminal,
  type LucideIcon,
} from "lucide-react";

/** Task kinds that can produce a Google artifact (mirrors db `tasks.kind`). */
export type TaskKind = "docs" | "sheets" | "slides" | "drive" | "gmail" | "appscript" | "chat";

/** A selectable agent surface for the chat landing picker. */
export type AgentDescriptor = {
  /** Stable id used in the picker + as the task agent value. */
  id: string;
  /** Display label. */
  label: string;
  /** Short capability blurb. */
  description: string;
  /** kebab-case slug used in the Agents `/agents/<slug>/<name>` route. */
  connectionSlug: string;
  /** Icon for cards / picker. */
  icon: LucideIcon;
};

export const ORCHESTRATOR: AgentDescriptor = {
  id: "orchestrator",
  label: "Orchestrator",
  description: "Routes any request to the right Workspace specialist automatically.",
  connectionSlug: "orchestrator-agent",
  icon: Bot,
};

/** Specialist agents (also used as task-type cards on /agent-tasks). */
export const SPECIALIST_AGENTS: AgentDescriptor[] = [
  {
    id: "gmail",
    label: "Gmail",
    description: "Search, read, label, draft and send mail across your accounts.",
    connectionSlug: "gmail-agent",
    icon: Mail,
  },
  {
    id: "docs",
    label: "Docs",
    description: "Create, read and edit Google Docs and resolve comments.",
    connectionSlug: "docs-agent",
    icon: FileText,
  },
  {
    id: "sheets",
    label: "Sheets",
    description: "Read, write and format spreadsheets and ranges.",
    connectionSlug: "sheets-agent",
    icon: Sheet,
  },
  {
    id: "slides",
    label: "Slides",
    description: "Build presentations from prompts or templates.",
    connectionSlug: "slides-agent",
    icon: Presentation,
  },
  {
    id: "drive",
    label: "Drive",
    description: "Browse, search, move and organize files and folders.",
    connectionSlug: "drive-agent",
    icon: FolderOpen,
  },
  {
    id: "appscript",
    label: "Apps Script",
    description: "Create and run Apps Script projects bound to your files.",
    // Binding APPSSCRIPT_AGENT kebab-cases to "appsscript-agent" (no hyphen
    // between apps/script) — must match the DO binding name, not the class name.
    connectionSlug: "appsscript-agent",
    icon: Terminal,
  },
];

/** Full picker list: orchestrator first, then specialists. */
export const ALL_AGENTS: AgentDescriptor[] = [ORCHESTRATOR, ...SPECIALIST_AGENTS];

/** Resolve a descriptor by id, falling back to the orchestrator. */
export function getAgentById(id: string | null | undefined): AgentDescriptor {
  return ALL_AGENTS.find((a) => a.id === id) ?? ORCHESTRATOR;
}

/** Task kinds (excludes "chat") shown as cards on the /agent-tasks chooser. */
export const TASK_KINDS: { kind: TaskKind; agent: AgentDescriptor }[] = SPECIALIST_AGENTS.map(
  (agent) => ({ kind: agent.id as TaskKind, agent }),
);

/** Map a task's agent id (stored on the row) to its connection slug. */
export function connectionSlugForAgent(agentId: string): string {
  return getAgentById(agentId).connectionSlug;
}
