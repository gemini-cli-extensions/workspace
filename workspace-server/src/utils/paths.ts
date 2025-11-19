/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

// Construct an absolute path to the project root.
// __dirname will be /path/to/project/src (in dev) or /path/to/project/dist (in prod).
// In both cases, going up one level gives us the project root.
export const PROJECT_ROOT = path.join(__dirname, '..', '..');
export const ENCRYPTED_TOKEN_PATH = path.join(
  PROJECT_ROOT,
  'gemini-cli-workspace-token.json',
);
export const ENCRYPTION_MASTER_KEY_PATH = path.join(
  PROJECT_ROOT,
  '.gemini-cli-workspace-master-key',
);
