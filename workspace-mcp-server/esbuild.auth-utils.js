/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const esbuild = require('esbuild');
const path = require('node:path');

async function buildClearAuth() {
  try {
    await esbuild.build({
      entryPoints: ['src/auth/token-storage/oauth-credential-storage.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: 'dist/clear-auth.js',
      minify: true,
      sourcemap: true,
      external: [
        'keytar', // keytar is a native module and should not be bundled
      ],
      format: 'cjs',
      logLevel: 'info',
    });

    console.log('Clear Auth build completed successfully!');
  } catch (error) {
    console.error('Clear Auth build failed:', error);
    process.exit(1);
  }
}

buildClearAuth();
