/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    // Hide subprocess console windows on Windows to prevent popup flickering
    const opts = { windowsHide: true, ...options };

    // On Windows, npm is a batch file and needs a shell
    if (process.platform === 'win32' && command === 'npm') {
      command = `${command}.cmd`;
      opts.shell = true;
    }
    const child = spawn(command, args, opts);

    // Pipe stderr to the parent process's stderr if it's available.
    // This is more efficient than listening for 'data' events.
    if (child.stderr) {
      child.stderr.pipe(process.stderr);
    }

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command failed with code ${code}: ${command} ${args.join(' ')}`,
          ),
        );
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
    const rootDir = path.join(__dirname, '..');
    const nodeModulesPath = path.join(rootDir, 'node_modules');
    const serverPath = path.join(
      rootDir,
      'workspace-server',
      'dist',
      'index.js',
    );

    // Only run npm install on initial setup if node_modules or build output are missing
    if (!fs.existsSync(nodeModulesPath) || !fs.existsSync(serverPath)) {
      await runCommand('npm', ['install'], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    }

    await runCommand('node', [serverPath, '--debug', '--use-dot-names'], {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
