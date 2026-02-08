// TypeScript types for AI integration system

export type QueryComplexity = 'simple' | 'complex' | 'agent';

export type ResponseFormat = 'text' | 'json' | 'schedule' | 'overview';

export type ContextType =
  | 'profile'
  | 'academics'
  | 'courses'
  | 'course_resources'
  | 'activity_logs'
  | 'smart_plan'
  | 'experiences'
  | 'commitments';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface GroqAnalysis {
  complexity: QueryComplexity;
  neededContext: ContextType[];
  responseFormat: ResponseFormat;
  directAnswer?: string;
  reasoning?: string;
}

export interface StudentContext {
  profile?: any;
  academics?: any;
  courses?: any[];
  courseResources?: Record<string, any[]>;
  activityLogs?: any[];
  smartPlan?: any;
  experiences?: any[];
  commitments?: any[];
}

export interface AIResponseMetadata {
  processingTimeMs: number;
  model: string;
  tokensUsed?: number;
  contextTypesUsed?: ContextType[];
  totalToolCalls?: number;
  toolCallDetails?: any[];
}

export interface AIResponse {
  response: string;
  source: 'groq' | 'gemini' | 'gemini-agent';
  complexity: QueryComplexity;
  contextUsed: ContextType[];
  toolsUsed?: string[];
  iterations?: number;
  metadata: AIResponseMetadata;
}

export interface UsageStats {
  groqRequests: number;
  geminiRequests: number;
  totalTokensUsed: number;
  date: Date;
}

// Re-export agent types
export type { AgentAIResponse } from './agent/types';
