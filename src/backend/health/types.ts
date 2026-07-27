/**
 * @fileoverview Shared health-check result types.
 *
 * Every health probe (D1, KV, AI, Durable Objects, secrets, env vars) returns a
 * `ModuleResult` so the `/health` aggregator and the frontend DiagnosticsPanel
 * can render a uniform status grid.
 */

/** Status of a single health probe. */
export type HealthStatus = "ok" | "fail" | "skipped";

/**
 * Result of a single health-check module.
 *
 * - `status`   — ok / fail / skipped
 * - `latencyMs`— how long the probe took
 * - `message`  — optional human-readable detail (usually on failure)
 *
 * Probes may attach extra fields (e.g. `missing: string[]`), so this type is
 * intentionally open via an index signature.
 */
export type ModuleResult = {
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  [key: string]: unknown;
};
