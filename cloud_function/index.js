/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import required packages
const functions = require('@google-cloud/functions-framework');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const axios = require('axios');
const { URL } = require('node:url');

// --- Configuration loaded from Environment Variables ---
// These are set in the Google Cloud Function's configuration
const CLIENT_ID = process.env.CLIENT_ID;
const SECRET_NAME = process.env.SECRET_NAME;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Fail fast if required environment variables are missing
if (!CLIENT_ID || !SECRET_NAME || !REDIRECT_URI) {
  throw new Error(
    'Missing required environment variables: CLIENT_ID, SECRET_NAME, and REDIRECT_URI must be set.'
  );
}

// --- Configuration for local storage (used in instructions) ---
const KEYCHAIN_SERVICE_NAME = 'gemini-cli-workspace-oauth';
const KEYCHAIN_ACCOUNT_NAME = 'main-account';
// --- END CONFIGURATION ---

// Initialize the Secret Manager client
const secretClient = new SecretManagerServiceClient();

/**
 * Helper function to access a secret from Secret Manager.
 */
async function getClientSecret() {
  try {
    console.log(`Accessing secret: ${SECRET_NAME}`); // Log which secret is being accessed
    const [version] = await secretClient.accessSecretVersion({
      name: SECRET_NAME,
    });
    const payload = version.payload.data.toString('utf8');
    console.log('Successfully accessed secret.');
    return payload;
  } catch (error) {
    console.error('Failed to access secret version:', error);
    throw new Error('Could not retrieve client secret.');
  }
}

/**
 * Handles the OAuth 2.0 callback.
 * @param {Object} req Express request object.
 * @param {Object} res Express response object.
 */
async function handleCallback(req, res) {
  const code = req.query.code;
  const state = req.query.state; // The state is the base64 encoded local redirect URI
  console.log(`Received request with code: ${code ? 'present' : 'missing'}`);
  console.log(`Received state: ${state ? 'present' : 'missing'}`);

  if (!code) {
    console.error('Missing authorization code in request query parameters.');
    return res.status(400).send('Error: Missing authorization code.');
  }

  try {
    const clientSecret = await getClientSecret();

    console.log(`Exchanging code for token using redirect_uri: ${REDIRECT_URI}`);
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });

    console.log('Token exchange successful.');
    const { access_token, refresh_token, expires_in, scope, token_type } = tokenResponse.data;

    // Calculate expiry_date (timestamp in milliseconds)
    const expiry_date = Date.now() + (expires_in * 1000);

    // If state is present, decode it and decide whether to redirect or show manual page.
    if (state) {
        try {
            // SECURITY: Enforce a reasonable size limit on the state parameter to prevent DoS.
            if (state.length > 4096) {
                throw new Error('State parameter exceeds size limit of 4KB.');
            }

            const payload = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));

            // If not in manual mode and a URI is present, perform the redirect.
            if (payload && payload.manual === false && payload.uri) {
                
                const redirectUrl = new URL(payload.uri);

                // SECURITY: Validate the redirect URI to prevent open redirect attacks.
                if (redirectUrl.hostname !== 'localhost' && redirectUrl.hostname !== '127.0.0.1') {
                    throw new Error(`Invalid redirect hostname: ${redirectUrl.hostname}. Must be localhost or 127.0.0.1.`);
                }
                
                console.log(`Automated flow detected. Redirecting to: ${payload.uri}`);
                
                const finalUrl = redirectUrl; // Use the validated URL object
                finalUrl.searchParams.append('access_token', access_token);
                if (refresh_token) {
                    finalUrl.searchParams.append('refresh_token', refresh_token);
                }
                finalUrl.searchParams.append('scope', scope);
                finalUrl.searchParams.append('token_type', token_type);
                finalUrl.searchParams.append('expiry_date', expiry_date.toString());

                // SECURITY: Pass the CSRF token back to the client for validation.
                if (payload.csrf) {
                    finalUrl.searchParams.append('state', payload.csrf);
                }
                
                return res.redirect(302, finalUrl.toString());
            }
        } catch (e) {
            console.error('Error processing state or redirect. Falling back to manual page.', e);
        }
    }

    // --- Fallback to manual instructions ---
    console.log('Manual flow detected or state was invalid. Rendering instructions page.');
    const credentialsJson = JSON.stringify({
        refresh_token: refresh_token,
        scope: scope,
        token_type: token_type,
        access_token: access_token,
        expiry_date: expiry_date
    }, null, 2); // Pretty print JSON

    // 4. Display the JSON and add a copy button + instructions
    res.set('Content-Type', 'text/html');
    res.status(200).send(`
      <html>
        <head>
          <title>OAuth Token Generated</title>
          <style>
            body { font-family: sans-serif; display: grid; place-items: center; min-height: 90vh; background-color: #f4f7f6; padding: 1rem;}
            .container { background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 90%; width: 600px; }
            h1 { color: #333; margin-top: 0;}
            h3 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
            textarea {
              width: 100%;
              min-height: 150px;
              padding: 0.5rem;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-family: monospace;
              white-space: pre;
              word-break: break-all;
              box-sizing: border-box; /* Include padding and border in the element's total width and height */
            }
            button {
              display: block;
              margin: 1rem auto 1rem 0; /* Align left */
              padding: 0.75rem 1.5rem;
              font-size: 1rem;
              border-radius: 4px;
              border: none;
              background-color: #4285F4;
              color: white;
              cursor: pointer;
              transition: background-color 0.2s;
            }
            button:hover { background-color: #357ae8; }
            button:active { background-color: #2a65d5; }
            #copy-status { font-style: italic; color: green; margin-left: 10px; opacity: 0; transition: opacity 0.5s;}
            .instructions { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; font-size: 0.9em; }
            code { background-color: #eee; padding: 0.2em 0.4em; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Success! Credentials Ready</h1>
            <p>Copy the JSON block below. You'll need to store this as the password/secret in your operating system's keychain.</p>

            <h3>Credentials JSON</h3>
            <textarea id="credentials-json" readonly>${credentialsJson}</textarea>
            <button onclick="copyCredentials()">Copy JSON</button>
            <span id="copy-status">Copied!</span>

            <div class="instructions">
              <h4>Keychain Storage Instructions:</h4>
              <ol>
                <li>Open your OS Keychain/Credential Manager.</li>
                <li>Create a new secure entry (e.g., a "Generic Password" on macOS, a "Windows Credential", or similar on Linux).</li>
                <li>Set the **Service** (or equivalent field) to: <code>${KEYCHAIN_SERVICE_NAME}</code></li>
                <li>Set the **Account** (or username field) to: <code>${KEYCHAIN_ACCOUNT_NAME}</code></li>
                <li>Paste the copied JSON into the **Password/Secret** field.</li>
                <li>Save the entry.</li>
              </ol>
              <p>Your local MCP server will now be able to find and use these credentials automatically.</p>
              <p><small>(If keychain is unavailable, the server falls back to an encrypted file, but keychain is recommended.)</small></p>
            </div>
          </div>

          <script>
            function copyCredentials() {
              const textArea = document.getElementById('credentials-json');
              const status = document.getElementById('copy-status');

              // Use modern Clipboard API if available, with fallback to execCommand
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textArea.value).then(() => {
                  status.textContent = 'Copied!';
                  status.style.color = 'green';
                }, () => {
                  status.textContent = 'Copy failed!';
                  status.style.color = 'red';
                });
              } else {
                // Fallback for older browsers/iframes without clipboard access
                textArea.select();
                try {
                  const successful = document.execCommand('copy');
                  if (successful) {
                    status.textContent = 'Copied!';
                    status.style.color = 'green';
                  } else {
                    status.textContent = 'Copy failed!';
                    status.style.color = 'red';
                  }
                } catch (err) {
                  status.textContent = 'Copy failed!';
                  status.style.color = 'red';
                  console.error('Fallback copy failed: ', err);
                }
              }

              status.style.opacity = 1;
              setTimeout(() => { status.style.opacity = 0; }, 2000);

              // Deselect text after attempting to copy
              if (window.getSelection) {window.getSelection().removeAllRanges();}
              else if (document.selection) {document.selection.empty();}
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
       console.error('Error during token exchange:', error.response.data);
    } else {
       console.error('Error during token exchange:', error instanceof Error ? error.message : error);
    }
    res.status(500).send('An error occurred during the token exchange. Check function logs for details.');
  }
}

/**
 * Handles token refresh.
 * Accepts a refresh_token and returns a new access_token.
 * @param {Object} req Express request object.
 * @param {Object} res Express response object.
 */
async function handleRefreshToken(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    console.error('Invalid method for refreshToken:', req.method);
    return res.status(405).send('Method Not Allowed');
  }

  const { refresh_token } = req.body;
  console.log(`Received refresh request with refresh_token: ${refresh_token ? 'present' : 'missing'}`);
  
  if (!refresh_token) {
    console.error('Missing refresh_token in request body');
    return res.status(400).send('Error: Missing refresh_token in request body.');
  }

  try {
    const clientSecret = await getClientSecret();

    console.log('Refreshing access token via Google OAuth API...');
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: refresh_token,
      grant_type: 'refresh_token',
    });

    console.log('Token refresh successful.');
    const { access_token, expires_in, scope, token_type } = tokenResponse.data;

    // Calculate expiry_date (timestamp in milliseconds)
    const expiry_date = Date.now() + (expires_in * 1000);

    // Return the new credentials
    // Note: Google does NOT return a new refresh_token on refresh
    // The client must preserve the original refresh_token
    res.status(200).json({
      access_token,
      expiry_date,
      token_type,
      scope,
    });

  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('Error during token refresh:', error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error('Error during token refresh:', error instanceof Error ? error.message : error);
      res.status(500).send('An error occurred during token refresh.');
    }
  }
}

/**
 * Main entry point for the Cloud Function.
 * Routes requests to either the callback handler or the refresh handler.
 */
functions.http('oauthHandler', async (req, res) => {
  // Route to refresh handler if path ends with /refresh or /refreshToken or it's a POST with refresh_token
  if (req.path === '/refresh' || req.path === '/refreshToken' || (req.method === 'POST' && req.body && req.body.refresh_token)) {
    return handleRefreshToken(req, res);
  }

  // Route to callback handler if path ends with /callback or /oauth2callback or has 'code' query param
  if (req.path === '/callback' || req.path === '/oauth2callback' || req.query.code) {
    return handleCallback(req, res);
  }

  // Default/Error case
  res.status(400).send('Unknown request type. Expected OAuth callback or token refresh request.');
});
