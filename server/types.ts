export type MentorAction = 'explain' | 'hint' | 'mistake' | 'ask';
export type AIProviderType = 'google' | 'openrouter';

export interface ExecutionContext {
  ok: boolean;
  varName?: string;
  total?: number;
  coinsCollected?: number;
  lastOutput?: string[];
  error?: string;
}

export interface MentorRequest {
  action: MentorAction;
  code: string;
  studentQuestion?: string;
  hintLevel?: number; // 1, 2, or 3
  executionState?: ExecutionContext;
  provider?: AIProviderType;
  apiKey?: string;
}

export interface MentorResponse {
  success: boolean;
  reply: string;
  action: MentorAction;
  hintLevel?: number;
  providerUsed: string;
  isFallback?: boolean;
  error?: string;
}

export interface HealthResponse {
  status: 'ok';
  hasEnvKey: boolean;
  configuredProvider: AIProviderType;
  rateLimitMax: number;
}
