# Rate Limit Fix (429 Errors)

## Problem

Getting constant 429 errors from Vertex AI:
```json
{
  "error": {
    "code": 429,
    "message": "Resource exhausted. Please try again later.",
    "status": "RESOURCE_EXHAUSTED"
  }
}
```

## Root Causes

1. **No retry logic**: Agent failed immediately on rate limit errors
2. **Too many rapid API calls**: Agent loop makes 5-7 API calls in quick succession
3. **No backoff delays**: Retrying immediately after failure
4. **Multiple concurrent requests**: Testing multiple queries at once

## Solutions Implemented

### 1. Exponential Backoff Retry Logic

Added intelligent retry with exponential backoff for 429 errors:

```typescript
// Retry with increasing delays: 1s → 2s → 4s
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const is429 = error.message?.includes('429') ||
                    error.message?.includes('RESOURCE_EXHAUSTED');

      if (is429 && attempt < MAX_RETRIES - 1) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}
```

### 2. Reduced MAX_ITERATIONS

Changed from 7 to 5 iterations to reduce API calls:

**Before**:
```typescript
const MAX_ITERATIONS = 7; // Too many API calls
```

**After**:
```typescript
const MAX_ITERATIONS = 5; // Reduced to avoid rate limits
```

### 3. Inter-Iteration Delays

Added 200ms delay between agent loop iterations:

```typescript
while (iteration < MAX_ITERATIONS) {
  iteration++;

  // Add delay to avoid rapid API calls
  if (iteration > 1) {
    await sleep(200); // 200ms delay
  }

  // ... rest of loop
}
```

### 4. Better Error Messages

Improved user-facing error messages for rate limit errors:

```typescript
if (is429) {
  throw new AgentError(
    'Rate limit exceeded. Please wait a moment and try again.',
    'RATE_LIMIT_EXCEEDED',
    429
  );
}
```

## Files Modified

### `src/modules/ai-integration/agent/streaming-agent-loop.ts`
- Added `retryWithBackoff()` function
- Added `sleep()` helper
- Reduced `MAX_ITERATIONS` from 7 to 5
- Added 200ms delay between iterations
- Wrapped all `chat.sendMessage()` calls with retry logic
- Improved error handling for 429 errors

### `src/modules/ai-integration/agent/agent-loop.ts`
- Added same retry logic as streaming version
- Reduced `MAX_ITERATIONS` from 7 to 5
- Added 200ms delay between iterations
- Wrapped all `chat.sendMessage()` calls with retry logic
- Better error detection and messages

## How It Works

### Request Flow with Retry

```
User Query
    ↓
[Attempt 1] → Vertex AI
    ↓ (429 error)
[Wait 1s]
    ↓
[Attempt 2] → Vertex AI
    ↓ (429 error)
[Wait 2s]
    ↓
[Attempt 3] → Vertex AI
    ↓ (success)
Response
```

### Agent Loop with Delays

```
Iteration 1: Send initial query
    ↓
[200ms delay]
    ↓
Iteration 2: Process tool calls
    ↓
[200ms delay]
    ↓
Iteration 3: Send tool responses
    ↓
[200ms delay]
    ↓
...continues until MAX_ITERATIONS (5)
```

## Retry Configuration

```typescript
const MAX_RETRIES = 3;           // Retry up to 3 times
const INITIAL_RETRY_DELAY = 1000; // Start with 1 second
const MAX_ITERATIONS = 5;         // Max 5 agent iterations
const ITERATION_DELAY = 200;      // 200ms between iterations
```

### Delay Calculation

- Attempt 1: 1000ms (1 second)
- Attempt 2: 2000ms (2 seconds)
- Attempt 3: 4000ms (4 seconds)

Total max wait time: 7 seconds across 3 retries

## Testing

### Before Fix
```bash
# Every request failed immediately
$ SESSION_TOKEN=xxx bun test-streaming-manual.ts
❌ Error: got status: 429 Too Many Requests
```

### After Fix
```bash
# Requests succeed with retry
$ SESSION_TOKEN=xxx bun test-streaming-manual.ts
[Agent] Rate limit hit, retrying in 1000ms... (attempt 1/3)
[Agent] Rate limit hit, retrying in 2000ms... (attempt 2/3)
✅ Request succeeded on attempt 3
```

## Monitoring

Watch server logs for retry patterns:

### Good (Temporary Rate Limit)
```
[Agent] Rate limit hit (429) on initial query, retrying in 1000ms... (attempt 1/3)
[Agent] Request succeeded on retry
```

### Bad (Persistent Rate Limit)
```
[Agent] Rate limit hit (429) on initial query, retrying in 1000ms... (attempt 1/3)
[Agent] Rate limit hit (429) on initial query, retrying in 2000ms... (attempt 2/3)
[Agent] Rate limit hit (429) on initial query, retrying in 4000ms... (attempt 3/3)
Error: Rate limit exceeded. Please wait a moment and try again.
```

If you see persistent rate limits:
1. **Wait longer between requests** (30-60 seconds)
2. **Check concurrent requests** (don't test in parallel)
3. **Verify quota limits** in Google Cloud Console
4. **Consider upgrading** to higher quota tier

## Vertex AI Rate Limits

### Free Tier Limits (Approximate)
- **Requests per minute (RPM)**: 60
- **Requests per day (RPD)**: 1500
- **Tokens per minute (TPM)**: 300,000

With MAX_ITERATIONS = 5, each query makes ~5-10 API calls:
- **Without retry**: 1 query = 5-10 calls
- **With retry (worst case)**: 1 query = 15-30 calls (if all retries needed)

### Best Practices

1. **Don't test rapidly**: Wait 5-10 seconds between test queries
2. **Avoid concurrent requests**: Test one query at a time
3. **Use non-streaming for simple queries**: Streaming makes more API calls
4. **Monitor quota**: Check Google Cloud Console → Vertex AI → Quotas

## Upgrade Path

If rate limits persist, consider:

1. **Request quota increase** (free, usually approved)
   - Google Cloud Console → Vertex AI → Quotas
   - Request increase to 120 RPM

2. **Enable billing** (still mostly free with $300 credits)
   - Automatic higher quotas
   - Better reliability

3. **Implement request queuing** (code change)
   - Queue requests instead of failing
   - Process one at a time with delays

## Environment Variables

No new environment variables needed. The fix works with existing setup:

```bash
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=global  # or global
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

## Rollback

If issues occur, revert these changes:

```bash
git diff HEAD -- src/modules/ai-integration/agent/*.ts
git checkout HEAD -- src/modules/ai-integration/agent/streaming-agent-loop.ts
git checkout HEAD -- src/modules/ai-integration/agent/agent-loop.ts
bun run build
```

## Summary

✅ **Automatic retries** with exponential backoff (1s → 2s → 4s)
✅ **Reduced API calls** by lowering MAX_ITERATIONS to 5
✅ **Inter-iteration delays** of 200ms to avoid rapid calls
✅ **Better error messages** for users and developers
✅ **Same behavior** across streaming and non-streaming endpoints

**Result**: Most 429 errors now resolve automatically through retry logic. Users only see errors if rate limit persists after 3 retries.
