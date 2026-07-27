/**
 * @fileoverview AuthGate — blocking login modal for the ported chat/tasks
 * surfaces (mounted per-page — `chat.astro`, `agent-tasks/*.astro`,
 * `accounts.astro`, `health.astro` — NOT globally in `BaseLayout`, which this
 * port does not touch).
 *
 * These pages are gated behind the `WORKER_API_KEY`. Since this page-level
 * gate has no SSR-verified `authed` prop wired up (that would require editing
 * the shared `BaseLayout`), callers always pass `authed={false}`; the modal's
 * own re-check against `GET /api/agent-session/session` — the server-side
 * source of truth — resolves it client-side before ever flashing the modal
 * for an already-logged-in browser.
 *
 * On success it POSTs the key to `/api/agent-session/login` (which sets the
 * signed `gsuite_session` cookie the `/agents/*` Durable Object gate accepts)
 * then reloads.
 */

"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Gate phase: still confirming with the server / authed / needs the modal. */
type Phase = "checking" | "authed" | "locked";

export function AuthGate({ authed }: { authed: boolean }) {
  // If SSR already verified the cookie, we're done — never flash the modal.
  const [phase, setPhase] = React.useState<Phase>(authed ? "authed" : "checking");
  const [key, setKey] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // SSR said not-authed: re-confirm against the server before locking the UI.
  // Covers the case where a valid cookie exists but the SSR render didn't reflect
  // it, so a logged-in user is never re-prompted on navigation.
  React.useEffect(() => {
    if (authed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent-session/session", {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { authed?: boolean };
          if (cancelled) return; // unmounted while parsing — don't set state
          setPhase(data.authed ? "authed" : "locked");
          return;
        }
        setPhase("locked");
      } catch {
        if (!cancelled) setPhase("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  // Authenticated (SSR or client re-check) — render nothing.
  if (phase === "authed") return null;
  // Still confirming — render nothing (no modal flash). The page underneath is
  // already gated server-side for any sensitive data, so a brief blank gate is safe.
  if (phase === "checking") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: key.trim() }),
      });
      if (res.ok) {
        // SSR will pick up the cookie and emit the session token on reload.
        window.location.reload();
        return;
      }
      if (res.status === 401) {
        setError("That key was not accepted. Check the value and try again.");
      } else {
        setError(`Login failed (${res.status}). Please try again.`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="authgate-title"
    >
      <div className="mx-4 w-full max-w-sm rounded-xl bg-card p-6 shadow-2xl ring-1 ring-border/40">
        <div className="mb-1 text-lg font-semibold tracking-tight" id="authgate-title">
          Unlock Workspace Hub
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Enter the worker API key to access this app.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Worker API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            disabled={submitting}
            aria-label="Worker API key"
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={submitting || !key.trim()}>
            {submitting ? "Verifying…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
