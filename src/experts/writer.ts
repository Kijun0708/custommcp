// src/experts/writer.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { WRITER_SYSTEM_PROMPT, WRITER_METADATA } from '../prompts/experts/index.js';

export const writer: Expert = {
  id: "writer",
  name: "Gemini Writer",
  model: config.models.writer,

  role: "문서 작성/정리 전문가 (Technical Writer)",

  // Enhanced prompt from prompts/experts/writer.prompt.ts
  systemPrompt: WRITER_SYSTEM_PROMPT,

  temperature: 0.2,
  maxTokens: 4000,  // Increased for comprehensive documentation

  fallbacks: ["explorer"],

  useCases: WRITER_METADATA.useWhen,

  toolChoice: "auto"
};

// Export metadata for external use
export { WRITER_METADATA };
