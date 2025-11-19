/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const esbuild = require('esbuild');
const path = require('node:path');
const fs = require('node:fs');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node16',
      outfile: 'dist/index.js',
      minify: true,
      sourcemap: true,
      // Replace 'open' package with our wrapper
      alias: {
        'open': path.resolve(__dirname, 'src/utils/open-wrapper.ts')
      },
      // External packages that shouldn't be bundled
      external: [
        'jsdom'
      ],
      // Add a loader for .node files
      loader: {
        '.node': 'file'
      },
      // Make sure CommonJS modules work properly
      format: 'cjs',
      logLevel: 'info',
    });

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();