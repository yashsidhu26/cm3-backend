/**
 * Agent-specific TypeScript types
 */

export interface ToolCallDetail {
  tool: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface AgentAIResponse {
  response: string;
  source: 'gemini-agent';
  complexity: 'agent';
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
