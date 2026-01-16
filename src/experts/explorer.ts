// src/experts/explorer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { EXPLORER_SYSTEM_PROMPT, EXPLORER_METADATA } from '../prompts/experts/index.js';

export const explorer: Expert = {
  id: "explorer",
  name: "Fast Explorer",
  model: config.models.explorer,

  role: "빠른 코드베이스 탐색/패턴 매칭 전문가 (Explore Pattern)",

  // Enhanced prompt from prompts/experts/explorer.prompt.ts
  systemPrompt: EXPLORER_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 2000,  // Increased for structured results

  fallbacks: ['writer', 'researcher'],  // Fallback chain for rate limit handling

  useCases: EXPLORER_METADATA.useWhen,

  // explorer는 빠른 응답을 위해 도구 사용 안 함
  toolChoice: "none"
};

// Export metadata for external use
export { EXPLORER_METADATA };
