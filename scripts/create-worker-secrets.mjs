#!/usr/bin/env node
/**
 * Set the Google OAuth Worker secrets from a Google "web" OAuth client creds
 * JSON, using `wrangler secret bulk` (one non-interactive call), and write a
 * local `.dev.vars` (gitignored) for `wrangler dev`.
 *
 * The creds JSON is the standard Google Cloud OAuth client download, shaped:
 *   { "web": { "client_id": "...", "client_secret": "...", ... } }
 *
 * Usage:
 *   node scripts/create-worker-secrets.mjs [path/to/creds.json]
 *   CREDS_FILE=/path/to/creds.json node scripts/create-worker-secrets.mjs
 *
 * Flags:
 *   --local-only   Only write .dev.vars; do NOT push remote secrets.
 *   --no-dev-vars  Only push remote secrets; do NOT write .dev.vars.
 *
 * Notes:
 *   - Uses `wrangler secret bulk` (reads JSON from stdin) so there is NO
 *     interactive prompt — the old per-secret `secret put` could hang waiting
 *     on a TTY. A hard timeout guarantees the script always terminates.
 *   - The Worker must already exist (deploy once first) for remote secrets to
 *     apply; if it doesn't, wrangler errors quickly instead of hanging.
 *   - Secret values are never printed. PUBLIC_BASE_URL stays a var in
 *     wrangler.jsonc (setting it as a secret would clash with that binding).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DEFAULT_CREDS = "/Volumes/Projects/gcloud_creds/jmbish04_google_workspace_mcp.json";
const PUBLIC_BASE_URL = "https://google-workspace-mcp.hacolby.workers.dev";
const WORKER_NAME = "google-workspace-mcp";
const TIMEOUT_MS = 90_000;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const localWrangler = join(repoRoot, "node_modules", ".bin", "wrangler");
const wranglerBin = existsSync(localWrangler) ? localWrangler : "npx";
const wranglerArgs = (rest) => (wranglerBin === "npx" ? ["wrangler", ...rest] : rest);

const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const noDevVars = args.includes("--no-dev-vars");
const credsPath =
  args.find((a) => !a.startsWith("--")) ?? process.env.CREDS_FILE ?? DEFAULT_CREDS;

if (!existsSync(credsPath)) {
  console.error(`✖ Creds file not found: ${credsPath}`);
  console.error(`  Pass a path or set CREDS_FILE. Expected a Google OAuth "web" client JSON.`);
  process.exit(1);
}

let creds;
try {
  creds = JSON.parse(readFileSync(credsPath, "utf8"));
} catch (err) {
  console.error(`✖ Could not parse ${credsPath}: ${err.message}`);
  process.exit(1);
}

const web = creds.web ?? creds.installed;
if (!web?.client_id || !web?.client_secret) {
  console.error(`✖ ${credsPath} has no web.client_id / web.client_secret.`);
  console.error(`  This must be an OAuth "web application" client (not a service account).`);
  process.exit(1);
}

const SECRETS = {
  GOOGLE_CLIENT_ID: web.client_id,
  GOOGLE_CLIENT_SECRET: web.client_secret,
};

if (!localOnly) {
  console.log(`→ Pushing ${Object.keys(SECRETS).length} secrets to Worker "${WORKER_NAME}" via wrangler secret bulk…`);
  const res = spawnSync(wranglerBin, wranglerArgs(["secret", "bulk", "--name", WORKER_NAME]), {
    input: JSON.stringify(SECRETS),
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
  });
  if (res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM") {
    console.error(`\n✖ wrangler timed out after ${TIMEOUT_MS / 1000}s. Check \`wrangler whoami\` / network and retry.`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`\n✖ wrangler secret bulk exited ${res.status}.`);
    console.error(`  If the Worker doesn't exist yet, deploy once first: pnpm run deploy`);
    process.exit(res.status ?? 1);
  }
  console.log(`  ✓ ${Object.keys(SECRETS).join(", ")} set (values hidden)`);
}

if (!noDevVars) {
  const devVars = [
    `GOOGLE_CLIENT_ID=${SECRETS.GOOGLE_CLIENT_ID}`,
    `GOOGLE_CLIENT_SECRET=${SECRETS.GOOGLE_CLIENT_SECRET}`,
    `PUBLIC_BASE_URL=http://localhost:8787`,
    "",
  ].join("\n");
  writeFileSync(join(repoRoot, ".dev.vars"), devVars, { mode: 0o600 });
  console.log("  ✓ wrote .dev.vars (gitignored, local dev)");
}

console.log("");
console.log("Done. Reminders:");
console.log(`  • PUBLIC_BASE_URL (var in wrangler.jsonc): ${PUBLIC_BASE_URL}`);
console.log(`  • Google console → Authorized redirect URI:`);
console.log(`      ${PUBLIC_BASE_URL}/auth/google/callback`);
console.log(`  • Then: pnpm run migrate:remote && pnpm run deploy`);
