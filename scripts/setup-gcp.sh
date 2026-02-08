#!/bin/bash

# GCP Setup Script for Google Workspace Extension
# This script enables necessary APIs and helps set up Secret Manager and Cloud Functions.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Google Cloud Platform setup...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Get current project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No Google Cloud project is currently set.${NC}"
    echo "Please run: gcloud config set project [PROJECT_ID]"
    exit 1
fi

echo -e "Using project: ${GREEN}$PROJECT_ID${NC}"

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
)

for api in "${APIS[@]}"; do
    echo "Enabling $api..."
    gcloud services enable "$api"
done

echo -e "${GREEN}APIs enabled successfully.${NC}"

# 2. Deploy Cloud Function (initial deploy without OAuth credentials)
echo -e "\n${YELLOW}Step 2: Deploying Cloud Function...${NC}"

echo -e "${YELLOW}Please enter the GCP region for your Cloud Function (e.g., us-central1):${NC}"
read REGION
if [ -z "$REGION" ]; then
    REGION="us-central1"
    echo -e "${YELLOW}No region entered, defaulting to $REGION.${NC}"
fi

SECRET_ID="workspace-oauth-client-secret"
FUNCTION_NAME="workspace-oauth-handler"

echo "Deploying Cloud Function (initial)..."
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --runtime=nodejs20 \
    --region="$REGION" \
    --source="./cloud_function" \
    --entry-point=oauthHandler \
    --trigger-http \
    --allow-unauthenticated

# Get the canonical URL of the deployed function
FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" --region="$REGION" --format='value(serviceConfig.uri)')
if [ -z "$FUNCTION_URL" ]; then
    echo -e "${RED}Error: Could not retrieve Cloud Function URL. Please check the deployment logs.${NC}"
    exit 1
fi

echo -e "${GREEN}Cloud Function deployed at: $FUNCTION_URL${NC}"

# 3. Collect OAuth credentials
echo -e "\n${YELLOW}Step 3: Configuring OAuth credentials...${NC}"
echo -e "Before continuing, create an OAuth 2.0 Client ID in the Google Cloud Console:"
echo -e "  1. Go to APIs & Services > Credentials > Create Credentials > OAuth client ID"
echo -e "  2. Select ${GREEN}Web application${NC}"
echo -e "  3. Add the following as an Authorized redirect URI:"
echo -e "     ${GREEN}$FUNCTION_URL${NC}"
echo -e "  4. Copy the Client ID and Client Secret"
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

# 4. Setup Secret Manager
echo -e "\n${YELLOW}Step 4: Storing Client Secret in Secret Manager...${NC}"

if gcloud secrets describe "$SECRET_ID" &> /dev/null; then
    echo "Secret $SECRET_ID already exists."
else
    echo "Creating secret $SECRET_ID..."
    gcloud secrets create "$SECRET_ID" --replication-policy=automatic
fi

echo "$CLIENT_SECRET" | gcloud secrets versions add "$SECRET_ID" --data-file=-
echo -e "${GREEN}Secret stored successfully.${NC}"

# 5. Update Cloud Function with OAuth configuration
echo -e "\n${YELLOW}Step 5: Updating Cloud Function with OAuth configuration...${NC}"
gcloud functions deploy "$FUNCTION_NAME" \
    --gen2 \
    --runtime=nodejs20 \
    --region="$REGION" \
    --source="./cloud_function" \
    --entry-point=oauthHandler \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars "CLIENT_ID=$CLIENT_ID,SECRET_NAME=projects/$PROJECT_ID/secrets/$SECRET_ID/versions/latest,REDIRECT_URI=$FUNCTION_URL"

echo -e "${GREEN}Cloud Function updated with OAuth configuration.${NC}"

# 6. Grant Permissions
echo -e "\n${YELLOW}Step 6: Granting Secret Manager Access to Cloud Function...${NC}"
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
