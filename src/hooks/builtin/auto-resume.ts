// src/hooks/builtin/auto-resume.ts

/**
 * Auto Resume Hook
 *
 * Automatically resumes sessions after recovery from errors.
 * Preserves context and continues from where the session left off.
 *
 * Features:
 * - Detects session interruptions
 * - Saves session state before potential failures
 * - Automatically resumes with preserved context
 * - Configurable resume strategies
 */

import {
  HookDefinition,
  HookResult,
  OnErrorContext,
  OnToolResultContext,
  OnWorkflowEndContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Session state for auto-resume
 */
interface SessionState {
  sessionId: string;
  timestamp: number;
  lastToolCall?: {
    toolName: string;
    input: Record<string, unknown>;
  };
  pendingTasks?: string[];
  contextSummary?: string;
  errorCount: number;
  lastError?: {
    message: string;
    timestamp: number;
    recoverable: boolean;
  };
}

/**
 * Auto-resume configuration
 */
interface AutoResumeConfig {
  /** Whether auto-resume is enabled */
  enabled: boolean;
  /** Maximum errors before giving up */
  maxErrors: number;
  /** Time window for error counting (ms) */
  errorWindowMs: number;
  /** Whether to save state on each tool call */
  saveOnToolCall: boolean;
  /** Whether to auto-resume after recoverable errors */
  autoResumeOnError: boolean;
  /** Delay before auto-resume (ms) */
  resumeDelayMs: number;
  /** State file path */
  stateFilePath: string;
}

/**
 * Auto-resume statistics
 */
interface AutoResumeStats {
  totalSaves: number;
  totalResumes: number;
  failedResumes: number;
  lastSaveTime?: number;
  lastResumeTime?: number;
  currentSessionErrors: number;
}

// State
let config: AutoResumeConfig = {
  enabled: true,
  maxErrors: 3,
  errorWindowMs: 300000, // 5 minutes
  saveOnToolCall: true,
  autoResumeOnError: true,
  resumeDelayMs: 2000,
  stateFilePath: path.join(os.homedir(), '.llm-router', 'session-state.json')
};

let stats: AutoResumeStats = {
  totalSaves: 0,
  totalResumes: 0,
  failedResumes: 0,
  currentSessionErrors: 0
};

let currentState: SessionState = {
  sessionId: generateSessionId(),
  timestamp: Date.now(),
  errorCount: 0
};

let errorTimestamps: number[] = [];

/**
 * Generates a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Ensures state directory exists
 */
function ensureStateDir(): void {
  const dir = path.dirname(config.stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Saves session state to file
 */
function saveState(): void {
  if (!config.enabled) return;

  try {
    ensureStateDir();
    currentState.timestamp = Date.now();
    fs.writeFileSync(config.stateFilePath, JSON.stringify(currentState, null, 2), 'utf-8');
    stats.totalSaves++;
    stats.lastSaveTime = Date.now();
    logger.debug({ sessionId: currentState.sessionId }, 'Session state saved');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to save session state');
  }
}

/**
 * Loads session state from file
 */
function loadState(): SessionState | null {
  try {
    if (fs.existsSync(config.stateFilePath)) {
      const data = fs.readFileSync(config.stateFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to load session state');
  }
  return null;
}

/**
 * Clears saved session state
 */
function clearState(): void {
  try {
    if (fs.existsSync(config.stateFilePath)) {
      fs.unlinkSync(config.stateFilePath);
    }
    currentState = {
      sessionId: generateSessionId(),
      timestamp: Date.now(),
      errorCount: 0
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to clear session state');
  }
}

/**
 * Checks if we should auto-resume
 */
function shouldAutoResume(): boolean {
  if (!config.enabled || !config.autoResumeOnError) return false;

  // Count recent errors
  const now = Date.now();
  errorTimestamps = errorTimestamps.filter(t => now - t < config.errorWindowMs);

  if (errorTimestamps.length >= config.maxErrors) {
    logger.warn({ errorCount: errorTimestamps.length }, 'Too many errors, disabling auto-resume');
    return false;
  }

  return true;
}

/**
 * Generates resume message
 */
function generateResumeMessage(state: SessionState): string {
  let message = `🔄 **세션 자동 재개**\n\n`;
  message += `이전 세션이 중단되어 자동으로 재개합니다.\n\n`;

  if (state.lastToolCall) {
    message += `**마지막 작업**: ${state.lastToolCall.toolName}\n`;
  }

  if (state.pendingTasks && state.pendingTasks.length > 0) {
    message += `\n**보류 중인 작업:**\n`;
    state.pendingTasks.forEach((task, i) => {
      message += `${i + 1}. ${task}\n`;
    });
  }

  if (state.lastError) {
    message += `\n**마지막 에러**: ${state.lastError.message}\n`;
  }

  if (state.contextSummary) {
    message += `\n**컨텍스트 요약**:\n${state.contextSummary}\n`;
  }

  return message;
}

/**
 * Hook: Save state on tool result
 */
const saveStateOnToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:auto-resume:save-on-tool-result',
  name: 'Auto Resume (Save State)',
  description: 'Saves session state after tool results',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.saveOnToolCall) {
      return { decision: 'continue' };
    }

    // Update current state
    currentState.lastToolCall = {
      toolName: context.toolName,
      input: context.toolInput as Record<string, unknown>
    };

    // Save state periodically (not on every call to avoid overhead)
    if (!stats.lastSaveTime || Date.now() - stats.lastSaveTime > 10000) {
      saveState();
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Handle errors and potentially resume
 */
const handleErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:auto-resume:handle-error',
  name: 'Auto Resume (Error Handler)',
  description: 'Handles errors and triggers auto-resume if needed',
  eventType: 'onError',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Record error
    errorTimestamps.push(Date.now());
    stats.currentSessionErrors++;
    currentState.errorCount++;
    currentState.lastError = {
      message: context.errorMessage,
      timestamp: Date.now(),
      recoverable: context.recoverable
    };

    // Save state before potential crash
    saveState();

    if (context.recoverable && shouldAutoResume()) {
      logger.info({
        error: context.errorMessage,
        errorCount: stats.currentSessionErrors
      }, 'Auto-resume triggered after recoverable error');

      stats.totalResumes++;
      stats.lastResumeTime = Date.now();

      // Generate resume message
      const resumeMessage = `⚠️ 에러가 발생했지만 자동으로 복구를 시도합니다.\n\n**에러**: ${context.errorMessage}`;

      return {
        decision: 'continue',
        injectMessage: resumeMessage,
        metadata: { autoResumeTriggered: true }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Clear state on successful workflow end
 */
const clearStateOnSuccessHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:auto-resume:clear-on-success',
  name: 'Auto Resume (Clear on Success)',
  description: 'Clears saved state when workflow completes successfully',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    if (context.success) {
      // Clear state on success
      clearState();
      stats.currentSessionErrors = 0;
      errorTimestamps = [];
      logger.debug('Session state cleared after successful workflow');
    } else {
      // Save final state on failure
      saveState();
    }

    return { decision: 'continue' };
  }
};

/**
 * All auto-resume hooks
 */
export const autoResumeHooks = [
  saveStateOnToolResultHook,
  handleErrorHook,
  clearStateOnSuccessHook
] as HookDefinition[];

/**
 * Registers auto-resume hooks
 */
export function registerAutoResumeHooks(): void {
  for (const hook of autoResumeHooks) {
    registerHook(hook);
  }
  logger.debug('Auto-resume hooks registered');
}

/**
 * Gets auto-resume statistics
 */
export function getAutoResumeStats(): AutoResumeStats & {
  config: AutoResumeConfig;
  currentState: SessionState;
} {
  return {
    ...stats,
    config,
    currentState
  };
}

/**
 * Resets auto-resume state
 */
export function resetAutoResumeState(): void {
  stats = {
    totalSaves: 0,
    totalResumes: 0,
    failedResumes: 0,
    currentSessionErrors: 0
  };
  errorTimestamps = [];
  clearState();
}

/**
 * Updates auto-resume configuration
 */
export function updateAutoResumeConfig(updates: Partial<AutoResumeConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Auto-resume config updated');
}

/**
 * Checks for and attempts to resume previous session
 */
export function checkForResume(): { shouldResume: boolean; message?: string } {
  if (!config.enabled) {
    return { shouldResume: false };
  }

  const savedState = loadState();

  if (savedState && savedState.lastError) {
    // Check if the saved state is recent enough (within 1 hour)
    const age = Date.now() - savedState.timestamp;
    if (age < 3600000) {
      stats.totalResumes++;
      stats.lastResumeTime = Date.now();

      return {
        shouldResume: true,
        message: generateResumeMessage(savedState)
      };
    }
  }

  return { shouldResume: false };
}

/**
 * Manually saves current state
 */
export function saveCurrentState(pendingTasks?: string[], contextSummary?: string): void {
  currentState.pendingTasks = pendingTasks;
  currentState.contextSummary = contextSummary;
  saveState();
}

export default {
  registerAutoResumeHooks,
  getAutoResumeStats,
  resetAutoResumeState,
  updateAutoResumeConfig,
  checkForResume,
  saveCurrentState
};
