/**
 * @fileoverview Unified Google access-token provider across a DYNAMIC set of
 * accounts.
 *
 * Historically this worker had a fixed two-account model
 * (`"workspace"` via DWD, `"personal"` via OAuth2). It is now a dynamic
 * multi-account registry: any number of Google accounts can be authorized via
 * OAuth, and the account selector is a free-form string (an email, or one of
 * the legacy aliases `"workspace"` / `"personal"`).
 *
 * {@link getGoogleAccessToken} is the single seam where account resolution
 * happens. Routing rules (in order):
 *
 *  1. `"workspace"` (default) → DWD impersonating `GOOGLE_USER_TO_IMPERSONATE`.
 *  2. `"personal"`            → resolves to `GOOGLE_PERSONAL_ACCOUNT_EMAIL`,
 *                               then falls through the email rules below.
 *  3. an email in the delegated Workspace domain (`@126colby.com`) with NO
 *     stored OAuth refresh token → DWD impersonating that email (`sub`).
 *  4. any other email → OAuth2 access token for that email.
 *
 * Clients and agents stay account-agnostic — they accept `account?: GoogleAccount`
 * (now `string`) and call {@link getGoogleAccessToken}.
 */

import { getServiceAccountAccessToken } from "@/backend/lib/google-auth";
import { getDb } from "@/backend/db";
import { getGoogleUserToImpersonate } from "@/backend/utils/secrets";
import { googleAccounts } from "@db/schemas";

import { getOAuthAccessToken, hasOAuthRefreshToken } from "./oauth-google";

/**
 * Which Google account a request targets.
 *
 * This is now a free-form string alias: an email address, or one of the legacy
 * aliases `"workspace"` / `"personal"`. The literal union is kept assignable so
 * existing call sites (`account = "workspace" | "personal"`) compile unchanged.
 */
export type GoogleAccount = string;

/** Default account when a caller does not specify one. */
export const DEFAULT_ACCOUNT: GoogleAccount = "workspace";

/** The Workspace domain reachable via Domain-Wide Delegation. */
const WORKSPACE_DOMAIN = "@126colby.com";

/**
 * Normalize loose account inputs (aliases, casing) to a canonical account
 * string. `"personal"` is resolved to the configured personal email; everything
 * else is lower-cased and trimmed. `"workspace"` is preserved as the synthetic
 * DWD-primary selector.
 *
 * @param env - Worker env
 * @param input - Optional raw account selector
 * @returns The normalized account string
 */
export function resolveAccount(env: Env, input?: string): GoogleAccount {
  if (!input) return DEFAULT_ACCOUNT;
  const v = input.trim().toLowerCase();
  if (!v || v === "workspace" || v === "justin") return "workspace";
  if (v === "personal" || v === "jmbish04") {
    return (env.GOOGLE_PERSONAL_ACCOUNT_EMAIL ?? "jmbish04@gmail.com").toLowerCase();
  }
  return v;
}

/**
 * Get a bearer access token for the chosen account + scopes.
 *
 * Routing:
 *  - Synthetic `"workspace"` selector, and Workspace-domain emails with no stored
 *    OAuth refresh token → Domain-Wide Delegation (DWD) impersonation.
 *  - Every other email → OAuth2 refresh-token flow.
 *
 * RESILIENCE: DWD can fail independently of OAuth — most commonly
 * `unauthorized_client` when a scope is not authorized for the service account in
 * the Google Workspace Admin console. When the DWD path fails we DO NOT take down
 * the request: if the SAME account also has a stored OAuth refresh token, we fall
 * back to OAuth for that exact email (same mailbox, different mechanism). When no
 * OAuth fallback exists we throw a clear, actionable error naming the account and
 * scopes — which the orchestrator can surface so the model retries against a
 * working account (e.g. `account: "personal"`). Either way, accounts that use OAuth
 * directly (e.g. a consumer Gmail) are never affected by a DWD failure: each call
 * resolves its own account independently.
 *
 * @param env - Worker env
 * @param account - Target account (defaults to `"workspace"`)
 * @param scopes - Google OAuth scopes to request
 * @returns A bearer access token string
 */
export async function getGoogleAccessToken(
  env: Env,
  account: GoogleAccount,
  scopes: string[],
): Promise<string> {
  const resolved = resolveAccount(env, account);

  // DWD path: the synthetic "workspace" selector, or a Workspace-domain email
  // that has no OAuth refresh token of its own.
  const usesDwd =
    resolved === "workspace" ||
    (resolved.endsWith(WORKSPACE_DOMAIN) && !(await hasOAuthRefreshToken(env, resolved)));

  if (usesDwd) {
    // The concrete email DWD impersonates: the configured primary for the
    // synthetic selector, otherwise the resolved domain email.
    const impersonated =
      resolved === "workspace" ? getGoogleUserToImpersonate(env).toLowerCase() : resolved;
    const sub = resolved === "workspace" ? undefined : resolved;

    try {
      return await getServiceAccountAccessToken(env, scopes, sub);
    } catch (dwdError) {
      // Same-account fallback: if this email is ALSO OAuth-authorized, use it.
      if (await hasOAuthRefreshToken(env, impersonated)) {
        return getOAuthAccessToken(env, impersonated, scopes);
      }
      const cause = dwdError instanceof Error ? dwdError.message : String(dwdError);
      throw new Error(
        `Domain-Wide Delegation failed for ${impersonated} (scopes: ${scopes.join(" ")}). ` +
          `Authorize these scopes for the service account in Google Workspace Admin → ` +
          `Domain-Wide Delegation, OR OAuth-authorize ${impersonated} at ` +
          `/api/auth/google/oauth/start, OR retry against a different account ` +
          `(e.g. account: "personal"). Cause: ${cause}`,
      );
    }
  }

  // OAuth access token for that email (unaffected by any DWD failure above).
  return getOAuthAccessToken(env, resolved, scopes);
}

/** Human-readable email for an account selector (for logging / display). */
export function accountEmail(env: Env, account: GoogleAccount): string {
  const resolved = resolveAccount(env, account);
  if (resolved === "workspace") {
    return env.GOOGLE_WORKSPACE_ACCOUNT_EMAIL ?? env.GOOGLE_USER_TO_IMPERSONATE;
  }
  return resolved;
}

/** A summary of one authorized account for listing / display. */
export interface AuthorizedAccount {
  /** Account email (or the synthetic `"workspace"` selector). */
  email: string;
  /** Auth mechanism. */
  kind: "workspace_dwd" | "oauth";
  /** Human-readable label. */
  label: string;
  /** Whether this is the default selection. */
  isDefault: boolean;
  /** Lifecycle status. */
  status: string;
  /** Granted scopes, if known. */
  scopes: string[] | null;
  /** When the account was authorized, ISO string or null. */
  authorizedAt: string | null;
}

/**
 * List the dynamic account registry from D1 plus the always-present synthetic
 * `workspace` (DWD primary) account.
 *
 * @param env - Worker env
 * @returns All authorized accounts, with `workspace` first.
 */
export async function listAuthorizedAccounts(env: Env): Promise<AuthorizedAccount[]> {
  const db = getDb(env);
  const rows = await db.select().from(googleAccounts);

  const hasExplicitDefault = rows.some((r) => r.isDefault && r.status === "active");

  const synthetic: AuthorizedAccount = {
    email: "workspace",
    kind: "workspace_dwd",
    label: `Workspace (DWD — ${env.GOOGLE_WORKSPACE_ACCOUNT_EMAIL ?? env.GOOGLE_USER_TO_IMPERSONATE})`,
    // Workspace is the default unless another account has explicitly claimed it.
    isDefault: !hasExplicitDefault,
    status: "active",
    scopes: null,
    authorizedAt: null,
  };

  const dynamic: AuthorizedAccount[] = rows.map((r) => ({
    email: r.email,
    kind: r.kind === "workspace_dwd" ? "workspace_dwd" : "oauth",
    label: r.label,
    isDefault: Boolean(r.isDefault),
    status: r.status,
    scopes: Array.isArray(r.scopesJson) ? (r.scopesJson as string[]) : null,
    authorizedAt: r.authorizedAt ? r.authorizedAt.toISOString() : null,
  }));

  return [synthetic, ...dynamic];
}
