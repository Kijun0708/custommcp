// src/experts/researcher.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { RESEARCHER_SYSTEM_PROMPT, RESEARCHER_METADATA } from '../prompts/experts/index.js';

export const researcher: Expert = {
  id: "researcher",
  name: "Claude Researcher",
  model: config.models.researcher,

  role: "조사/분석/문서 전문가 (Librarian Pattern)",

  // Enhanced prompt from prompts/experts/researcher.prompt.ts
  systemPrompt: RESEARCHER_SYSTEM_PROMPT,

  temperature: 0.1,
  maxTokens: 4000,  // Increased for comprehensive research

  fallbacks: ["reviewer", "explorer"],

  useCases: RESEARCHER_METADATA.useWhen,

  toolChoice: "auto"
};

// Export metadata for external use
export { RESEARCHER_METADATA };
