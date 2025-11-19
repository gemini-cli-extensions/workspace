/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    // Pipe stderr to the parent process's stderr if it's available.
    // This is more efficient than listening for 'data' events.
    if (child.stderr) {
      child.stderr.pipe(process.stderr);
    }

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}`));
      } else {
        resolve();
      }
    });
    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    await runCommand('npm', ['install'], { stdio: ['ignore', 'ignore', 'pipe'] });

    const SERVER_PATH = path.join(__dirname, '..', 'workspace-server', 'dist', 'index.js');
    await runCommand('node', [SERVER_PATH, '--debug'], { stdio: 'inherit' });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();