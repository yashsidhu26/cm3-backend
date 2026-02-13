/**
 * Prompt Cache Service
 * Manages Vertex AI prompt caching via systemInstruction
 *
 * Vertex AI automatically caches systemInstruction content when:
 * - The systemInstruction is > 2048 tokens (~8KB text)
 * - The same systemInstruction is reused across requests
 * - Cache TTL is 1 hour by default
 *
 * Our STATIC_SYSTEM_PROMPT (~11KB) will be automatically cached,
 * reducing input token costs by ~85% after the first request.
 */

import { STATIC_SYSTEM_PROMPT } from './agent/system-prompt';

interface CacheStats {
  status: 'enabled' | 'disabled';
  staticPromptSize: number;
  estimatedTokens: number;
  cachingActive: boolean;
  message: string;
}

class PromptCacheService {
  private readonly MIN_CACHE_TOKENS = 2048; // Vertex AI minimum for caching
  private readonly ESTIMATED_CHARS_PER_TOKEN = 4; // Rough estimate

  /**
   * Get the static system prompt for caching
   * This will be passed as systemInstruction to Vertex AI
   */
  getStaticPrompt(): string {
    return STATIC_SYSTEM_PROMPT;
  }

  /**
   * Check if prompt caching is enabled and effective
   */
  isCachingEnabled(): boolean {
    const estimatedTokens = Math.floor(STATIC_SYSTEM_PROMPT.length / this.ESTIMATED_CHARS_PER_TOKEN);
    return estimatedTokens >= this.MIN_CACHE_TOKENS;
  }

  /**
   * Get cache statistics and info
   */
  getCacheStats(): CacheStats {
    const staticPromptSize = STATIC_SYSTEM_PROMPT.length;
    const estimatedTokens = Math.floor(staticPromptSize / this.ESTIMATED_CHARS_PER_TOKEN);
    const cachingActive = estimatedTokens >= this.MIN_CACHE_TOKENS;

    return {
      status: cachingActive ? 'enabled' : 'disabled',
      staticPromptSize,
      estimatedTokens,
      cachingActive,
      message: cachingActive
        ? `Prompt caching is active. Static prompt (~${estimatedTokens} tokens) will be cached by Vertex AI, reducing input costs by ~85% after the first request per hour.`
        : `Prompt caching is disabled. Static prompt is too small (${estimatedTokens} tokens < ${this.MIN_CACHE_TOKENS} required).`,
    };
  }

  /**
   * Log cache usage info
   */
  logCacheUsage(): void {
    const stats = this.getCacheStats();
    if (stats.cachingActive) {
      console.log(`[PromptCache] ✅ Caching enabled - ${stats.estimatedTokens} tokens will be cached`);
    } else {
      console.log(`[PromptCache] ⚠️ Caching disabled - prompt too small (${stats.estimatedTokens} tokens)`);
    }
  }
}

export const promptCacheService = new PromptCacheService();
