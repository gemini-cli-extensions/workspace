/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, Auth } from 'googleapis';
import crypto from 'node:crypto';
import * as http from 'node:http';
import * as net from 'node:net';
import * as url from 'node:url';
import { logToFile } from '../utils/logger';
import open from '../utils/open-wrapper';
import { shouldLaunchBrowser } from '../utils/secure-browser-launcher';
import { OAuthCredentialStorage } from './token-storage/oauth-credential-storage';

// The Client ID for the OAuth flow.
// The secret is handled by the cloud function, not in the client.
const CLIENT_ID = '338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com';

/**
 * An Authentication URL for updating the credentials of a Oauth2Client
 * as well as a promise that will resolve when the credentials have
 * been refreshed (or which throws error when refreshing credentials failed).
 */
interface OauthWebLogin {
  authUrl: string;
  loginCompletePromise: Promise<void>;
}

export class AuthManager {
    private client: Auth.OAuth2Client | null = null;
    private scopes: string[];

    constructor(scopes: string[]) {
        this.scopes = scopes;
    }

    private async loadCachedCredentials(client: Auth.OAuth2Client): Promise<boolean> {
        const credentials = await OAuthCredentialStorage.loadCredentials();

        if (credentials) {
            // Check if saved token has required scopes
            const savedScopes = new Set(credentials.scope?.split(' ') ?? []);
            logToFile(`Cached token has scopes: ${[...savedScopes].join(', ')}`);
            logToFile(`Required scopes: ${this.scopes.join(', ')}`);
            
            const missingScopes = this.scopes.filter(scope => !savedScopes.has(scope));
            
            if (missingScopes.length > 0) {
                logToFile(`Token cache missing required scopes: ${missingScopes.join(', ')}`);
                logToFile('Removing cached token to force re-authentication...');
                await OAuthCredentialStorage.clearCredentials();
                return false;
            } else {
                client.setCredentials(credentials);
                return true;
            }
        }

        return false;
    }

    public async getAuthenticatedClient(): Promise<Auth.OAuth2Client> {
        logToFile('getAuthenticatedClient called');
        
        // Check if we have a cached client with valid credentials
        if (this.client && this.client.credentials && this.client.credentials.refresh_token) {
            logToFile('Returning existing cached client with valid credentials');
            return this.client;
        }

        // Note: No clientSecret is provided here. The secret is only known by the cloud function.
        const options: Auth.OAuth2ClientOptions = {
            clientId: CLIENT_ID,
        };
        const oAuth2Client = new google.auth.OAuth2(options);

        oAuth2Client.on('tokens', async (tokens) => {
            logToFile('Tokens refreshed event received');
            if (tokens.refresh_token) {
                logToFile('New refresh token received in event');
            }
            
            try {
                const current = await OAuthCredentialStorage.loadCredentials();
                const merged = {
                    ...current,
                    ...tokens
                };
                await OAuthCredentialStorage.saveCredentials(merged);
                logToFile('Credentials saved after refresh');
            } catch (e) {
                logToFile(`Error saving refreshed credentials: ${e}`);
            }
        });

        logToFile('No valid cached client, checking for saved credentials...');
        if (await this.loadCachedCredentials(oAuth2Client)) {
            logToFile('Loaded saved credentials, caching and returning client');
            this.client = oAuth2Client;
            return this.client;
        }

        const webLogin = await this.authWithWeb(oAuth2Client);
        await open(webLogin.authUrl);
        console.log('Waiting for authentication...');

        // Add timeout to prevent infinite waiting when browser tab gets stuck
        const authTimeout = 5 * 60 * 1000; // 5 minutes timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
            reject(
            new Error(
                'Authentication timed out after 5 minutes. The browser tab may have gotten stuck in a loading state. ' +
                'Please try again.',
            ),
            );
        }, authTimeout);
        });
        await Promise.race([webLogin.loginCompletePromise, timeoutPromise]);

        await OAuthCredentialStorage.saveCredentials(oAuth2Client.credentials);
        this.client = oAuth2Client;
        return this.client;
    }

    public async clearAuth(): Promise<void> {
        logToFile('Clearing authentication...');
        this.client = null;
        await OAuthCredentialStorage.clearCredentials();
        logToFile('Authentication cleared.');
    }

    private async getAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            let port = 0;
            try {
            const portStr = process.env['OAUTH_CALLBACK_PORT'];
            if (portStr) {
                port = parseInt(portStr, 10);
                if (isNaN(port) || port <= 0 || port > 65535) {
                return reject(
                    new Error(`Invalid value for OAUTH_CALLBACK_PORT: "${portStr}"`),
                );
                }
                return resolve(port);
            }
            const server = net.createServer();
            server.listen(0, () => {
                const address = server.address()! as net.AddressInfo;
                port = address.port;
            });
            server.on('listening', () => {
                server.close();
                server.unref();
            });
            server.on('error', (e) => reject(e));
            server.on('close', () => resolve(port));
            } catch (e) {
            reject(e);
            }
        });
        }

    private async authWithWeb(client: Auth.OAuth2Client): Promise<OauthWebLogin> {
        logToFile(`Requesting authentication with scopes: ${this.scopes.join(', ')}`);

        const port = await this.getAvailablePort();
        const host = process.env['OAUTH_CALLBACK_HOST'] || 'localhost';
        
        const localRedirectUri = `http://${host}:${port}/oauth2callback`;

        const isGuiAvailable = shouldLaunchBrowser();

        // SECURITY: Generate a random token for CSRF protection.
        const csrfToken = crypto.randomBytes(32).toString('hex');

        // The state now contains a JSON payload indicating the flow mode and CSRF token.
        const statePayload = {
            uri: isGuiAvailable ? localRedirectUri : undefined,
            manual: !isGuiAvailable,
            csrf: csrfToken,
        };
        const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

        // The redirect URI for Google's auth server is the cloud function
        const cloudFunctionRedirectUri = 'https://google-workspace-extension.geminicli.com';

        const authUrl = client.generateAuthUrl({
            redirect_uri: cloudFunctionRedirectUri, // Tell Google to go to the cloud function
            access_type: 'offline',
            scope: this.scopes,
            state: state, // Pass our JSON payload in the state
            prompt: 'consent', // Make sure we get a refresh token
        });

        const loginCompletePromise = new Promise<void>((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                try {
                    // Use startsWith for more robust path checking.
                    if (!req.url || !req.url.startsWith('/oauth2callback')) {
                        res.end();
                        reject(
                            new Error(
                                'OAuth callback not received. Unexpected request: ' + req.url,
                            ),
                        );
                        return;
                    }

                    const qs = new url.URL(req.url, `http://${host}:${port}`)
                        .searchParams;

                    // SECURITY: Validate the state parameter to prevent CSRF attacks.
                    const returnedState = qs.get('state');
                    if (returnedState !== csrfToken) {
                        res.end('State mismatch. Possible CSRF attack.');
                        reject(new Error('OAuth state mismatch. Possible CSRF attack.'));
                        return;
                    }

                    if (qs.get('error')) {
                        const errorCode = qs.get('error');
                        const errorDescription =
                            qs.get('error_description') || 'No additional details provided';
                        res.end();
                        reject(
                            new Error(
                            `Google OAuth error: ${errorCode}. ${errorDescription}`,
                            ),
                        );
                        return;
                    }
                    
                    const access_token = qs.get('access_token');
                    const refresh_token = qs.get('refresh_token');
                    const scope = qs.get('scope');
                    const token_type = qs.get('token_type');
                    const expiry_date_str = qs.get('expiry_date');

                    if (access_token && expiry_date_str) {
                        const tokens: Auth.Credentials = {
                            access_token: access_token,
                            refresh_token: refresh_token || null,
                            scope: scope || undefined,
                            token_type: (token_type as 'Bearer') || undefined,
                            expiry_date: parseInt(expiry_date_str, 10),
                        };
                        client.setCredentials(tokens);
                        res.end('Authentication successful! Please return to the console.');
                        resolve();
                    } else {
                        reject(
                            new Error(
                            'Authentication failed: Did not receive tokens from callback.',
                            ),
                        );
                    }
                } catch (e) {
                    reject(e);
                } finally {
                    server.close();
                }
            })

            server.listen(port, host, () => {
            // Server started successfully
            });

            server.on('error', (err) => {
                reject(
                    new Error(
                    `OAuth callback server error: ${err}`,
                    ),
                );
            });
        });

        return {
            authUrl,
            loginCompletePromise,
        };
  }
}
