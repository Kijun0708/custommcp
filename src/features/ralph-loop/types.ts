// src/features/ralph-loop/types.ts

/**
 * Ralph Loop Types
 *
 * Ralph Loop is a self-referential task completion pattern that:
 * 1. Executes a task iteratively
 * 2. Detects completion via promise tag (<promise>DONE</promise>)
 * 3. Auto-continues until completion or max iterations
 *
 * Based on oh-my-opencode's Ralph Loop implementation.
 */

/**
 * Ralph Loop state persisted to file.
 */
export interface RalphLoopState {
  /** Whether the loop is currently active */
  active: boolean;

  /** Current iteration number (starts at 1) */
  iteration: number;

  /** Maximum iterations before auto-stop */
  maxIterations: number;

  /** Text that signals completion (default: "DONE") */
  completionPromise: string;

  /** ISO timestamp when loop started */
  startedAt: string;

  /** Original task prompt */
  prompt: string;

  /** Associated workflow/task ID */
  taskId?: string;

  /** Last output from the task */
  lastOutput?: string;

  /** Expert used for execution */
  expert?: string;
}

/**
 * Options for starting a Ralph Loop.
 */
export interface RalphLoopOptions {
  /** Maximum iterations (default: 10 for MCP, less aggressive than oh-my-opencode's 100) */
  maxIterations?: number;

  /** Completion promise text (default: "DONE") */
  completionPromise?: string;

  /** Expert to use for execution (default: "strategist") */
  expert?: string;

  /** Additional context to include */
  context?: string;

  /** Whether to skip initial execution (for resuming) */
  skipInitial?: boolean;
}

/**
 * Result of a Ralph Loop execution.
 */
export interface RalphLoopResult {
  /** Whether the task completed successfully */
  completed: boolean;

  /** Final output from the task */
  output: string;

  /** Number of iterations executed */
  iterations: number;

  /** Whether max iterations was reached */
  maxIterationsReached: boolean;

  /** Whether the loop was cancelled */
  cancelled: boolean;

  /** Total execution time in milliseconds */
  totalTimeMs: number;

  /** Completion promise if detected */
  detectedPromise?: string;
}

/**
 * Ralph Loop iteration result.
 */
export interface RalphLoopIterationResult {
  /** Iteration number */
  iteration: number;

  /** Output from this iteration */
  output: string;

  /** Whether completion was detected */
  completionDetected: boolean;

  /** Detected promise text if any */
  detectedPromise?: string;

  /** Whether to continue looping */
  shouldContinue: boolean;

  /** Error if iteration failed */
  error?: string;
}

/**
 * Ralph Loop configuration.
 */
export interface RalphLoopConfig {
  /** Default max iterations */
  defaultMaxIterations: number;

  /** Default completion promise */
  defaultCompletionPromise: string;

  /** State file path relative to project root */
  stateFilePath: string;

  /** Delay between iterations in ms */
  iterationDelayMs: number;

  /** Whether to include iteration context in prompts */
  includeIterationContext: boolean;
}
