/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { PROJECT_ROOT } from '../../utils/paths';

describe('paths utils', () => {
  describe('PROJECT_ROOT', () => {
    it('should resolve to the workspace root directory', () => {
      // The project root should contain gemini-extension.json
      // Since we are searching for gemini-extension.json which is in the root 'workspace',
      // not 'workspace-server', the path should NOT end with 'workspace-server'.
      import * as fs from 'node:fs';
      const extensionConfigPath = path.join(PROJECT_ROOT, 'gemini-extension.json');
      expect(fs.existsSync(extensionConfigPath)).toBe(true);
      
      // The root should be the parent of workspace-server in this monorepo setup
      // PROJECT_ROOT = .../workspace
      // __dirname = .../workspace/workspace-server/src/__tests__/utils
      expect(PROJECT_ROOT.endsWith('workspace-server')).toBe(false);
    });
  });
});
