/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const { OAuthCredentialStorage } = require('../workspace-server/dist/auth/token-storage/oauth-credential-storage.js');

async function clearAuth() {
  try {
    await OAuthCredentialStorage.clearCredentials();
    console.log('✅ Authentication credentials cleared successfully.');
  } catch (error) {
    console.error('❌ Failed to clear authentication credentials:', error);
    process.exit(1);
  }
}

async function expireToken() {
  try {
    const credentials = await OAuthCredentialStorage.loadCredentials();
    if (!credentials) {
      console.log('ℹ️  No credentials found to expire.');
      return;
    }
    
    // Set expiry to 1 second ago
    credentials.expiry_date = Date.now() - 1000;
    await OAuthCredentialStorage.saveCredentials(credentials);
    console.log('✅ Access token expired successfully.');
    console.log('   Next API call will trigger proactive refresh.');
  } catch (error) {
    console.error('❌ Failed to expire token:', error);
    process.exit(1);
  }
}

async function showStatus() {
  try {
    const credentials = await OAuthCredentialStorage.loadCredentials();
    if (!credentials) {
      console.log('ℹ️  No credentials found.');
      return;
    }
    
    const now = Date.now();
    const expiry = credentials.expiry_date;
    const hasRefreshToken = !!credentials.refresh_token;
    const hasAccessToken = !!credentials.access_token;
    const isExpired = expiry ? expiry < now : false;
    
    console.log('📊 Auth Status:');
    console.log(`   Access Token: ${hasAccessToken ? '✅ Present' : '❌ Missing'}`);
    console.log(`   Refresh Token: ${hasRefreshToken ? '✅ Present' : '❌ Missing'}`);
    if (expiry) {
      console.log(`   Expiry: ${new Date(expiry).toISOString()}`);
      console.log(`   Status: ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      if (!isExpired) {
        const minutesLeft = Math.floor((expiry - now) / 1000 / 60);
        console.log(`   Time left: ~${minutesLeft} minutes`);
      }
    } else {
      console.log(`   Expiry: ⚠️  Unknown`);
    }
  } catch (error) {
    console.error('❌ Failed to get auth status:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Auth Management CLI

Usage: node scripts/auth-utils.js <command>

Commands:
  clear     Clear all authentication credentials
  expire    Force the access token to expire (for testing refresh)
  status    Show current authentication status
  help      Show this help message

Examples:
  node scripts/auth-utils.js clear
  node scripts/auth-utils.js expire
  node scripts/auth-utils.js status
`);
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case 'clear':
      await clearAuth();
      break;
    case 'expire':
      await expireToken();
      break;
    case 'status':
      await showStatus();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      if (!command) {
        console.error('❌ No command specified.');
      } else {
        console.error(`❌ Unknown command: ${command}`);
      }
      showHelp();
      process.exit(1);
  }
}

main();
