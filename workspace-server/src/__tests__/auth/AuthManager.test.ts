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

// Mock fetch globally for refreshToken tests
global.fetch = jest.fn();

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
    
    // Mock fetch to simulate cloud function returning new tokens without refresh_token
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
            access_token: 'new_access_token',
            expiry_date: 999999999
        })
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
    
    // Mock fetch to simulate cloud function returning new tokens without refresh_token
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
            access_token: 'new_access_token',
            expiry_date: 999999999
        })
    });

    await authManager.refreshToken();

    // This test verifies that the refresh_token is preserved even when
    // the cloud function doesn't return it in the response
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

  it('should proactively refresh expired tokens before returning client', async () => {
    // Setup: Load credentials with expired token
    const expiredTime = Date.now() - 1000; // 1 second ago
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'expired_token',
        refresh_token: 'valid_refresh',
        expiry_date: expiredTime,
        scope: 'scope1'
    });
    
    // Mock fetch to simulate cloud function returning fresh tokens
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
            access_token: 'fresh_token',
            expiry_date: Date.now() + 3600000
        })
    });
    
    // First call: load expired credentials from storage, should trigger proactive refresh
    const firstClient = await authManager.getAuthenticatedClient();
    expect(firstClient).toBeDefined();
    
    // Verify fetch was called to refresh the token
    expect(global.fetch).toHaveBeenCalledWith(
        'https://google-workspace-extension.geminicli.com/refreshToken',
        expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('valid_refresh')
        })
    );
    
    // Verify new token was saved with preserved refresh_token
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
            access_token: 'fresh_token',
            refresh_token: 'valid_refresh'
        })
    );
  });

  it('should proactively refresh tokens expiring within buffer (5 minutes)', async () => {
    // Setup: Load credentials with token expiring in 4 minutes (within 5 min buffer)
    const expiresIn4Minutes = Date.now() + 4 * 60 * 1000;
    (OAuthCredentialStorage.loadCredentials as jest.Mock).mockResolvedValue({
        access_token: 'soon_expiring_token',
        refresh_token: 'valid_refresh',
        expiry_date: expiresIn4Minutes,
        scope: 'scope1'
    });
    
    // Mock fetch to simulate cloud function returning fresh tokens
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
            access_token: 'fresh_token',
            expiry_date: Date.now() + 3600000
        })
    });
    
    // Call getAuthenticatedClient
    const client = await authManager.getAuthenticatedClient();
    expect(client).toBeDefined();
    
    // Verify fetch was called to refresh the token because it was within buffer
    expect(global.fetch).toHaveBeenCalledWith(
        'https://google-workspace-extension.geminicli.com/refreshToken',
        expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('valid_refresh')
        })
    );
  });
});
