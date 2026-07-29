/**
 * @file gmail/search-service.ts
 * @description Semantic search over captured mail. Queries the `emails`
 * Vectorize corpus, dedupes to one hit per message (best chunk score), and
 * enriches with subject/snippet/sender from D1. Shared by the MCP tool and the
 * REST route (frontend).
 */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { gmailMessages, gmailMessageContacts } from "@db/schemas";
import { queryCorpus } from "@/backend/ai/rag";

export interface GmailSearchHit {
  messageId: string;
  threadId: string;
  account: string;
  score: number;
  subject: string | null;
  snippet: string | null;
  from: string | null;
  preview: string;
}

export async function searchGmail(
  env: Env,
  query: string,
  opts: { account?: string; topK?: number } = {},
): Promise<GmailSearchHit[]> {
  const filter = opts.account ? { account: opts.account.toLowerCase() } : undefined;
  const matches = await queryCorpus(env, "emails", query, opts.topK ?? 8, filter);

  // Chunks share a sourceId (message id); keep the best-scoring chunk per message.
  const best = new Map<string, { score: number; preview: string }>();
  for (const m of matches) {
    const sid = String((m.metadata as { sourceId?: string }).sourceId ?? "");
    if (!sid) continue;
    const prev = best.get(sid);
    if (!prev || m.score > prev.score) {
      best.set(sid, { score: m.score, preview: String((m.metadata as { preview?: string }).preview ?? "") });
    }
  }
  const ids = [...best.keys()];
  if (!ids.length) return [];

  const db = getDb(env);
  const msgs = await db.select().from(gmailMessages).where(inArray(gmailMessages.id, ids));
  const froms = await db
    .select()
    .from(gmailMessageContacts)
    .where(and(inArray(gmailMessageContacts.messageId, ids), eq(gmailMessageContacts.type, "from")));
  const fromByMsg = new Map(froms.map((f) => [f.messageId, f.email]));

  return msgs
    .map((m) => ({
      messageId: m.id,
      threadId: m.threadId,
      account: m.account,
      score: best.get(m.id)!.score,
      subject: m.subject,
      snippet: m.snippet,
      from: fromByMsg.get(m.id) ?? null,
      preview: best.get(m.id)!.preview,
    }))
    .sort((a, b) => b.score - a.score);
}
