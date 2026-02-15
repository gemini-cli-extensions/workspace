/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import * as fs from 'node:fs';
import { PROJECT_ROOT } from '../../utils/paths';

describe('paths utils', () => {
  describe('PROJECT_ROOT', () => {
    it('should resolve to the workspace root directory', () => {
      // The project root should contain gemini-extension.json
      // Since we are searching for gemini-extension.json which is in the root 'workspace',
      // not 'workspace-server', the path should NOT end with 'workspace-server'.
      const extensionConfigPath = path.join(
        PROJECT_ROOT,
        'gemini-extension.json',
      );
      expect(fs.existsSync(extensionConfigPath)).toBe(true);

      // The root should be the parent of workspace-server in this monorepo setup
      // PROJECT_ROOT = .../workspace
      // __dirname = .../workspace/workspace-server/src/__tests__/utils
      expect(PROJECT_ROOT.endsWith('workspace-server')).toBe(false);
    });
  });

  describe('resolveSafePath', () => {
    const { resolveSafePath } = require('../../utils/paths');

    it('should resolve a relative path within the project root', () => {
      const relativePath = 'downloads/file.txt';
      const resolved = resolveSafePath(relativePath);
      expect(resolved).toBe(path.join(PROJECT_ROOT, relativePath));
    });

    it('should resolve an absolute path within the project root', () => {
      const absolutePath = path.join(PROJECT_ROOT, 'downloads', 'file.txt');
      const resolved = resolveSafePath(absolutePath);
      expect(resolved).toBe(absolutePath);
    });

    it('should throw an error for a path outside the project root using ..', () => {
      const dangerousPath = path.join(PROJECT_ROOT, '..', 'shadow.pwd');
      expect(() => resolveSafePath(dangerousPath)).toThrow(
        /Security Error: Path traversal detected/,
      );
    });

    it('should throw an error for an absolute path outside the project root', () => {
      const dangerousPath = '/etc/passwd';
      expect(() => resolveSafePath(dangerousPath)).toThrow(
        /Security Error: Path traversal detected/,
      );
    });

    it('should allow paths within a custom base directory', () => {
      const customBase = '/tmp/my-safe-dir';
      const relativePath = 'file.txt';
      // Mock path.resolve to handle the fake absolute path correctly on all OSes
      const spy = jest.spyOn(path, 'resolve').mockImplementation((...args) => {
        if (args[0] === customBase) return path.join(customBase, args[1]);
        return path.join(...args);
      });

      // We need to be careful with mocks and real path operations in the same test
      // Instead of mocking path, let's just use a real directory we know exists
      const realBase = path.join(PROJECT_ROOT, 'workspace-server');
      const realPath = 'package.json';
      const resolved = resolveSafePath(realPath, realBase);
      expect(resolved).toBe(path.join(realBase, realPath));

      const dangerousPath = path.join(PROJECT_ROOT, 'package.json');
      expect(() => resolveSafePath(dangerousPath, realBase)).toThrow(
        /Security Error: Path traversal detected/,
      );
    });
  });
});
