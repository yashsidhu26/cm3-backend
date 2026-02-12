import { eq, desc, and } from 'drizzle-orm';
import { db } from '../../core/database/client';
import type { ChatMessage, ResponseFormat } from './types';
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
   * All queries now routed to Gemini agent with smart model selection
   */
  async processQuery(
    userId: string,
    query: string,
    conversationHistory?: ChatMessage[],
    format?: ResponseFormat
  ): Promise<AgentAIResponse> {
    try {
      console.log('[AI] Processing query with Gemini agent...');
      const result = await this.processAgentQuery(userId, query, conversationHistory || [], format);

      // Track Gemini usage
      await this.trackUsage(userId, 'gemini', 0);

      return result;
    } catch (error: any) {
      console.error('[AI] Error processing query:', error);
      throw error;
    }
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
