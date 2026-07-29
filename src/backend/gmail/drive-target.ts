/**
 * @file gmail/drive-target.ts
 * @description Resolves where Drive-stored attachments go: the active account
 * with the MOST free storage, in a dedicated folder. The chosen {email,
 * folderId} is cached in global_config so we don't re-query storage / re-create
 * the folder on every attachment. First run creates the folder.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { globalConfig } from "@db/schemas";
import { DriveService } from "@/backend/mcp/services/drive";

import { listCaptureAccounts } from "./sync-service";

const CONFIG_KEY = "gmail_attachment_target";
const FOLDER_NAME = "MCP Gmail Attachments";

export interface DriveTarget {
  ref: string;
  email: string;
  folderId: string;
}

/** Pick the Drive account with the most free space and ensure its folder. */
export async function resolveDriveTarget(env: Env): Promise<DriveTarget | null> {
  const accounts = await listCaptureAccounts(env);
  if (!accounts.length) return null;

  const db = getDb(env);
  const cached = (await db.select().from(globalConfig).where(eq(globalConfig.key, CONFIG_KEY)).limit(1))[0]?.value as
    | { email?: string; folderId?: string }
    | undefined;
  if (cached?.email && cached?.folderId) {
    const acc = accounts.find((a) => a.email === cached.email);
    if (acc) return { ref: acc.ref, email: acc.email, folderId: cached.folderId };
  }

  // Query free storage per account; pick the largest.
  let best: { ref: string; email: string; free: number } | null = null;
  for (const a of accounts) {
    try {
      const free = await new DriveService(env, a.ref).getStorageFree();
      if (!best || free > best.free) best = { ref: a.ref, email: a.email, free };
    } catch {
      // Skip accounts we can't query (e.g. Gmail-only OAuth without Drive scope).
    }
  }
  if (!best) return null;

  const folderId = await new DriveService(env, best.ref).findOrCreateFolder(FOLDER_NAME);
  const now = new Date();
  await db
    .insert(globalConfig)
    .values({ key: CONFIG_KEY, value: { email: best.email, folderId }, updatedAt: now })
    .onConflictDoUpdate({ target: globalConfig.key, set: { value: { email: best.email, folderId }, updatedAt: now } });

  return { ref: best.ref, email: best.email, folderId };
}
