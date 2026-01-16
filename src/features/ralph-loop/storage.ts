// src/features/ralph-loop/storage.ts

/**
 * Ralph Loop State Storage
 *
 * Handles persistence of Ralph Loop state to filesystem.
 * Uses JSON format for simplicity (unlike oh-my-opencode's markdown frontmatter).
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RalphLoopState } from './types.js';
import { DEFAULT_STATE_FILE } from './constants.js';
import { logger } from '../../utils/logger.js';

/**
 * Gets the full path to the state file.
 */
export function getStateFilePath(directory: string, customPath?: string): string {
  return customPath
    ? join(directory, customPath)
    : join(directory, DEFAULT_STATE_FILE);
}

/**
 * Reads Ralph Loop state from file.
 * Returns null if no state exists or state is invalid.
 */
export function readState(directory: string, customPath?: string): RalphLoopState | null {
  const filePath = getStateFilePath(directory, customPath);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const state = JSON.parse(content) as RalphLoopState;

    // Validate required fields
    if (
      typeof state.active !== 'boolean' ||
      typeof state.iteration !== 'number' ||
      typeof state.maxIterations !== 'number' ||
      typeof state.completionPromise !== 'string' ||
      typeof state.prompt !== 'string'
    ) {
      logger.warn({ filePath }, 'Invalid Ralph Loop state file');
      return null;
    }

    return state;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to read Ralph Loop state');
    return null;
  }
}

/**
 * Writes Ralph Loop state to file.
 * Creates directory if it doesn't exist.
 */
export function writeState(
  directory: string,
  state: RalphLoopState,
  customPath?: string
): boolean {
  const filePath = getStateFilePath(directory, customPath);

  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(state, null, 2);
    writeFileSync(filePath, content, 'utf-8');

    logger.debug({ filePath, iteration: state.iteration }, 'Ralph Loop state written');
    return true;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to write Ralph Loop state');
    return false;
  }
}

/**
 * Clears Ralph Loop state by deleting the state file.
 */
export function clearState(directory: string, customPath?: string): boolean {
  const filePath = getStateFilePath(directory, customPath);

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      logger.debug({ filePath }, 'Ralph Loop state cleared');
    }
    return true;
  } catch (error) {
    logger.error({ error, filePath }, 'Failed to clear Ralph Loop state');
    return false;
  }
}

/**
 * Increments the iteration counter and updates state.
 * Returns the updated state or null if failed.
 */
export function incrementIteration(
  directory: string,
  customPath?: string
): RalphLoopState | null {
  const state = readState(directory, customPath);
  if (!state) return null;

  state.iteration += 1;

  if (writeState(directory, state, customPath)) {
    return state;
  }

  return null;
}

/**
 * Updates the last output in state.
 */
export function updateLastOutput(
  directory: string,
  output: string,
  customPath?: string
): boolean {
  const state = readState(directory, customPath);
  if (!state) return false;

  state.lastOutput = output.substring(0, 2000); // Limit stored output size

  return writeState(directory, state, customPath);
}

/**
 * Marks the loop as inactive (completed or cancelled).
 */
export function deactivateLoop(
  directory: string,
  customPath?: string
): boolean {
  const state = readState(directory, customPath);
  if (!state) return false;

  state.active = false;

  return writeState(directory, state, customPath);
}

/**
 * Checks if a Ralph Loop is currently active.
 */
export function isLoopActive(directory: string, customPath?: string): boolean {
  const state = readState(directory, customPath);
  return state?.active ?? false;
}
