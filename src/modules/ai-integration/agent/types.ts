/**
 * Agent-specific TypeScript types
 */

export interface ToolCallDetail {
  tool: string;
  name?: string; // Alias for tool for compatibility
  durationMs?: number;
  success?: boolean;
  error?: string;
  args?: any;
  result?: any;
}

export interface AgentAIResponse {
  response: string;
  source: 'gemini-agent';
  source: 'gemini-agent';
  complexity: 'agent' | 'general' | 'query';
  toolsUsed: string[];
  toolsUsed: string[];
  iterations: number;
  metadata: {
    processingTimeMs: number;
    model: string;
    totalToolCalls: number;
    toolCallDetails: ToolCallDetail[];
  };
}

export interface ToolExecutionResult {
  name: string;
  response: {
    success?: boolean;
    data?: any;
    error?: string;
  };
}
