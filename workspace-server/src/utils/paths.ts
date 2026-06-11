/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs';

function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'gemini-extension.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    `Could not find project root containing gemini-extension.json. Traversed up from ${__dirname}.`,
  );
}

// Construct an absolute path to the project root.
export const PROJECT_ROOT = findProjectRoot();

/**
 * Directory for mutable server state (encrypted token, master key, logs).
 *
 * Defaults to PROJECT_ROOT (the historical behavior, suitable when the
 * extension runs from a user-writable checkout). Deployments that install
 * the package in a read-only location (e.g. a system-wide install owned by
 * root while the server runs as an unprivileged user) can point state at a
 * writable directory via the WORKSPACE_STATE_DIR environment variable.
 */
export const STATE_DIR = process.env['WORKSPACE_STATE_DIR'] || PROJECT_ROOT;

export const ENCRYPTED_TOKEN_PATH = path.join(
  STATE_DIR,
  'gemini-cli-workspace-token.json',
);
export const ENCRYPTION_MASTER_KEY_PATH = path.join(
  STATE_DIR,
  '.gemini-cli-workspace-master-key',
);
