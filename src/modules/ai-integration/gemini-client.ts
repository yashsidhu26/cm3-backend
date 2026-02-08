import { VertexAI } from '@google-cloud/vertexai';
import type { ChatMessage, StudentContext, ResponseFormat } from './types';

export class GeminiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export class GeminiClient {
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  private thinkingModel = process.env.GEMINI_MODEL_THINKING || 'gemini-2.5-flash-lite';
  private vertexAI: VertexAI;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';

    if (!projectId) {
      throw new GeminiError('GCP_PROJECT_ID not configured', 'MISSING_PROJECT_ID', 500);
    }

    this.vertexAI = new VertexAI({ project: projectId, location });
  }

  /**
   * Determine which model to use based on task complexity
   * Thinking model (gemini-3-flash) for: scheduling, conflict resolution, complex planning
   * Default model (gemini-2.5-flash-lite) for: PDF analysis, quiz making, general queries
   */
  private selectModel(format: ResponseFormat, query: string): string {
    // Use thinking model for complex scheduling and conflict tasks
    const needsThinking =
      format === 'schedule' ||
      query.toLowerCase().includes('schedule') ||
      query.toLowerCase().includes('conflict') ||
      query.toLowerCase().includes('plan my week') ||
      query.toLowerCase().includes('manage my time');

    return needsThinking ? this.thinkingModel : this.defaultModel;
  }

  private buildSystemPrompt(context: StudentContext, format: ResponseFormat): string {
    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    const formattedDate = `${day}/${month}/${year}`; // DD/MM/YYYY

    let formatInstructions = '';
    switch (format) {
      case 'schedule':
        formatInstructions = 'Provide a detailed schedule or timeline with specific time slots and activities.';
        break;
      case 'json':
        formatInstructions = 'Return structured JSON data that can be easily parsed by the frontend.';
        break;
      case 'overview':
        formatInstructions = 'Provide a comprehensive overview with sections, bullet points, and clear organization.';
        break;
      default:
        formatInstructions = 'Provide a clear, conversational response.';
    }

    return `You are an intelligent student assistant helping with academic planning, productivity, and course management for students in India.

**Current Date**: ${formattedDate} (DD/MM/YYYY format)
**DATE FORMAT REQUIREMENT**: ALWAYS use DD/MM/YYYY format (Indian standard). Example: 25/12/2024 means 25th December 2024.

**Your Role**:
- Analyze student data to provide personalized recommendations
- Create study plans based on productivity patterns
- Answer questions about courses, resources, and deadlines
- Be encouraging, supportive, and actionable

**Response Format**: ${formatInstructions}

**Available Student Context**:
${JSON.stringify(context, null, 2)}

**Guidelines**:
1. Use the student's actual data (courses, resources, activity patterns)
2. Reference specific courses, deadlines, and resources when relevant
3. Consider their productivity patterns and behavioral insights
4. Be specific with dates, times, and actionable steps
5. Keep responses focused and practical
6. If data is missing, acknowledge it and work with what's available`;
  }

  async generateResponse(
    query: string,
    context: StudentContext,
    format: ResponseFormat = 'text'
  ): Promise<string> {
    try {
      const selectedModel = this.selectModel(format, query);
      console.log(`[Gemini] Using model: ${selectedModel} for format: ${format}`);

      const model = this.vertexAI.getGenerativeModel({ model: selectedModel });
      const systemPrompt = this.buildSystemPrompt(context, format);

      const prompt = `${systemPrompt}\n\n**Student Query**: ${query}\n\nProvide your response:`;

      const result = await model.generateContent(prompt);

      const response = result.response;
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        throw new GeminiError('Empty response from Gemini', 'EMPTY_RESPONSE', 500);
      }

      return text;
    } catch (error: any) {
      if (error instanceof GeminiError) throw error;
      throw new GeminiError(
        `Gemini generation failed: ${error.message}`,
        'GENERATION_FAILED',
        500
      );
    }
  }

  async generateChatResponse(
    messages: ChatMessage[],
    context: StudentContext
  ): Promise<string> {
    try {
      // For chat, analyze last message to select model
      const lastMessage = messages[messages.length - 1];
      const selectedModel = this.selectModel('text', lastMessage.content);
      console.log(`[Gemini] Chat using model: ${selectedModel}`);

      const model = this.vertexAI.getGenerativeModel({ model: selectedModel });
      const systemPrompt = this.buildSystemPrompt(context, 'text');

      // Build chat history for Vertex AI
      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will assist with student queries using the provided context.' }] },
          ...history,
        ],
      });

      const result = await chat.sendMessage(lastMessage.content);
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        throw new GeminiError('Empty response from Gemini', 'EMPTY_RESPONSE', 500);
      }

      return text;
    } catch (error: any) {
      if (error instanceof GeminiError) throw error;
      throw new GeminiError(
        `Gemini chat generation failed: ${error.message}`,
        'CHAT_GENERATION_FAILED',
        500
      );
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const model = this.vertexAI.getGenerativeModel({ model: this.defaultModel });
      const result = await model.generateContent('Hello');
      const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the model that would be used for a given query
   */
  getModelForQuery(format: ResponseFormat, query: string): string {
    return this.selectModel(format, query);
  }
}

export const geminiClient = new GeminiClient();
