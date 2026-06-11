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

  describe('STATE_DIR', () => {
    const reload = () => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('../../utils/paths') as typeof import('../../utils/paths');
    };

    afterEach(() => {
      delete process.env['WORKSPACE_STATE_DIR'];
      jest.resetModules();
    });

    it('defaults to PROJECT_ROOT when WORKSPACE_STATE_DIR is unset', () => {
      delete process.env['WORKSPACE_STATE_DIR'];
      const m = reload();
      expect(m.STATE_DIR).toBe(m.PROJECT_ROOT);
      expect(m.ENCRYPTED_TOKEN_PATH).toBe(
        path.join(m.PROJECT_ROOT, 'gemini-cli-workspace-token.json'),
      );
      expect(m.ENCRYPTION_MASTER_KEY_PATH).toBe(
        path.join(m.PROJECT_ROOT, '.gemini-cli-workspace-master-key'),
      );
    });

    it('honors WORKSPACE_STATE_DIR for token and master-key paths', () => {
      process.env['WORKSPACE_STATE_DIR'] = '/var/lib/workspace-state';
      const m = reload();
      expect(m.STATE_DIR).toBe('/var/lib/workspace-state');
      expect(m.ENCRYPTED_TOKEN_PATH).toBe(
        path.join('/var/lib/workspace-state', 'gemini-cli-workspace-token.json'),
      );
      expect(m.ENCRYPTION_MASTER_KEY_PATH).toBe(
        path.join(
          '/var/lib/workspace-state',
          '.gemini-cli-workspace-master-key',
        ),
      );
    });
  });
});
