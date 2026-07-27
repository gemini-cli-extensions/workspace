import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { assetEvents, mcpLogs, workspaceAssets } from "@db/schemas";

/** Insert one `mcp_logs` row for a completed tool invocation. */
export async function logOperation(
  env: Env,
  o: {
    toolName: string;
    request?: unknown;
    response?: unknown;
    success: boolean;
    errorMessage?: string;
    latencyMs: number;
  },
): Promise<void> {
  const db = getDb(env);
  await db.insert(mcpLogs).values({
    id: crypto.randomUUID(),
    serverName: "google-workspace",
    toolName: o.toolName,
    request: (o.request ?? null) as Record<string, unknown> | null,
    response: (o.response ?? null) as Record<string, unknown> | null,
    success: o.success,
    errorMessage: o.errorMessage,
    latencyMs: Math.round(o.latencyMs),
  });
}

export type AssetAction = "read" | "create" | "update" | "modify" | "delete";

/**
 * Upsert a `workspace_assets` row keyed on (userSub, assetType, googleId),
 * then append one `asset_events` row recording the touch.
 */
export async function logAssetTouch(
  env: Env,
  a: {
    userSub: string;
    assetType: string;
    googleId: string;
    title?: string;
    url?: string;
    action: AssetAction;
    detail?: Record<string, unknown>;
    toolName: string;
  },
): Promise<void> {
  const db = getDb(env);
  const now = new Date();

  const existing = await db
    .select({ id: workspaceAssets.id })
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.userSub, a.userSub),
        eq(workspaceAssets.assetType, a.assetType),
        eq(workspaceAssets.googleId, a.googleId),
      ),
    )
    .limit(1);

  let assetId: string;
  if (existing.length > 0) {
    assetId = existing[0].id;
    await db
      .update(workspaceAssets)
      .set({ lastTouchedAt: now, title: a.title, url: a.url })
      .where(eq(workspaceAssets.id, assetId));
  } else {
    assetId = crypto.randomUUID();
    await db.insert(workspaceAssets).values({
      id: assetId,
      userSub: a.userSub,
      assetType: a.assetType,
      googleId: a.googleId,
      title: a.title,
      url: a.url,
      firstSeenAt: now,
      lastTouchedAt: now,
    });
  }

  await db.insert(assetEvents).values({
    id: crypto.randomUUID(),
    assetId,
    userSub: a.userSub,
    action: a.action,
    detail: (a.detail ?? null) as Record<string, unknown> | null,
    toolName: a.toolName,
    createdAt: now,
  });
}
