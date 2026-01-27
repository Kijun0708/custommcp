// src/features/ralph-loop/manager.ts

/**
 * Ralph Loop Manager
 *
 * Manages the execution of Ralph Loop tasks - self-referential loops
 * that continue until a completion promise is detected or max iterations reached.
 *
 * Unlike oh-my-opencode which uses hooks on session.idle events,
 * custommcp implements this as a synchronous execution manager since
 * MCP tools are request-response based.
 */

import {
  RalphLoopState,
  RalphLoopOptions,
  RalphLoopResult,
  RalphLoopIterationResult,
  RalphLoopConfig
} from './types.js';
import {
  readState,
  writeState,
  clearState,
  incrementIteration,
  updateLastOutput,
  isLoopActive
} from './storage.js';
import {
  DEFAULT_RALPH_LOOP_CONFIG,
  COMPLETION_TAG_PATTERN,
  CONTINUATION_PROMPT_TEMPLATE,
  INITIAL_PROMPT_TEMPLATE
} from './constants.js';
import { callExpertWithFallback } from '../../services/expert-router.js';
import { logger } from '../../utils/logger.js';
import { executeHooks } from '../../hooks/index.js';

/**
 * Sleep utility for delays between iterations.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects completion promise in output text.
 * Returns the detected promise text or null.
 */
export function detectCompletionPromise(
  output: string,
  expectedPromise: string
): string | null {
  const match = output.match(COMPLETION_TAG_PATTERN);

  if (match) {
    const detectedPromise = match[1].trim();

    // Check if it matches expected promise (case-insensitive)
    if (detectedPromise.toLowerCase() === expectedPromise.toLowerCase()) {
      return detectedPromise;
    }

    // Also accept if detected promise contains expected
    if (detectedPromise.toLowerCase().includes(expectedPromise.toLowerCase())) {
      return detectedPromise;
    }
  }

  return null;
}

/**
 * Builds the initial prompt for a Ralph Loop task.
 */
function buildInitialPrompt(
  prompt: string,
  options: RalphLoopOptions,
  config: RalphLoopConfig
): string {
  const maxIterations = options.maxIterations ?? config.defaultMaxIterations;
  const completionPromise = options.completionPromise ?? config.defaultCompletionPromise;
  const context = options.context ? `\n## Additional Context\n${options.context}` : '';

  return INITIAL_PROMPT_TEMPLATE
    .replace(/\{\{MAX\}\}/g, String(maxIterations))
    .replace(/\{\{PROMISE\}\}/g, completionPromise)
    .replace(/\{\{PROMPT\}\}/g, prompt)
    .replace(/\{\{CONTEXT\}\}/g, context);
}

/**
 * Builds the continuation prompt for subsequent iterations.
 */
function buildContinuationPrompt(
  state: RalphLoopState,
  config: RalphLoopConfig
): string {
  const previousOutput = state.lastOutput
    ? state.lastOutput.substring(0, 500) + (state.lastOutput.length > 500 ? '...' : '')
    : 'No previous output recorded';

  return CONTINUATION_PROMPT_TEMPLATE
    .replace(/\{\{ITERATION\}\}/g, String(state.iteration))
    .replace(/\{\{MAX\}\}/g, String(state.maxIterations))
    .replace(/\{\{PROMISE\}\}/g, state.completionPromise)
    .replace(/\{\{PROMPT\}\}/g, state.prompt)
    .replace(/\{\{PREVIOUS_OUTPUT\}\}/g, previousOutput);
}

/**
 * Executes a single iteration of the Ralph Loop.
 */
async function executeIteration(
  state: RalphLoopState,
  isInitial: boolean,
  config: RalphLoopConfig
): Promise<RalphLoopIterationResult> {
  const expert = state.expert || 'strategist';

  try {
    // Build prompt based on iteration
    const prompt = isInitial
      ? buildInitialPrompt(state.prompt, {
          maxIterations: state.maxIterations,
          completionPromise: state.completionPromise
        }, config)
      : buildContinuationPrompt(state, config);

    logger.info({
      iteration: state.iteration,
      maxIterations: state.maxIterations,
      expert,
      isInitial
    }, 'Executing Ralph Loop iteration');

    // Call expert
    const response = await callExpertWithFallback(
      expert,
      prompt,
      undefined,
      true, // skipCache - always get fresh response
      undefined,  // imagePath
      true  // applyPreamble - Ralph Loop에서 Worker 제약 적용
    );

    const output = response.response;

    // Check for completion
    const detectedPromise = detectCompletionPromise(output, state.completionPromise);
    const completionDetected = detectedPromise !== null;

    logger.info({
      iteration: state.iteration,
      completionDetected,
      detectedPromise,
      outputLength: output.length
    }, 'Ralph Loop iteration completed');

    return {
      iteration: state.iteration,
      output,
      completionDetected,
      detectedPromise: detectedPromise ?? undefined,
      shouldContinue: !completionDetected && state.iteration < state.maxIterations
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error({
      iteration: state.iteration,
      error: errorMessage
    }, 'Ralph Loop iteration failed');

    return {
      iteration: state.iteration,
      output: `Error: ${errorMessage}`,
      completionDetected: false,
      shouldContinue: state.iteration < state.maxIterations, // Continue despite error
      error: errorMessage
    };
  }
}

/**
 * Ralph Loop Manager class.
 *
 * Provides methods to start, execute, and cancel Ralph Loop tasks.
 */
export class RalphLoopManager {
  private config: RalphLoopConfig;
  private directory: string;
  private cancelled: boolean = false;

  constructor(directory: string, config?: Partial<RalphLoopConfig>) {
    this.directory = directory;
    this.config = { ...DEFAULT_RALPH_LOOP_CONFIG, ...config };
  }

  /**
   * Starts a new Ralph Loop.
   */
  startLoop(
    taskId: string,
    prompt: string,
    options?: RalphLoopOptions
  ): RalphLoopState {
    const state: RalphLoopState = {
      active: true,
      iteration: 1,
      maxIterations: options?.maxIterations ?? this.config.defaultMaxIterations,
      completionPromise: options?.completionPromise ?? this.config.defaultCompletionPromise,
      startedAt: new Date().toISOString(),
      prompt,
      taskId,
      expert: options?.expert ?? 'strategist'
    };

    writeState(this.directory, state, this.config.stateFilePath);

    logger.info({
      taskId,
      maxIterations: state.maxIterations,
      completionPromise: state.completionPromise,
      expert: state.expert
    }, 'Ralph Loop started');

    return state;
  }

  /**
   * Executes the Ralph Loop until completion or max iterations.
   * This is a blocking operation that runs the entire loop.
   */
  async execute(
    taskId: string,
    prompt: string,
    options?: RalphLoopOptions
  ): Promise<RalphLoopResult> {
    const startTime = Date.now();
    this.cancelled = false;

    // Initialize state
    let state = this.startLoop(taskId, prompt, options);
    let allOutputs: string[] = [];
    let finalResult: RalphLoopIterationResult | null = null;

    // Execute onRalphLoopStart hook
    await executeHooks('onRalphLoopStart', {
      taskId,
      prompt,
      maxIterations: state.maxIterations,
      completionPromise: state.completionPromise,
      expert: state.expert || 'strategist'
    });

    try {
      // Execute iterations
      while (state.active && !this.cancelled) {
        const isInitial = state.iteration === 1 && !options?.skipInitial;

        // Execute iteration
        const result = await executeIteration(state, isInitial, this.config);
        allOutputs.push(result.output);
        finalResult = result;

        // Execute onRalphLoopIteration hook
        await executeHooks('onRalphLoopIteration', {
          taskId,
          iteration: state.iteration,
          maxIterations: state.maxIterations,
          output: result.output.substring(0, 500),
          completionDetected: result.completionDetected,
          detectedPromise: result.detectedPromise
        });

        // Update state with last output
        updateLastOutput(this.directory, result.output, this.config.stateFilePath);

        // Check completion
        if (result.completionDetected) {
          logger.info({
            taskId,
            iteration: state.iteration,
            detectedPromise: result.detectedPromise
          }, 'Ralph Loop completed - promise detected');

          clearState(this.directory, this.config.stateFilePath);

          const completedResult: RalphLoopResult = {
            completed: true,
            output: this.formatFinalOutput(allOutputs, result),
            iterations: state.iteration,
            maxIterationsReached: false,
            cancelled: false,
            totalTimeMs: Date.now() - startTime,
            detectedPromise: result.detectedPromise
          };

          // Execute onRalphLoopEnd hook
          await executeHooks('onRalphLoopEnd', {
            taskId,
            completed: true,
            iterations: state.iteration,
            maxIterationsReached: false,
            cancelled: false,
            totalDurationMs: completedResult.totalTimeMs
          });

          return completedResult;
        }

        // Check max iterations
        if (state.iteration >= state.maxIterations) {
          logger.warn({
            taskId,
            iteration: state.iteration,
            maxIterations: state.maxIterations
          }, 'Ralph Loop stopped - max iterations reached');

          clearState(this.directory, this.config.stateFilePath);

          const maxIterResult: RalphLoopResult = {
            completed: false,
            output: this.formatFinalOutput(allOutputs, result),
            iterations: state.iteration,
            maxIterationsReached: true,
            cancelled: false,
            totalTimeMs: Date.now() - startTime
          };

          // Execute onRalphLoopEnd hook
          await executeHooks('onRalphLoopEnd', {
            taskId,
            completed: false,
            iterations: state.iteration,
            maxIterationsReached: true,
            cancelled: false,
            totalDurationMs: maxIterResult.totalTimeMs
          });

          return maxIterResult;
        }

        // Check if cancelled
        if (this.cancelled) {
          break;
        }

        // Increment iteration for next round
        const newState = incrementIteration(this.directory, this.config.stateFilePath);
        if (!newState) {
          logger.error({ taskId }, 'Failed to increment Ralph Loop iteration');
          break;
        }
        state = newState;

        // Delay before next iteration
        if (this.config.iterationDelayMs > 0) {
          await sleep(this.config.iterationDelayMs);
        }
      }

      // Cancelled or error exit
      clearState(this.directory, this.config.stateFilePath);

      const cancelledResult: RalphLoopResult = {
        completed: false,
        output: this.formatFinalOutput(allOutputs, finalResult),
        iterations: state.iteration,
        maxIterationsReached: false,
        cancelled: this.cancelled,
        totalTimeMs: Date.now() - startTime
      };

      // Execute onRalphLoopEnd hook
      await executeHooks('onRalphLoopEnd', {
        taskId,
        completed: false,
        iterations: state.iteration,
        maxIterationsReached: false,
        cancelled: this.cancelled,
        totalDurationMs: cancelledResult.totalTimeMs
      });

      return cancelledResult;

    } catch (error) {
      logger.error({ error, taskId }, 'Ralph Loop execution failed');
      clearState(this.directory, this.config.stateFilePath);

      const errorResult: RalphLoopResult = {
        completed: false,
        output: `Ralph Loop failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        iterations: state.iteration,
        maxIterationsReached: false,
        cancelled: false,
        totalTimeMs: Date.now() - startTime
      };

      // Execute onRalphLoopEnd hook
      await executeHooks('onRalphLoopEnd', {
        taskId,
        completed: false,
        iterations: state.iteration,
        maxIterationsReached: false,
        cancelled: false,
        totalDurationMs: errorResult.totalTimeMs
      });

      // Execute onError hook
      await executeHooks('onError', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        source: `ralph-loop:${taskId}`,
        recoverable: false
      });

      return errorResult;
    }
  }

  /**
   * Cancels the currently running Ralph Loop.
   */
  cancel(): boolean {
    this.cancelled = true;
    const state = readState(this.directory, this.config.stateFilePath);

    if (state?.active) {
      clearState(this.directory, this.config.stateFilePath);
      logger.info({ taskId: state.taskId, iteration: state.iteration }, 'Ralph Loop cancelled');
      return true;
    }

    return false;
  }

  /**
   * Gets the current loop state.
   */
  getState(): RalphLoopState | null {
    return readState(this.directory, this.config.stateFilePath);
  }

  /**
   * Checks if a loop is currently active.
   */
  isActive(): boolean {
    return isLoopActive(this.directory, this.config.stateFilePath);
  }

  /**
   * Formats the final output from all iterations.
   */
  private formatFinalOutput(
    allOutputs: string[],
    lastResult: RalphLoopIterationResult | null
  ): string {
    if (allOutputs.length === 0) {
      return 'No output generated';
    }

    if (allOutputs.length === 1) {
      return allOutputs[0];
    }

    // For multiple iterations, include summary
    const lastOutput = allOutputs[allOutputs.length - 1];
    const iterationCount = allOutputs.length;

    return `## Ralph Loop Result (${iterationCount} iterations)

### Final Output
${lastOutput}

${lastResult?.completionDetected ? `\n### Completion Detected\nPromise: <promise>${lastResult.detectedPromise}</promise>` : ''}`;
  }
}

/**
 * Creates a new Ralph Loop manager instance.
 */
export function createRalphLoopManager(
  directory: string,
  config?: Partial<RalphLoopConfig>
): RalphLoopManager {
  return new RalphLoopManager(directory, config);
}

/**
 * Convenience function to execute a single Ralph Loop task.
 */
export async function executeRalphLoop(
  directory: string,
  taskId: string,
  prompt: string,
  options?: RalphLoopOptions
): Promise<RalphLoopResult> {
  const manager = createRalphLoopManager(directory);
  return manager.execute(taskId, prompt, options);
}
