/**
 * @fileoverview Google service-account (Domain-Wide Delegation) auth for the
 * ported `google/` client layer.
 *
 * Ported from core-gsuite-tools. The original file minted its own RS256 JWT
 * over Web Crypto and exchanged it directly at Google's token endpoint. This
 * worker already has that exact signer in `src/backend/mcp/dwd.ts`
 * (`getDwdAccessToken`, using `jose`) for the stateless `/mcp` DWD path, so
 * rather than duplicate a second SA-JWT signer, {@link getServiceAccountAccessToken}
 * is now a thin bridge onto it (see the Phase 1 port plan's "DWD bridge"
 * reconciliation decision).
 *
 * NOTE: `mcp/dwd.ts`'s `getDwdAccessToken` always requests the fixed
 * `API_SCOPE_STRING` from `src/backend/mcp/scopes.ts` (a superset covering
 * drive/documents/spreadsheets/presentations/calendar/gmail.modify/
 * script.projects/script.processes/forms/contacts/directory.readonly) rather
 * than the narrower per-call `scopes` argument below — so the `scopes`
 * parameter here is accepted for interface compatibility with the ported
 * `google/*` clients but not forwarded. Every scope those clients request is a
 * subset of `API_SCOPE_STRING`, so no functionality is lost; this also means
 * DWD tokens are cached per-impersonated-user rather than per-(user, scopes)
 * tuple, which is coarser but still correct.
 */

import { getDwdAccessToken } from "@/backend/mcp/dwd";
import { getGoogleUserToImpersonate } from "@/backend/utils/secrets";

/**
 * Canonical Google API OAuth scopes used across every Workspace surface.
 * DWD authorizes these in the Workspace Admin console; the OAuth consent
 * screen requests the same set for the personal account.
 */
export const GoogleScope = {
  Docs: "https://www.googleapis.com/auth/documents",
  Sheets: "https://www.googleapis.com/auth/spreadsheets",
  Slides: "https://www.googleapis.com/auth/presentations",
  Drive: "https://www.googleapis.com/auth/drive",
  Gmail: "https://www.googleapis.com/auth/gmail.modify",
  GmailSend: "https://www.googleapis.com/auth/gmail.send",
  GmailSettings: "https://www.googleapis.com/auth/gmail.settings.basic",
  Calendar: "https://www.googleapis.com/auth/calendar",
  ScriptProjects: "https://www.googleapis.com/auth/script.projects",
  ScriptDeployments: "https://www.googleapis.com/auth/script.deployments",
  UserinfoEmail: "https://www.googleapis.com/auth/userinfo.email",
} as const;

/** Every scope — used for the broadest token / one-time OAuth consent. */
export const ALL_GOOGLE_SCOPES: string[] = Object.values(GoogleScope);

/**
 * Get a DWD access token impersonating `sub` (defaults to
 * `GOOGLE_USER_TO_IMPERSONATE`), bridged onto `mcp/dwd.ts`'s `getDwdAccessToken`
 * (KV-cached there, keyed per impersonated user).
 *
 * @param env - Worker env (needs `GOOGLE_CREDS_SA_*` secret-store bindings)
 * @param scopes - Accepted for interface compatibility; see file-level note —
 *   not forwarded, since the bridged signer always requests the fixed
 *   `API_SCOPE_STRING` (a superset of every scope callers pass here).
 * @param sub - Workspace user to impersonate; defaults to the configured primary
 * @returns A bearer access token string
 * @throws If the token exchange fails or required secrets are missing
 */
export async function getServiceAccountAccessToken(
  env: Env,
  scopes: string[],
  sub?: string,
): Promise<string> {
  void scopes;
  const impersonate = sub ?? (await getGoogleUserToImpersonate(env));
  return getDwdAccessToken(env, impersonate);
}
