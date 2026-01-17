// src/experts/prometheus.ts

import { Expert } from '../types.js';
import { config } from '../config.js';
import { PROMETHEUS_SYSTEM_PROMPT, PROMETHEUS_METADATA } from '../prompts/experts/prometheus.prompt.js';

export const prometheus: Expert = {
  id: "prometheus",
  name: "Prometheus Planner",
  model: config.models.prometheus,

  role: "전략적 계획 전문가 (인터뷰 기반)",

  systemPrompt: PROMETHEUS_SYSTEM_PROMPT,

  temperature: 0.3,
  maxTokens: 4000,

  fallbacks: ["strategist", "metis"],

  useCases: PROMETHEUS_METADATA.useWhen,

  // READ-ONLY: prometheus plans but doesn't modify
  toolChoice: "auto"
};

// Export metadata for external use
export { PROMETHEUS_METADATA };
