/**
 * @fileoverview Inbox — the two-pane Email Routing showcase island.
 *
 * LEFT pane: view switcher (Inbox / Starred / Archive), search box, and the
 * message list. RIGHT pane: the full reading view of the selected message.
 *
 * Data comes exclusively from the real Hono API (`/api/inbox`) via `@/lib/api`
 * — every row is an email stored by the Worker `email()` handler. On first load,
 * if the inbox is empty, we offer a clearly-labeled "Load demo data" action that
 * seeds ~12 realistic emails (`POST /api/inbox/seed`) so the showcase is alive
 * before any live mail arrives.
 *
 * Responsive behavior: on desktop (md+) both panes are visible side-by-side. On
 * mobile only one pane shows at a time — selecting a message swaps to the
 * reading pane, and a Back button returns to the list.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MailIcon, SearchIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { EmptyState, ErrorState } from "./states";
import { FolderNav } from "./FolderNav";
import { MessageList } from "./MessageList";
import { MessageView } from "./MessageView";
import type { EmailFolder, EmailMessage, InboxEnvelope, InboxView, SeedResponse } from "./types";
import { viewToQuery } from "./types";

const VIEW_TITLES: Record<InboxView, string> = {
  inbox: "Inbox",
  starred: "Starred",
  archive: "Archive",
};

export function Inbox() {
  const [view, setView] = useState<InboxView>("inbox");
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // Mobile: which pane is visible. Desktop shows both via CSS regardless.
  const [mobilePane, setMobilePane] = useState<"list" | "reading">("list");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<InboxEnvelope>("inbox", {
        ...viewToQuery(view),
        q: debouncedQ || undefined,
        limit: 100,
      });
      if (id !== reqId.current) return;
      setMessages(res.data);
      setUnread(res.unread);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(e instanceof ApiError ? e.message : "Failed to load mailbox.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [view, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = messages.find((m) => m.id === selectedId) ?? null;

  // --- Selection + mark-as-read ---------------------------------------------
  const handleSelect = useCallback(
    async (msg: EmailMessage) => {
      setSelectedId(msg.id);
      setMobilePane("reading");
      if (msg.read) return;
      // Optimistically mark read + decrement the inbox unread badge.
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m)));
      if (msg.folder === "inbox") setUnread((u) => Math.max(0, u - 1));
      try {
        await apiSend<EmailMessage>("PATCH", `inbox/${msg.id}`, { read: true });
      } catch {
        // Non-fatal: revert the read flag, leave the badge optimistic-safe.
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read: false } : m)));
        if (msg.folder === "inbox") setUnread((u) => u + 1);
      }
    },
    [],
  );

  // --- Star toggle (optimistic) ---------------------------------------------
  const toggleStar = useCallback(
    async (msg: EmailMessage) => {
      const next = !msg.starred;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, starred: next } : m)),
      );
      try {
        await apiSend<EmailMessage>("PATCH", `inbox/${msg.id}`, { starred: next });
        // In the Starred view, un-starring removes the row.
        if (view === "starred" && !next) {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          if (selectedId === msg.id) setSelectedId(null);
        }
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, starred: msg.starred } : m)),
        );
        setError(e instanceof ApiError ? e.message : "Failed to update star.");
      }
    },
    [view, selectedId],
  );

  // --- Move folder (archive / back to inbox) --------------------------------
  const moveFolder = useCallback(
    async (msg: EmailMessage, folder: EmailFolder) => {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (selectedId === msg.id) {
        setSelectedId(null);
        setMobilePane("list");
      }
      try {
        await apiSend<EmailMessage>("PATCH", `inbox/${msg.id}`, { folder });
        void load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to move message.");
        void load();
      }
    },
    [selectedId, load],
  );

  // --- Seed demo data -------------------------------------------------------
  const seed = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      await apiSend<SeedResponse>("POST", "inbox/seed");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load demo data.");
    } finally {
      setSeeding(false);
    }
  }, [load]);

  const isEmpty = !loading && messages.length === 0;
  const showSeed = isEmpty && view === "inbox" && !debouncedQ;

  return (
    <div className="flex h-[calc(100svh-var(--header-height)-2rem)] min-h-[32rem] flex-col gap-4">
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl bg-card ring-1 ring-border/40 md:grid-cols-[16rem_minmax(20rem,24rem)_1fr]">
        {/* Sidebar (desktop only) */}
        <aside className="hidden flex-col gap-4 border-r border-border/40 p-4 md:flex">
          <FolderNav active={view} unread={unread} onChange={switchView(setView, setSelectedId, setMobilePane)} />
        </aside>

        {/* List pane */}
        <section
          className={cn(
            "min-h-0 flex-col border-border/40 md:flex md:border-r",
            mobilePane === "list" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{VIEW_TITLES[view]}</h2>
              <span className="text-xs text-muted-foreground">
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </span>
            </div>
            {/* Mobile view switcher */}
            <div className="md:hidden">
              <FolderNav
                active={view}
                unread={unread}
                orientation="segmented"
                onChange={switchView(setView, setSelectedId, setMobilePane)}
              />
            </div>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search mail…"
                className="pl-8"
                aria-label="Search mail"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {isEmpty ? (
              <div className="p-4">
                <EmptyState
                  icon={<MailIcon />}
                  title={debouncedQ ? "No matching mail" : `No mail in ${VIEW_TITLES[view]}`}
                  description={
                    showSeed
                      ? "This inbox is wired to Cloudflare Email Routing. Load demo data to explore the showcase, or send a real email to a routed address."
                      : debouncedQ
                        ? "Try a different search term."
                        : "Messages you receive will appear here."
                  }
                  action={
                    showSeed ? (
                      <Button onClick={seed} disabled={seeding}>
                        <SparklesIcon className="size-4" />
                        {seeding ? "Loading…" : "Load demo data"}
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <MessageList
                messages={messages}
                selectedId={selectedId}
                loading={loading}
                onSelect={handleSelect}
                onToggleStar={toggleStar}
              />
            )}
          </div>
        </section>

        {/* Reading pane */}
        <section
          className={cn(
            "min-h-0 flex-col md:flex",
            mobilePane === "reading" ? "flex" : "hidden md:flex",
          )}
        >
          <MessageView
            message={selected}
            onBack={() => setMobilePane("list")}
            onToggleStar={toggleStar}
            onArchive={(m) => moveFolder(m, "archive")}
            onMoveToInbox={(m) => moveFolder(m, "inbox")}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * Build a view-change handler that also clears the current selection and
 * returns the mobile UI to the list pane.
 */
function switchView(
  setView: (v: InboxView) => void,
  setSelectedId: (id: string | null) => void,
  setMobilePane: (p: "list" | "reading") => void,
) {
  return (next: InboxView) => {
    setView(next);
    setSelectedId(null);
    setMobilePane("list");
  };
}
