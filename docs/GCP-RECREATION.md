# Recreating the GCP Project

This guide provides step-by-step instructions to recreate the Google Cloud
Platform (GCP) project and infrastructure required for the Google Workspace
Extension.

## Overview

The extension uses a "Hybrid" OAuth flow for security:

1. **Local Client**: Requests authorization from the user.
2. **Cloud Function**: Acts as a secure proxy to exchange the authorization code
   for tokens. It holds the `CLIENT_SECRET` securely in Secret Manager.
3. **Secret Manager**: Stores the OAuth Client Secret.

## Prerequisites

- A Google Cloud Project with billing enabled.
- [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install)
  installed and authenticated.
- Node.js and npm installed.

## Step 1: Configure OAuth Consent Screen

Before running the setup script, configure the OAuth consent screen in the
Google Cloud Console.

1. Go to
   [APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. Select **Internal** (if you are a Google Workspace user) or **External**.
3. Fill in the required App information.
4. **Scopes**: Add the following scopes:
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/chat.spaces`
   - `https://www.googleapis.com/auth/chat.messages`
   - `https://www.googleapis.com/auth/chat.memberships`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/directory.readonly`
   - `https://www.googleapis.com/auth/presentations.readonly`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`

## Step 2: Run the Automated Setup Script

The setup script handles the full infrastructure setup in the correct order:

1. Set your project ID:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```
2. Run the setup script:
   ```bash
   ./scripts/setup-gcp.sh
   ```

The script will:

1. Enable all required GCP APIs.
2. Deploy the Cloud Function and display its URL.
3. Prompt you to create an **OAuth 2.0 Client ID** in the Google Cloud Console
   using the deployed function URL as the redirect URI.
4. Collect your Client ID and Client Secret.
5. Store the Client Secret in Secret Manager.
6. Update the Cloud Function with the OAuth configuration.
7. Grant the Cloud Function access to the secret.

## Step 3: Local Configuration

After running the script, set the following environment variables in your shell
(e.g., in `.zshrc` or `.bashrc`):

```bash
export WORKSPACE_CLIENT_ID="your-client-id"
export WORKSPACE_CLOUD_FUNCTION_URL="https://your-cloud-function-url"
```

The script will display the exact values to use.

Alternatively, you can modify the `DEFAULT_CONFIG` in
`workspace-server/src/utils/config.ts`.

## Why a Cloud Function?

The extension uses a Cloud Function to protect your `CLIENT_SECRET`.

- If the `CLIENT_SECRET` were included in the local extension code, anyone with
  access to the extension could steal it.
- By using a Cloud Function, the secret stays in your GCP project and is only
  used server-side during the token exchange.
- The local client only ever sees the resulting tokens, never the secret.
