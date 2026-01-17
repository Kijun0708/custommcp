// src/hooks/builtin/todo-continuation-enforcer.ts

/**
 * Todo Continuation Enforcer Hook (Sisyphus Style)
 *
 * Prevents task abandonment by detecting session idle state
 * and automatically injecting continuation prompts.
 *
 * Based on oh-my-opencode's todo-continuation-enforcer:
 * - 2-second countdown after session becomes idle
 * - Automatic prompt injection to continue pending work
 * - Cancellation on user input, recovery mode, or background tasks
 *
 * Features:
 * - Session idle detection and countdown timer
 * - Automatic continuation prompt injection
 * - Integration with Boulder state tracking
 * - Background task awareness
 */

import {
  HookDefinition,
  HookResult,
  OnSessionIdleContext,
  OnWorkflowEndContext,
  OnRalphLoopIterationContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

// ============ Types ============

/**
 * Configuration for TODO continuation enforcer
 */
interface TodoEnforcerConfig {
  /** Whether the enforcer is enabled */
  enabled: boolean;
  /** Countdown duration in milliseconds before auto-continue */
  countdownMs: number;
  /** Minimum idle time before triggering countdown */
  minIdleMs: number;
  /** Whether to inject reminders during workflow */
  injectReminders: boolean;
  /** Whether to block completion with incomplete items */
  blockIncomplete: boolean;
  /** Maximum pending items before forcing completion */
  maxPendingBeforeForce: number;
  /** Patterns indicating incomplete work */
  incompletePatterns: RegExp[];
  /** Patterns indicating completed work */
  completePatterns: RegExp[];
}

const DEFAULT_CONFIG: TodoEnforcerConfig = {
  enabled: true,
  countdownMs: 2000,  // 2 seconds like oh-my-opencode
  minIdleMs: 1000,    // Minimum 1 second idle
  injectReminders: true,
  blockIncomplete: false,
  maxPendingBeforeForce: 5,
  incompletePatterns: [
    // Korean patterns
    /(?:나중에|이후에|다음에|추후에|향후)\s*(?:구현|작성|추가|완료|처리)/gi,
    /(?:아직|미완료|미구현|TODO|FIXME|XXX|HACK)/gi,
    /(?:일단|우선|먼저).*(?:하고|후에)/gi,
    /(?:다음\s*단계|후속\s*작업|추가\s*작업)/gi,

    // English patterns
    /(?:TODO|FIXME|XXX|HACK|WIP|TBD|TBA)[\s:]/gi,
    /(?:will|need to|should|must)\s+(?:implement|add|fix|complete|finish)/gi,
    /(?:later|eventually|soon|next|afterward)/gi,
    /(?:pending|remaining|incomplete|unfinished)/gi,
    /(?:left to do|still need|not yet)/gi,
    /(?:placeholder|stub|mock|temporary|temp)/gi,

    // Code comment patterns
    /\/\/\s*(?:TODO|FIXME|XXX)/gi,
    /\/\*\s*(?:TODO|FIXME|XXX)/gi,
    /#\s*(?:TODO|FIXME|XXX)/gi,
  ],
  completePatterns: [
    /(?:완료|완성|끝|done|complete|finished|implemented)/gi,
    /(?:성공적으로|successfully)/gi,
    /(?:모든\s*작업|all\s*tasks?)/gi,
  ]
};

let config: TodoEnforcerConfig = { ...DEFAULT_CONFIG };

/**
 * Tracked TODO item
 */
interface TrackedTodo {
  /** TODO content */
  content: string;
  /** Current status */
  status: 'pending' | 'in_progress' | 'completed';
  /** When detected */
  detectedAt: string;
  /** Source (expert ID, tool, etc.) */
  source: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Countdown state for idle detection
 */
interface CountdownState {
  /** Whether countdown is active */
  isActive: boolean;
  /** Countdown start time */
  startedAt: number;
  /** Scheduled timeout ID */
  timeoutId: NodeJS.Timeout | null;
  /** Number of times countdown was cancelled */
  cancelCount: number;
}

/**
 * Enforcer state
 */
interface EnforcerState {
  /** Tracked TODO items */
  trackedTodos: TrackedTodo[];
  /** Countdown state */
  countdown: CountdownState;
  /** Number of continuation prompts injected */
  continuationCount: number;
  /** Last continuation timestamp */
  lastContinuationAt?: string;
  /** Session start time */
  sessionStartTime: number;
  /** Total responses analyzed */
  responsesAnalyzed: number;
  /** Whether recovery is in progress */
  isRecovering: boolean;
  /** Last activity timestamp */
  lastActivityAt: number;
}

// Global state
let state: EnforcerState = {
  trackedTodos: [],
  countdown: {
    isActive: false,
    startedAt: 0,
    timeoutId: null,
    cancelCount: 0
  },
  continuationCount: 0,
  sessionStartTime: Date.now(),
  responsesAnalyzed: 0,
  isRecovering: false,
  lastActivityAt: Date.now()
};

// Continuation prompt callback
let continuationCallback: ((message: string) => void) | null = null;

// ============ Utility Functions ============

/**
 * Generates the TODO continuation prompt (Sisyphus style)
 */
function generateContinuationPrompt(todos: TrackedTodo[]): string {
  const pendingTodos = todos.filter(t => t.status !== 'completed');

  if (pendingTodos.length === 0) {
    return '';
  }

  const todoList = pendingTodos
    .slice(0, 5)
    .map((t, i) => `${i + 1}. [${t.status}] ${t.content}`)
    .join('\n');

  const moreCount = pendingTodos.length > 5 ? pendingTodos.length - 5 : 0;

  return `[SYSTEM REMINDER - TODO CONTINUATION]

⚠️ **작업이 완료되지 않았습니다!**

현재 남은 작업 목록:
${todoList}${moreCount > 0 ? `\n... 외 ${moreCount}개 항목` : ''}

다음 작업을 계속 진행해주세요. 모든 작업이 완료될 때까지 멈추지 마세요.

📋 **지시사항:**
- 위 TODO 리스트의 항목들을 순서대로 처리하세요
- 각 항목 완료 시 TODO 상태를 업데이트하세요
- 모든 항목이 완료될 때까지 계속 진행하세요`;
}

/**
 * Detects incomplete patterns in text
 */
function detectIncompletePatterns(text: string, source: string): TrackedTodo[] {
  const todos: TrackedTodo[] = [];

  for (const pattern of config.incompletePatterns) {
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Extract context around match
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      const context = text.substring(start, end).trim();

      // Check if in completed context
      let isCompleted = false;
      for (const completePattern of config.completePatterns) {
        completePattern.lastIndex = 0;
        if (completePattern.test(context)) {
          isCompleted = true;
          break;
        }
      }

      if (!isCompleted) {
        const confidence = calculateConfidence(match[0], context);

        if (confidence >= 0.4) {
          todos.push({
            content: context.substring(0, 100),
            status: 'pending',
            detectedAt: new Date().toISOString(),
            source,
            confidence
          });
        }
      }
    }
  }

  return deduplicateTodos(todos);
}

/**
 * Calculates confidence score for a detection
 */
function calculateConfidence(match: string, context: string): number {
  let confidence = 0.5;

  if (/TODO|FIXME|XXX|HACK|WIP/i.test(match)) {
    confidence += 0.3;
  }

  if (/will|need to|should|must|나중에|이후에|추후에/i.test(match)) {
    confidence += 0.2;
  }

  if (/\/\/|\/\*|#/.test(context.substring(0, 5))) {
    confidence -= 0.1;
  }

  if (/incomplete|unfinished|pending|미완료|미구현/i.test(context)) {
    confidence += 0.3;
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Deduplicates similar TODO items
 */
function deduplicateTodos(todos: TrackedTodo[]): TrackedTodo[] {
  const seen = new Set<string>();
  return todos.filter(todo => {
    const key = todo.content.toLowerCase().substring(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Starts the continuation countdown
 */
function startCountdown(): void {
  if (state.countdown.isActive) {
    return;
  }

  if (!config.enabled) {
    return;
  }

  const pendingTodos = state.trackedTodos.filter(t => t.status !== 'completed');
  if (pendingTodos.length === 0) {
    return;
  }

  // Don't start if recovering
  if (state.isRecovering) {
    logger.debug('[Todo Enforcer] Skipping countdown - recovery in progress');
    return;
  }

  state.countdown.isActive = true;
  state.countdown.startedAt = Date.now();

  logger.debug({
    pendingCount: pendingTodos.length,
    countdownMs: config.countdownMs
  }, '[Todo Enforcer] Starting continuation countdown');

  state.countdown.timeoutId = setTimeout(() => {
    triggerContinuation();
  }, config.countdownMs);
}

/**
 * Cancels the active countdown
 */
function cancelCountdown(reason: string): void {
  if (!state.countdown.isActive) {
    return;
  }

  if (state.countdown.timeoutId) {
    clearTimeout(state.countdown.timeoutId);
    state.countdown.timeoutId = null;
  }

  state.countdown.isActive = false;
  state.countdown.cancelCount++;

  logger.debug({ reason }, '[Todo Enforcer] Countdown cancelled');
}

/**
 * Triggers the continuation prompt
 */
function triggerContinuation(): void {
  state.countdown.isActive = false;
  state.countdown.timeoutId = null;

  const pendingTodos = state.trackedTodos.filter(t => t.status !== 'completed');

  if (pendingTodos.length === 0) {
    return;
  }

  const prompt = generateContinuationPrompt(pendingTodos);

  if (prompt && continuationCallback) {
    state.continuationCount++;
    state.lastContinuationAt = new Date().toISOString();

    logger.info({
      pendingCount: pendingTodos.length,
      continuationCount: state.continuationCount
    }, '[Todo Enforcer] Injecting continuation prompt');

    continuationCallback(prompt);
  }
}

/**
 * Records activity (cancels countdown)
 */
function recordActivity(): void {
  state.lastActivityAt = Date.now();
  cancelCountdown('user_activity');
}

// ============ Public API ============

/**
 * Resets enforcer state
 */
export function resetEnforcerState(): void {
  cancelCountdown('reset');

  state = {
    trackedTodos: [],
    countdown: {
      isActive: false,
      startedAt: 0,
      timeoutId: null,
      cancelCount: 0
    },
    continuationCount: 0,
    sessionStartTime: Date.now(),
    responsesAnalyzed: 0,
    isRecovering: false,
    lastActivityAt: Date.now()
  };
}

/**
 * Gets current enforcer statistics
 */
export function getEnforcerStats(): {
  trackedTodoCount: number;
  pendingTodoCount: number;
  continuationCount: number;
  responsesAnalyzed: number;
  sessionDurationMs: number;
  countdownActive: boolean;
  countdownCancelCount: number;
  isRecovering: boolean;
} {
  return {
    trackedTodoCount: state.trackedTodos.length,
    pendingTodoCount: state.trackedTodos.filter(t => t.status !== 'completed').length,
    continuationCount: state.continuationCount,
    responsesAnalyzed: state.responsesAnalyzed,
    sessionDurationMs: Date.now() - state.sessionStartTime,
    countdownActive: state.countdown.isActive,
    countdownCancelCount: state.countdown.cancelCount,
    isRecovering: state.isRecovering
  };
}

/**
 * Adds a TODO item manually
 */
export function addTodo(content: string, status: 'pending' | 'in_progress' = 'pending'): void {
  state.trackedTodos.push({
    content,
    status,
    detectedAt: new Date().toISOString(),
    source: 'manual',
    confidence: 1.0
  });
}

/**
 * Updates TODO item status
 */
export function updateTodoStatus(index: number, status: 'pending' | 'in_progress' | 'completed'): boolean {
  if (index >= 0 && index < state.trackedTodos.length) {
    state.trackedTodos[index].status = status;
    return true;
  }
  return false;
}

/**
 * Clears all TODO items
 */
export function clearTodos(): void {
  state.trackedTodos = [];
}

/**
 * Gets all tracked TODOs
 */
export function getTrackedTodos(): TrackedTodo[] {
  return [...state.trackedTodos];
}

/**
 * Sets the continuation callback
 */
export function setContinuationCallback(callback: (message: string) => void): void {
  continuationCallback = callback;
}

/**
 * Sets recovery mode
 */
export function setRecoveryMode(recovering: boolean): void {
  state.isRecovering = recovering;
  if (recovering) {
    cancelCountdown('recovery_mode');
  }
}

/**
 * Updates configuration
 */
export function updateEnforcerConfig(newConfig: Partial<TodoEnforcerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Manually triggers idle check (for testing)
 */
export function checkIdle(): void {
  const idleDuration = Date.now() - state.lastActivityAt;
  if (idleDuration >= config.minIdleMs) {
    startCountdown();
  }
}

// ============ Hooks ============

/**
 * Hook: Handle session idle event (Sisyphus)
 */
const sessionIdleHook: HookDefinition<OnSessionIdleContext> = {
  id: 'builtin:todo-enforcer:session-idle',
  name: 'Todo Continuation Enforcer (Session Idle)',
  description: 'Detects session idle and triggers TODO continuation',
  eventType: 'onSessionIdle',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) {
      return { decision: 'continue' };
    }

    // Update TODO list from context
    if (context.pendingTodos && context.pendingTodos.length > 0) {
      for (const todo of context.pendingTodos) {
        const existing = state.trackedTodos.find(t => t.content === todo.content);
        if (!existing) {
          state.trackedTodos.push({
            content: todo.content,
            status: todo.status,
            detectedAt: new Date().toISOString(),
            source: 'session',
            confidence: 1.0
          });
        }
      }
    }

    // Skip if recovering
    if (context.isRecovering) {
      state.isRecovering = true;
      return { decision: 'continue' };
    }

    // Skip if background tasks running
    if (context.hasBackgroundTasks) {
      cancelCountdown('background_tasks');
      return { decision: 'continue' };
    }

    // Check if we should start countdown
    const pendingTodos = state.trackedTodos.filter(t => t.status !== 'completed');

    if (pendingTodos.length > 0 && context.idleDurationMs >= config.minIdleMs) {
      startCountdown();
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Detect incomplete work in expert responses
 */
const detectInExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:todo-enforcer:detect-expert',
  name: 'Todo Continuation Enforcer (Detect Expert)',
  description: 'Detects incomplete work patterns in expert responses',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    recordActivity();
    state.responsesAnalyzed++;

    // Detect new TODO items
    const newTodos = detectIncompletePatterns(
      context.response,
      `expert:${context.expertId}`
    );

    if (newTodos.length > 0) {
      // Add to tracked items (deduplicate)
      for (const todo of newTodos) {
        const existing = state.trackedTodos.find(
          t => t.content.toLowerCase().substring(0, 30) === todo.content.toLowerCase().substring(0, 30)
        );
        if (!existing) {
          state.trackedTodos.push(todo);
        }
      }

      // Limit total tracked items
      if (state.trackedTodos.length > 20) {
        state.trackedTodos = state.trackedTodos.slice(-20);
      }

      logger.debug({
        expertId: context.expertId,
        newTodos: newTodos.length,
        totalTracked: state.trackedTodos.length
      }, '[Todo Enforcer] New incomplete patterns detected');
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check incomplete items on workflow end
 */
const checkWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:todo-enforcer:workflow-end',
  name: 'Todo Continuation Enforcer (Workflow End)',
  description: 'Checks for incomplete items when workflow ends',
  eventType: 'onWorkflowEnd',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    cancelCountdown('workflow_end');

    const pendingTodos = state.trackedTodos.filter(t => t.status !== 'completed');

    if (pendingTodos.length > 0) {
      logger.warn({
        pendingCount: pendingTodos.length,
        workflowSuccess: context.success
      }, '[Todo Enforcer] Workflow ending with incomplete items');

      if (config.blockIncomplete && pendingTodos.length >= config.maxPendingBeforeForce) {
        return {
          decision: 'block',
          reason: `${pendingTodos.length}개의 미완료 작업이 있습니다. 작업을 완료하거나 명시적으로 건너뛰기를 선언해주세요.`,
          metadata: { pendingTodos: pendingTodos.map(t => t.content) }
        };
      }

      // Inject final reminder
      const prompt = generateContinuationPrompt(pendingTodos);
      if (prompt) {
        return {
          decision: 'continue',
          injectMessage: prompt,
          metadata: { pendingCount: pendingTodos.length }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check during Ralph Loop iterations
 */
const checkRalphLoopHook: HookDefinition<OnRalphLoopIterationContext> = {
  id: 'builtin:todo-enforcer:ralph-loop',
  name: 'Todo Continuation Enforcer (Ralph Loop)',
  description: 'Checks for incomplete items during Ralph Loop iterations',
  eventType: 'onRalphLoopIteration',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    recordActivity();

    // Detect new items in iteration output
    const newTodos = detectIncompletePatterns(context.output, `ralph:${context.taskId}`);

    if (newTodos.length > 0) {
      for (const todo of newTodos) {
        const existing = state.trackedTodos.find(
          t => t.content.toLowerCase().substring(0, 30) === todo.content.toLowerCase().substring(0, 30)
        );
        if (!existing) {
          state.trackedTodos.push(todo);
        }
      }
    }

    // If completion detected but we have pending items
    if (context.completionDetected) {
      const pendingTodos = state.trackedTodos.filter(t => t.status !== 'completed');

      if (pendingTodos.length > 0) {
        logger.warn({
          iteration: context.iteration,
          pendingCount: pendingTodos.length
        }, '[Todo Enforcer] Completion detected but items remain');

        return {
          decision: 'continue',
          injectMessage: `⚠️ 완료 신호가 감지되었지만 ${pendingTodos.length}개의 미완료 항목이 있습니다.\n\n남은 항목:\n${pendingTodos.slice(0, 3).map(t => `- ${t.content}`).join('\n')}`,
          metadata: { pendingCount: pendingTodos.length }
        };
      }
    }

    return { decision: 'continue' };
  }
};

// ============ Registration ============

/**
 * Registers all TODO continuation enforcer hooks
 */
export function registerTodoContinuationEnforcerHooks(): void {
  registerHook(sessionIdleHook);
  registerHook(detectInExpertResultHook);
  registerHook(checkWorkflowEndHook);
  registerHook(checkRalphLoopHook);

  logger.debug('Todo Continuation Enforcer hooks registered (Sisyphus style)');
}

export default {
  registerTodoContinuationEnforcerHooks,
  getEnforcerStats,
  resetEnforcerState,
  addTodo,
  updateTodoStatus,
  clearTodos,
  getTrackedTodos,
  setContinuationCallback,
  setRecoveryMode,
  updateEnforcerConfig,
  checkIdle
};
