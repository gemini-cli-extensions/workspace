#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Headless OAuth login CLI tool.
 *
 * Allows users in headless environments (SSH, WSL, Cloud Shell, VMs) to
 * complete the OAuth flow by:
 * 1. Printing an OAuth URL to open in any browser
 * 2. Reading pasted credentials JSON securely from /dev/tty (not stdin)
 * 3. Saving credentials via OAuthCredentialStorage
 *
 * The /dev/tty approach ensures credentials are never visible to an AI model
 * that may have spawned this process.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as readline from 'node:readline';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { OAuthCredentialStorage } from '../auth/token-storage/oauth-credential-storage';
import { SCOPES } from '../auth/scopes';
import { loadConfig } from '../utils/config';

const config = loadConfig();
const CLIENT_ID = config.clientId;
const CLOUD_FUNCTION_URL = config.cloudFunctionUrl;

interface CredentialsJson {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope?: string;
  token_type?: string;
}

const TTY_PATH = os.platform() === 'win32' ? '\\\\.\\CON' : '/dev/tty';

/**
 * Opens a readable stream from /dev/tty (Unix) or CON (Windows).
 * This bypasses process stdin entirely so credentials can't be intercepted
 * by a parent process.
 */
function openTtyRead(): fs.ReadStream {
  return fs.createReadStream(TTY_PATH, { encoding: 'utf8' });
}

/**
 * Opens a writable stream to /dev/tty (Unix) or CON (Windows).
 */
function openTtyWrite(): fs.WriteStream {
  return fs.createWriteStream(TTY_PATH);
}

/**
 * Reads multi-line input from /dev/tty until valid JSON is detected
 * or the user presses Enter on an empty line.
 */
function readCredentialsFromTty(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input: fs.ReadStream;
    let output: fs.WriteStream;

    try {
      input = openTtyRead();
      output = openTtyWrite();
    } catch {
      reject(
        new Error(
          'Cannot open terminal for secure input. ' +
            'This command must be run in an interactive terminal.',
        ),
      );
      return;
    }

    const rl = readline.createInterface({ input, output, terminal: false });
    const lines: string[] = [];

    output.write(
      'Paste the credentials JSON from the browser, then press Enter twice:\n',
    );

    rl.on('line', (line) => {
      lines.push(line);

      // Try to parse accumulated input as JSON after each line
      const joined = lines.join('\n').trim();
      if (joined) {
        try {
          JSON.parse(joined);
          // Valid JSON detected, we're done
          rl.close();
          return;
        } catch {
          // Not valid JSON yet, keep collecting
        }
      }

      // Empty line after content means user is done
      if (line.trim() === '' && lines.length > 1) {
        rl.close();
      }
    });

    rl.on('close', () => {
      input.destroy();
      output.end();
      resolve(lines.join('\n').trim());
    });

    rl.on('error', (err) => {
      input.destroy();
      output.end();
      reject(err);
    });
  });
}

/**
 * Validates that the parsed JSON contains the required credential fields.
 */
function validateCredentials(
  data: Record<string, unknown>,
): asserts data is Record<string, unknown> & CredentialsJson {
  if (typeof data.access_token !== 'string' || !data.access_token) {
    throw new Error('Missing or invalid "access_token" field.');
  }
  if (typeof data.refresh_token !== 'string' || !data.refresh_token) {
    throw new Error('Missing or invalid "refresh_token" field.');
  }
  if (typeof data.expiry_date !== 'number' || !data.expiry_date) {
    throw new Error('Missing or invalid "expiry_date" field.');
  }
}

/**
 * Generates the OAuth URL with manual=true state, matching the pattern
 * used by AuthManager.authWithWeb().
 */
function generateOAuthUrl(): string {
  const csrfToken = crypto.randomBytes(32).toString('hex');

  const statePayload = {
    manual: true,
    csrf: csrfToken,
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

  const oAuth2Client = new google.auth.OAuth2({ clientId: CLIENT_ID });

  return oAuth2Client.generateAuthUrl({
    redirect_uri: CLOUD_FUNCTION_URL,
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });
}

async function main() {
  const force = process.argv.includes('--force');

  // Check for existing credentials unless --force is used
  if (!force) {
    const existing = await OAuthCredentialStorage.loadCredentials();
    if (existing && existing.refresh_token) {
      console.log('Already authenticated. Credentials found in storage.');
      console.log('Use --force to re-authenticate.');
      return;
    }
  }

  // Generate and display the OAuth URL
  const authUrl = generateOAuthUrl();

  console.log();
  console.log('=== Google Workspace MCP Server - Headless Login ===');
  console.log();
  console.log('Open this URL in any browser (local machine, phone, etc.):');
  console.log();
  console.log(authUrl);
  console.log();
  console.log('After signing in, the browser will show your credentials JSON.');
  console.log('Copy that JSON and paste it below.');
  console.log();

  // Read credentials securely from /dev/tty
  const rawInput = await readCredentialsFromTty();

  if (!rawInput) {
    console.error('No input received.');
    process.exit(1);
  }

  // Parse and validate
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    console.error(
      'Invalid JSON. Please copy the complete JSON from the browser.',
    );
    process.exit(1);
  }

  try {
    validateCredentials(parsed);
  } catch (err) {
    console.error(
      `Invalid credentials: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(1);
  }

  // Save credentials
  await OAuthCredentialStorage.saveCredentials({
    access_token: parsed.access_token as string,
    refresh_token: parsed.refresh_token as string,
    expiry_date: parsed.expiry_date as number,
    scope: (parsed.scope as string) || SCOPES.join(' '),
    token_type: (parsed.token_type as string) || 'Bearer',
  });

  console.log();
  console.log('Credentials saved successfully!');
  console.log('You can now start the MCP server.');
}

main().catch((error) => {
  console.error('Login failed:', error.message || error);
  process.exit(1);
});
