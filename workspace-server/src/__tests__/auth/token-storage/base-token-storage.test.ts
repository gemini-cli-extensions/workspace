/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BaseTokenStorage } from '../../../auth/token-storage/base-token-storage';
import type { OAuthCredentials, OAuthToken } from '../../../auth/token-storage/types';

class TestTokenStorage extends BaseTokenStorage {
  private storage = new Map<string, OAuthCredentials>();

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    return this.storage.get(serverName) || null;
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);
    this.storage.set(credentials.serverName, credentials);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    this.storage.delete(serverName);
  }

  async listServers(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    return new Map(this.storage);
  }

  async clearAll(): Promise<void> {
    this.storage.clear();
  }

  override validateCredentials(credentials: OAuthCredentials): void {
    super.validateCredentials(credentials);
  }



  override sanitizeServerName(serverName: string): string {
    return super.sanitizeServerName(serverName);
  }
}

describe('BaseTokenStorage', () => {
  let storage: TestTokenStorage;

  beforeEach(() => {
    storage = new TestTokenStorage('gemini-cli-mcp-oauth');
  });

  describe('validateCredentials', () => {
    it('should validate valid credentials with access token', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      expect(() => storage.validateCredentials(credentials)).not.toThrow();
    });

    it('should validate valid credentials with refresh token', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      expect(() => storage.validateCredentials(credentials)).not.toThrow();
    });

    it('should throw for missing server name', () => {
      const credentials = {
        serverName: '',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Server name is required',
      );
    });

    it('should throw for missing token', () => {
      const credentials = {
        serverName: 'test-server',
        token: null as unknown as OAuthToken,
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Token is required',
      );
    });

    it('should throw for missing access token and refresh token', () => {
      const credentials = {
        serverName: 'test-server',
        token: {
          accessToken: '',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Access token or refresh token is required',
      );
    });

    it('should throw for missing token type', () => {
      const credentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: '',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Token type is required',
      );
    });
  });



  describe('sanitizeServerName', () => {
    it('should keep valid characters', () => {
      expect(storage.sanitizeServerName('test-server.example_123')).toBe(
        'test-server.example_123',
      );
    });

    it('should replace invalid characters with underscore', () => {
      expect(storage.sanitizeServerName('test@server#example')).toBe(
        'test_server_example',
      );
    });

    it('should handle special characters', () => {
      expect(storage.sanitizeServerName('test server/example:123')).toBe(
        'test_server_example_123',
      );
    });
  });
});