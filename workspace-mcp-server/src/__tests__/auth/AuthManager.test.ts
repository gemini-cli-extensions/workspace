/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthManager } from '../../auth/AuthManager';
import { OAuthCredentialStorage } from '../../auth/token-storage/oauth-credential-storage';
import { google } from 'googleapis';

// Mock dependencies
jest.mock('../../auth/token-storage/oauth-credential-storage');
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('../../utils/secure-browser-launcher');

describe('AuthManager', () => {
  let authManager: AuthManager;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock OAuth2 client
    mockOAuth2Client = {
      setCredentials: jest.fn().mockImplementation((creds) => {
        mockOAuth2Client.credentials = creds;
      }),
      generateAuthUrl: jest.fn(),
      on: jest.fn(),
      refreshAccessToken: jest.fn(),
      credentials: {}
    };

    (google.auth.OAuth2 as unknown as jest.Mock).mockReturnValue(mockOAuth2Client);

    authManager = new AuthManager(['scope1']);
  });

  it('should set up tokens event listener on client creation', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'old_token',
        refresh_token: 'old_refresh',
        scope: 'scope1'
    });

    await authManager.getAuthenticatedClient();

    // Verify 'on' was called for 'tokens'
    expect(mockOAuth2Client.on).toHaveBeenCalledWith('tokens', expect.any(Function));
  });

  it('should save credentials when tokens event is emitted', async () => {
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'old_token',
        refresh_token: 'old_refresh',
        scope: 'scope1'
    });

    await authManager.getAuthenticatedClient();

    // Get the registered callback
    const tokensCallback = mockOAuth2Client.on.mock.calls.find((call: any[]) => call[0] === 'tokens')[1];
    expect(tokensCallback).toBeDefined();

    // Simulate tokens event
    const newTokens = {
        access_token: 'new_token',
        expiry_date: 123456789
    };

    await tokensCallback(newTokens);

    // Verify saveCredentials was called with merged tokens
    // New tokens take precedence, but refresh_token is preserved from old credentials
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith({
        access_token: 'new_token',
        refresh_token: 'old_refresh', // Preserved from old credentials
        expiry_date: 123456789
        // Note: scope is NOT preserved because newTokens didn't include it
    });
  });

  it('should preserve refresh token during manual refresh if not returned', async () => {
    // Setup initial state with a refresh token
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'old_token',
        refresh_token: 'old_refresh_token',
        scope: 'scope1'
    });
    
    // Initialize client to populate this.client
    await authManager.getAuthenticatedClient();
    
    // Mock refresh to return ONLY access token (no refresh token)
    // We need to update the mock to actually update credentials, similar to real OAuth2Client
    mockOAuth2Client.refreshAccessToken.mockImplementation(async () => {
        const newCreds = {
            access_token: 'new_access_token',
            expiry_date: 999999999
        };
        mockOAuth2Client.credentials = newCreds;
        return { credentials: newCreds };
    });

    await authManager.refreshToken();

    // Verify saveCredentials was called with BOTH new access token AND old refresh token
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
        access_token: 'new_access_token',
        refresh_token: 'old_refresh_token'
    }));
  });

  it('should preserve refresh token when refreshAccessToken mutates credentials in-place', async () => {
    // Setup initial state with a refresh token
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'old_token',
        refresh_token: 'old_refresh_token',
        scope: 'scope1'
    });
    
    // Initialize client to populate this.client
    await authManager.getAuthenticatedClient();
    
    // This test simulates the REAL OAuth2Client behavior where refreshAccessToken
    // mutates the credentials object IN-PLACE before returning
    mockOAuth2Client.refreshAccessToken.mockImplementation(async () => {
        // CRITICAL: Mutate the existing credentials object in-place
        // This is what the real OAuth2Client does!
        mockOAuth2Client.credentials.access_token = 'new_access_token';
        mockOAuth2Client.credentials.expiry_date = 999999999;
        // Note: refresh_token is NOT included in the refresh response
        delete mockOAuth2Client.credentials.refresh_token;
        delete mockOAuth2Client.credentials.scope;
        
        // Return the new credentials (which are the SAME object reference)
        return { credentials: mockOAuth2Client.credentials };
    });

    await authManager.refreshToken();

    // This test will FAIL if the bug exists, because:
    // 1. Line 146 captures a reference to mockOAuth2Client.credentials
    // 2. Line 148 calls refreshAccessToken which mutates that same object
    // 3. The merge logic sees currentCredentials.refresh_token is undefined (it was deleted)
    // 4. The refresh_token is lost
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith(expect.objectContaining({
        access_token: 'new_access_token',
        refresh_token: 'old_refresh_token'
    }));
  });

  it('should preserve refresh token in tokens event handler', async () => {
    // Setup initial state with a refresh token in storage
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'old_token',
        refresh_token: 'stored_refresh_token',
        scope: 'scope1'
    });
    
    await authManager.getAuthenticatedClient();
    
    // Get the registered callback
    const tokensCallback = mockOAuth2Client.on.mock.calls.find((call: any[]) => call[0] === 'tokens')[1];
    
    // Simulate automatic refresh that doesn't include refresh_token
    const newTokens = {
        access_token: 'auto_refreshed_token',
        expiry_date: 999999999
        // Note: no refresh_token
    };
    
    await tokensCallback(newTokens);
    
    // Verify saveCredentials was called with BOTH new access token AND stored refresh token
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith({
        access_token: 'auto_refreshed_token',
        expiry_date: 999999999,
        refresh_token: 'stored_refresh_token'
    });
  });
});
