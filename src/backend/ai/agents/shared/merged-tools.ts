/**
 * @fileoverview Flattened Google Workspace tool set for the single chat agent.
 *
 * The OrchestratorAgent is the one chat surface the user talks to. To let a
 * single thread chain across surfaces (e.g. "search Gmail → write the findings
 * into a new Sheet → create an Apps Script on a schedule"), it exposes EVERY
 * specialist tool directly to the model rather than a single `delegate` tool.
 *
 * This module assembles that flattened `ToolSet` by reusing each specialist's
 * existing pure tool factory (`build<Surface>Tools(client)`) against a freshly
 * constructed, stateless Google client. The Google clients (`@/backend/google`)
 * carry only `(env, account)` and resolve auth per request, so they are safe to
 * build on demand inside `onChatMessage`.
 *
 * COLLISION SAFETY: several surfaces export tools with the same key
 * (`replaceAllText`, `insertText`, `appendText` exist in both Docs and Slides).
 * A naive spread would silently drop tools. We therefore namespace every tool
 * key with its surface prefix (`gmail_`, `docs_`, `sheets_`, `slides_`,
 * `drive_`, `appscript_`, `calendar_`) — which also mirrors the MCP server's
 * naming and gives the model unambiguous, self-describing tool names.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { resolveAccount, type GoogleAccount } from "@/backend/auth/provider";

import { buildAppsScriptTools } from "@/backend/ai/agents/appscript/methods/tools";
import { buildCalendarTools } from "@/backend/ai/agents/calendar/methods/tools";
import { buildDocsTools } from "@/backend/ai/agents/docs/methods/tools";
import { buildDriveTools } from "@/backend/ai/agents/drive/methods/tools";
import { buildGmailTools } from "@/backend/ai/agents/gmail/methods/tools";
import { buildSheetsTools } from "@/backend/ai/agents/sheets/methods/tools";
import { buildSlidesTools } from "@/backend/ai/agents/slides/methods/tools";
import {
  AppsScriptClient,
  CalendarClient,
  GmailClient,
  GoogleDocsClient,
  GoogleDriveClient,
  GoogleSheetsClient,
  GoogleSlidesClient,
} from "@/backend/google";

/**
 * Prefix every tool key in a `ToolSet` with `<surface>_` so merged tools never
 * collide across surfaces.
 *
 * @param prefix - Surface prefix WITHOUT the trailing underscore (e.g. "gmail").
 * @param tools - The surface's tool set.
 * @returns A new tool set with namespaced keys.
 */
function withPrefix(prefix: string, tools: ToolSet): ToolSet {
  const out: ToolSet = {};
  for (const [name, def] of Object.entries(tools)) {
    out[`${prefix}_${name}`] = def;
  }
  return out;
}

/**
 * Build the full, flattened Workspace tool set bound to ONE Google account.
 *
 * Constructs one stateless client per surface and merges every specialist tool
 * factory under a namespaced key.
 *
 * @param env - Worker env (bindings + secrets for Google auth).
 * @param account - Google account context ("workspace" | "personal" | email).
 * @returns A `ToolSet` containing every Workspace tool, surface-namespaced.
 */
function buildForAccount(env: Env, account: GoogleAccount): ToolSet {
  const gmail = new GmailClient(env, account);
  const docs = new GoogleDocsClient(env, account);
  const drive = new GoogleDriveClient(env, account);
  const sheets = new GoogleSheetsClient(env, account);
  const slides = new GoogleSlidesClient(env, account);
  const appscript = new AppsScriptClient(env, account);
  const calendar = new CalendarClient(env, account);

  return {
    ...withPrefix("gmail", buildGmailTools(gmail)),
    ...withPrefix("docs", buildDocsTools(docs, drive)),
    ...withPrefix("sheets", buildSheetsTools(sheets)),
    ...withPrefix("slides", buildSlidesTools(slides)),
    ...withPrefix("drive", buildDriveTools(drive)),
    ...withPrefix("appscript", buildAppsScriptTools(appscript)),
    ...withPrefix("calendar", buildCalendarTools(calendar)),
  };
}

/** Optional per-call account selector injected into every tool's input schema. */
const ACCOUNT_FIELD = z
  .string()
  .optional()
  .describe(
    "Google account to act as for THIS call: 'workspace' (default), 'personal', or a specific email address. Omit to use the conversation's default account. Use 'personal' when the user refers to their personal Gmail/Drive.",
  );

/**
 * Build the flattened Workspace tool set the orchestrator exposes to the model.
 *
 * Each tool gains an optional `account` parameter so the model can route an
 * individual call to a different Google account (e.g. "search my personal
 * gmail") without changing the conversation default — `account` is resolved via
 * {@link resolveAccount} and the matching surface client is rebuilt on demand.
 *
 * SAFETY: if a tool's schema cannot be introspected/extended (unexpected shape),
 * that tool is passed through UNCHANGED rather than reconstructed, so this layer
 * can never regress the base tool behavior.
 *
 * @param env - Worker env.
 * @param defaultAccount - Account used when a call omits `account`.
 * @returns A `ToolSet` with per-call account routing.
 */
export function buildWorkspaceToolSet(env: Env, defaultAccount: GoogleAccount): ToolSet {
  const base = buildForAccount(env, defaultAccount);
  const defaultResolved = resolveAccount(env, defaultAccount);
  const out: ToolSet = {};

  for (const [name, original] of Object.entries(base)) {
    const orig = original as {
      inputSchema?: { extend?: unknown };
      description?: string;
      execute?: (args: unknown, options: unknown) => Promise<unknown>;
    };
    const schema = orig.inputSchema;
    const extendable = !!schema && typeof schema.extend === "function";

    // Pass through unchanged when we cannot cleanly extend — never regress.
    if (!extendable || typeof orig.execute !== "function") {
      out[name] = original;
      continue;
    }

    out[name] = tool({
      description: orig.description,
      inputSchema: (schema as unknown as z.ZodObject<z.ZodRawShape>).extend({
        account: ACCOUNT_FIELD,
      }) as never,
      execute: async (rawArgs: unknown, options: unknown) => {
        const { account, ...rest } = (rawArgs ?? {}) as Record<string, unknown> & {
          account?: string;
        };
        const useDefault = !account || resolveAccount(env, account) === defaultResolved;
        const targetSet = useDefault ? base : buildForAccount(env, account as string);
        const target = targetSet[name] as {
          execute?: (args: unknown, options: unknown) => Promise<unknown>;
        };
        if (typeof target?.execute !== "function") {
          throw new Error(`Tool "${name}" is not executable.`);
        }
        return target.execute(rest, options);
      },
    }) as ToolSet[string];
  }

  return out;
}
