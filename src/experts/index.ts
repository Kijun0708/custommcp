// src/experts/index.ts

import { Expert } from '../types.js';
import { strategist, STRATEGIST_METADATA } from './strategist.js';
import { researcher, RESEARCHER_METADATA } from './researcher.js';
import { reviewer, REVIEWER_METADATA } from './reviewer.js';
import { frontend, FRONTEND_METADATA } from './frontend.js';
import { writer, WRITER_METADATA } from './writer.js';
import { explorer, EXPLORER_METADATA } from './explorer.js';
import { multimodal, MULTIMODAL_METADATA } from './multimodal.js';
import { prometheus, PROMETHEUS_METADATA } from './prometheus.js';
import { metis, METIS_METADATA } from './metis.js';
import { momus, MOMUS_METADATA } from './momus.js';
import { librarian, LIBRARIAN_METADATA } from './librarian.js';
import type { ExpertPromptMetadata } from '../prompts/metadata/expert-metadata.js';

export const experts: Record<string, Expert> = {
  strategist,
  researcher,
  reviewer,
  frontend,
  writer,
  explorer,
  multimodal,
  prometheus,
  metis,
  momus,
  librarian
};

export type ExpertId = keyof typeof experts;

// 폴백 매핑
export const FALLBACK_CHAIN: Record<string, string[]> = {
  strategist: ['researcher', 'reviewer'],
  researcher: ['reviewer', 'explorer'],
  reviewer: ['explorer', 'writer'],
  frontend: ['writer', 'explorer'],
  writer: ['explorer', 'reviewer'],
  explorer: ['writer', 'researcher'],
  multimodal: ['researcher', 'reviewer'],  // Multimodal fallback chain
  prometheus: ['strategist', 'metis'],     // Planning agents
  metis: ['prometheus', 'strategist'],
  momus: ['reviewer', 'strategist'],
  librarian: ['researcher', 'explorer']
};

// Export individual experts
export { strategist, researcher, reviewer, frontend, writer, explorer, multimodal, prometheus, metis, momus, librarian };

// Export metadata
export {
  STRATEGIST_METADATA,
  RESEARCHER_METADATA,
  REVIEWER_METADATA,
  FRONTEND_METADATA,
  WRITER_METADATA,
  EXPLORER_METADATA,
  MULTIMODAL_METADATA,
  PROMETHEUS_METADATA,
  METIS_METADATA,
  MOMUS_METADATA,
  LIBRARIAN_METADATA
};

/**
 * Complete registry of all expert metadata for auto-routing.
 */
export const EXPERT_METADATA_REGISTRY: Record<string, ExpertPromptMetadata> = {
  strategist: STRATEGIST_METADATA,
  researcher: RESEARCHER_METADATA,
  reviewer: REVIEWER_METADATA,
  frontend: FRONTEND_METADATA,
  writer: WRITER_METADATA,
  explorer: EXPLORER_METADATA,
  multimodal: MULTIMODAL_METADATA,
  prometheus: PROMETHEUS_METADATA,
  metis: METIS_METADATA,
  momus: MOMUS_METADATA,
  librarian: LIBRARIAN_METADATA
};

/**
 * Gets metadata for an expert by ID.
 */
export function getExpertMetadata(expertId: string): ExpertPromptMetadata | undefined {
  return EXPERT_METADATA_REGISTRY[expertId];
}

/**
 * Lists all available expert IDs.
 */
export function listExpertIds(): string[] {
  return Object.keys(experts);
}
