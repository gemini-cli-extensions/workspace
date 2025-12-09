/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs';

function findProjectRoot(): string {
  // Case 1: Bundled (dist/index.js) -> __dirname is '.../dist'. Root is '.../dist/..'
  const bundledRoot = path.join(__dirname, '..');
  if (fs.existsSync(path.join(bundledRoot, 'package.json'))) {
    return bundledRoot;
  }

  // Case 2: Development (src/utils/paths.ts) -> __dirname is '.../src/utils'. Root is '.../src/utils/../..'
  const devRoot = path.join(__dirname, '..', '..');
  if (fs.existsSync(path.join(devRoot, 'package.json'))) {
    return devRoot;
  }

  // Default fallback
  return devRoot;
}

// Construct an absolute path to the project root.
export const PROJECT_ROOT = findProjectRoot();
export const ENCRYPTED_TOKEN_PATH = path.join(
  PROJECT_ROOT,
  'gemini-cli-workspace-token.json',
);
export const ENCRYPTION_MASTER_KEY_PATH = path.join(
  PROJECT_ROOT,
  '.gemini-cli-workspace-master-key',
);
