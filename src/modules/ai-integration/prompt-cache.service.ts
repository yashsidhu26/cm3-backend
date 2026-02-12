/**
 * Prompt Cache Service
 * Manages Vertex AI cached content for system prompts
 */

import { STATIC_SYSTEM_PROMPT } from './agent/system-prompt';

interface CachedPrompt {
  cacheId: string;
  createdAt: Date;
  expiresAt: Date;
}

class PromptCacheService {
  private currentCache: CachedPrompt | null = null;
  private readonly CACHE_TTL_HOURS = 1;

  /**
   * Get cached prompt ID (creates new cache if needed)
   */
  async getCachedPromptId(): Promise<string | null> {
    // Check if current cache is still valid
    if (this.currentCache && new Date() < this.currentCache.expiresAt) {
      console.log('[PromptCache] Using existing cache:', this.currentCache.cacheId);
      return this.currentCache.cacheId;
    }

    // Cache expired or doesn't exist - create new one
    try {
      const cacheId = await this.createCache();
      console.log('[PromptCache] Created new cache:', cacheId);
      return cacheId;
    } catch (error) {
      console.error('[PromptCache] Failed to create cache:', error);
      return null; // Fallback to non-cached requests
    }
  }

  /**
   * Create new cached content in Vertex AI
   */
  private async createCache(): Promise<string> {
    // TODO: Implement actual Vertex AI caching API call
    // For now, return mock cache ID
    // In production, this will call Vertex AI's cachedContents.create()
    
    const cacheId = `cache_${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.CACHE_TTL_HOURS * 60 * 60 * 1000);

    this.currentCache = {
      cacheId,
      createdAt: now,
      expiresAt,
    };

    return cacheId;
  }

  /**
   * Invalidate current cache (force recreation on next request)
   */
  invalidateCache(): void {
    console.log('[PromptCache] Cache invalidated');
    this.currentCache = null;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (!this.currentCache) {
      return { status: 'no-cache' };
    }

    const now = new Date();
    const isExpired = now >= this.currentCache.expiresAt;

    return {
      status: isExpired ? 'expired' : 'active',
      cacheId: this.currentCache.cacheId,
      createdAt: this.currentCache.createdAt.toISOString(),
      expiresAt: this.currentCache.expiresAt.toISOString(),
      remainingMinutes: isExpired ? 0 : Math.floor((this.currentCache.expiresAt.getTime() - now.getTime()) / 60000),
    };
  }
}

export const promptCacheService = new PromptCacheService();
