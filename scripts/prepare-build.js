/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Install-time build hook.
 *
 * `npm install -g git+https://...#<sha>` runs the root `prepare` script but
 * refuses to run a workspaces build for a global package ("Workspaces not
 * supported for global packages"). This script therefore builds the
 * workspace-server bundle directly with esbuild — no npm workspaces involved —
 * so install-from-git produces `workspace-server/dist/index.js` and the
 * `gemini-workspace-server` bin can require it.
 *
 * Behaviour:
 *  - If esbuild is available (devDependencies are present, as they are for
 *    git-source installs), build the bundle in workspace-server/.
 *  - If esbuild is NOT available AND a prebuilt dist already exists (committed
 *    fallback or a registry install that shipped dist via the `files` field),
 *    skip the build instead of failing.
 *  - Only fail when there is neither a toolchain to build with nor a prebuilt
 *    artifact to fall back to.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workspaceServerDir = path.join(__dirname, '..', 'workspace-server');
const distIndex = path.join(workspaceServerDir, 'dist', 'index.js');

function esbuildAvailable() {
  try {
    require.resolve('esbuild');
    return true;
  } catch {
    return false;
  }
}

function run(script) {
  execFileSync(process.execPath, [script], {
    cwd: workspaceServerDir,
    stdio: 'inherit',
  });
}

if (esbuildAvailable()) {
  run('esbuild.config.js');
  run('esbuild.headless-login.js');
  console.log('prepare-build: workspace-server bundle built.');
} else if (fs.existsSync(distIndex)) {
  console.log(
    'prepare-build: esbuild not available; using the prebuilt dist/ artifact.',
  );
} else {
  console.error(
    'prepare-build: esbuild is not available and no prebuilt dist/ exists. ' +
      'Install dev dependencies or ship a prebuilt dist/.',
  );
  process.exit(1);
}
