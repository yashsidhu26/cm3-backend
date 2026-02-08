# AI Integration Module

An intelligent AI agent system with Gemini function calling for student assistance. Features three query modes: fast Groq path, smart agent loop, and auto-routing for optimal cost/performance balance.

## 🆕 Agent System (NEW!)

The AI is now a true **agent** that can:
- Request specific data via structured tool calls
- Make multiple rounds of data fetching (up to 7 iterations)
- Access 15 tools covering all student data
- Intelligently route between fast answers and deep analysis

See [**AI_AGENT_GUIDE.md**](../../../AI_AGENT_GUIDE.md) for complete documentation.

## Architecture

### Two-Layer System

**Layer 1 (Groq/Llama 3.3)**: Fast, cheap query analyzer
- Analyzes query complexity
- Determines needed context types
- Answers simple queries directly
- ~80% of queries handled here

**Layer 2 (Gemini Flash)**: Powerful responder for complex tasks
- Receives full student context
- Generates comprehensive plans and schedules
- Only invoked when needed
- ~20% of queries

### Cost Optimization

- **Groq**: ~$0.05 per 1M tokens
- **Gemini Flash**: ~$0.075 per 1M tokens (input)
- Average query cost: < $0.001
- 80/20 distribution ensures low costs

## API Endpoints

### `POST /api/ai-integration/chat`

Process a user query with the dual AI system.

**Request**:
```json
{
  "query": "Create a study plan for my Data Structures exam",
  "includeHistory": true,
  "format": "schedule"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "response": "...",
    "source": "gemini",
    "complexity": "complex",
    "contextUsed": ["courses", "course_resources", "smart_plan"],
    "metadata": {
      "processingTimeMs": 3421,
      "model": "gemini-2.0-flash-exp",
      "contextTypesUsed": [...]
    }
  }
}
```

### `GET /api/ai-integration/history?limit=50`

Get conversation history.

**Response**:
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "role": "user",
        "content": "What courses am I enrolled in?",
        "timestamp": "2026-02-07T..."
      },
      {
        "role": "assistant",
        "content": "You are enrolled in...",
        "timestamp": "2026-02-07T..."
      }
    ],
    "count": 10
  }
}
```

### `DELETE /api/ai-integration/history`

Clear all conversation history for the user.

### `GET /api/ai-integration/stats?days=7`

Get AI usage statistics.

**Response**:
```json
{
  "success": true,
  "data": {
    "stats": [...],
    "totals": {
      "groqRequests": 120,
      "geminiRequests": 30,
      "totalTokensUsed": 45000
    },
    "period": "Last 7 days"
  }
}
```

### `GET /api/ai-integration/health`

Health check endpoint.

## Context Types

The system can fetch these context types based on query needs:

- `profile`: Student profile, behavioral insights
- `academics`: Academic data, gap analysis
- `courses`: Enrolled courses with metadata
- `course_resources`: PDFs, slides, assignments per course
- `activity_logs`: Recent activity history
- `smart_plan`: Personalized study schedule
- `experiences`: Work/project experiences
- `commitments`: Time commitments

## Response Formats

- `text`: Conversational response (default)
- `json`: Structured data
- `schedule`: Timeline with time slots
- `overview`: Comprehensive summary with sections

## Example Query Flows

### Simple Query
**User**: "What lecture do I have tomorrow?"

**Flow**:
1. Groq analyzes: `{ complexity: 'simple', neededContext: ['courses'] }`
2. Groq answers directly using courses data
3. Response time: ~1-2s

### Complex Query
**User**: "Create a study plan for my exam next week"

**Flow**:
1. Groq analyzes: `{ complexity: 'complex', neededContext: ['courses', 'smart_plan', 'activity_logs'] }`
2. Context fetcher retrieves needed data
3. Gemini generates comprehensive plan
4. Response time: ~3-5s

## Environment Variables

```bash
# Required
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key

# Optional (defaults shown)
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_MODEL=gemini-2.0-flash-exp
```

## Database Schema

### `ai_conversations`
Stores conversation history with metadata.

### `ai_usage_stats`
Tracks daily usage per user for cost monitoring.

## Error Handling

Custom error classes with status codes:

```typescript
class GroqError extends Error {
  code: string;
  statusCode: number;
}

class GeminiError extends Error {
  code: string;
  statusCode: number;
}
```

## Testing

```bash
# Health check
curl http://localhost:3000/api/ai-integration/health

# Chat (requires auth)
curl -X POST http://localhost:3000/api/ai-integration/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: super-app.session_token=YOUR_TOKEN" \
  -d '{"query": "What courses am I enrolled in?"}'
```

## Performance

- **Simple queries**: 1-2s response time
- **Complex queries**: 3-5s response time
- **Context fetching**: Parallel requests for optimal speed
- **Timeouts**: 10s (Groq), 30s (Gemini)

## Cost Monitoring

Track costs via the `/stats` endpoint:
- Groq vs Gemini request ratio
- Total tokens used
- Daily/weekly trends

Target: 80% Groq, 20% Gemini for optimal cost/quality balance.

## Future Enhancements

- [ ] Streaming responses
- [ ] Voice input/output
- [ ] Context caching (5min TTL)
- [ ] Rate limiting
- [ ] Specialized agents (exam prep, career planning)
- [ ] Multi-turn conversation optimization
