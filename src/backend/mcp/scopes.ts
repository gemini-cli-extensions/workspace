/**
 * OAuth / DWD scopes for the Google Workspace MCP server.
 *
 * SCOPES / SCOPE_STRING — interactive OAuth scopes (include OIDC identity
 * scopes so we can read the signed-in user's sub/email).
 * API_SCOPES / API_SCOPE_STRING — Google API scopes for Domain-Wide Delegation
 * JWTs (no OIDC identity scopes; DWD impersonates a known user directly).
 */

// Google Workspace API scopes the tools call.
export const API_SCOPES: string[] = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/script.projects",
  "https://www.googleapis.com/auth/script.processes",
];

// Interactive OAuth scopes = identity + the API scopes above.
export const SCOPES: string[] = ["openid", "email", "profile", ...API_SCOPES];
export const SCOPE_STRING = SCOPES.join(" ");

/** Space-delimited API scopes for DWD service-account JWTs. */
export const API_SCOPE_STRING = API_SCOPES.join(" ");
