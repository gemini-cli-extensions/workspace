/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { OAuthCredentialStorage } = require('../workspace-mcp-server/dist/clear-auth.js');

async function clearAuth() {
  try {
    await OAuthCredentialStorage.clearCredentials();
    console.log('Authentication credentials cleared successfully.');
  } catch (error) {
    console.error('Failed to clear authentication credentials:', error);
    process.exit(1);
  }
}

clearAuth();
