/**
 * @fileoverview Retrieval-Augmented Generation (RAG) over Vectorize.
 *
 * Three indexes back distinct corpora:
 *  - `VECTORIZE_EMAILS`  — indexed Gmail messages
 *  - `VECTORIZE_DOCS`    — Google Docs / Drive document text
 *  - `VECTORIZE_GENERAL` — general-purpose notes / misc context
 *
 * Embeddings are produced with Workers AI (`DEFAULT_MODEL_EMBEDDING`,
 * `@cf/baai/bge-large-en-v1.5`, 1024-dim — matching the index dimensionality).
 * Long inputs are chunked before embedding; each chunk becomes one vector with
 * shared metadata so retrieval can cite its source record.
 */

/** Logical corpus selector → Vectorize binding. */
export type RagCorpus = "emails" | "docs" | "general";

/** Metadata stored alongside each vector for citation + filtering. */
export interface RagMetadata {
  /** Source record id (e.g. messageId, docId). */
  sourceId: string;
  account: string;
  /** Chunk ordinal within the source record. */
  chunk: number;
  title?: string;
  url?: string;
  /** First ~200 chars of the chunk for quick display. */
  preview: string;
  [key: string]: string | number | boolean | undefined;
}

/** A single retrieval hit. */
export interface RagMatch {
  id: string;
  score: number;
  metadata: RagMetadata;
}

const MAX_CHARS_PER_CHUNK = 2000;

/** Resolve the Vectorize binding for a corpus. */
function indexFor(env: Env, corpus: RagCorpus): VectorizeIndex {
  switch (corpus) {
    case "emails":
      return env.VECTORIZE_EMAILS;
    case "docs":
      return env.VECTORIZE_DOCS;
    case "general":
      return env.VECTORIZE_GENERAL;
  }
}

/** Split text into ~2000-char chunks on paragraph boundaries where possible. */
export function chunkText(text: string, maxChars = MAX_CHARS_PER_CHUNK): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];

  const chunks: string[] = [];
  const paragraphs = clean.split(/\n{2,}/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChars && current) {
      chunks.push(current.trim());
      current = "";
    }
    if (para.length > maxChars) {
      // Hard-split an oversized paragraph.
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Embed an array of strings with Workers AI. Returns one vector per input. */
async function embed(env: Env, inputs: string[]): Promise<number[][]> {
  const model = env.DEFAULT_MODEL_EMBEDDING || "@cf/baai/bge-large-en-v1.5";
  const result = (await env.AI.run(model as keyof AiModels, { text: inputs })) as {
    data: number[][];
  };
  return result.data;
}

/**
 * Ingest a source record into a corpus: chunk → embed → upsert vectors.
 *
 * @returns the vector ids written
 */
export async function ingestDocument(
  env: Env,
  corpus: RagCorpus,
  source: { id: string; account: string; title?: string; url?: string; text: string },
): Promise<string[]> {
  const chunks = chunkText(source.text);
  if (chunks.length === 0) return [];

  const vectors = await embed(env, chunks);
  const records: VectorizeVector[] = vectors.map((values, i) => {
    // Vectorize metadata values may not be undefined — include keys conditionally.
    const metadata: Record<string, string | number | boolean> = {
      sourceId: source.id,
      account: source.account,
      chunk: i,
      preview: chunks[i].slice(0, 200),
    };
    if (source.title) metadata.title = source.title;
    if (source.url) metadata.url = source.url;
    return { id: `${source.id}:${i}`, values, metadata };
  });

  await indexFor(env, corpus).upsert(records);
  return records.map((r) => r.id);
}

/**
 * Query a corpus for the top-K most similar chunks to `query`.
 *
 * @param filter - optional Vectorize metadata filter (e.g. `{ account: "workspace" }`)
 */
export async function queryCorpus(
  env: Env,
  corpus: RagCorpus,
  query: string,
  topK = 5,
  filter?: Record<string, string>,
): Promise<RagMatch[]> {
  const [vector] = await embed(env, [query]);
  const result = await indexFor(env, corpus).query(vector, {
    topK,
    returnMetadata: "all",
    filter,
  });
  return result.matches.map((m) => ({
    id: m.id,
    score: m.score,
    metadata: m.metadata as unknown as RagMetadata,
  }));
}

/**
 * Build a RAG context block (for prompt injection) from the top matches.
 * Returns a newline-joined, source-cited string ready to drop into a prompt.
 */
export async function buildRagContext(
  env: Env,
  corpus: RagCorpus,
  query: string,
  topK = 5,
): Promise<string> {
  const matches = await queryCorpus(env, corpus, query, topK);
  if (matches.length === 0) return "";
  return matches
    .map((m) => {
      const cite = m.metadata.title || m.metadata.url || m.metadata.sourceId;
      return `[${cite}]\n${m.metadata.preview}`;
    })
    .join("\n\n---\n\n");
}

/** Remove all vectors for a source record (all chunks) from a corpus. */
export async function deleteDocument(
  env: Env,
  corpus: RagCorpus,
  sourceId: string,
  maxChunks = 64,
): Promise<void> {
  const ids = Array.from({ length: maxChunks }, (_, i) => `${sourceId}:${i}`);
  await indexFor(env, corpus).deleteByIds(ids);
}
