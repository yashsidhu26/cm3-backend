# AI Response Speed Optimization Plan

## Current Flow Analysis

```
User Query
    ↓
1. Parse request (5ms)
    ↓
2. Fetch conversation history (50-200ms) ← DB query
    ↓
3. Build context (tool fetching) (200-1000ms) ← Multiple DB queries
    ↓
4. Send to Gemini (Network + Inference)
   - Network latency: 50-150ms
   - Model inference: 500-3000ms ← SLOWEST
   - Tool calls: 200-800ms each ← Can be multiple
    ↓
5. Process response (10ms)
    ↓
6. Save to DB (50ms)
    ↓
Total: 1-6 seconds
```

---

## Speed Bottlenecks Identified

### 1. Model Inference Time (Biggest Impact)
- **gemini-3-flash-preview**: 2-3 seconds
- **gemini-3-flash-preview-lite**: 500-800ms
- Currently chosen based on format, not urgency

### 2. Sequential Tool Calls
- Agent calls tools one by one
- Each tool call = full round trip to Gemini
- Example: 3 tool calls = 3 × 2 seconds = 6 seconds total

### 3. Context Fetching
- Fetching multiple context types serially
- Each DB query adds 50-200ms

### 4. Network Latency
- Server → Vertex AI round trip
- Can't eliminate, but can minimize impact

---

## Optimization Strategies

## Strategy 1: **Smart Model Routing** ⚡ (Highest Impact)

### Concept
Route queries to appropriate model based on actual complexity, not format.

### Implementation
```typescript
// Query Complexity Classifier
function classifyQueryComplexity(query: string): 'simple' | 'medium' | 'complex' {
  const simplePatterns = [
    /what.*my.*schedule/i,
    /when.*my.*class/i,
    /do.*i.*have/i,
    /show.*me/i,
  ];
  
  const complexPatterns = [
    /analyze.*pdf/i,
    /what.*was.*covered/i,
    /compare.*courses/i,
    /recommend/i,
    /plan/i,
  ];
  
  // Check for tool indicators
  const needsMultipleTools = /and|also|plus/i.test(query);
  const needsPDFAnalysis = /handout|syllabus|lecture.*\d+/i.test(query);
  
  if (complexPatterns.some(p => p.test(query)) || needsPDFAnalysis) {
    return 'complex';
  }
  
  if (simplePatterns.some(p => p.test(query)) && !needsMultipleTools) {
    return 'simple';
  }
  
  return 'medium';
}

// Model Selection
const modelMap = {
  simple: 'gemini-2.0-flash-exp',      // Fastest (300-500ms)
  medium: 'gemini-3-flash-preview-lite',     // Fast (500-800ms)
  complex: 'gemini-3-flash-preview'    // Thorough (2-3s)
};
```

### Expected Impact
- Simple queries: 2-3s → **500ms** (83% faster)
- Medium queries: 2s → **800ms** (60% faster)
- Complex queries: 3s → 3s (no change, already optimal)

**Average: 60% speed improvement**

---

## Strategy 2: **Parallel Tool Execution** 🚀 (High Impact)

### Problem
Current: Agent calls tools sequentially
```
get_enrolled_courses (2s)
  ↓
get_course_resources (2s)
  ↓
analyze_pdf_document (3s)
= 7 seconds total
```

### Solution
Execute independent tools in parallel
```
┌─ get_enrolled_courses (2s) ─┐
├─ get_class_schedule (2s) ───┤→ Merge results → Continue
└─ get_commitments (2s) ──────┘
= 2 seconds total (vs 6s)
```

### Implementation
```typescript
// In agent-loop.ts
async function executeToolsInParallel(toolCalls: ToolCall[]) {
  // Analyze dependencies
  const dependencies = analyzeDependencies(toolCalls);
  
  // Group by dependency level
  const batches = groupByDependencyLevel(toolCalls, dependencies);
  
  // Execute each batch in parallel
  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(tool => executeToolCall(tool))
    );
    // Feed results to next batch
  }
}

// Dependency analysis
function analyzeDependencies(toolCalls: ToolCall[]) {
  // get_course_by_code must run before get_course_resources
  // get_enrolled_courses independent of get_class_schedule
  // etc.
  return dependencyGraph;
}
```

### Expected Impact
- Queries with 2+ independent tools: **50-70% faster**
- Example: "What's my schedule and do I have tasks?" → 4s to **2s**

---

## Strategy 3: **Streaming Responses** 💨 (Perceived Speed)

### Concept
Stream response tokens as they're generated instead of waiting for completion.

### Implementation
```typescript
// In gemini-client.ts
async function* streamGenerateContent(query: string) {
  const stream = await generativeModel.generateContentStream({
    contents: [...],
    tools: [...]
  });
  
  for await (const chunk of stream) {
    yield chunk.text();
  }
}

// In routes
app.post('/chat-stream', protect, async (c) => {
  return streamSSE(c, async (stream) => {
    for await (const chunk of generateResponse(query)) {
      await stream.writeSSE({ data: chunk });
    }
  });
});
```

### Expected Impact
- **Time to first token: 200-400ms** (vs 2-3s for full response)
- User sees response building in real-time
- Feels 5-10x faster (perception)

---

## Strategy 4: **Predictive Context Prefetching** 🔮 (Medium Impact)

### Concept
Prefetch likely-needed context based on user patterns.

### Implementation
```typescript
// Background service
class ContextPrefetcher {
  async prefetchForUser(userId: string) {
    // Common queries at this time of day?
    const now = new Date().getHours();
    
    if (now >= 7 && now <= 10) {
      // Morning: Prefetch schedule, tasks
      await this.cacheUserSchedule(userId);
      await this.cacheUserTasks(userId);
    } else if (now >= 14 && now <= 18) {
      // Afternoon: Prefetch assignments, materials
      await this.cacheUpcomingAssignments(userId);
    }
  }
  
  // Cache in Redis with 5-min TTL
  private async cacheUserSchedule(userId: string) {
    const schedule = await fetchSchedule(userId);
    await redis.setex(`schedule:${userId}`, 300, JSON.stringify(schedule));
  }
}
```

### Expected Impact
- Cache hit: 200ms DB query → **5ms Redis lookup** (97% faster)
- Only helps for predictable queries
- Requires Redis/memory cache

---

## Strategy 5: **Optimized Tool Implementations** ⚙️ (Medium Impact)

### Problem
Some tools make unnecessary DB queries or fetch too much data.

### Optimizations

#### A. Add Database Indexes
```sql
-- Speed up common queries
CREATE INDEX idx_enrollments_user ON enrollments(user_id);
CREATE INDEX idx_assignments_user_date ON student_assignments(user_id, due_date);
CREATE INDEX idx_schedule_items_schedule ON schedule_items(schedule_id, start_date_time);
CREATE INDEX idx_courses_code ON courses(code);
```

#### B. Reduce Over-Fetching
```typescript
// Before: Fetch all fields
const courses = await db.select().from(courses);

// After: Only fetch needed fields
const courses = await db
  .select({ id: courses.id, code: courses.code, name: courses.name })
  .from(courses);
```

#### C. Use Drizzle's Prepared Statements
```typescript
// Prepare frequently-used queries once
const getUserScheduleStmt = db
  .select()
  .from(userSectionRegistrations)
  .where(eq(userSectionRegistrations.userId, sql.placeholder('userId')))
  .prepare();

// Execute with params (faster)
const result = await getUserScheduleStmt.execute({ userId });
```

### Expected Impact
- DB queries: 100-200ms → **20-50ms** (75% faster)
- Compounds with multiple tool calls

---

## Strategy 6: **Response Compression** 📦 (Low Impact, Easy Win)

### Implementation
```typescript
// In routes
app.use(compress({
  threshold: 1024, // Only compress >1KB
}));
```

### Expected Impact
- Response size: 50KB → **10KB** (80% smaller)
- Network transfer: 200ms → **40ms** (on slow connections)
- Minimal CPU overhead

---

## Strategy 7: **Edge Caching for Static Tools** 🌐 (Low Impact)

### Concept
Cache tool results that rarely change.

### Implementation
```typescript
const CACHEABLE_TOOLS = ['get_all_skills', 'search_all_courses'];

async function executeToolWithCache(toolName: string, args: any) {
  if (CACHEABLE_TOOLS.includes(toolName)) {
    const cacheKey = `tool:${toolName}:${JSON.stringify(args)}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) return JSON.parse(cached);
    
    const result = await executeTool(toolName, args);
    await redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 hour
    return result;
  }
  
  return executeTool(toolName, args);
}
```

### Expected Impact
- Catalog queries: 200ms → **5ms** (97% faster)
- Only helps for repeated queries

---

## Strategy 8: **WebSocket for Real-Time Updates** 🔄 (Advanced)

### Concept
Keep connection open, stream updates as tools complete.

### Flow
```
User: "What's my schedule and do I have assignments?"
  ↓
Server (WebSocket):
  → "Fetching your schedule..." (100ms)
  → "Schedule: [data]" (2s)
  → "Checking assignments..." (2.1s)
  → "Assignments: [data]" (3.5s)
  → "Here's your summary..." (4s)
```

### Implementation
```typescript
io.on('connection', (socket) => {
  socket.on('query', async (query) => {
    socket.emit('status', 'Processing...');
    
    const tools = await identifyNeededTools(query);
    
    for (const tool of tools) {
      socket.emit('tool-start', tool.name);
      const result = await executeTool(tool);
      socket.emit('tool-result', { tool: tool.name, result });
    }
    
    socket.emit('complete', finalResponse);
  });
});
```

### Expected Impact
- **Perceived speed: 90% improvement**
- User sees progress in real-time
- Can cancel slow queries

---

## Combined Impact Analysis

### Baseline (Current)
- Simple query: **2-3 seconds**
- Medium query: **3-5 seconds**
- Complex query: **6-10 seconds**

### After All Optimizations
| Optimization | Simple | Medium | Complex |
|--------------|--------|--------|---------|
| Smart routing | -60% | -40% | 0% |
| Parallel tools | -20% | -50% | -60% |
| Streaming | -80%* | -70%* | -60%* |
| DB optimize | -10% | -15% | -20% |
| **Total** | **500ms** | **1.5s** | **2.5s** |

*Perceived (time to first token)

---

## Implementation Priority

### Phase 1: Quick Wins (Week 1) ⚡
1. **Smart Model Routing** - 4 hours
2. **Response Streaming** - 6 hours
3. **DB Indexes** - 2 hours
**Expected: 70% perceived speed improvement**

### Phase 2: Architecture (Week 2) 🚀
4. **Parallel Tool Execution** - 12 hours
5. **Optimized Tool Queries** - 8 hours
**Expected: Additional 40% actual speed improvement**

### Phase 3: Advanced (Week 3) 🔮
6. **Context Prefetching** - 16 hours (requires Redis)
7. **WebSocket Streaming** - 20 hours
**Expected: Additional 20% perceived improvement**

### Phase 4: Polish (Ongoing) ⚙️
8. **Tool Result Caching** - 4 hours
9. **Response Compression** - 1 hour

---

## Monitoring Plan

### Metrics to Track
```typescript
interface ResponseMetrics {
  totalTime: number;           // End-to-end
  modelInferenceTime: number;  // Gemini API time
  toolExecutionTime: number;   // All tools combined
  dbQueryTime: number;         // Database time
  networkLatency: number;      // Network overhead
  timeToFirstToken: number;    // Streaming: first response
  complexity: 'simple' | 'medium' | 'complex';
  toolsUsed: string[];
  parallelizable: boolean;
}
```

### Alerts
- Response time > 5s
- Model inference > 3s
- DB query > 200ms
- Tool failure rate > 5%

---

## Risk Assessment

### Low Risk (Safe to Implement)
- ✅ Smart model routing (fallback to complex)
- ✅ Response compression
- ✅ DB indexes
- ✅ Streaming responses

### Medium Risk (Test Thoroughly)
- ⚠️ Parallel tool execution (dependency bugs)
- ⚠️ Context prefetching (cache invalidation)
- ⚠️ Tool result caching (stale data)

### High Risk (Requires Architecture Change)
- 🚨 WebSocket (connection management)
- 🚨 Edge caching (consistency issues)

---

## Expected ROI

### Development Time: ~80 hours total
### Speed Improvement:
- **Phase 1**: 70% perceived, 40% actual
- **Phase 2**: Additional 40% actual  
- **Phase 3**: Additional 20% perceived

### User Experience:
- Simple queries: 3s → **500ms** (6x faster)
- Complex queries: 8s → **2.5s** (3x faster)
- Streaming: **Instant feedback** vs waiting

### Business Impact:
- Lower bounce rate (users don't wait)
- Higher engagement (faster = more queries)
- Better retention (responsive = quality)

---

**Recommendation**: Start with Phase 1 (Smart Routing + Streaming) for maximum immediate impact with minimal risk.
