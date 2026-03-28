/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { rmSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const RMRF = { recursive: true, force: true };

function rmrfSyncVerbose(path) {
  console.log(`Removing ${path}`);
  rmSync(path, RMRF);
}

// Clean up all workspaces.
const { workspaces } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf-8'),
);
for (const workspace of workspaces) {
  rmrfSyncVerbose(join(root, workspace, 'dist'));
}

// Root artifacts.
rmrfSyncVerbose(join(root, 'node_modules'));
rmrfSyncVerbose(join(root, 'release'));
rmrfSyncVerbose(join(root, 'logs'));
rmrfSyncVerbose(join(root, 'docs', '.vitepress', 'cache'));
rmrfSyncVerbose(join(root, 'docs', '.vitepress', 'dist'));
