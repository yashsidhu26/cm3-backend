#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api"
COOKIES_FILE="/tmp/moodle-test-cookies.txt"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "======================================"
echo "      Moodle Integration Test         "
echo "======================================"

# 1. Sign In / Sign Up to App
echo -e "\nStep 1: Authenticating with App..."
EMAIL="test-moodle-${RANDOM}@example.com"
PASSWORD="Password123!"
NAME="Moodle Tester"

# Try sign in first (if user exists from previous run)
SIGNIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\", \"password\":\"$PASSWORD\"}" \
  -c $COOKIES_FILE)

if echo "$SIGNIN_RESPONSE" | grep -q '"user"'; then
    echo -e "${GREEN}✓ Signed in as $EMAIL${NC}"
else
    # Sign up if sign in failed
    echo "Sign in failed, trying sign up..."
    SIGNUP_RESPONSE=$(curl -s -X POST "$API_URL/auth/sign-up/email" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$EMAIL\", \"password\":\"$PASSWORD\", \"name\":\"$NAME\"}" \
      -c $COOKIES_FILE)
      
    if echo "$SIGNUP_RESPONSE" | grep -q '"user"'; then
        echo -e "${GREEN}✓ Created account for $EMAIL${NC}"
    else
        echo -e "${RED}✗ Failed to authenticate${NC}"
        echo "Response: $SIGNUP_RESPONSE"
        exit 1
    fi
fi

# 2. Get Moodle Credentials
echo -e "\nStep 2: Enter Moodle Credentials"
read -p "Moodle Username (BITS ID): " MOODLE_USER
read -s -p "Moodle Password: " MOODLE_PASS
echo ""

# 3. Connect Moodle
echo -e "\nStep 3: Connecting Moodle..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/academics/moodle/login" \
  -H "Content-Type: application/json" \
  -b $COOKIES_FILE \
  -d "{\"username\":\"$MOODLE_USER\", \"password\":\"$MOODLE_PASS\"}")

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Moodle connected successfully!${NC}"
else
    echo -e "${RED}✗ Moodle connection failed${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

# 4. Check Status
echo -e "\nStep 4: Checking Connection Status..."
STATUS_RESPONSE=$(curl -s -X GET "$API_URL/academics/moodle/status" \
  -b $COOKIES_FILE)

echo "Status: $STATUS_RESPONSE"

# 5. Fetch Notifications
echo -e "\nStep 5: Fetching Notifications..."
NOTIFY_RESPONSE=$(curl -s -X GET "$API_URL/academics/moodle/notifications" \
  -b $COOKIES_FILE)

# Pretty print json if jq is installed, else just cat
if command -v jq &> /dev/null; then
    echo "$NOTIFY_RESPONSE" | jq '.'
else
    echo "$NOTIFY_RESPONSE"
fi

# 6. Logout
echo -e "\nStep 6: Disconnecting Moodle..."
LOGOUT_RESPONSE=$(curl -s -X DELETE "$API_URL/academics/moodle/logout" \
  -b $COOKIES_FILE)

echo "Logout: $LOGOUT_RESPONSE"

echo -e "\n${GREEN}Test Complete!${NC}"
