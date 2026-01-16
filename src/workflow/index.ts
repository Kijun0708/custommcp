// src/workflow/index.ts

/**
 * Workflow System
 *
 * Phase-based workflow orchestration for multi-step task execution.
 * Based on oh-my-opencode's Sisyphus pattern.
 *
 * Phases:
 * - Phase 0 (Intent): Classify the request
 * - Phase 1 (Assessment): Analyze codebase context
 * - Phase 2A (Exploration): Deep dive when needed
 * - Phase 2B (Implementation): Execute with expert delegation
 * - Phase 2C (Recovery): Handle failures with 3-strike protocol
 * - Phase 3 (Completion): Verify and summarize
 */

// Types
export * from './types.js';

// Orchestrator
export {
  WorkflowOrchestrator,
  createOrchestrator,
  executeWorkflow
} from './orchestrator.js';

// Phase handlers
export {
  PHASE_HANDLERS,
  getPhaseHandler,
  phase0Intent,
  phase1Assessment,
  phase2aExploration,
  phase2bImplementation,
  phase2cRecovery,
  phase3Completion,
  contextToResult
} from './phases/index.js';
