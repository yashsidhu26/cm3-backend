import { VertexAI } from '@google-cloud/vertexai';
import type { ChatMessage, StudentContext, ResponseFormat } from './types';
import { promptCacheService } from './prompt-cache.service';
import { classifyQuery, getEstimatedResponseTime } from './query-classifier';

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
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
  private thinkingModel = process.env.GEMINI_MODEL_THINKING || 'gemini-3-flash-preview';
  private vertexAI: VertexAI;

  // Cache model instances with systemInstruction for indefinite caching
  // This makes the cache persist as long as the server is running (not just 1 hour)
  private modelCache: Map<string, any> = new Map();

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'global';

    if (!projectId) {
      throw new GeminiError('GCP_PROJECT_ID not configured', 'MISSING_PROJECT_ID', 500);
    }

    this.vertexAI = new VertexAI({
      project: projectId,
      location,
      // Let SDK auto-configure apiEndpoint
    });

    // Log cache status on initialization
    promptCacheService.logCacheUsage();
    console.log('[GeminiClient] Indefinite caching enabled - model instances will be reused across all requests');
  }

  /**
   * Determine which model to use based on query complexity analysis
   * Uses smart routing to optimize speed vs quality trade-off
   */
  private selectModel(format: ResponseFormat, query: string): string {
    const classification = classifyQuery(query, format);
    const estimatedTime = getEstimatedResponseTime(classification.complexity);

    console.log(
      `[Gemini] Query classified as: ${classification.complexity} ` +
      `(confidence: ${(classification.confidence * 100).toFixed(0)}%) ` +
      `→ ${classification.recommendedModel} ` +
      `(~${estimatedTime}ms)`
    );

    if (classification.reasons.length > 0) {
      console.log(`[Gemini] Reasons: ${classification.reasons.join(', ')}`);
    }

    return classification.recommendedModel;
  }

  /**
   * Get or create a cached model instance with systemInstruction
   * This enables indefinite caching - the model is created once and reused forever
   * (until server restart), rather than Vertex AI's default 1-hour cache TTL
   */
  private getCachedModel(modelName: string) {
    // Check if model already exists in cache
    if (this.modelCache.has(modelName)) {
      return this.modelCache.get(modelName);
    }

    // Create new model with systemInstruction for caching
    const staticPrompt = promptCacheService.getStaticPrompt();
    const model = this.vertexAI.getGenerativeModel({
      model: modelName,
      systemInstruction: {
        role: 'system',
        parts: [{ text: staticPrompt }],
      },
    });

    // Cache the model instance indefinitely
    this.modelCache.set(modelName, model);
    console.log(`[GeminiClient] Cached new model instance: ${modelName} (will be reused across all requests)`);

    return model;
  }

  /**
   * Build dynamic context for the current request
   * This is appended to the user query and changes per request (not cached)
   */
  private buildDynamicContext(context: StudentContext, format: ResponseFormat): string {
    const currentDate = new Date();
    const day = String(currentDate.getDate()).padStart(2, '0');
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const year = currentDate.getFullYear();
    const formattedDate = `${day}/${month}/${year}`; // DD/MM/YYYY
    const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });

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

    return `**Current Context**:
- Date: ${formattedDate} (${dayOfWeek})
${formatInstructions ? `- Response Format: ${formatInstructions}` : ''}

**Available Student Context**:
${JSON.stringify(context, null, 2)}`;
  }

  async generateResponse(
    query: string,
    context: StudentContext,
    format: ResponseFormat = 'text'
  ): Promise<string> {
    try {
      const selectedModel = this.selectModel(format, query);
      console.log(`[Gemini] Using model: ${selectedModel} for format: ${format}`);

      // Get cached model instance (indefinite caching - reused across all requests)
      const model = this.getCachedModel(selectedModel);

      // Build dynamic context (not cached, changes per request)
      const dynamicContext = this.buildDynamicContext(context, format);

      // Combine dynamic context with user query
      const prompt = `${dynamicContext}\n\n**Student Query**: ${query}\n\nProvide your response:`;

      console.log(`[Gemini] Indefinite caching: ✅ enabled (model instance reused)`);

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

      // Get cached model instance (indefinite caching - reused across all requests)
      const model = this.getCachedModel(selectedModel);

      // Build dynamic context
      const dynamicContext = this.buildDynamicContext(context, 'text');

      // Build chat history for Vertex AI
      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: dynamicContext }] },
          { role: 'model', parts: [{ text: 'I understand. I will assist with student queries using the provided context.' }] },
          ...history,
        ],
      });

      console.log(`[Gemini] Indefinite caching: ✅ enabled (model instance reused)`);

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

  /**
   * Stream response generation (for real-time feedback)
   * Yields chunks of text as they're generated
   */
  async *streamResponse(
    query: string,
    context: StudentContext,
    format: ResponseFormat = 'text'
  ): AsyncGenerator<string, void, unknown> {
    try {
      const selectedModel = this.selectModel(format, query);
      console.log(`[Gemini] Streaming with model: ${selectedModel}`);

      // Get cached model instance
      const model = this.getCachedModel(selectedModel);

      // Build dynamic context
      const dynamicContext = this.buildDynamicContext(context, format);
      const prompt = `${dynamicContext}\n\n**Student Query**: ${query}\n\nProvide your response:`;

      console.log(`[Gemini] Streaming started - indefinite caching enabled`);

      // Stream content from Gemini
      const streamResult = await model.generateContentStream(prompt);

      for await (const chunk of streamResult.stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          yield text;
        }
      }

      console.log(`[Gemini] Streaming completed`);
    } catch (error: any) {
      if (error instanceof GeminiError) throw error;
      throw new GeminiError(
        `Gemini streaming failed: ${error.message}`,
        'STREAMING_FAILED',
        500
      );
    }
  }

  /**
   * Stream chat response (for real-time feedback in chat)
   */
  async *streamChatResponse(
    messages: ChatMessage[],
    context: StudentContext
  ): AsyncGenerator<string, void, unknown> {
    try {
      const lastMessage = messages[messages.length - 1];
      const selectedModel = this.selectModel('text', lastMessage.content);
      console.log(`[Gemini] Streaming chat with model: ${selectedModel}`);

      // Get cached model instance
      const model = this.getCachedModel(selectedModel);

      // Build dynamic context
      const dynamicContext = this.buildDynamicContext(context, 'text');

      // Build chat history
      const history = messages.slice(0, -1).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: dynamicContext }] },
          { role: 'model', parts: [{ text: 'I understand. I will assist with student queries using the provided context.' }] },
          ...history,
        ],
      });

      console.log(`[Gemini] Chat streaming started`);

      // Stream chat response
      const streamResult = await chat.sendMessageStream(lastMessage.content);

      for await (const chunk of streamResult.stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          yield text;
        }
      }

      console.log(`[Gemini] Chat streaming completed`);
    } catch (error: any) {
      if (error instanceof GeminiError) throw error;
      throw new GeminiError(
        `Gemini chat streaming failed: ${error.message}`,
        'CHAT_STREAMING_FAILED',
        500
      );
    }
  }
}

export const geminiClient = new GeminiClient();
