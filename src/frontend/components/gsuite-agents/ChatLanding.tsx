/**
 * @fileoverview ChatLanding — the single chat surface for the ported gsuite
 * agent platform, bound to the `OrchestratorAgent` Durable Object (Phase 2).
 *
 * One assistant-ui chat bound to the single orchestrator, with a D1-backed
 * thread sidebar (`/api/threads`, ported in Phase 3). There is NO agent
 * picker: the orchestrator already exposes every Workspace tool (gmail_/docs_/
 * sheets_/slides_/drive_/appscript_/calendar_*), so one thread chains across
 * surfaces.
 *
 * Unlike `core-gsuite-tools`'s SRC (which ports its own `components/
 * assistant-ui/thread.tsx` primitive set), this reuses THIS Worker's existing
 * `@/components/assistant/Thread` (`Thread`/`ThreadProvider`) — the same
 * assistant-ui wiring pattern its own (currently orphaned) `AgentChat.tsx`
 * already uses for the `ChatBroker` demo agent, just pointed at the
 * orchestrator instead. This avoids introducing a second, differently-versioned
 * assistant-ui primitive set alongside the one already installed.
 *
 * Each thread renders a single `<ThreadProvider>` keyed by the thread's stable
 * `key` (the orchestrator DO instance name), so:
 *   - switching threads remounts the pane once and connects the right DO;
 *   - staying on a thread keeps a stable connection (no reconnect storm);
 *   - the DO mirrors history to D1 under the same key.
 *
 * MUST be mounted `client:only="react"` — `useAgent` cannot be server-rendered.
 */

"use client";

import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { Loader2Icon, MenuIcon, PlusIcon, Trash2Icon } from "lucide-react";
import * as React from "react";

import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ORCHESTRATOR } from "@/lib/agents";
import { getSessionToken } from "@/lib/session";
import {
  createThread,
  deleteThread as deleteThreadApi,
  listThreads,
  type ThreadRow,
} from "@/lib/threads-api";
import { cn } from "@/lib/utils";

/** Map PartySocket `readyState` (0=CONNECTING, 1=OPEN, 2/3=CLOSING/CLOSED). */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/**
 * The chat transcript + composer for a single thread. Connects the
 * orchestrator DO at the thread's stable `key`. Always mounted with a
 * `key={threadKey}` so a thread switch is a clean remount.
 */
function ChatPane({ threadKey }: { threadKey: string }) {
  // Synchronous so the FIRST WebSocket connect carries the token (if any).
  const [token] = React.useState<string | null>(() => getSessionToken().token);

  const agent = useAgent({
    agent: ORCHESTRATOR.connectionSlug,
    name: threadKey,
    query: token ? { token } : undefined,
    queryDeps: [token],
  });

  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  return <ThreadProvider runtime={runtime} status={status} />;
}

/** A single row in the thread sidebar. */
function ThreadRowItem({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ThreadRow;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left"
        title={thread.title}
      >
        {thread.title || "Untitled"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete thread"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
}

/** The thread sidebar: new-chat button + the D1-backed thread list. */
function Sidebar({
  threads,
  activeKey,
  onSelect,
  onNew,
  onDelete,
  creating,
}: {
  threads: ThreadRow[];
  activeKey: string | null;
  onSelect: (t: ThreadRow) => void;
  onNew: () => void;
  onDelete: (t: ThreadRow) => void;
  creating: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-card p-3">
      <Button size="sm" className="w-full justify-start gap-2" onClick={onNew} disabled={creating}>
        {creating ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
        New chat
      </Button>
      <div className="px-1 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Threads
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No threads yet.</p>
        ) : (
          threads.map((t) => (
            <ThreadRowItem
              key={t.key}
              thread={t}
              active={t.key === activeKey}
              onSelect={() => onSelect(t)}
              onDelete={() => onDelete(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Authenticated workspace: loads the thread list, ensures an active thread, and
 * renders the sidebar + the active thread's chat pane. Only mounted once a
 * session is present (see {@link ChatLanding} and the page's `<AuthGate>`).
 */
function ChatWorkspace() {
  const [threads, setThreads] = React.useState<ThreadRow[]>([]);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Initial load: fetch threads; create the first one if none exist.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let rows = await listThreads();
        if (!cancelled && rows.length === 0) {
          const created = await createThread();
          rows = [created];
        }
        if (cancelled) return;
        setThreads(rows);
        setActiveKey((prev) => prev ?? rows[0]?.key ?? null);
      } catch {
        // listThreads/createThread already logged via logError.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNew = React.useCallback(async () => {
    setCreating(true);
    try {
      const created = await createThread();
      setThreads((prev) => [created, ...prev]);
      setActiveKey(created.key);
      setMobileOpen(false);
    } catch {
      /* logged */
    } finally {
      setCreating(false);
    }
  }, []);

  const handleSelect = React.useCallback((t: ThreadRow) => {
    setActiveKey(t.key);
    setMobileOpen(false);
  }, []);

  const handleDelete = React.useCallback(
    async (t: ThreadRow) => {
      try {
        await deleteThreadApi(t.id);
      } catch {
        return; // logged; keep the row on failure
      }
      setThreads((prev) => prev.filter((x) => x.key !== t.key));
      setActiveKey((prev) => {
        if (prev !== t.key) return prev;
        const remaining = threads.filter((x) => x.key !== t.key);
        return remaining[0]?.key ?? null;
      });
    },
    [threads],
  );

  const sidebar = (
    <Sidebar
      threads={threads}
      activeKey={activeKey}
      onSelect={handleSelect}
      onNew={handleNew}
      onDelete={handleDelete}
      creating={creating}
    />
  );

  return (
    <div className="flex h-[calc(100svh-var(--header-height))] w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-72 shrink-0 ring-1 ring-border/40 lg:block">{sidebar}</aside>

      {/* Main chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-2 ring-1 ring-border/40">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "lg:hidden")}
                aria-label="Open threads"
              >
                <MenuIcon className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="px-3 pt-3 pb-0">
                  <SheetTitle className="text-sm">Threads</SheetTitle>
                </SheetHeader>
                <div className="h-[calc(100svh-3rem)]">{sidebar}</div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">Workspace Assistant</p>
              <p className="truncate text-xs text-muted-foreground">
                Gmail · Docs · Sheets · Slides · Drive · Calendar · Apps Script
              </p>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2Icon className="mr-2 size-4 animate-spin" /> Loading…
            </div>
          ) : activeKey ? (
            // `key` makes a thread switch a clean remount with a stable DO name.
            <ChatPane key={activeKey} threadKey={activeKey} />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Could not start a chat thread. Check your connection and reload.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatLanding() {
  return <ChatWorkspace />;
}
