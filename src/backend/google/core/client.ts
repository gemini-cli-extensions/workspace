/**
 * @fileoverview Account-aware Google REST fetch helper — the shared base every
 * surface client (docs/sheets/slides/drive/gmail/calendar/appscript) builds on.
 *
 * `GoogleApiClient` resolves a bearer access token for the selected
 * {@link GoogleAccount} (workspace via DWD, or personal via OAuth2) and issues
 * authenticated JSON requests against any Google API host. It centralizes auth,
 * JSON encode/decode, query-param handling, and error surfacing so individual
 * clients stay declarative.
 *
 * No Node `googleapis` — pure `fetch` + Web Crypto, Workers-compatible.
 */

import { getGoogleAccessToken, type GoogleAccount } from "@/backend/auth/provider";

/** Options for a single Google API request. */
export interface GoogleRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Query parameters appended to the URL (undefined values are skipped). */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body (serialized automatically). Mutually exclusive with `raw`. */
  body?: unknown;
  /** Raw body for non-JSON requests (e.g. multipart, media upload). */
  raw?: BodyInit;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  /** OAuth scopes this request needs (token is requested for these). */
  scopes: string[];
  /** Expect a non-JSON (binary/text) response; returns the raw Response. */
  rawResponse?: boolean;
}

/**
 * Base client for a Google API surface bound to one account.
 *
 * @example
 * ```ts
 * class GoogleDocsClient extends GoogleApiClient {
 *   read(id: string) {
 *     return this.request(`https://docs.googleapis.com/v1/documents/${id}`, {
 *       scopes: [GoogleScope.Docs],
 *     });
 *   }
 * }
 * ```
 */
export class GoogleApiClient {
  constructor(
    protected readonly env: Env,
    /** Account this client instance operates as. */
    public readonly account: GoogleAccount = "workspace",
  ) {}

  /**
   * Issue an authenticated request and parse the JSON response.
   *
   * @typeParam T - expected response shape
   * @throws Error with the Google error body when the response is not ok
   */
  async request<T = unknown>(url: string, options: GoogleRequestOptions): Promise<T> {
    const token = await getGoogleAccessToken(this.env, this.account, options.scopes);

    const finalUrl = options.query ? appendQuery(url, options.query) : url;
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      ...options.headers,
    };

    let body: BodyInit | undefined;
    if (options.raw !== undefined) {
      body = options.raw;
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["content-type"] = headers["content-type"] ?? "application/json";
    }

    const response = await fetch(finalUrl, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Google API ${options.method ?? "GET"} ${finalUrl} failed: ${response.status} ${text}`,
      );
    }

    if (options.rawResponse) {
      return response as unknown as T;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  }
}

/** Append a query object to a URL, skipping undefined values. */
function appendQuery(
  url: string,
  query: Record<string, string | number | boolean | undefined>,
): string {
  const u = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      u.searchParams.set(key, String(value));
    }
  }
  return u.toString();
}
