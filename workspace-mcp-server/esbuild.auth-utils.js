/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const esbuild = require('esbuild');
const path = require('node:path');

async function buildAuthUtils() {
  try {
    await esbuild.build({
      entryPoints: ['src/auth/token-storage/oauth-credential-storage.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: 'dist/auth-utils.js',
      minify: true,
      sourcemap: true,
      external: [
        'keytar', // keytar is a native module and should not be bundled
      ],
      format: 'cjs',
      logLevel: 'info',
    });

    console.log('Auth Utils build completed successfully!');
  } catch (error) {
    console.error('Auth Utils build failed:', error);
    process.exit(1);
  }
}

buildAuthUtils();
