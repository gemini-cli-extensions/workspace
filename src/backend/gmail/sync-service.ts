/**
 * @file gmail/sync-service.ts
 * @description Applies the label reconciliation (see label-sync.ts) against
 * Gmail + the gmail_labels registry for one account. Shared by the
 * `gmail_labels_sync` MCP tool and the weekly cron.
 */
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { gmailLabels } from "@db/schemas";
import { GmailService } from "@/backend/mcp/services/gmail";

import { diffLabels, parentIdFor } from "./label-sync";

export interface SyncResult {
  registered: number;
  reactivated: number;
  softDeleted: number;
  total: number;
}

/** Reconcile the gmail_labels registry for `account` against live Gmail. */
export async function syncLabels(env: Env, account: string): Promise<SyncResult> {
  const raw = (await new GmailService(env, account).listLabels()).labels as { id: string; name: string }[];
  const gmail = raw.map((l) => ({ id: l.id, name: l.name }));

  const db = getDb(env);
  const existing = await db
    .select({ id: gmailLabels.id, isActive: gmailLabels.isActive })
    .from(gmailLabels)
    .where(eq(gmailLabels.account, account));

  const diff = diffLabels(gmail, existing);
  const idByName = new Map(gmail.map((l) => [l.name, l.id]));
  const now = new Date();

  const newRows = diff.toRegister.map((l) => ({
    id: l.id,
    account,
    name: l.name,
    parentId: parentIdFor(l.name, idByName),
    isActive: true,
    createdVia: "sync",
    createdAt: now,
    updatedAt: now,
  }));
  // gmail_labels insert binds ~8 columns/row; chunk to stay under D1's 100-param cap.
  for (let i = 0; i < newRows.length; i += 6) {
    await db.insert(gmailLabels).values(newRows.slice(i, i + 6));
  }
  for (const id of diff.toReactivate) {
    await db.update(gmailLabels).set({ isActive: true, updatedAt: now }).where(eq(gmailLabels.id, id));
  }
  for (const id of diff.toSoftDelete) {
    await db.update(gmailLabels).set({ isActive: false, updatedAt: now }).where(eq(gmailLabels.id, id));
  }

  return {
    registered: newRows.length,
    reactivated: diff.toReactivate.length,
    softDeleted: diff.toSoftDelete.length,
    total: gmail.length,
  };
}

/**
 * Weekly cron entry point: sync labels for every signed-in OAuth account
 * (keys `gwsuser:<sub>` in SESSIONS KV). Errors on one account don't abort the
 * others.
 */
export async function syncLabelsForAllAccounts(env: Env): Promise<void> {
  const list = await env.SESSIONS.list({ prefix: "gwsuser:" });
  for (const key of list.keys) {
    const sub = key.name.slice("gwsuser:".length);
    try {
      await syncLabels(env, sub);
    } catch (err) {
      console.error(`[label-sync] failed for ${sub}:`, err instanceof Error ? err.message : err);
    }
  }
}
