/**
 * @fileoverview Types for the Orchestrator agent.
 */

/** The specialist surfaces the orchestrator can route to. */
export type SpecialistKind =
  | "gmail"
  | "docs"
  | "sheets"
  | "slides"
  | "drive"
  | "appscript";

/** A routing decision produced by the orchestrator. */
export interface RouteDecision {
  /** The chosen specialist. */
  agent: SpecialistKind;
  /** The DO instance name the specialist was addressed by. */
  name: string;
  /** The method invoked on the specialist. */
  method: string;
}

/** Result of an orchestrator health probe (aggregates specialists). */
export interface OrchestratorHealth {
  agent: "orchestrator";
  ok: boolean;
  specialists: Record<string, boolean>;
}
