/**
 * @fileoverview Orchestrator health probe — aggregates specialist health.
 */

import type { OrchestratorHealth, SpecialistKind } from "@/backend/ai/agents/orchestrator/types";

import { resolveSpecialist } from "@/backend/ai/agents/orchestrator/methods/route";

const KINDS: SpecialistKind[] = ["gmail", "docs", "sheets", "slides", "drive", "appscript"];

/**
 * Probe every specialist via RPC and aggregate readiness.
 *
 * @param env  Worker environment bindings.
 * @param name DO instance name to probe (usually the user id).
 */
export async function checkOrchestratorHealth(
  env: Env,
  name: string,
): Promise<OrchestratorHealth> {
  const specialists: Record<string, boolean> = {};
  await Promise.all(
    KINDS.map(async (kind) => {
      try {
        const stub = await resolveSpecialist(env, kind, name);
        const result = (await (stub as unknown as { healthProbe(): Promise<{ ok: boolean }> }).healthProbe()) ?? { ok: false };
        specialists[kind] = Boolean(result.ok);
      } catch {
        specialists[kind] = false;
      }
    }),
  );

  return {
    agent: "orchestrator",
    ok: Object.values(specialists).some(Boolean),
    specialists,
  };
}
