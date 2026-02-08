import { eq, desc, and } from 'drizzle-orm';
import { db } from '../../core/database/client';
import type { ChatMessage, AIResponse, ContextType, ResponseFormat } from './types';
import { groqClient } from './groq-client';
import { geminiClient } from './gemini-client';
import { contextFetcherService } from './context-fetcher.service';
import { aiConversations, aiUsageStats } from './ai-integration.schema';
import { runAgentLoop } from './agent/agent-loop';
import type { AgentAIResponse } from './agent/types';

export class AIIntegrationService {
  /**
   * Process query using agent loop
   */
  async processAgentQuery(
    userId: string,
    query: string,
    conversationHistory: ChatMessage[],
    format?: ResponseFormat
  ): Promise<AgentAIResponse> {
    console.log('[AI] Processing with agent loop...');
    return await runAgentLoop(userId, query, conversationHistory, format);
  }

  /**
   * Main orchestration method for processing user queries
   * Now supports three modes: agent, fast, auto
   * - agent: Always use agent loop
   * - fast: Use Groq-first (backward compatible)
   * - auto (default): Groq quick check, route to agent if needed
   */
  async processQuery(
    userId: string,
    query: string,
    conversationHistory?: ChatMessage[],
    mode: 'agent' | 'fast' | 'auto' = 'auto',
    format?: ResponseFormat
  ): Promise<AIResponse | AgentAIResponse> {
    const startTime = Date.now();

    try {
      // Mode: agent - Always use agent loop
      if (mode === 'agent') {
        const result = await this.processAgentQuery(userId, query, conversationHistory || [], format);
        // Track Gemini usage (agent uses Gemini)
        await this.trackUsage(userId, 'gemini', 0);
        return result;
      }

      // Mode: fast - Use Groq-first (backward compatible)
      if (mode === 'fast') {
        return await this.processFastQuery(userId, query, conversationHistory || []);
      }

      // Mode: auto (default) - Smart routing
      // Quick Groq analysis to decide routing
      console.log('[AI] Auto mode: Analyzing query with Groq...');
      const analysis = await groqClient.analyzeQuery(query, conversationHistory);
      console.log('[AI] Analysis result:', analysis);

      // Track Groq usage
      await this.trackUsage(userId, 'groq', 0);

      // If simple with direct answer, return Groq's fast answer
      if (analysis.complexity === 'simple' && analysis.directAnswer) {
        console.log('[AI] Auto mode: Simple query with direct answer, using Groq');
        return {
          response: analysis.directAnswer,
          source: 'groq',
          complexity: 'simple',
          contextUsed: analysis.neededContext,
          metadata: {
            processingTimeMs: Date.now() - startTime,
            model: 'llama-3.3-70b-versatile',
            contextTypesUsed: analysis.neededContext,
          },
        };
      }

      // For anything else (simple without answer OR complex), route to agent
      console.log('[AI] Auto mode: Routing to agent loop');
      const result = await this.processAgentQuery(userId, query, conversationHistory || [], format);
      await this.trackUsage(userId, 'gemini', 0);
      return result;

    } catch (error: any) {
      console.error('[AI] Error processing query:', error);
      throw error;
    }
  }

  /**
   * Fast query processing (Groq-first, backward compatible)
   */
  private async processFastQuery(
    userId: string,
    query: string,
    conversationHistory: ChatMessage[]
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Step 1: Groq analyzes the query
    console.log('[AI] Fast mode: Analyzing query with Groq...');
    const analysis = await groqClient.analyzeQuery(query, conversationHistory);
    console.log('[AI] Analysis result:', analysis);

    // Track Groq usage
    await this.trackUsage(userId, 'groq', 0);

    // Step 2: If simple and has direct answer, return Groq's response
    if (analysis.complexity === 'simple' && analysis.directAnswer) {
      console.log('[AI] Simple query, returning Groq answer');
      return {
        response: analysis.directAnswer,
        source: 'groq',
        complexity: 'simple',
        contextUsed: analysis.neededContext,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          model: 'llama-3.3-70b-versatile',
          contextTypesUsed: analysis.neededContext,
        },
      };
    }

    // Step 3: For simple queries without direct answer, fetch minimal context
    if (analysis.complexity === 'simple') {
      console.log('[AI] Simple query, fetching context and using Groq...');
      const context = await contextFetcherService.fetchContext(
        userId,
        analysis.neededContext
      );

      const response = await groqClient.generateSimpleResponse(query, context);

      return {
        response,
        source: 'groq',
        complexity: 'simple',
        contextUsed: analysis.neededContext,
        metadata: {
          processingTimeMs: Date.now() - startTime,
          model: 'llama-3.3-70b-versatile',
          contextTypesUsed: analysis.neededContext,
        },
      };
    }

    // Step 4: Complex query - fetch full context and send to Gemini
    console.log('[AI] Complex query, fetching context for Gemini...');
    const context = await contextFetcherService.fetchContext(
      userId,
      analysis.neededContext
    );

    console.log('[AI] Generating response with Gemini...');
    const modelUsed = geminiClient.getModelForQuery(analysis.responseFormat, query);
    const response = await geminiClient.generateResponse(
      query,
      context,
      analysis.responseFormat
    );

    // Track Gemini usage
    await this.trackUsage(userId, 'gemini', 0);

    return {
      response,
      source: 'gemini',
      complexity: 'complex',
      contextUsed: analysis.neededContext,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        model: modelUsed,
        contextTypesUsed: analysis.neededContext,
      },
    };
  }

  /**
   * Save a conversation message to the database
   */
  async saveConversation(userId: string, message: ChatMessage): Promise<void> {
    try {
      await db.insert(aiConversations).values({
        userId,
        role: message.role,
        content: message.content,
        source: null,
        metadata: {},
      });
    } catch (error) {
      console.error('Failed to save conversation:', error);
      // Don't throw - conversation saving is not critical
    }
  }

  /**
   * Save AI response with metadata
   */
  async saveAIResponse(
    userId: string,
    message: ChatMessage,
    source: 'groq' | 'gemini' | 'gemini-agent',
    complexity: string,
    contextUsed: ContextType[],
    toolsUsed?: string[],
    iterations?: number,
    totalToolCalls?: number
  ): Promise<void> {
    try {
      await db.insert(aiConversations).values({
        userId,
        role: message.role,
        content: message.content,
        source,
        metadata: {
          complexity,
          contextUsed,
          toolsUsed,
          iterations,
          totalToolCalls,
        },
      });
    } catch (error) {
      console.error('Failed to save AI response:', error);
    }
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(
    userId: string,
    limit: number = 50
  ): Promise<ChatMessage[]> {
    try {
      const messages = await db.query.aiConversations.findMany({
        where: eq(aiConversations.userId, userId),
        orderBy: desc(aiConversations.createdAt),
        limit,
      });

      // Reverse to get chronological order
      return messages.reverse().map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.createdAt,
      }));
    } catch (error) {
      console.error('Failed to fetch conversation history:', error);
      return [];
    }
  }

  /**
   * Clear conversation history for a user
   */
  async clearConversation(userId: string): Promise<void> {
    try {
      await db.delete(aiConversations).where(eq(aiConversations.userId, userId));
    } catch (error) {
      console.error('Failed to clear conversation:', error);
      throw error;
    }
  }

  /**
   * Track AI usage statistics
   */
  private async trackUsage(
    userId: string,
    model: 'groq' | 'gemini',
    tokensUsed: number
  ): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await db.query.aiUsageStats.findFirst({
        where: and(
          eq(aiUsageStats.userId, userId),
          eq(aiUsageStats.date, today)
        ),
      });

      if (existing) {
        await db
          .update(aiUsageStats)
          .set({
            groqRequests: model === 'groq' ? existing.groqRequests + 1 : existing.groqRequests,
            geminiRequests:
              model === 'gemini' ? existing.geminiRequests + 1 : existing.geminiRequests,
            totalTokensUsed: existing.totalTokensUsed + tokensUsed,
            updatedAt: new Date(),
          })
          .where(eq(aiUsageStats.id, existing.id));
      } else {
        await db.insert(aiUsageStats).values({
          userId,
          date: today,
          groqRequests: model === 'groq' ? 1 : 0,
          geminiRequests: model === 'gemini' ? 1 : 0,
          totalTokensUsed: tokensUsed,
        });
      }
    } catch (error) {
      console.error('Failed to track usage:', error);
      // Don't throw - usage tracking is not critical
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUserStats(userId: string, days: number = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const stats = await db.query.aiUsageStats.findMany({
        where: eq(aiUsageStats.userId, userId),
        orderBy: desc(aiUsageStats.date),
        limit: days,
      });

      const totals = stats.reduce(
        (acc, stat) => ({
          groqRequests: acc.groqRequests + stat.groqRequests,
          geminiRequests: acc.geminiRequests + stat.geminiRequests,
          totalTokensUsed: acc.totalTokensUsed + stat.totalTokensUsed,
        }),
        { groqRequests: 0, geminiRequests: 0, totalTokensUsed: 0 }
      );

      return {
        stats,
        totals,
        period: `Last ${days} days`,
      };
    } catch (error) {
      console.error('Failed to get user stats:', error);
      return null;
    }
  }
}

export const aiIntegrationService = new AIIntegrationService();
