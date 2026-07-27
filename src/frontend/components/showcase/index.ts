/**
 * @fileoverview Barrel for the agent showcase islands. Astro pages import the
 * concrete panel they mount (so each island stays a tight, browser-only bundle);
 * this barrel exists for the modular-folder convention and for any cross-panel
 * reuse of the shared primitives.
 */

export { AgentThread, statusFromReadyState } from "./AgentThread";
export type { AgentStatus, AgentThreadProps } from "./AgentThread";
export { ToolCallCard } from "./ToolCallCard";
export { ApprovalGate } from "./ApprovalGate";
export { SpotlightFeatures } from "./SpotlightFeatures";
export { ConnectionBadge, EmptyState, ErrorBanner, LoadingRow, useSessionId } from "./shared";

export { CodeModePanel } from "./CodeModePanel";
export { WorkflowsPanel } from "./WorkflowsPanel";
export { BrowserHitlPanel } from "./BrowserHitlPanel";
export { MultiAgentPanel } from "./MultiAgentPanel";
export { McpPanel } from "./McpPanel";
export { ThinkingPanel } from "./ThinkingPanel";
export { SkillsPanel } from "./SkillsPanel";
export { UtilitiesDemo } from "./UtilitiesDemo";
