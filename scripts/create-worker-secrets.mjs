#!/usr/bin/env node
/**
 * Set the Google OAuth Worker secrets from a Google "web" OAuth client creds
 * JSON, using `wrangler secret put` (remote). Also writes a local `.dev.vars`
 * (gitignored) so `wrangler dev` works without re-entering values.
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
 * Secret values are never printed. PUBLIC_BASE_URL is a non-sensitive var kept
 * in wrangler.jsonc; this script does not set it as a secret (that would clash
 * with the var binding of the same name).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_CREDS = "/Volumes/Projects/gcloud_creds/jmbish04_google_workspace_mcp.json";
const PUBLIC_BASE_URL = "https://google-workspace-mcp.hacolby.workers.dev";

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

/** Pipe a secret value into `wrangler secret put NAME` via stdin (never argv/echo). */
function putSecret(name, value) {
  const res = spawnSync("npx", ["wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(`wrangler secret put ${name} exited ${res.status}`);
  }
}

if (!localOnly) {
  console.log("→ Pushing remote secrets via wrangler…");
  for (const [name, value] of Object.entries(SECRETS)) {
    putSecret(name, value);
    console.log(`  ✓ ${name} set (value hidden)`);
  }
}

if (!noDevVars) {
  // Local dev secrets for `wrangler dev`. Gitignored; overwrites any existing.
  const devVars = [
    `GOOGLE_CLIENT_ID=${SECRETS.GOOGLE_CLIENT_ID}`,
    `GOOGLE_CLIENT_SECRET=${SECRETS.GOOGLE_CLIENT_SECRET}`,
    `PUBLIC_BASE_URL=http://localhost:8787`,
    "",
  ].join("\n");
  writeFileSync(".dev.vars", devVars, { mode: 0o600 });
  console.log("  ✓ wrote .dev.vars (gitignored, local dev)");
}

console.log("");
console.log("Done. Reminders:");
console.log(`  • PUBLIC_BASE_URL (var in wrangler.jsonc): ${PUBLIC_BASE_URL}`);
console.log(`  • Google console → Authorized redirect URI:`);
console.log(`      ${PUBLIC_BASE_URL}/auth/google/callback`);
console.log(`  • Then: pnpm run migrate:remote && pnpm run deploy`);
