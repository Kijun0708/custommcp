// src/experts/reviewer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_METADATA } from '../prompts/experts/index.js';

export const reviewer: Expert = {
  id: "reviewer",
  name: "Gemini Reviewer",
  model: config.models.reviewer,

  role: "코드 리뷰/버그 탐지 전문가 (READ-ONLY)",

  // Enhanced prompt from prompts/experts/reviewer.prompt.ts
  systemPrompt: REVIEWER_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 4000,  // Increased for comprehensive reviews

  fallbacks: ["explorer"],

  useCases: REVIEWER_METADATA.useWhen,

  // READ-ONLY: reviewer analyzes but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { REVIEWER_METADATA };
