/**
 * @file gmail/sync-service.ts
 * @description Multi-account label reconciliation. Enumerates the
 * `google_accounts` registry, resolves each to an MCP token ref (DWD email or
 * OAuth sub), and reconciles the `gmail_labels` registry per account — keyed by
 * canonical email so the cron and the on-demand tool never double-write. Shared
 * by the `gmail_labels_sync` tool and the weekly cron.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { gmailLabels, googleAccounts } from "@db/schemas";
import { GmailService } from "@/backend/mcp/services/gmail";

import { diffLabels, parentIdFor } from "./label-sync";

export interface SyncResult {
  account: string;
  registered: number;
  reactivated: number;
  softDeleted: number;
  total: number;
}

/** Build a lower-cased email → OAuth sub map from the signed-in users in KV. */
async function oauthSubByEmail(env: Env): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = await env.SESSIONS.list({ prefix: "gwsuser:" });
  for (const key of list.keys) {
    const raw = await env.SESSIONS.get(key.name);
    if (!raw) continue;
    const u = JSON.parse(raw) as { sub?: string; email?: string };
    if (u.email && u.sub) out.set(u.email.toLowerCase(), u.sub);
  }
  return out;
}

/** The canonical email for an MCP token ref (dwd:email → email, sub → its email). */
export async function accountEmailFor(env: Env, ref: string): Promise<string> {
  if (ref.startsWith("dwd:")) return ref.slice(4).toLowerCase();
  const raw = await env.SESSIONS.get(`gwsuser:${ref}`);
  if (raw) {
    const u = JSON.parse(raw) as { email?: string };
    if (u.email) return u.email.toLowerCase();
  }
  return ref;
}

/** Active accounts to capture, each with its email + MCP token ref. */
export async function listCaptureAccounts(env: Env): Promise<{ email: string; ref: string }[]> {
  const db = getDb(env);
  const rows = await db.select().from(googleAccounts).where(eq(googleAccounts.status, "active"));
  const subByEmail = await oauthSubByEmail(env);
  const out: { email: string; ref: string }[] = [];
  for (const r of rows) {
    const email = r.email.toLowerCase();
    if (r.kind === "workspace_dwd") {
      out.push({ email, ref: `dwd:${email}` });
    } else {
      const sub = subByEmail.get(email);
      if (sub) out.push({ email, ref: sub }); // OAuth account must be signed in
    }
  }
  return out;
}

/** Reconcile the gmail_labels registry for one account (keyed by `email`). */
export async function syncLabels(env: Env, ref: string, email: string): Promise<SyncResult> {
  const raw = (await new GmailService(env, ref).listLabels()).labels as { id: string; name: string }[];
  const gmail = raw.map((l) => ({ id: l.id, name: l.name }));

  const db = getDb(env);
  const existing = await db
    .select({ id: gmailLabels.id, isActive: gmailLabels.isActive })
    .from(gmailLabels)
    .where(eq(gmailLabels.account, email));

  const diff = diffLabels(gmail, existing);
  const idByName = new Map(gmail.map((l) => [l.name, l.id]));
  const now = new Date();

  const newRows = diff.toRegister.map((l) => ({
    id: l.id,
    account: email,
    name: l.name,
    parentId: parentIdFor(l.name, idByName),
    isActive: true,
    createdVia: "sync",
    createdAt: now,
    updatedAt: now,
  }));
  // gmail_labels binds ~8 cols/row; chunk under D1's 100-param cap.
  for (let i = 0; i < newRows.length; i += 6) {
    await db.insert(gmailLabels).values(newRows.slice(i, i + 6));
  }
  for (const id of diff.toReactivate) {
    await db.update(gmailLabels).set({ isActive: true, updatedAt: now }).where(eq(gmailLabels.id, id));
  }
  for (const id of diff.toSoftDelete) {
    await db.update(gmailLabels).set({ isActive: false, updatedAt: now }).where(and(eq(gmailLabels.id, id), eq(gmailLabels.account, email)));
  }

  return {
    account: email,
    registered: newRows.length,
    reactivated: diff.toReactivate.length,
    softDeleted: diff.toSoftDelete.length,
    total: gmail.length,
  };
}

/** Sync labels for every active account. Errors on one don't abort the rest. */
export async function syncLabelsForAllAccounts(env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const acc of await listCaptureAccounts(env)) {
    try {
      results.push(await syncLabels(env, acc.ref, acc.email));
    } catch (err) {
      console.error(`[label-sync] failed for ${acc.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return results;
}
