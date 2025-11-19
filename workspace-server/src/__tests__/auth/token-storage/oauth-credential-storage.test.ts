/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OAuthCredentialStorage } from '../../../auth/token-storage/oauth-credential-storage';
import { HybridTokenStorage } from '../../../auth/token-storage/hybrid-token-storage';
import { type Credentials } from 'google-auth-library';
import { type OAuthCredentials } from '../../../auth/token-storage/types';

// Mock the HybridTokenStorage dependency
jest.mock('../../../auth/token-storage/hybrid-token-storage');

describe('OAuthCredentialStorage', () => {
  const mockGoogleCredentials: Credentials = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expiry_date: 1234567890,
    token_type: 'Bearer',
    scope: 'test-scope',
  };

  const mockMcpCredentials: OAuthCredentials = {
    serverName: 'main-account',
    token: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: 1234567890,
      tokenType: 'Bearer',
      scope: 'test-scope',
    },
    updatedAt: expect.any(Number) as any,
  };

  let getCredentialsMock: any;
  let setCredentialsMock: any;
  let deleteCredentialsMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

    getCredentialsMock = jest
      .spyOn(HybridTokenStorage.prototype, 'getCredentials')
      .mockResolvedValue(null);
    setCredentialsMock = jest
      .spyOn(HybridTokenStorage.prototype, 'setCredentials')
      .mockResolvedValue(undefined);
    deleteCredentialsMock = jest
      .spyOn(HybridTokenStorage.prototype, 'deleteCredentials')
      .mockResolvedValue(undefined);
  });

  describe('loadCredentials', () => {
    it('should load credentials from HybridTokenStorage if available', async () => {
      getCredentialsMock.mockResolvedValue(mockMcpCredentials);

      const credentials = await OAuthCredentialStorage.loadCredentials();

      expect(getCredentialsMock).toHaveBeenCalledWith('main-account');
      expect(credentials).toEqual(mockGoogleCredentials);
    });

    it('should return null if no credentials found', async () => {
      getCredentialsMock.mockResolvedValue(null);

      const credentials = await OAuthCredentialStorage.loadCredentials();

      expect(getCredentialsMock).toHaveBeenCalledWith('main-account');
      expect(credentials).toBeNull();
    });

    it('should throw an error if loading fails', async () => {
      getCredentialsMock.mockRejectedValue(new Error('Storage error'));

      await expect(OAuthCredentialStorage.loadCredentials()).rejects.toThrow(
        'Storage error',
      );
    });
  });

  describe('saveCredentials', () => {
    it('should save credentials to HybridTokenStorage', async () => {
      setCredentialsMock.mockResolvedValue(undefined);

      await OAuthCredentialStorage.saveCredentials(mockGoogleCredentials);

      expect(setCredentialsMock).toHaveBeenCalledWith(mockMcpCredentials);
    });
  });

  describe('clearCredentials', () => {
    it('should delete credentials from HybridTokenStorage', async () => {
      deleteCredentialsMock.mockResolvedValue(undefined);

      await OAuthCredentialStorage.clearCredentials();

      expect(deleteCredentialsMock).toHaveBeenCalledWith('main-account');
    });

    it('should throw an error if clearing from HybridTokenStorage fails', async () => {
      deleteCredentialsMock.mockRejectedValue(new Error('Clear error'));

      await expect(OAuthCredentialStorage.clearCredentials()).rejects.toThrow(
        'Clear error',
      );
    });
  });
});