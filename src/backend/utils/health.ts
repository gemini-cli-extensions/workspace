import type { ModuleResult } from "@/backend/health/types";

/** Verify all required Secrets Store bindings are present and non-empty. */
export async function checkSecrets(env: Env): Promise<ModuleResult & { missing?: string[] }> {
  const start = Date.now();
  const required = [
    "GITHUB_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_WRANGLER_API_TOKEN",
    "WORKER_API_KEY",
    "CLOUDFLARE_AI_GATEWAY_TOKEN",
    "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1",
    "GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2",
    "GOOGLE_CREDS_SA_CLIENT_EMAIL",
  ] as const;

  const missing: string[] = [];
  for (const name of required) {
    try {
      const val = await (env as Record<string, any>)[name]?.get();
      if (!val || val.trim() === "") missing.push(name);
    } catch {
      missing.push(name);
    }
  }

  return {
    status: missing.length === 0 ? "ok" : "fail",
    latencyMs: Date.now() - start,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/** Verify all required environment variables are present. */
export async function checkEnvVars(env: Env): Promise<ModuleResult & { missing?: string[] }> {
  const start = Date.now();
  const required = [
    "AI_GATEWAY_ID",
    "MODEL_CHAT",
    "MODEL_EXTRACT",
    "MODEL_DRAFT",
  ] as const;

  const missing: string[] = [];
  for (const name of required) {
    const val = (env as Record<string, any>)[name];
    if (!val || (typeof val === "string" && (val.trim() === "" || val.startsWith("<")))) {
      missing.push(name);
    }
  }

  return {
    status: missing.length === 0 ? "ok" : "fail",
    latencyMs: Date.now() - start,
    missing: missing.length > 0 ? missing : undefined,
  };
}
