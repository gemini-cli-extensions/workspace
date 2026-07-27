/**
 * @fileoverview Global frontend error bus for the ported chat/tasks surfaces.
 *
 * Provides `logError(...)` — the entry point these components use instead of
 * `window.alert` / silent catches. Errors are always logged to the console;
 * they're also dispatched on a custom DOM event (`app:error`) for any future
 * listener to pick up (this Worker does not currently mount a dedicated
 * dialog for this event — see `FrontendErrorDialog`/`error-handler.tsx` for
 * this Worker's own, differently-shaped error-reporting surface, used by the
 * unrelated existing pages).
 */

export type LoggedError = {
  /** Short human-friendly title shown in the dialog header. */
  title: string;
  /** User-facing explanation. */
  message: string;
  /** Optional raw error / server payload for the details section. */
  detail?: unknown;
  /** Where it happened (component/function) — aids debugging. */
  source?: string;
  /** Populated automatically. */
  occurredAt?: string;
};

/** Custom event name used to ferry errors to any listening ErrorLogger island. */
export const ERROR_EVENT = "app:error";

/**
 * Report an error to the console (and the `app:error` DOM event, if anything
 * is listening). Safe to call from anywhere on the client. On the server it
 * is a no-op (guards against `window` being undefined during SSR).
 */
export function logError(error: LoggedError): void {
  const enriched: LoggedError = {
    ...error,
    occurredAt: error.occurredAt ?? new Date().toISOString(),
  };

  // Always surface to the console for devtools / log capture.
  // eslint-disable-next-line no-console
  console.error(`[${enriched.source ?? "app"}] ${enriched.title}:`, enriched.message, enriched.detail);

  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LoggedError>(ERROR_EVENT, { detail: enriched }));
}

/**
 * Normalize an unknown thrown value into a string for display.
 */
export function stringifyError(detail: unknown): string {
  if (detail == null) return "";
  if (detail instanceof Error) {
    return JSON.stringify(
      { name: detail.name, message: detail.message, stack: detail.stack },
      null,
      2,
    );
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

/**
 * Helper: wrap a fetch Response, throwing+logging a structured error on non-2xx.
 * Returns the parsed JSON body on success.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  context: { source: string; friendly: string },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (networkError) {
    logError({
      title: "Network error",
      message: context.friendly,
      detail: networkError,
      source: context.source,
    });
    throw networkError;
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.clone().json();
    } catch {
      body = await res.clone().text();
    }
    logError({
      title: `Request failed (${res.status})`,
      message: context.friendly,
      detail: body,
      source: context.source,
    });
    throw new Error(`${context.source}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}
