# Core Template: Cloudflare Workers + Astro + shadcn/ui

This template combines Cloudflare Workers, Hono, Astro, React, Tailwind CSS, and shadcn/ui into a single full-stack starter.

## Getting Started

Use Node.js 22+ so Wrangler can generate Cloudflare types successfully, then use Corepack so the repository runs with the pinned pnpm version from `package.json`.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

## Template Intake Automation

When this repository is used through GitHub's **Use this template** flow, `.github/workflows/setup-template.yml` runs once on the first push in the new repository. It will:

- rename the package and Wrangler worker to the new repository name
- update the repository URL in `package.json`
- refresh dependencies with pnpm, including the lockfile
- regenerate `worker-configuration.d.ts`
- remove `package-lock.json`
- delete the setup workflow from the generated repository after it finishes

The workflow now rebases before pushing its setup commit so the initial template update does not fail on a non-fast-forward push.

## Dependency Maintenance

This template is pnpm-first. Keep `pnpm-lock.yaml` committed and in sync with `package.json`.

Useful maintenance commands:

```bash
corepack pnpm run deps:lockfile
corepack pnpm run deps:update
corepack pnpm lint
corepack pnpm build
```

- `deps:lockfile` refreshes the pnpm lockfile and regenerates Wrangler types
- `deps:update` pulls the latest dependency versions first, then refreshes the lockfile and types

## Fixing GitHub or Cloudflare Build Failures

If a GitHub Actions run or Cloudflare PR deployment fails because the lockfile is frozen, pnpm metadata is stale, or Wrangler/generated types drifted:

1. Run `corepack pnpm run deps:lockfile`
2. If versions are stale, run `corepack pnpm run deps:update`
3. If Wrangler reports a Node version error, switch the environment to Node.js 22+ and rerun the maintenance commands
4. Re-run `corepack pnpm lint` and `corepack pnpm build`
5. Commit the resulting `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (if changed), and `worker-configuration.d.ts` (if changed)

Do not add `package-lock.json` back to the repository.

## License

This project is licensed under the [MIT License](LICENSE).
