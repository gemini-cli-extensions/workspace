# Recreating the GCP Project

This guide provides step-by-step instructions to recreate the Google Cloud
Platform (GCP) project and infrastructure required for the Google Workspace
Extension.

## Overview

The extension uses a "Hybrid" OAuth flow for security:

1.  **Local Client**: Requests authorization from the user.
2.  **Cloud Function**: Acts as a secure proxy to exchange the authorization
    code for tokens. It holds the `CLIENT_SECRET` securely in Secret Manager.
3.  **Secret Manager**: Stores the OAuth Client Secret.

## Prerequisites

- A Google Cloud Project with billing enabled.
- [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install)
  installed and authenticated.
- Node.js and npm installed.

## Step 1: Automated Infrastructure Setup

We provide a script to automate most of the GCP setup, including enabling APIs,
creating secrets, and deploying the Cloud Function.

1.  Set your project ID:
    ```bash
    gcloud config set project YOUR_PROJECT_ID
    ```
2.  Run the setup script:
    ```bash
    ./scripts/setup-gcp.sh
    ```
3.  Follow the prompts to enter your **OAuth Client ID** and **Client Secret**.
    (If you don't have them yet, see Step 2 below first).

## Step 2: Manual OAuth Configuration

Some steps must be performed manually in the Google Cloud Console for security
and policy reasons.

### 1. Configure OAuth Consent Screen

1.  Go to
    [APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2.  Select **Internal** (if you are a Google Workspace user) or **External**.
3.  Fill in the required App information.
4.  **Scopes**: Add the following scopes:
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

### 2. Create OAuth 2.0 Client ID

1.  Go to
    [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials).
2.  Click **Create Credentials > OAuth client ID**.
3.  Select **Web application** as the Application type.
4.  Name it (e.g., "Workspace Extension").
5.  **Authorized redirect URIs**: Add the URL of your deployed Cloud Function
    (provided by the setup script).
    - Format:
      `https://[REGION]-[PROJECT_ID].cloudfunctions.net/workspace-oauth-handler`
6.  Click **Create**.
7.  Copy the **Client ID** and **Client Secret**.

## Step 3: Local Configuration

After running the script and configuring the OAuth client, you need to tell the
local extension where to find your infrastructure.

Set the following environment variables in your shell (e.g., in `.zshrc` or
`.bashrc`):

```bash
export WORKSPACE_CLIENT_ID="your-client-id"
export WORKSPACE_CLOUD_FUNCTION_URL="https://your-cloud-function-url"
```

Alternatively, you can modify the `DEFAULT_CONFIG` in
`workspace-server/src/utils/config.ts`.

## Why a Cloud Function?

The extension uses a Cloud Function to protect your `CLIENT_SECRET`.

- If the `CLIENT_SECRET` were included in the local extension code, anyone with
  access to the extension could steal it.
- By using a Cloud Function, the secret stays in your GCP project and is only
  used server-side during the token exchange.
- The local client only ever sees the resulting tokens, never the secret.
