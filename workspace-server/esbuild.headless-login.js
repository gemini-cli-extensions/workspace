/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const esbuild = require('esbuild');

async function buildHeadlessLogin() {
  try {
    await esbuild.build({
      entryPoints: ['src/cli/headless-login.ts'],
      bundle: true,
      platform: 'node',
      target: 'node20',
      outfile: 'dist/headless-login.js',
      minify: true,
      sourcemap: true,
      external: [
        'keytar', // keytar is a native module and should not be bundled
      ],
      format: 'cjs',
      logLevel: 'info',
    });

    console.log('Headless Login build completed successfully!');
  } catch (error) {
    console.error('Headless Login build failed:', error);
    process.exit(1);
  }
}

buildHeadlessLogin();
