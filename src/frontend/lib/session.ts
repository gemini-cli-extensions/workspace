/**
 * @fileoverview Client session token source for agent connections.
 *
 * The signed session token (`exp.signature`, minted by
 * `POST /api/agent-session/login`) is resolved in priority order:
 *   1. The SSR-injected `<meta name="session-token">` tag, if a layout ever
 *      emits one (this Worker's `BaseLayout` does not — see below).
 *   2. The `gsuite_session` cookie read directly from `document.cookie` — the
 *      cookie is intentionally NOT HttpOnly, so the client can recover the
 *      token even without an SSR-emitted meta tag. This keeps the agent
 *      WebSocket authenticated without a re-prompt.
 *
 * The token is forwarded to the Cloudflare Agent on connect via
 * `useAgent({ query: { token } })`. The backend DO validates it (see
 * `isAuthorizedAgentRequest` in `src/_worker.ts`), which also accepts the
 * `gsuite_session` cookie directly (same-origin WS requests carry it
 * automatically) — so the meta-tag path above is optional, not required.
 *
 * TODO(auth): the token is still a shared-key-derived session, not a per-user
 * identity; scoping the agent instance `name` to a real user remains follow-up.
 */

const SESSION_KEY = "gsuite-hub:session";

/** Cookie name holding the signed session token (mirrors backend SESSION_COOKIE). */
const SESSION_COOKIE = "gsuite_session";

/**
 * Read the `gsuite_session` token directly from `document.cookie`.
 * Fallback for when the SSR meta tag is absent. Returns null when unavailable.
 */
function readSessionCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export type ClientSession = {
  /** Auth token forwarded to the agent. Placeholder until real auth lands. */
  token: string | null;
  /** Stable per-browser chat instance id (history continuity for the landing chat). */
  chatId: string;
};

let cached: ClientSession | null = null;

/**
 * Read the session token from a server-injected meta tag if present, else fall
 * back to the (non-HttpOnly) `gsuite_session` cookie, plus a stable
 * per-browser id stored in localStorage.
 */
export function getSessionToken(): ClientSession {
  if (cached) return cached;

  let token: string | null = null;
  if (typeof document !== "undefined") {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="session-token"]');
    token = meta?.content?.trim() || null;
    // Fall back to the (non-HttpOnly) cookie when SSR didn't emit the meta tag.
    if (!token) token = readSessionCookie();
  }

  let chatId = "";
  try {
    chatId = localStorage.getItem(SESSION_KEY) || "";
    if (!chatId) {
      chatId = `anon-${crypto.randomUUID()}`;
      localStorage.setItem(SESSION_KEY, chatId);
    }
  } catch {
    chatId = `anon-${Math.random().toString(36).slice(2)}`;
  }

  cached = { token, chatId };
  return cached;
}
