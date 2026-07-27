# Dependency and CI Maintenance Rules

Use `corepack pnpm` for every install, update, and validation command in this template.
Use Node.js 22+ for any command that invokes Wrangler.

## When to refresh dependencies

Run the dependency refresh flow whenever:

- `package.json` changes
- `wrangler.jsonc` changes in a way that affects generated types
- `pnpm-lock.yaml` is out of sync or frozen installs fail
- GitHub Actions or Cloudflare PR deployment checks fail because pnpm, Wrangler, or generated types are stale

## Standard recovery flow

1. `corepack pnpm run deps:lockfile`
2. If packages are stale, especially `wrangler`, run `corepack pnpm run deps:update`
3. If Wrangler reports a Node version error, switch the environment to Node.js 22+ and rerun the maintenance command
4. Re-run validation:
   - `corepack pnpm lint`
   - `corepack pnpm build`
5. Commit all resulting maintenance files together:
   - `package.json`
   - `pnpm-lock.yaml`
   - `pnpm-workspace.yaml` if it changed
   - `worker-configuration.d.ts` if regenerated

## Guardrails

- Do not add or regenerate `package-lock.json`; this template is pnpm-first.
- Keep `pnpm-lock.yaml` committed and in sync with `package.json`.
- Keep the repository on Node.js 22+ when refreshing Wrangler or generated types.
- If Cloudflare or GitHub CI reports frozen lockfile, missing pnpm metadata, or outdated Wrangler issues, fix them in the same PR instead of leaving the deployment failing.
