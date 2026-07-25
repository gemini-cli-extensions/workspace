import type { ModuleResult } from "@/backend/health/types";

/** Check D1 database connectivity with a simple `SELECT 1`. */
export async function checkD1(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    await env.DB.prepare("SELECT 1").first();
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Check KV namespace by reading a well-known health-check key. */
export async function checkKV(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    if (!env.SESSIONS) throw new Error("KV binding is undefined");
    await env.SESSIONS.get("__health_check");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
