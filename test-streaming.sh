#!/bin/bash

# Test Streaming Endpoint
# Usage: ./test-streaming.sh "Your question here"

QUERY="${1:-What is 2+2?}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"

echo "Testing streaming endpoint..."
echo "Query: $QUERY"
echo "Backend: $BACKEND_URL"
echo ""

# Make streaming request (without auth for testing - will fail auth but shows endpoint works)
curl -N -X POST "$BACKEND_URL/api/ai-integration/chat-stream" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d "{\"query\":\"$QUERY\",\"format\":\"text\"}" \
  2>&1

echo ""
echo "Done!"
