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
import * as readline from 'node:readline';
import { logToFile } from '../utils/logger';
import open from '../utils/open-wrapper';
import { shouldLaunchBrowser } from '../utils/secure-browser-launcher';
import { OAuthCredentialStorage } from './token-storage/oauth-credential-storage';

// The Client ID for the OAuth flow.
// The secret is handled by the cloud function, not in the client.
const CLIENT_ID = '338689075775-o75k922vn5fdl18qergr96rp8g63e4d7.apps.googleusercontent.com';
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

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

    private isTokenExpiringSoon(credentials: Auth.Credentials): boolean {
        return !!(credentials.expiry_date && 
            credentials.expiry_date < Date.now() + TOKEN_EXPIRY_BUFFER_MS);
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

    private async authManual(client: Auth.OAuth2Client): Promise<void> {
        logToFile(`Requesting manual authentication with scopes: ${this.scopes.join(', ')}`);

        // SECURITY: Generate a random token for CSRF protection.
        const csrfToken = crypto.randomBytes(32).toString('hex');

        // The state now contains a JSON payload indicating the flow mode and CSRF token.
        const statePayload = {
            manual: true,
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

        console.error('Browser launch not supported or disabled.');
        console.error('Please open the following URL in your browser to authenticate:');
        console.error('\n' + authUrl + '\n');
        console.error('After authenticating, copy the JSON credential block and paste it here.');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stderr, // Use stderr so prompts don't interfere with stdout
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                rl.close();
                reject(new Error('Manual authentication timed out after 10 minutes. Please try again.'));
            }, 10 * 60 * 1000); // 10 minutes

            rl.question('Paste credentials JSON here: ', (answer) => {
                clearTimeout(timeout);
                rl.close();
                try {
                    const tokens = JSON.parse(answer.trim());
                    
                    if (tokens.csrf_token_for_validation !== csrfToken) {
                         reject(new Error('CSRF token mismatch. Authentication aborted.'));
                         return;
                    }

                    if (tokens.access_token) {
                        client.setCredentials(tokens);
                        logToFile('Manual authentication successful');
                        resolve();
                    } else {
                        reject(new Error('Invalid credentials JSON: missing access_token'));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse credentials JSON: ${e instanceof Error ? e.message : String(e)}`));
                }
            });
        });
    }

    public async getAuthenticatedClient(): Promise<Auth.OAuth2Client> {
        logToFile('getAuthenticatedClient called');
        
        // Check if we have a cached client with valid credentials
        if (this.client && this.client.credentials && this.client.credentials.refresh_token) {
            logToFile('Returning existing cached client with valid credentials');
            logToFile(`Access token exists: ${!!this.client.credentials.access_token}`);
            logToFile(`Expiry date: ${this.client.credentials.expiry_date}`);
            logToFile(`Current time: ${Date.now()}`);
            
            const isExpired = this.isTokenExpiringSoon(this.client.credentials);
            logToFile(`Token expired: ${isExpired}`);
            
            // Proactively refresh if expired
            if (isExpired) {
                logToFile('Token is expired, refreshing proactively...');
                try {
                    await this.refreshToken();
                    logToFile('Token refreshed successfully');
                } catch (error) {
                    logToFile(`Failed to refresh token: ${error}`);
                    // Clear the client and fall through to re-authenticate
                    this.client = null;
                    await OAuthCredentialStorage.clearCredentials();
                }
            }
            
            // Return the client (either still valid or just refreshed)
            if (this.client) {
                return this.client;
            }
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
                // Create a copy to preserve refresh_token from storage
                const current = await OAuthCredentialStorage.loadCredentials() || {};
                const merged = {
                    ...tokens,
                    refresh_token: tokens.refresh_token || current.refresh_token
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
            
            // Check if the loaded token is expired and refresh proactively
            const isExpired = this.isTokenExpiringSoon(this.client.credentials);
            logToFile(`Token expired: ${isExpired}`);
            
            if (isExpired) {
                logToFile('Loaded token is expired, refreshing proactively...');
                try {
                    await this.refreshToken();
                    logToFile('Token refreshed successfully after loading from storage');
                } catch (error) {
                    logToFile(`Failed to refresh loaded token: ${error}`);
                    // Clear the client and fall through to re-authenticate
                    this.client = null;
                    await OAuthCredentialStorage.clearCredentials();
                }
            }
            
            // Return the client if refresh succeeded or token was still valid
            if (this.client) {
                return this.client;
            }
        }

        if (shouldLaunchBrowser()) {
            const webLogin = await this.authWithWeb(oAuth2Client);
            await open(webLogin.authUrl);
            console.error('Waiting for authentication...');

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
        } else {
            await this.authManual(oAuth2Client);
        }

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

    public async refreshToken(): Promise<void> {
        logToFile('Manual token refresh triggered');
        if (!this.client) {
            logToFile('No client available to refresh, getting new client');
            this.client = await this.getAuthenticatedClient();
        }
        try {
            const currentCredentials = { ...this.client.credentials };
            
            if (!currentCredentials.refresh_token) {
                throw new Error('No refresh token available');
            }
            
            logToFile('Calling cloud function to refresh token...');
            
            // Call the cloud function refresh endpoint
            // The cloud function has the client secret needed for token refresh
            const response = await fetch('https://google-workspace-extension.geminicli.com/refreshToken', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refresh_token: currentCredentials.refresh_token
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
            }
            
            const newTokens = await response.json();
            
            // Merge new tokens with existing credentials, preserving refresh_token
            // Note: Google does NOT return a new refresh_token on refresh
            const mergedCredentials = {
                ...newTokens,
                refresh_token: currentCredentials.refresh_token // Always preserve original
            };

            this.client.setCredentials(mergedCredentials);
            await OAuthCredentialStorage.saveCredentials(mergedCredentials);
            logToFile('Token refreshed and saved successfully via cloud function');
        } catch (error) {
            logToFile(`Error during token refresh: ${error}`);
            throw error;
        }
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
