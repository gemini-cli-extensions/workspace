/**
 * @fileoverview AccountsManager — the /accounts management island.
 *
 * Lists authorized Google accounts (GET /api/accounts), lets the user add a new
 * account via the OAuth start flow (popup), set the default account, and remove
 * an account behind a shadcn AlertDialog confirm (NEVER window.confirm).
 *
 * Auth: every API call sends `Authorization: Bearer <token>` from
 * `lib/session.ts` (harmless no-op if absent — see `src/backend/api/index.ts`
 * for why these are open feature APIs). All failures route through
 * `logError` / `fetchJson`. No mock data — the list is always live.
 *
 * Wire contract:
 *   GET    /api/accounts                  -> { data: GoogleAccount[] }
 *   GET    /api/auth/google/oauth/start?label=
 *   POST   /api/accounts/:email/default
 *   DELETE /api/accounts/:email
 * On OAuth return the popup lands on /accounts?added=<email>.
 */

"use client";

import {
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchJson, logError } from "@/lib/error-log";
import { getSessionToken } from "@/lib/session";
import { cn } from "@/lib/utils";

/** A single authorized Google account, per the backend wire contract. */
export type GoogleAccount = {
  email: string;
  kind: "workspace_dwd" | "oauth";
  label?: string | null;
  isDefault: boolean;
  status: string;
};

// The API returns the list under `data` (the standard envelope used across the
// REST surface). Accept `accounts` too for forward-compat.
type AccountsResponse = { data?: GoogleAccount[]; accounts?: GoogleAccount[] };

/** Build auth headers from the session token (Bearer). */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const { token } = getSessionToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function kindBadge(kind: GoogleAccount["kind"]) {
  if (kind === "workspace_dwd") {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="size-3" />
        Workspace (DWD)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      OAuth
    </Badge>
  );
}

function statusBadge(status: string) {
  const ok = /^(active|authorized|ready|connected)$/i.test(status);
  return (
    <Badge
      variant={ok ? "secondary" : "destructive"}
      className={cn("capitalize", ok && "text-foreground")}
    >
      {status}
    </Badge>
  );
}

export function AccountsManager() {
  const [accounts, setAccounts] = React.useState<GoogleAccount[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errored, setErrored] = React.useState(false);
  const [busyEmail, setBusyEmail] = React.useState<string | null>(null);
  const [newLabel, setNewLabel] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<GoogleAccount | null>(null);

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErrored(false);
    try {
      const data = await fetchJson<AccountsResponse>(
        "/api/accounts",
        { headers: authHeaders() },
        { source: "AccountsManager.load", friendly: "Could not load your Google accounts." },
      );
      const list = data.data ?? data.accounts ?? [];
      setAccounts(Array.isArray(list) ? list : []);
    } catch {
      // fetchJson already logged to the global ErrorLogger.
      setErrored(true);
      setAccounts(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + handle the OAuth return (?added=<email>).
  React.useEffect(() => {
    void load();

    try {
      const params = new URLSearchParams(window.location.search);
      const added = params.get("added");
      if (added) {
        showToast(`Connected ${added}.`);
        // Strip the query param so a refresh doesn't re-toast.
        params.delete("added");
        const qs = params.toString();
        window.history.replaceState(
          {},
          "",
          window.location.pathname + (qs ? `?${qs}` : ""),
        );
      }
    } catch {
      /* ignore */
    }
  }, [load, showToast]);

  const handleAdd = React.useCallback(() => {
    const label = newLabel.trim();
    const url = `/api/auth/google/oauth/start${label ? `?label=${encodeURIComponent(label)}` : ""}`;
    // Open consent in a popup; the backend redirects back to /accounts?added=<email>.
    const popup = window.open(url, "google-oauth", "width=520,height=680,noopener");
    if (!popup) {
      // Popup blocked — fall back to a full navigation in a new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setNewLabel("");
    // Re-check the list when focus returns from the popup.
    const onFocus = () => {
      void load();
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus);
  }, [newLabel, load]);

  const handleSetDefault = React.useCallback(
    async (account: GoogleAccount) => {
      if (account.isDefault) return;
      setBusyEmail(account.email);
      try {
        await fetchJson(
          `/api/accounts/${encodeURIComponent(account.email)}/default`,
          { method: "POST", headers: authHeaders() },
          {
            source: "AccountsManager.setDefault",
            friendly: `Could not set ${account.email} as the default account.`,
          },
        );
        showToast(`${account.email} is now the default account.`);
        await load();
      } catch {
        /* logged by fetchJson */
      } finally {
        setBusyEmail(null);
      }
    },
    [load, showToast],
  );

  const handleRemove = React.useCallback(
    async (account: GoogleAccount) => {
      setBusyEmail(account.email);
      try {
        await fetchJson(
          `/api/accounts/${encodeURIComponent(account.email)}`,
          { method: "DELETE", headers: authHeaders() },
          {
            source: "AccountsManager.remove",
            friendly: `Could not remove ${account.email}.`,
          },
        );
        showToast(`Removed ${account.email}.`);
        setRemoveTarget(null);
        await load();
      } catch {
        /* logged by fetchJson */
      } finally {
        setBusyEmail(null);
      }
    },
    [load, showToast],
  );

  const isEmpty = !loading && !errored && accounts !== null && accounts.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Users className="size-6" />
            Google Accounts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorized accounts the agents can act on. Add consumer accounts via OAuth; Workspace
            accounts use Domain-Wide Delegation.{" "}
            <a
              href="/docs/google-config"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              Learn more
            </a>
            .
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh accounts"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Add account */}
      <Card>
        <CardHeader>
          <CardTitle>Add a Google account</CardTitle>
          <CardDescription>
            Opens Google consent in a popup. On return, the account appears below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Optional label (e.g. Personal Gmail)"
              className="sm:max-w-xs"
              aria-label="Optional account label"
            />
            <Button onClick={handleAdd}>
              <Plus className="size-4" />
              Add Google account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Toast (lightweight inline success banner — no external toast lib) */}
      {toast ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm text-foreground ring-1 ring-border/40"
        >
          <CheckCircle2 className="size-4 text-primary" />
          <span>{toast}</span>
        </div>
      ) : null}

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl bg-card ring-1 ring-border/40"
              />
            ))}
          </div>
        ) : null}

        {errored ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-6">
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your accounts. The error has been logged.
              </p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                <RefreshCw className="size-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {isEmpty ? <EmptyState onAdd={handleAdd} /> : null}

        {!loading && !errored && accounts
          ? accounts.map((account) => (
              <Card key={account.email} size="sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {account.email}
                      </span>
                      {account.isDefault ? (
                        <Badge className="gap-1">
                          <Star className="size-3" />
                          Default
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {kindBadge(account.kind)}
                      {statusBadge(account.status)}
                      {account.label ? (
                        <span className="text-xs text-muted-foreground">{account.label}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={account.isDefault || busyEmail === account.email}
                      onClick={() => void handleSetDefault(account)}
                    >
                      <Star className="size-4" />
                      Set default
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      disabled={busyEmail === account.email}
                      onClick={() => setRemoveTarget(account)}
                      aria-label={`Remove ${account.email}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          : null}
      </div>

      {/* Remove confirm — shadcn AlertDialog, NEVER window.confirm */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget
                ? `The agents will no longer be able to act on ${removeTarget.email}. ` +
                  (removeTarget.kind === "oauth"
                    ? "Its stored OAuth token will be deleted; you can re-add it later by consenting again."
                    : "You can re-add it later.")
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyEmail !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyEmail !== null}
              onClick={() => {
                if (removeTarget) void handleRemove(removeTarget);
              }}
            >
              <Trash2 className="size-4" />
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Users className="size-6 text-muted-foreground" />
        </div>
        <div className="max-w-md space-y-2">
          <p className="font-medium text-foreground">No Google accounts yet</p>
          <p className="text-sm text-muted-foreground">
            Authorize an account so the agents can read and act on your Workspace. There are two kinds:
          </p>
          <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Workspace (DWD)</strong> — a service account with
              Domain-Wide Delegation impersonates a Workspace user. No interactive consent.
            </li>
            <li>
              <strong className="text-foreground">OAuth</strong> — a consumer Google account grants
              access through the standard consent screen. Required for <code>@gmail.com</code> accounts.
            </li>
          </ul>
        </div>
        <Button onClick={onAdd}>
          <Plus className="size-4" />
          Add Google account
        </Button>
      </CardContent>
    </Card>
  );
}
