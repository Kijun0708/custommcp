// src/features/ralph-loop/constants.ts

/**
 * Ralph Loop Constants
 */

import { RalphLoopConfig } from './types.js';

/** Default completion promise text */
export const DEFAULT_COMPLETION_PROMISE = 'DONE';

/** Default max iterations (conservative for MCP context) */
export const DEFAULT_MAX_ITERATIONS = 10;

/** State file path relative to working directory */
export const DEFAULT_STATE_FILE = '.llm-router/ralph-loop.json';

/** Regex pattern to detect completion promise */
export const COMPLETION_TAG_PATTERN = /<promise>(.*?)<\/promise>/is;

/** Delay between iterations in milliseconds */
export const DEFAULT_ITERATION_DELAY_MS = 1000;

/** Default configuration */
export const DEFAULT_RALPH_LOOP_CONFIG: RalphLoopConfig = {
  defaultMaxIterations: DEFAULT_MAX_ITERATIONS,
  defaultCompletionPromise: DEFAULT_COMPLETION_PROMISE,
  stateFilePath: DEFAULT_STATE_FILE,
  iterationDelayMs: DEFAULT_ITERATION_DELAY_MS,
  includeIterationContext: true
};

/** Continuation prompt template */
export const CONTINUATION_PROMPT_TEMPLATE = `[RALPH LOOP - Iteration {{ITERATION}}/{{MAX}}]

Your previous attempt did not output the completion promise. Continue working on the task.

IMPORTANT:
- Review your progress so far
- Continue from where you left off
- When FULLY complete, output: <promise>{{PROMISE}}</promise>
- Do not stop until the task is truly done

## Previous Output Summary
{{PREVIOUS_OUTPUT}}

## Original Task
{{PROMPT}}

Continue now. Remember to output <promise>{{PROMISE}}</promise> when done.`;

/** Initial prompt template for Ralph Loop tasks */
export const INITIAL_PROMPT_TEMPLATE = `[RALPH LOOP TASK - Max {{MAX}} iterations]

You are starting a Ralph Loop - a self-referential task that runs until completion.

## How It Works
1. Work on the task continuously
2. When FULLY complete, output: <promise>{{PROMISE}}</promise>
3. If you don't output the promise, the loop will continue automatically
4. You have up to {{MAX}} iterations to complete

## Rules
- Focus on completing the task fully, not partially
- Don't output the completion promise until truly done
- Each iteration should make meaningful progress
- If stuck, try different approaches

## Your Task
{{PROMPT}}

{{CONTEXT}}

Begin working now. Output <promise>{{PROMISE}}</promise> when completely done.`;
