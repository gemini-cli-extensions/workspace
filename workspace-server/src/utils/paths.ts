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
 * Resolves a local path and ensures it is within a safe directory (defaults to PROJECT_ROOT).
 * This prevents path traversal vulnerabilities by checking that the resolved absolute path
 * starts with the safe directory path.
 *
 * @param localPath The path to resolve (can be relative or absolute)
 * @param baseDir The base directory to resolve against. Defaults to PROJECT_ROOT.
 * @returns The resolved absolute path if safe
 * @throws Error if the path is outside the base directory
 */
export function resolveSafePath(
  localPath: string,
  baseDir: string = PROJECT_ROOT,
): string {
  const absoluteBase = path.resolve(baseDir);
  const resolvedPath = path.isAbsolute(localPath)
    ? path.resolve(localPath)
    : path.resolve(absoluteBase, localPath);

  if (!resolvedPath.startsWith(absoluteBase)) {
    throw new Error(
      `Security Error: Path traversal detected. Resolved path "${resolvedPath}" is outside of allowed directory "${absoluteBase}".`,
    );
  }

  return resolvedPath;
}

export const ENCRYPTED_TOKEN_PATH = path.join(
  PROJECT_ROOT,
  'gemini-cli-workspace-token.json',
);
export const ENCRYPTION_MASTER_KEY_PATH = path.join(
  PROJECT_ROOT,
  '.gemini-cli-workspace-master-key',
);
