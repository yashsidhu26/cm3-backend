#!/bin/bash

echo "🔍 Diagnosing Super App Issues"
echo "=============================="
echo ""

# Check .env
echo "1. Checking .env file..."
if [ -f .env ]; then
    echo "   ✓ .env exists"
    if grep -q "BASE_URL" .env; then
        echo "   ✓ BASE_URL is set"
        BASE_URL=$(grep "BASE_URL" .env | cut -d= -f2)
        echo "     Value: $BASE_URL"
    else
        echo "   ✗ BASE_URL is missing!"
    fi
    
    if grep -q "BETTER_AUTH_SECRET" .env; then
        echo "   ✓ BETTER_AUTH_SECRET is set"
    else
        echo "   ✗ BETTER_AUTH_SECRET is missing!"
    fi
    
    if grep -q "DATABASE_URL" .env; then
        echo "   ✓ DATABASE_URL is set"
        DB_HOST=$(grep "DATABASE_URL" .env | cut -d@ -f2 | cut -d: -f1)
        echo "     Database host: $DB_HOST"
    else
        echo "   ✗ DATABASE_URL is missing!"
    fi
else
    echo "   ✗ .env file not found!"
fi

echo ""

# Check server
echo "2. Checking server..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✓ Server is running"
    UPTIME=$(curl -s http://localhost:3000/health | grep -o '"uptime":[0-9.]*' | cut -d: -f2)
    echo "     Uptime: ${UPTIME}s"
else
    echo "   ✗ Server is not running!"
    echo "     Run: bun run dev"
fi

echo ""

# Test signup
echo "3. Testing signup endpoint..."
TIMESTAMP=$(date +%s)
EMAIL="test_${TIMESTAMP}@example.com"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"TestPassword123!\",\"name\":\"Test User\"}" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

echo "   HTTP Status: $HTTP_CODE"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "   ✓ Signup works!"
    echo "   Response: $BODY"
elif [ "$HTTP_CODE" = "500" ]; then
    echo "   ✗ Server error (500)"
    if [ -n "$BODY" ]; then
        echo "   Error details: $BODY"
    else
        echo "   No error details returned"
        echo "   Check server logs for more information"
    fi
else
    echo "   ⚠ Status: $HTTP_CODE"
    echo "   Response: $BODY"
fi

echo ""
echo "=============================="
echo "Diagnosis complete!"
echo ""
echo "If signup fails:"
echo "1. Make sure server was restarted: bun run dev"
echo "2. Check server terminal for error logs"
echo "3. Verify database is accessible"
echo "4. Check .env configuration"
