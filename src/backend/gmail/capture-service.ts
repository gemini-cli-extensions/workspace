/**
 * @file gmail/capture-service.ts
 * @description Slice 2 ingestion. For each capture-enabled label on an account,
 * scan recent messages and fill the relational store: gmail_threads,
 * gmail_messages, gmail_message_bodies, gmail_message_contacts. Idempotent —
 * messages already stored (by id PK) are skipped. Attachments and embedding are
 * later slices; ragUuid stays null for now.
 */
import { and, eq, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { gmailLabels, gmailThreads, gmailMessages, gmailMessageBodies, gmailMessageContacts, gmailMessageAttachments } from "@db/schemas";
import { GmailService } from "@/backend/mcp/services/gmail";

import { parseRawMessage } from "./parse-message";
import { keepableAttachments } from "./attachments";
import { storeAttachment } from "./attachment-store";
import { listCaptureAccounts } from "./sync-service";

export interface CaptureResult {
  account: string;
  labels: number;
  messages: number;
  contacts: number;
  attachments: number;
  skipped: number;
}

/** Ingest capture-enabled labels for one account. */
export async function captureAccount(env: Env, ref: string, email: string, perLabel = 25): Promise<CaptureResult> {
  const db = getDb(env);
  const labels = await db
    .select({
      id: gmailLabels.id,
      captureAttachments: gmailLabels.captureAttachments,
      attachmentStore: gmailLabels.attachmentStore,
    })
    .from(gmailLabels)
    .where(and(eq(gmailLabels.account, email), eq(gmailLabels.isActive, true), ne(gmailLabels.captureMode, "none")));

  const gmail = new GmailService(env, ref);
  let messages = 0;
  let contacts = 0;
  let attachments = 0;
  let skipped = 0;

  for (const lbl of labels) {
    const listed = await gmail.listByLabel(lbl.id, perLabel);
    for (const m of listed.messages) {
      const existing = await db.select({ id: gmailMessages.id }).from(gmailMessages).where(eq(gmailMessages.id, m.id)).limit(1);
      if (existing.length) {
        skipped++;
        continue;
      }

      const raw = await gmail.getRawMessage(m.id);
      const p = parseRawMessage(raw);
      if (!p.id || !p.threadId) continue;
      const now = new Date();

      await db
        .insert(gmailThreads)
        .values({
          id: p.threadId,
          account: email,
          subject: p.subject,
          snippet: p.snippet,
          labelIdsJson: p.labelIds,
          lastMessageAt: p.internalDate,
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      await db.insert(gmailMessages).values({
        id: p.id,
        threadId: p.threadId,
        account: email,
        subject: p.subject,
        snippet: p.snippet,
        ragUuid: null,
        labelIdsJson: p.labelIds,
        internalDate: p.internalDate,
        createdAt: now,
      });

      await db.insert(gmailMessageBodies).values({
        messageId: p.id,
        bodyText: p.bodyText,
        sizeBytes: p.bodyText.length,
        createdAt: now,
      });

      const contactRows = p.contacts.map((c) => ({
        id: crypto.randomUUID(),
        messageId: p.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        type: c.type,
      }));
      // gmail_message_contacts has 6 cols; chunk under D1's 100-param cap.
      for (let i = 0; i < contactRows.length; i += 12) {
        await db.insert(gmailMessageContacts).values(contactRows.slice(i, i + 12));
      }

      messages++;
      contacts += contactRows.length;

      // Attachments (junk-filtered), when the label opts in.
      if (lbl.captureAttachments) {
        for (const part of keepableAttachments((raw as any).payload)) {
          try {
            const { data } = await gmail.getAttachment(p.id, part.attachmentId);
            const stored = await storeAttachment(env, { account: email, messageId: p.id, part, data, store: lbl.attachmentStore });
            await db.insert(gmailMessageAttachments).values({
              id: crypto.randomUUID(),
              messageId: p.id,
              filename: part.filename || null,
              mimetype: part.mimeType,
              md5: stored.md5,
              r2Key: stored.r2Key,
              driveId: stored.driveId,
              driveUrl: stored.driveUrl,
              ocrText: null,
              ragUuid: null,
              createdAt: now,
            });
            attachments++;
          } catch (err) {
            console.error(`[capture] attachment ${part.filename} on ${p.id}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }
  }

  return { account: email, labels: labels.length, messages, contacts, attachments, skipped };
}

/** Capture across every active account. Errors on one don't abort the rest. */
export async function captureAllAccounts(env: Env): Promise<CaptureResult[]> {
  const out: CaptureResult[] = [];
  for (const acc of await listCaptureAccounts(env)) {
    try {
      out.push(await captureAccount(env, acc.ref, acc.email));
    } catch (err) {
      console.error(`[capture] failed for ${acc.email}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}
