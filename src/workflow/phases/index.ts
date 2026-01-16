// src/workflow/phases/index.ts

/**
 * Phase handlers index.
 * Exports all phase implementations for the workflow system.
 */

export { phase0Intent } from './phase-0-intent.js';
export { phase1Assessment } from './phase-1-assessment.js';
export { phase2aExploration } from './phase-2a-exploration.js';
export { phase2bImplementation } from './phase-2b-implementation.js';
export { phase2dVerification } from './phase-2d-verification.js';
export { phase2cRecovery } from './phase-2c-recovery.js';
export { phase3Completion, contextToResult } from './phase-3-completion.js';

import { PhaseHandler, PhaseId } from '../types.js';
import { phase0Intent } from './phase-0-intent.js';
import { phase1Assessment } from './phase-1-assessment.js';
import { phase2aExploration } from './phase-2a-exploration.js';
import { phase2bImplementation } from './phase-2b-implementation.js';
import { phase2dVerification } from './phase-2d-verification.js';
import { phase2cRecovery } from './phase-2c-recovery.js';
import { phase3Completion } from './phase-3-completion.js';

/**
 * Registry of all phase handlers.
 */
export const PHASE_HANDLERS: Record<PhaseId, PhaseHandler> = {
  intent: phase0Intent,
  assessment: phase1Assessment,
  exploration: phase2aExploration,
  implementation: phase2bImplementation,
  verification: phase2dVerification,
  recovery: phase2cRecovery,
  completion: phase3Completion
};

/**
 * Gets a phase handler by ID.
 */
export function getPhaseHandler(phaseId: PhaseId): PhaseHandler | undefined {
  return PHASE_HANDLERS[phaseId];
}
