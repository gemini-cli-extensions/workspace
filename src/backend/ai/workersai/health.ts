import type { ModuleResult } from "@/backend/health/types";

/**
 * Verify Workers AI connectivity with a minimal embedding inference call
 * (direct, bypassing AI Gateway).
 */
export async function checkWorkersAI(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    const result = await env.AI.run(env.DEFAULT_MODEL_EMBEDDING as any, {
      text: ["health"],
    });
    if (!result || !("data" in result)) {
      return { status: "fail", latencyMs: Date.now() - start, error: "Empty AI response" };
    }
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Verify AI Gateway integration by running a tiny embedding inference call
 * routed through the configured AI Gateway.
 */
export async function checkAIGateway(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    if (!env.AI_GATEWAY_ID) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "AI_GATEWAY_ID not configured",
      };
    }
    const result = await env.AI.run(
      env.DEFAULT_MODEL_EMBEDDING as any,
      { text: ["health-gateway-check"] },
      { gateway: { id: env.AI_GATEWAY_ID } },
    );
    if (!result || !("data" in result)) {
      return { status: "fail", latencyMs: Date.now() - start, error: "Empty gateway response" };
    }
    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { gatewayId: env.AI_GATEWAY_ID },
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
