#!/bin/bash

# GCP Setup Script for Google Workspace Extension
# This script is idempotent — it can be safely re-run without breaking existing config.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper to open a URL in the default browser
open_url() {
    if command -v open &> /dev/null; then
        open "$1"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "$1"
    else
        echo -e "Could not open browser automatically."
    fi
}

echo -e "${YELLOW}Starting Google Cloud Platform setup...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Get current project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No Google Cloud project is currently set.${NC}"
    echo "Please run: gcloud config set project [PROJECT_ID]"
    exit 1
fi

echo -e "Using project: ${GREEN}$PROJECT_ID${NC}"

SECRET_ID="workspace-oauth-client-secret"
FUNCTION_NAME="workspace-oauth-handler"

# 1. Enable Required APIs
echo -e "\n${YELLOW}Step 1: Enabling Required APIs...${NC}"
APIS=(
    "drive.googleapis.com"
    "docs.googleapis.com"
    "calendar-json.googleapis.com"
    "chat.googleapis.com"
    "gmail.googleapis.com"
    "people.googleapis.com"
    "slides.googleapis.com"
    "sheets.googleapis.com"
    "admin.googleapis.com"
    "secretmanager.googleapis.com"
    "cloudfunctions.googleapis.com"
    "cloudbuild.googleapis.com"
    "run.googleapis.com"
    "artifactregistry.googleapis.com"
)

for api in "${APIS[@]}"; do
    echo "Enabling $api..."
    gcloud services enable "$api"
done

echo -e "${GREEN}APIs enabled successfully.${NC}"

# 2. Configure OAuth Consent Screen
echo -e "\n${YELLOW}Step 2: Configure OAuth Consent Screen${NC}"
echo -e "The OAuth consent screen must be configured before creating credentials."
echo ""

CONSENT_URL="https://console.cloud.google.com/apis/credentials/consent?project=$PROJECT_ID"

echo -e "Opening the OAuth consent screen configuration page..."
open_url "$CONSENT_URL"

echo ""
echo -e "If the page did not open, go to:"
echo -e "   ${GREEN}$CONSENT_URL${NC}"
echo ""
echo -e "Configure the consent screen with these settings:"
echo -e "  1. Select ${GREEN}Internal${NC} (Google Workspace) or ${GREEN}External${NC}"
echo -e "  2. Fill in the App name and Support email"
echo -e "  3. Add the following ${GREEN}scopes${NC} (listed below)"
echo -e "  4. Under ${GREEN}Test users${NC}, add the email addresses of anyone"
echo -e "     who will use this extension (required while in Testing mode)"
echo ""

SCOPES=(
    "https://www.googleapis.com/auth/documents"
    "https://www.googleapis.com/auth/drive"
    "https://www.googleapis.com/auth/calendar"
    "https://www.googleapis.com/auth/chat.spaces"
    "https://www.googleapis.com/auth/chat.messages"
    "https://www.googleapis.com/auth/chat.memberships"
    "https://www.googleapis.com/auth/userinfo.profile"
    "https://www.googleapis.com/auth/gmail.modify"
    "https://www.googleapis.com/auth/directory.readonly"
    "https://www.googleapis.com/auth/presentations.readonly"
    "https://www.googleapis.com/auth/spreadsheets.readonly"
)

for scope in "${SCOPES[@]}"; do
    echo -e "     ${GREEN}$scope${NC}"
done

echo ""
echo -e "${YELLOW}Have you finished configuring the OAuth consent screen? (y/n)${NC}"
read CONSENT_DONE
if [ "$CONSENT_DONE" != "y" ] && [ "$CONSENT_DONE" != "Y" ]; then
    echo -e "${RED}Please configure the OAuth consent screen before continuing.${NC}"
    echo -e "Re-run this script when ready."
    exit 1
fi

# 3. Deploy Cloud Function
echo -e "\n${YELLOW}Step 3: Deploying Cloud Function...${NC}"

echo -e "${YELLOW}Please enter the GCP region for your Cloud Function (e.g., us-central1):${NC}"
read REGION
if [ -z "$REGION" ]; then
    REGION="us-central1"
    echo -e "${YELLOW}No region entered, defaulting to $REGION.${NC}"
fi

# Check if the function already exists and get its URL
FUNCTION_URL=""
if gcloud functions describe "$FUNCTION_NAME" --region="$REGION" &> /dev/null; then
    FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --format='value(serviceConfig.uri)')
    echo -e "${GREEN}Cloud Function already exists at: $FUNCTION_URL${NC}"
    echo -e "It will be updated with the final configuration in a later step."
else
    echo "Deploying Cloud Function (initial)..."
    gcloud functions deploy "$FUNCTION_NAME" \
        --gen2 \
        --runtime=nodejs22 \
        --region="$REGION" \
        --source="./cloud_function" \
        --entry-point=oauthHandler \
        --trigger-http \
        --allow-unauthenticated

    FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --format='value(serviceConfig.uri)')
fi

if [ -z "$FUNCTION_URL" ]; then
    echo -e "${RED}Error: Could not retrieve Cloud Function URL. Please check the deployment logs.${NC}"
    exit 1
fi

echo -e "${GREEN}Cloud Function URL: $FUNCTION_URL${NC}"

# 4. Collect OAuth credentials
echo -e "\n${YELLOW}Step 4: Configuring OAuth credentials...${NC}"
echo -e "Create an OAuth 2.0 Client ID in the Google Cloud Console"
echo -e "(or locate your existing one):"
echo -e "  1. Go to APIs & Services > Credentials > Create Credentials > OAuth client ID"
echo -e "  2. Select ${GREEN}Web application${NC}"
echo -e "  3. Add the following as an Authorized redirect URI:"
echo -e "     ${GREEN}$FUNCTION_URL${NC}"
echo -e "  4. Copy the Client ID and Client Secret"
echo ""

CREDENTIALS_URL="https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo -e "Opening the Credentials page..."
open_url "$CREDENTIALS_URL"

echo ""
echo -e "If the page did not open, go to:"
echo -e "   ${GREEN}$CREDENTIALS_URL${NC}"
echo ""

echo -e "${YELLOW}Please enter the OAuth 2.0 Client ID:${NC}"
read CLIENT_ID
if [ -z "$CLIENT_ID" ]; then
    echo -e "${RED}Error: Client ID cannot be empty.${NC}"
    exit 1
fi

echo -e "${YELLOW}Please enter the OAuth 2.0 Client Secret:${NC}"
read -s CLIENT_SECRET
echo
if [ -z "$CLIENT_SECRET" ]; then
    echo -e "${RED}Error: Client Secret cannot be empty.${NC}"
    exit 1
fi

# 5. Setup Secret Manager
echo -e "\n${YELLOW}Step 5: Storing Client Secret in Secret Manager...${NC}"

if gcloud secrets describe "$SECRET_ID" &> /dev/null; then
    echo "Secret $SECRET_ID already exists. Adding new version..."
else
    echo "Creating secret $SECRET_ID..."
    gcloud secrets create "$SECRET_ID" --replication-policy=automatic
fi

echo -n "$CLIENT_SECRET" | gcloud secrets versions add "$SECRET_ID" --data-file=-
echo -e "${GREEN}Secret stored successfully.${NC}"

# 6. Update Cloud Function with OAuth configuration
echo -e "\n${YELLOW}Step 6: Updating Cloud Function with OAuth configuration...${NC}"
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --runtime=nodejs22 \
    --region="$REGION" \
    --source="./cloud_function" \
    --entry-point=oauthHandler \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars "CLIENT_ID=$CLIENT_ID,SECRET_NAME=projects/$PROJECT_ID/secrets/$SECRET_ID/versions/latest,REDIRECT_URI=$FUNCTION_URL"

echo -e "${GREEN}Cloud Function updated with OAuth configuration.${NC}"

# 7. Grant Permissions
echo -e "\n${YELLOW}Step 7: Granting Secret Manager Access to Cloud Function...${NC}"
SERVICE_ACCOUNT=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --format='value(serviceConfig.serviceAccountEmail)')

gcloud secrets add-iam-policy-binding "$SECRET_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor"

echo -e "${GREEN}Permissions granted successfully.${NC}"

echo -e "\n${GREEN}GCP Setup Complete!${NC}"
echo -e "---------------------------------------------------"
echo -e "${YELLOW}Next Steps:${NC}"
echo "Set the following environment variables in your local environment:"
echo -e "   ${GREEN}export WORKSPACE_CLIENT_ID=\"$CLIENT_ID\"${NC}"
echo -e "   ${GREEN}export WORKSPACE_CLOUD_FUNCTION_URL=\"$FUNCTION_URL\"${NC}"
echo -e "---------------------------------------------------"
