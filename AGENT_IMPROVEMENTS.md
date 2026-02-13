# Agent Tool Usage Improvements

## Problem

The AI agent was calling tools unnecessarily, causing:
1. **Excessive tool calls**: Calling `get_course_resources` 5 times for simple queries like "What courses am I taking?"
2. **Irrelevant tool usage**: Calling course-related tools for general knowledge queries like "What is 2+2?"
3. **Stream disconnections**: Too many tool calls causing `ERR_INCOMPLETE_CHUNKED_ENCODING` errors

Example issue:
- Query: "What courses am I taking?"
- Expected: Call `get_enrolled_courses` once
- Actual: Called `get_enrolled_courses`, `get_course_resources` × 5, `search_studydeck_resources`

## Root Cause

The system prompt had overly broad instructions:
1. **Line 68**: "ALWAYS use tools to get data before responding" → Agent tried to use tools for everything
2. **Lines 39-47**: Progress tracking instructions were too broad → Agent applied them to simple enrollment queries
3. **No guidance on when NOT to use tools** → Agent couldn't distinguish between relevant and irrelevant tool usage

## Changes Made

### 1. Updated System Prompt (`system-prompt.ts`)

#### Added Tool Relevance Rules (lines 68-77)
```typescript
**TOOL USAGE RULES**:
1. ⚠️ ONLY use tools when they're directly relevant to the user's query. DO NOT call tools for:
   - General knowledge questions (e.g., "What is 2+2?", "Who is the president?")
   - Conversational queries (e.g., "Hello", "How are you?")
   - Questions you can answer without student-specific data
2. ALWAYS use tools for student-specific data:
   - Course enrollment, schedules, tasks, notifications
   - Course materials, handouts, lecture content
   - Skills, experiences, commitments, activity logs
```

#### Clarified Minimum Tool Usage (line 71)
```typescript
4. Use the MINIMUM number of tools needed:
   - "What courses am I taking?" → ONLY get_enrolled_courses (don't call get_course_resources)
   - "What's in lecture 5?" → get_course_resources (Moodle) OR search_studydeck_resources, then analyze_pdf
   - "Track my progress" → Multiple tools (enrolled courses + resources + logs)
```

#### Separated Simple Queries from Progress Tracking (lines 39-47)
```typescript
**COURSE PROGRESS TRACKING** (ONLY for progress/completion questions):
- "Is [course] complete?" or "track my progress" or "how far am I in [course]?" → Use multiple tools
- ⚠️ DO NOT use these multiple tools for simple "What courses am I taking?" queries - just use get_enrolled_courses
```

#### Added Examples in Tool Guidance (line 85)
```typescript
- "What courses am I taking?" → get_enrolled_courses ONLY (do NOT call get_course_resources)
- "What is 2+2?" or general knowledge → NO TOOLS (just answer directly)
```

### 2. Enhanced Logging (`streaming-agent-loop.ts`)

Added detailed logging to track agent decisions:

```typescript
// Log tool requests
console.log(`[StreamingAgent] Iteration ${iteration}: Agent requesting ${functionCalls.length} tool(s):`,
  functionCalls.map(fc => fc.name).join(', '));

// Log each tool call
console.log(`[StreamingAgent] Calling tool: ${toolName} with args:`,
  JSON.stringify(args).substring(0, 100));

// Log responses sent back to agent
console.log(`[StreamingAgent] Sending ${functionResponseParts.length} tool response(s) back to agent...`);

// Log final response generation
console.log(`[StreamingAgent] Agent generated final response (${text.length} chars)`);
```

## Testing

### Automated Tests

Run the new test suite to verify improvements:

```bash
# Get session token from browser (DevTools → Application → Cookies → super-app.session_token)
SESSION_TOKEN=your-token bun test-agent-improvements.ts
```

### Test Cases

1. **General Knowledge Query**
   - Query: "What is 2+2?"
   - Expected: No tools called, direct answer
   - Should NOT call: get_enrolled_courses, get_course_resources

2. **Simple Enrollment Query**
   - Query: "What courses am I taking?"
   - Expected: Only `get_enrolled_courses`
   - Should NOT call: get_course_resources, get_courses_full_details, search_studydeck_resources

3. **Greeting**
   - Query: "Hello!"
   - Expected: No tools called, friendly response
   - Should NOT call: Any tools

### Manual Verification

Watch server logs while testing:

```bash
# Terminal 1: Start server
bun src/app.ts

# Terminal 2: Run test
SESSION_TOKEN=your-token bun test-agent-improvements.ts
```

Look for lines like:
```
[StreamingAgent] Iteration 1: Agent requesting 1 tool(s): get_enrolled_courses
[StreamingAgent] Calling tool: get_enrolled_courses with args: {}
[StreamingAgent] Agent generated final response (157 chars)
```

## Expected Improvements

### Performance
- **Faster responses**: Fewer tool calls = faster completion
- **Reduced API costs**: Each tool call costs tokens
- **Better stream reliability**: Fewer iterations = less chance of disconnection

### Quality
- **More relevant responses**: Agent focuses on what's needed
- **Better UX**: No unnecessary "Accessing..." messages for simple queries
- **More predictable behavior**: Clear rules = consistent tool usage

## Verification Checklist

Run these queries and verify tool usage:

- [ ] "What is 2+2?" → No tools
- [ ] "Hello" → No tools
- [ ] "What courses am I taking?" → Only get_enrolled_courses
- [ ] "What's my schedule today?" → Only get_class_schedule
- [ ] "Track my progress in CS F111" → Multiple tools (enrolled courses, resources, logs)
- [ ] "What was covered in lecture 5?" → get_course_resources, then analyze_pdf

## Deployment

After testing passes:

```bash
# Build production bundle
bun run build

# Deploy dist/app.js to production
# Monitor logs for any issues
```

## Monitoring

Watch for these patterns in production logs:

### Good (Expected)
```
[StreamingAgent] Iteration 1: Agent requesting 1 tool(s): get_enrolled_courses
[StreamingAgent] Agent generated final response (157 chars)
```

### Bad (Issue)
```
[StreamingAgent] Iteration 1: Agent requesting 5 tool(s): get_enrolled_courses, get_course_resources, ...
[StreamingAgent] Iteration 5: Agent requesting 3 tool(s): ...
```

If you see excessive iterations or tool calls, check:
1. Is the query actually complex enough to warrant multiple tools?
2. Are tool responses returning errors that cause retries?
3. Does the system prompt need further refinement?

## Rollback Plan

If issues occur, revert these files:
- `src/modules/ai-integration/agent/system-prompt.ts`
- `src/modules/ai-integration/agent/streaming-agent-loop.ts`

```bash
git checkout HEAD~1 -- src/modules/ai-integration/agent/
bun run build
```

## Summary

These changes make the AI agent significantly more efficient by:
1. Only calling tools when relevant to the query
2. Using the minimum number of tools needed
3. Providing clear examples of when to use/not use tools
4. Adding comprehensive logging for debugging

The result is faster, more reliable streaming with better user experience.
