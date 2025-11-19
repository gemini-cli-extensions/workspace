/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { type OAuthCredentials, TokenStorageType } from '../../../auth/token-storage/types';

// Mock paths
const KEYCHAIN_TOKEN_STORAGE_PATH = '../../../auth/token-storage/keychain-token-storage';
const FILE_TOKEN_STORAGE_PATH = '../../../auth/token-storage/file-token-storage';
const HYBRID_TOKEN_STORAGE_PATH = '../../../auth/token-storage/hybrid-token-storage';

interface MockStorage {
  isAvailable?: ReturnType<typeof jest.fn>;
  getCredentials: ReturnType<typeof jest.fn>;
  setCredentials: ReturnType<typeof jest.fn>;
  deleteCredentials: ReturnType<typeof jest.fn>;
  listServers: ReturnType<typeof jest.fn>;
  getAllCredentials: ReturnType<typeof jest.fn>;
  clearAll: ReturnType<typeof jest.fn>;
}

describe('HybridTokenStorage', () => {
  let HybridTokenStorage: typeof import('../../../auth/token-storage/hybrid-token-storage').HybridTokenStorage;
  let storage: import('../../../auth/token-storage/hybrid-token-storage').HybridTokenStorage;
  let mockKeychainStorage: MockStorage;
  let mockFileStorage: MockStorage;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env['GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE'] = 'false';

    mockKeychainStorage = {
      isAvailable: jest.fn(),
      getCredentials: jest.fn(),
      setCredentials: jest.fn(),
      deleteCredentials: jest.fn(),
      listServers: jest.fn(),
      getAllCredentials: jest.fn(),
      clearAll: jest.fn(),
    };

    mockFileStorage = {
      getCredentials: jest.fn(),
      setCredentials: jest.fn(),
      deleteCredentials: jest.fn(),
      listServers: jest.fn(),
      getAllCredentials: jest.fn(),
      clearAll: jest.fn(),
    };

    jest.doMock(KEYCHAIN_TOKEN_STORAGE_PATH, () => ({
      KeychainTokenStorage: jest.fn().mockImplementation(() => mockKeychainStorage),
    }));

    jest.mock(FILE_TOKEN_STORAGE_PATH, () => ({
      FileTokenStorage: {
        create: jest.fn().mockImplementation(() => {
          return Promise.resolve(mockFileStorage);
        }),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    HybridTokenStorage = require(HYBRID_TOKEN_STORAGE_PATH).HybridTokenStorage;
    storage = new HybridTokenStorage('test-service');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('storage selection', () => {
    it('should use keychain when available', async () => {
      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');

      expect(mockKeychainStorage.isAvailable).toHaveBeenCalled();
      expect(mockKeychainStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await storage.getStorageType()).toBe(TokenStorageType.KEYCHAIN);
    });

    it('should use file storage when GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE is set', async () => {
      process.env['GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE'] = 'true';
      mockFileStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');

      expect(mockKeychainStorage.isAvailable).not.toHaveBeenCalled();
      expect(mockFileStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await storage.getStorageType()).toBe(
        TokenStorageType.ENCRYPTED_FILE,
      );
    });

    it('should fall back to file storage when keychain is unavailable', async () => {
      mockKeychainStorage.isAvailable!.mockResolvedValue(false);
      mockFileStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');

      expect(mockKeychainStorage.isAvailable).toHaveBeenCalled();
      expect(mockFileStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await storage.getStorageType()).toBe(
        TokenStorageType.ENCRYPTED_FILE,
      );
    });

    it('should fall back to file storage when keychain throws error', async () => {
      mockKeychainStorage.isAvailable!.mockRejectedValue(
        new Error('Keychain error'),
      );
      mockFileStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');

      expect(mockKeychainStorage.isAvailable).toHaveBeenCalled();
      expect(mockFileStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await storage.getStorageType()).toBe(
        TokenStorageType.ENCRYPTED_FILE,
      );
    });

    it('should cache storage selection', async () => {
      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');
      await storage.getCredentials('another-server');

      expect(mockKeychainStorage.isAvailable).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.getCredentials.mockResolvedValue(credentials);

      const result = await storage.getCredentials('test-server');

      expect(result).toEqual(credentials);
      expect(mockKeychainStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
    });
  });

  describe('setCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.setCredentials.mockResolvedValue(undefined);

      await storage.setCredentials(credentials);

      expect(mockKeychainStorage.setCredentials).toHaveBeenCalledWith(
        credentials,
      );
    });
  });

  describe('deleteCredentials', () => {
    it('should delegate to selected storage', async () => {
      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.deleteCredentials.mockResolvedValue(undefined);

      await storage.deleteCredentials('test-server');

      expect(mockKeychainStorage.deleteCredentials).toHaveBeenCalledWith(
        'test-server',
      );
    });
  });

  describe('listServers', () => {
    it('should delegate to selected storage', async () => {
      const servers = ['server1', 'server2'];
      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.listServers.mockResolvedValue(servers);

      const result = await storage.listServers();

      expect(result).toEqual(servers);
      expect(mockKeychainStorage.listServers).toHaveBeenCalled();
    });
  });

  describe('getAllCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentialsMap = new Map([
        [
          'server1',
          {
            serverName: 'server1',
            token: { accessToken: 'token1', tokenType: 'Bearer' },
            updatedAt: Date.now(),
          },
        ],
        [
          'server2',
          {
            serverName: 'server2',
            token: { accessToken: 'token2', tokenType: 'Bearer' },
            updatedAt: Date.now(),
          },
        ],
      ]);

      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.getAllCredentials.mockResolvedValue(credentialsMap);

      const result = await storage.getAllCredentials();

      expect(result).toEqual(credentialsMap);
      expect(mockKeychainStorage.getAllCredentials).toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('should delegate to selected storage', async () => {
      mockKeychainStorage.isAvailable!.mockResolvedValue(true);
      mockKeychainStorage.clearAll.mockResolvedValue(undefined);

      await storage.clearAll();

      expect(mockKeychainStorage.clearAll).toHaveBeenCalled();
    });
  });
});