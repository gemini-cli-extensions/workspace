/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OAuthCredentials,
  TokenStorage
} from './types';

export abstract class BaseTokenStorage implements TokenStorage {
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  abstract getCredentials(serverName: string): Promise<OAuthCredentials | null>;
  abstract setCredentials(credentials: OAuthCredentials): Promise<void>;
  abstract deleteCredentials(serverName: string): Promise<void>;
  abstract listServers(): Promise<string[]>;
  abstract getAllCredentials(): Promise<Map<string, OAuthCredentials>>;
  abstract clearAll(): Promise<void>;

  protected validateCredentials(credentials: OAuthCredentials): void {
    if (!credentials.serverName) {
      throw new Error('Server name is required');
    }
    if (!credentials.token) {
      throw new Error('Token is required');
    }
    if (!credentials.token.accessToken && !credentials.token.refreshToken) {
      throw new Error('Access token or refresh token is required');
    }
    if (!credentials.token.tokenType) {
      throw new Error('Token type is required');
    }
  }



  protected sanitizeServerName(serverName: string): string {
    return serverName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  }
}