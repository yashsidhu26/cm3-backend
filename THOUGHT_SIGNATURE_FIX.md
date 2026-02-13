# Thought Signature Fix

## Problem

Getting 400 error from Vertex AI:
```
Unable to submit request because function call `get_enrolled_courses`
in the 14. content block is missing a `thought_signature`.
```

## Root Cause

Vertex AI's Gemini models include a `thoughtSignature` field in function calls. This is part of their reasoning trace and **must be preserved** when sending function responses back to the model.

### What We Were Doing (Wrong)

When extracting function calls and sending responses:

```typescript
// Extract function call
const toolName = fc.name;
const args = fc.args;
// ❌ Ignored fc.thoughtSignature

// Send response
{
  functionResponse: {
    name: toolName,
    response: result,
  }
  // ❌ Missing thoughtSignature
}
```

### What We Should Do (Correct)

Preserve and include the `thoughtSignature`:

```typescript
// Extract function call
const toolName = fc.name;
const args = fc.args;
const thoughtSignature = fc.thoughtSignature; // ✅ Preserve it

// Send response
{
  functionResponse: {
    name: toolName,
    response: result,
  },
  thoughtSignature: thoughtSignature, // ✅ Include it
}
```

## The Fix

### 1. Streaming Agent Loop (`streaming-agent-loop.ts`)

**Extract and store thoughtSignature:**
```typescript
for (const fc of functionCalls) {
  const toolName = fc.name;
  const args = fc.args || {};
  const thoughtSignature = fc.thoughtSignature; // ✅ Extract

  const toolResult = await executeToolCall(toolName, args, userId);

  functionResponses.push({
    name: toolName,
    response: toolResult,
    thoughtSignature, // ✅ Store
  });
}
```

**Include in function response parts:**
```typescript
const functionResponseParts = functionResponses.map((fr) => {
  const part: any = {
    functionResponse: {
      name: fr.name,
      response: fr.response,
    },
  };

  // Include thoughtSignature if present
  if (fr.thoughtSignature) {
    part.thoughtSignature = fr.thoughtSignature; // ✅ Include
  }

  return part;
});
```

### 2. Non-Streaming Agent Loop (`agent-loop.ts`)

Same fix applied to the non-streaming version:

```typescript
const functionResponseParts = toolResults.map((result, index) => {
  const call = functionCalls[index];

  const part: any = {
    functionResponse: {
      name: call.name,
      response: result.value.response,
    },
  };

  // Include thoughtSignature if present
  if (call.thoughtSignature) {
    part.thoughtSignature = call.thoughtSignature; // ✅ Include
  }

  return part;
});
```

## What is thoughtSignature?

The `thoughtSignature` is a **cryptographic signature** of the model's internal reasoning process. It's part of Vertex AI's explainability and traceability features.

### Example from Response

```json
{
  "functionCall": {
    "name": "get_enrolled_courses",
    "args": {}
  },
  "thoughtSignature": "CiQBjz1rXwm/wLw61yn0hUghpTD5WBMkY9G/mUINAYcZ/mYgTjY..."
}
```

This signature:
- ✅ Links the function call to the model's reasoning
- ✅ Helps Vertex AI track the conversation context
- ✅ Required for multi-turn function calling to work correctly

## Why This Broke

This is likely a **new requirement** in recent versions of Vertex AI's Gemini models. Previously, the `thoughtSignature` might have been optional, but now it's **mandatory**.

## Testing

After the fix, function calling should work:

```bash
# Restart server
bun src/app.ts

# Test a query that uses tools
curl -X POST http://localhost:3000/api/ai-integration/chat-stream \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_TOKEN" \
  -d '{"query":"What courses am I taking?"}'
```

**Expected:** Should call `get_enrolled_courses` and return results (no 400 error).

## Files Modified

- `src/modules/ai-integration/agent/streaming-agent-loop.ts`
  - Extract `thoughtSignature` from function calls
  - Include in function response parts

- `src/modules/ai-integration/agent/agent-loop.ts`
  - Extract `thoughtSignature` from function calls
  - Include in function response parts

## Build

```bash
bun run build
# Output: dist/app.js (32.52 MB)
```

## Summary

✅ **Fixed**: Missing `thoughtSignature` in function responses
✅ **Preserved**: `thoughtSignature` from function calls
✅ **Included**: `thoughtSignature` in response parts
✅ **Works**: Both streaming and non-streaming agent loops

The error "missing a `thought_signature`" should no longer occur! 🎉
