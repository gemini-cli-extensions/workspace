
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
      setCredentials: jest.fn(),
      generateAuthUrl: jest.fn(),
      on: jest.fn(),
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
    expect(OAuthCredentialStorage.saveCredentials).toHaveBeenCalledWith({
        access_token: 'new_token',
        refresh_token: 'old_refresh', // Should be preserved
        expiry_date: 123456789,
        scope: 'scope1'
    });
  });
});
