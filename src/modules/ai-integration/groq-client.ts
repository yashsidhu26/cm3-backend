import type { ChatMessage, GroqAnalysis, StudentContext } from './types';

export class GroqError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqClient {
  private baseUrl = 'https://api.groq.com/openai/v1';
  private model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  private apiKey: string;

  constructor() {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      throw new GroqError('GROQ_API_KEY not configured', 'MISSING_API_KEY', 500);
    }
    this.apiKey = key;
  }

  private getAnalysisSystemPrompt(): string {
    return `You are an intelligent query analyzer for a student assistant system. Your job is to analyze student queries and determine:

1. **Complexity**: Is this a simple query (factual, lookup) or complex (requires reasoning, planning, synthesis)?
2. **Needed Context**: What student data is needed? Options: profile, academics, courses, course_resources, activity_logs, smart_plan, experiences, commitments
3. **Response Format**: text (conversational), json (structured data), schedule (timeline), overview (summary)
4. **Direct Answer**: If simple and you can answer with minimal context, provide it

⛔ **CRITICAL ANTI-HALLUCINATION RULES**:
- If a query asks about handout/PDF/syllabus contents (e.g., "what is in CS handout"), classify as COMPLEX
- NEVER provide directAnswer for handout/syllabus questions - these need PDF analysis tools
- If you're uncertain about available data, classify as complex to use tools for verification

**Simple queries** (you can answer directly WITH context):
- "What courses am I enrolled in?" (needs academics context)
- "What lecture do I have tomorrow?" (needs courses context)
- "Show me PDFs for Operating Systems" (needs course_resources context)
- "What's my next deadline?" (needs smart_plan or courses context)

**Complex queries** (need agent with tools):
- "Create a study plan for my exam"
- "Analyze my productivity patterns"
- "What is in [course] handout?" ← ALWAYS complex (needs PDF analysis)
- "Tell me about [course] syllabus" ← ALWAYS complex (needs PDF analysis)
- "What should I focus on this week?"

Respond ONLY with valid JSON in this exact format:
{
  "complexity": "simple" or "complex",
  "neededContext": ["context1", "context2"],
  "responseFormat": "text" | "json" | "schedule" | "overview",
  "directAnswer": "your answer here" (only if simple AND you have context),
  "reasoning": "brief explanation of your analysis"
}`;
  }

  private getSimpleResponseSystemPrompt(context?: StudentContext): string {
    const contextStr = context ? `\n\nAvailable Context:\n${JSON.stringify(context, null, 2)}` : '';
    return `You are a helpful student assistant. Answer questions clearly and concisely using ONLY the provided context.${contextStr}

⛔ **CRITICAL RULES - NO HALLUCINATION**:
1. ONLY use information from the "Available Context" above. NEVER make up or guess information.
2. If the context doesn't contain the answer, say "I don't have that information" or "I need to check [source]".
3. NEVER describe handout contents, syllabus details, or PDF contents unless explicitly provided in context.
4. If asked about something not in context, suggest using more specific queries or checking the source directly.
5. Be honest about limitations: "I can see X in the context, but I don't have information about Y."

Keep responses friendly, informative, and student-focused. Use natural language. When uncertain, admit it.`;
  }

  async analyzeQuery(query: string, history?: ChatMessage[]): Promise<GroqAnalysis> {
    try {
      const messages: GroqChatMessage[] = [
        { role: 'system', content: this.getAnalysisSystemPrompt() },
      ];

      // Add conversation history for context
      if (history && history.length > 0) {
        const recentHistory = history.slice(-4); // Last 4 messages for context
        for (const msg of recentHistory) {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        }
      }

      messages.push({ role: 'user', content: query });

      const response = await this.chat(messages, { temperature: 0.1, maxTokens: 500 });

      // Parse JSON response
      const content = response.choices[0].message.content.trim();
      let analysis: GroqAnalysis;

      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = content.match(/```json\n([\s\S]+?)\n```/) || content.match(/```([\s\S]+?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : content;
        analysis = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('Failed to parse Groq analysis:', content);
        throw new GroqError('Failed to parse analysis response', 'PARSE_ERROR', 500);
      }

      return analysis;
    } catch (error: any) {
      if (error instanceof GroqError) throw error;
      throw new GroqError(
        `Groq analysis failed: ${error.message}`,
        'ANALYSIS_FAILED',
        500
      );
    }
  }

  async generateSimpleResponse(query: string, context?: StudentContext): Promise<string> {
    try {
      const messages: GroqChatMessage[] = [
        { role: 'system', content: this.getSimpleResponseSystemPrompt(context) },
        { role: 'user', content: query },
      ];

      const response = await this.chat(messages, { temperature: 0.3, maxTokens: 1000 });
      return response.choices[0].message.content;
    } catch (error: any) {
      if (error instanceof GroqError) throw error;
      throw new GroqError(
        `Groq response generation failed: ${error.message}`,
        'GENERATION_FAILED',
        500
      );
    }
  }

  private async chat(
    messages: GroqChatMessage[],
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<GroqChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.maxTokens ?? 1000,
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout for Groq
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new GroqError(
          errorData.error?.message || `Groq API error: ${response.statusText}`,
          'API_ERROR',
          response.status
        );
      }

      return await response.json();
    } catch (error: any) {
      if (error instanceof GroqError) throw error;
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new GroqError('Groq API request timeout', 'TIMEOUT', 504);
      }
      throw new GroqError(`Groq API request failed: ${error.message}`, 'REQUEST_FAILED', 500);
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const response = await this.chat([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10 });
      return response.choices.length > 0;
    } catch (error) {
      return false;
    }
  }
}

export const groqClient = new GroqClient();
