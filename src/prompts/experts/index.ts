/**
 * Expert Prompts Index
 *
 * Exports all expert prompts and their metadata.
 */

// Strategist (Oracle pattern)
export {
  STRATEGIST_SYSTEM_PROMPT,
  STRATEGIST_METADATA,
  buildStrategistPrompt,
} from './strategist.prompt.js';

// Researcher (Librarian pattern)
export {
  RESEARCHER_SYSTEM_PROMPT,
  RESEARCHER_METADATA,
  buildResearcherPrompt,
  type ResearchDepth,
} from './researcher.prompt.js';

// Explorer (Explore pattern)
export {
  EXPLORER_SYSTEM_PROMPT,
  EXPLORER_METADATA,
  buildExplorerPrompt,
  type ExplorerThoroughness,
} from './explorer.prompt.js';

// Frontend (UI/UX Engineer)
export {
  FRONTEND_SYSTEM_PROMPT,
  FRONTEND_METADATA,
  buildFrontendPrompt,
} from './frontend.prompt.js';

// Reviewer (Code Review)
export {
  REVIEWER_SYSTEM_PROMPT,
  REVIEWER_METADATA,
  buildReviewerPrompt,
  type ReviewFocus,
} from './reviewer.prompt.js';

// Writer (Technical Documentation)
export {
  WRITER_SYSTEM_PROMPT,
  WRITER_METADATA,
  buildWriterPrompt,
  type DocumentationType,
} from './writer.prompt.js';

// Multimodal Looker (Visual Analysis)
export {
  MULTIMODAL_SYSTEM_PROMPT,
  MULTIMODAL_METADATA,
  buildMultimodalPrompt,
  type MultimodalDepth,
} from './multimodal.prompt.js';

// Import for internal use
import { STRATEGIST_SYSTEM_PROMPT, STRATEGIST_METADATA } from './strategist.prompt.js';
import { RESEARCHER_SYSTEM_PROMPT, RESEARCHER_METADATA } from './researcher.prompt.js';
import { EXPLORER_SYSTEM_PROMPT, EXPLORER_METADATA } from './explorer.prompt.js';
import { FRONTEND_SYSTEM_PROMPT, FRONTEND_METADATA } from './frontend.prompt.js';
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_METADATA } from './reviewer.prompt.js';
import { WRITER_SYSTEM_PROMPT, WRITER_METADATA } from './writer.prompt.js';
import { MULTIMODAL_SYSTEM_PROMPT, MULTIMODAL_METADATA } from './multimodal.prompt.js';
import type { ExpertRegistry } from '../metadata/expert-metadata.js';

/**
 * Complete registry of all expert metadata.
 */
export const EXPERT_REGISTRY: ExpertRegistry = {
  strategist: STRATEGIST_METADATA,
  researcher: RESEARCHER_METADATA,
  explorer: EXPLORER_METADATA,
  frontend: FRONTEND_METADATA,
  reviewer: REVIEWER_METADATA,
  writer: WRITER_METADATA,
  multimodal: MULTIMODAL_METADATA,
};

/**
 * Map of expert IDs to their system prompts.
 */
export const EXPERT_PROMPTS: Record<string, string> = {
  strategist: STRATEGIST_SYSTEM_PROMPT,
  researcher: RESEARCHER_SYSTEM_PROMPT,
  explorer: EXPLORER_SYSTEM_PROMPT,
  frontend: FRONTEND_SYSTEM_PROMPT,
  reviewer: REVIEWER_SYSTEM_PROMPT,
  writer: WRITER_SYSTEM_PROMPT,
  multimodal: MULTIMODAL_SYSTEM_PROMPT,
};

/**
 * Gets the system prompt for an expert.
 */
export function getExpertPrompt(expertId: string): string | undefined {
  return EXPERT_PROMPTS[expertId];
}
