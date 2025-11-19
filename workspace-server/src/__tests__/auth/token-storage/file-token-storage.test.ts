/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import * as crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileTokenStorage } from '../../../auth/token-storage/file-token-storage';
import type { OAuthCredentials } from '../../../auth/token-storage/types';
import {
  ENCRYPTED_TOKEN_PATH,
  ENCRYPTION_MASTER_KEY_PATH,
} from '../../../utils/paths';

jest.mock('node:fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
  },
}));

jest.mock('node:os', () => ({
  default: {
    homedir: jest.fn(() => '/home/test'),
    hostname: jest.fn(() => 'test-host'),
    userInfo: jest.fn(() => ({ username: 'test-user' })),
  },
  homedir: jest.fn(() => '/home/test'),
  hostname: jest.fn(() => 'test-host'),
  userInfo: jest.fn(() => ({ username: 'test-user' })),
}));

describe('FileTokenStorage', () => {
  let storage: FileTokenStorage;
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof jest.fn>;
    writeFile: ReturnType<typeof jest.fn>;
    unlink: ReturnType<typeof jest.fn>;
    mkdir: ReturnType<typeof jest.fn>;
  };

  const existingCredentials: OAuthCredentials = {
    serverName: 'existing-server',
    token: {
      accessToken: 'existing-token',
      tokenType: 'Bearer',
    },
    updatedAt: Date.now() - 10000,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when master key does not exist', () => {
    it('should create a new master key', async () => {
      const error = new Error('File not found');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);
      storage = await FileTokenStorage.create('test-storage');

      expect(mockFs.readFile).toHaveBeenCalledWith(ENCRYPTION_MASTER_KEY_PATH);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        ENCRYPTION_MASTER_KEY_PATH,
        expect.any(Buffer),
        { mode: 0o600 },
      );
    });
  });

  describe('when master key exists', () => {
    it('should load the master key without creating a new one', async () => {
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
      expect(mockFs.readFile).toHaveBeenCalledWith(ENCRYPTION_MASTER_KEY_PATH);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getCredentials', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });

    it('should return null when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });

    it('should return credentials even if access token is expired', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() - 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toEqual(credentials);
    });

    it('should return credentials for valid tokens', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toEqual(credentials);
    });

    it('should return null for corrupted files', async () => {
      mockFs.readFile.mockResolvedValue('corrupted-data');

      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });
  });

  describe('setCredentials', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });
    it('should save credentials with encryption', async () => {
      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(credentials);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.dirname(ENCRYPTED_TOKEN_PATH),
        { recursive: true, mode: 0o700 },
      );
      expect(mockFs.writeFile).toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toBe(ENCRYPTED_TOKEN_PATH);
      expect(writeCall[1]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(writeCall[2]).toEqual({ mode: 0o600 });
    });

    it('should update existing credentials', async () => {
      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.writeFile.mockResolvedValue(undefined);

      const newCredentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'new-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(newCredentials);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const decrypted = (storage as any).decrypt(writeCall[1]);
      const saved = JSON.parse(decrypted);

      expect(saved['existing-server']).toEqual(existingCredentials);
      expect(saved['test-server'].token.accessToken).toBe('new-token');
    });
  });

  describe('deleteCredentials', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });
    it('should throw when credentials do not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
        'No credentials found for test-server',
      );
    });

    it('should delete file when last credential is removed', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.deleteCredentials('test-server');

      expect(mockFs.unlink).toHaveBeenCalledWith(ENCRYPTED_TOKEN_PATH);
    });

    it('should update file when other credentials remain', async () => {
      const credentials1: OAuthCredentials = {
        serverName: 'server1',
        token: {
          accessToken: 'token1',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const credentials2: OAuthCredentials = {
        serverName: 'server2',
        token: {
          accessToken: 'token2',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = (storage as any).encrypt(
        JSON.stringify({ server1: credentials1, server2: credentials2 }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.writeFile.mockResolvedValue(undefined);

      await storage.deleteCredentials('server1');

      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.unlink).not.toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      const decrypted = (storage as any).decrypt(writeCall[1]);
      const saved = JSON.parse(decrypted);

      expect(saved['server1']).toBeUndefined();
      expect(saved['server2']).toEqual(credentials2);
    });
  });

  describe('listServers', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });
    it('should return empty list when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.listServers();
      expect(result).toEqual([]);
    });

    it('should return list of server names', async () => {
      const credentials: Record<string, OAuthCredentials> = {
        server1: {
          serverName: 'server1',
          token: { accessToken: 'token1', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
        server2: {
          serverName: 'server2',
          token: { accessToken: 'token2', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
      };

      const encryptedData = (storage as any).encrypt(
        JSON.stringify(credentials),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.listServers();
      expect(result).toEqual(['server1', 'server2']);
    });
  });

  describe('clearAll', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });
    it('should delete the token file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.clearAll();

      expect(mockFs.unlink).toHaveBeenCalledWith(ENCRYPTED_TOKEN_PATH);
    });

    it('should not throw when file does not exist', async () => {
      mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.clearAll()).resolves.not.toThrow();
    });
  });

  describe('encryption', () => {
    beforeEach(async () => {
      // All tests assume a master key exists.
      const masterKey = crypto.randomBytes(32);
      mockFs.readFile.mockResolvedValue(masterKey);
      storage = await FileTokenStorage.create('test-storage');
    });
    it('should encrypt and decrypt data correctly', () => {
      const original = 'test-data-123';
      const encrypted = (storage as any).encrypt(original);
      const decrypted = (storage as any).decrypt(encrypted);

      expect(decrypted).toBe(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should produce different encrypted output each time', () => {
      const original = 'test-data';
      const encrypted1 = (storage as any).encrypt(original);
      const encrypted2 = (storage as any).encrypt(original);

      expect(encrypted1).not.toBe(encrypted2);
      expect((storage as any).decrypt(encrypted1)).toBe(original);
      expect((storage as any).decrypt(encrypted2)).toBe(original);
    });

    it('should throw on invalid encrypted data format', () => {
      expect(() => (storage as any).decrypt('invalid-data')).toThrow(
        'Invalid encrypted data format',
      );
    });
  });
});