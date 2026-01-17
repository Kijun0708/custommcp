// src/experts/librarian.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { LIBRARIAN_SYSTEM_PROMPT, LIBRARIAN_METADATA } from '../prompts/experts/librarian.prompt.js';

export const librarian: Expert = {
  id: "librarian",
  name: "Librarian",
  model: config.models.librarian,

  role: "멀티 레포지토리 분석 및 문서화 전문가",

  systemPrompt: LIBRARIAN_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 5000,

  fallbacks: ["researcher", "explorer"],

  useCases: LIBRARIAN_METADATA.useWhen,

  // READ-ONLY: librarian documents but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { LIBRARIAN_METADATA };
