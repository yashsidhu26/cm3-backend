#!/bin/bash

# Simple streaming test that shows server logs

if [ -z "$SESSION_TOKEN" ]; then
  echo "❌ SESSION_TOKEN required"
  echo "   Get from browser DevTools → Application → Cookies"
  echo "   Then run: SESSION_TOKEN=your-token ./test-streaming-simple.sh"
  exit 1
fi

echo "🧪 Testing streaming with detailed logs..."
echo ""

curl -N -X POST http://localhost:3000/api/ai-integration/chat-stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -H "Cookie: super-app.session_token=$SESSION_TOKEN" \
  -d '{"query":"What is a utopian society?","format":"text"}' \
  2>&1 | while IFS= read -r line; do
    timestamp=$(date +%H:%M:%S.%3N)
    echo "[$timestamp] $line"
  done
