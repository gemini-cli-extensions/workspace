/**
 * Semantic search over captured Gmail (labels set to captureMode=vectorize).
 * Posts to /api/gmail/search and renders ranked message hits.
 */
import { useState } from "react";

interface Hit {
  messageId: string;
  threadId: string;
  account: string;
  score: number;
  subject: string | null;
  snippet: string | null;
  from: string | null;
  preview: string;
}

export function GmailSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/gmail/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as { hits?: Hit[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setHits(data.hits ?? []);
      setRan(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <form onSubmit={run} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search captured mail…"
          className="flex-1 rounded-md border border-white/15 bg-transparent px-3 py-2 outline-none focus:border-white/40"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-white/15 px-4 py-2 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      <ul className="mt-5 space-y-3">
        {hits.map((h) => (
          <li key={h.messageId} className="rounded-md border border-white/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{h.subject || "(no subject)"}</span>
              <span className="shrink-0 text-xs opacity-60">{Math.round(h.score * 100)}%</span>
            </div>
            <div className="mt-0.5 text-xs opacity-60">
              {h.from || "unknown sender"} · {h.account}
            </div>
            <p className="mt-1.5 text-sm opacity-80">{h.preview || h.snippet}</p>
          </li>
        ))}
        {ran && !loading && !err && hits.length === 0 && (
          <li className="text-sm opacity-60">No matches. Only labels set to captureMode=vectorize are searchable.</li>
        )}
      </ul>
    </div>
  );
}
