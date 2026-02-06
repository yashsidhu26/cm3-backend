#!/bin/bash

###############################################################################
# Gmail Auth Setup Script
# 
# This script helps you:
# 1. Sign up a new user via Better Auth
# 2. Get the Gmail OAuth authorization URL
# 3. Connect the user's Gmail account
#
# Usage: ./scripts/setup-gmail.sh
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API Base URL
API_URL="${API_URL:-http://localhost:3000}"

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Gmail Auth Setup Script             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

###############################################################################
# Step 1: Choose Action
###############################################################################

echo -e "${YELLOW}Step 1: Authentication Method${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1) Sign Up (New Account)"
echo "2) Sign In (Existing Account)"
read -p "Choose an option (1 or 2): " AUTH_CHOICE
echo ""

if [ "$AUTH_CHOICE" != "1" ] && [ "$AUTH_CHOICE" != "2" ]; then
    echo -e "${RED}Invalid option selected.${NC}"
    exit 1
fi

###############################################################################
# Step 2: Collect Information
###############################################################################

echo -e "${YELLOW}Step 2: User Information${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$AUTH_CHOICE" == "1" ]; then
    # SIGN UP FLOW
    read -p "Enter user's name: " USER_NAME
    read -p "Enter user's email: " USER_EMAIL
    read -sp "Enter password (min 8 chars): " USER_PASSWORD
    echo ""
    read -sp "Confirm password: " USER_PASSWORD_CONFIRM
    echo ""

    if [ "$USER_PASSWORD" != "$USER_PASSWORD_CONFIRM" ]; then
        echo -e "${RED}✗ Passwords don't match!${NC}"
        exit 1
    fi

    if [ ${#USER_PASSWORD} -lt 8 ]; then
        echo -e "${RED}✗ Password must be at least 8 characters!${NC}"
        exit 1
    fi
else
    # SIGN IN FLOW
    read -p "Enter user's email: " USER_EMAIL
    read -sp "Enter password: " USER_PASSWORD
    echo ""
fi
echo ""

###############################################################################
# Step 3: Authenticate
###############################################################################

if [ "$AUTH_CHOICE" == "1" ]; then
    echo -e "${YELLOW}Step 3a: Creating Account${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/sign-up/email" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$USER_EMAIL\",
        \"password\": \"$USER_PASSWORD\",
        \"name\": \"$USER_NAME\"
      }")

    # Check if signup was successful
    if echo "$SIGNUP_RESPONSE" | grep -q '"user"'; then
        echo -e "${GREEN}✓ User account created successfully!${NC}"
        USER_ID=$(echo "$SIGNUP_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo -e "User ID: ${BLUE}$USER_ID${NC}"
    else
        echo -e "${RED}✗ Failed to create user account${NC}"
        echo "Response: $SIGNUP_RESPONSE"
        exit 1
    fi
    echo ""
fi

# ALWAYS SIGN IN (to get session cookie)
echo -e "${YELLOW}Step 3b: Signing In${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SIGNIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -c /tmp/gmail-setup-cookies.txt \
  -d "{
    \"email\": \"$USER_EMAIL\",
    \"password\": \"$USER_PASSWORD\"
  }")

# Debug: Show what cookies were set
echo "Debug: Cookies saved to /tmp/gmail-setup-cookies.txt"
if [ -f /tmp/gmail-setup-cookies.txt ]; then
    cat /tmp/gmail-setup-cookies.txt
fi

# Check if sign-in was successful by looking for user in response
# Better Auth returns { session: ..., user: ... } OR just { user: ... } depending on config
# But it always sets the cookie which is what we need
if echo "$SIGNIN_RESPONSE" | grep -q '"user"'; then
    echo -e "${GREEN}✓ Signed in successfully!${NC}"
else
    echo -e "${RED}✗ Failed to sign in${NC}"
    echo "Response: $SIGNIN_RESPONSE"
    exit 1
fi
echo ""

###############################################################################
# Step 4: Get Gmail OAuth URL
###############################################################################

echo -e "${YELLOW}Step 4: Getting Gmail OAuth URL${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Use cookie jar file instead of trying to extract individual cookies
AUTH_URL_RESPONSE=$(curl -s -X GET "$API_URL/auth/url" \
  -b /tmp/gmail-setup-cookies.txt)

AUTH_URL=$(echo "$AUTH_URL_RESPONSE" | grep -o '"authUrl":"[^"]*"' | cut -d'"' -f4 | sed 's/\\u0026/\&/g')

if [ -z "$AUTH_URL" ]; then
    echo -e "${RED}✗ Failed to get Gmail OAuth URL${NC}"
    echo "Response: $AUTH_URL_RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Gmail OAuth URL retrieved!${NC}"
echo ""

###############################################################################
# Step 5: Display OAuth URL
###############################################################################

echo -e "${YELLOW}Step 5: Connect Gmail Account${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}Please open this URL in your browser to authorize Gmail:${NC}"
echo ""
echo -e "${BLUE}$AUTH_URL${NC}"
echo ""
echo -e "${YELLOW}After authorizing, you'll be redirected to a callback URL.${NC}"
echo -e "${YELLOW}Copy the 'code' parameter from the callback URL.${NC}"
echo ""
echo "Example callback URL:"
echo "  http://localhost:3000/auth/callback?code=4/0AY0e-g7..."
echo "                                      ^^^^^^^^^^^^^ (copy this part)"
echo ""

read -p "Enter the authorization code: " AUTH_CODE

if [ -z "$AUTH_CODE" ]; then
    echo -e "${RED}✗ No authorization code provided${NC}"
    exit 1
fi

###############################################################################
# Step 6: Exchange Code for Tokens
###############################################################################

echo ""
echo -e "${YELLOW}Step 6: Saving Gmail Tokens${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CALLBACK_RESPONSE=$(curl -s -X GET "$API_URL/auth/callback?code=$AUTH_CODE" \
  -b /tmp/gmail-setup-cookies.txt \
  -L)  # Follow redirects

if echo "$CALLBACK_RESPONSE" | grep -q "Gmail Connected\|Gmail authorized"; then
    echo -e "${GREEN}✓ Gmail tokens saved successfully!${NC}"
else
    echo -e "${RED}✗ Failed to save Gmail tokens${NC}"
    echo "Response: $CALLBACK_RESPONSE"
    exit 1
fi

###############################################################################
# Step 7: Verify Connection
###############################################################################

echo ""
echo -e "${YELLOW}Step 7: Verifying Gmail Connection${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STATUS_RESPONSE=$(curl -s -X GET "$API_URL/auth/status" \
  -b /tmp/gmail-setup-cookies.txt)

CONNECTED=$(echo "$STATUS_RESPONSE" | grep -o '"connected":[^,}]*' | cut -d':' -f2)
GMAIL_EMAIL=$(echo "$STATUS_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)

if [ "$CONNECTED" = "true" ]; then
    echo -e "${GREEN}✓ Gmail connection verified!${NC}"
    echo -e "Connected Gmail: ${BLUE}$GMAIL_EMAIL${NC}"
else
    echo -e "${RED}✗ Gmail not connected${NC}"
    echo "Status: $STATUS_RESPONSE"
    exit 1
fi

###############################################################################
# Cleanup
###############################################################################

rm -f /tmp/gmail-setup-cookies.txt

###############################################################################
# Success Summary
###############################################################################

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup Complete! ✓               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "User Details:"
echo -e "  Name:  ${BLUE}$USER_NAME${NC}"
echo -e "  Email: ${BLUE}$USER_EMAIL${NC}"
echo -e "  ID:    ${BLUE}$USER_ID${NC}"
echo ""
echo -e "Gmail Connection:"
echo -e "  Status: ${GREEN}Connected${NC}"
echo -e "  Email:  ${BLUE}$GMAIL_EMAIL${NC}"
echo ""
echo -e "${YELLOW}You can now use this account to access Gmail API!${NC}"
echo ""
