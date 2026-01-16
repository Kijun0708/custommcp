// src/features/ralph-loop/index.ts

/**
 * Ralph Loop Feature
 *
 * Self-referential task completion pattern that continues
 * until a completion promise is detected or max iterations reached.
 */

// Types
export type {
  RalphLoopState,
  RalphLoopOptions,
  RalphLoopResult,
  RalphLoopIterationResult,
  RalphLoopConfig
} from './types.js';

// Constants
export {
  DEFAULT_COMPLETION_PROMISE,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_STATE_FILE,
  COMPLETION_TAG_PATTERN,
  DEFAULT_RALPH_LOOP_CONFIG
} from './constants.js';

// Storage
export {
  readState,
  writeState,
  clearState,
  incrementIteration,
  updateLastOutput,
  isLoopActive,
  getStateFilePath
} from './storage.js';

// Manager
export {
  RalphLoopManager,
  createRalphLoopManager,
  executeRalphLoop,
  detectCompletionPromise
} from './manager.js';
