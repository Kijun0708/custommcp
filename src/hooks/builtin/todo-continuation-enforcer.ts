// src/hooks/builtin/todo-continuation-enforcer.ts

/**
 * Todo Continuation Enforcer Hook
 *
 * Prevents task abandonment by detecting incomplete work patterns
 * and injecting reminders to complete pending tasks.
 *
 * Features:
 * - Detects incomplete task indicators in responses
 * - Tracks pending tasks across interactions
 * - Injects continuation reminders
 * - Blocks workflow completion if tasks remain
 */

import {
  HookDefinition,
  HookResult,
  OnExpertResultContext,
  OnWorkflowEndContext,
  OnRalphLoopIterationContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Configuration for todo enforcer
 */
interface TodoEnforcerConfig {
  /** Whether to inject reminders */
  injectReminders: boolean;
  /** Whether to block incomplete workflows */
  blockIncomplete: boolean;
  /** Patterns indicating incomplete work */
  incompletePatterns: RegExp[];
  /** Patterns indicating completed work */
  completePatterns: RegExp[];
  /** Minimum confidence to trigger (0-1) */
  confidenceThreshold: number;
  /** Maximum incomplete items to track */
  maxTrackedItems: number;
}

const DEFAULT_CONFIG: TodoEnforcerConfig = {
  injectReminders: true,
  blockIncomplete: false,
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
  ],
  confidenceThreshold: 0.3,
  maxTrackedItems: 20
};

let config: TodoEnforcerConfig = { ...DEFAULT_CONFIG };

/**
 * Tracked incomplete item
 */
interface IncompleteItem {
  /** Detected pattern */
  pattern: string;
  /** Context around the pattern */
  context: string;
  /** Detection timestamp */
  detectedAt: string;
  /** Source (expert ID, tool, etc.) */
  source: string;
  /** Confidence score */
  confidence: number;
}

/**
 * Enforcer state
 */
interface EnforcerState {
  /** Detected incomplete items */
  incompleteItems: IncompleteItem[];
  /** Number of reminders sent */
  reminderCount: number;
  /** Last reminder timestamp */
  lastReminderAt?: string;
  /** Session start time */
  sessionStartTime: number;
  /** Total responses analyzed */
  responsesAnalyzed: number;
}

// Global state
let state: EnforcerState = {
  incompleteItems: [],
  reminderCount: 0,
  sessionStartTime: Date.now(),
  responsesAnalyzed: 0
};

/**
 * Detects incomplete work patterns in text
 */
function detectIncompletePatterns(text: string, source: string): IncompleteItem[] {
  const items: IncompleteItem[] = [];

  for (const pattern of config.incompletePatterns) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Extract context around match
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      const context = text.substring(start, end).trim();

      // Check if this is a false positive (in a completed context)
      let isCompleted = false;
      for (const completePattern of config.completePatterns) {
        completePattern.lastIndex = 0;
        if (completePattern.test(context)) {
          isCompleted = true;
          break;
        }
      }

      if (!isCompleted) {
        // Calculate confidence based on pattern strength
        const confidence = calculateConfidence(match[0], context);

        if (confidence >= config.confidenceThreshold) {
          items.push({
            pattern: match[0],
            context,
            detectedAt: new Date().toISOString(),
            source,
            confidence
          });
        }
      }
    }
  }

  // Deduplicate similar items
  return deduplicateItems(items);
}

/**
 * Calculates confidence score for a detection
 */
function calculateConfidence(match: string, context: string): number {
  let confidence = 0.5; // Base confidence

  // Increase for explicit markers
  if (/TODO|FIXME|XXX|HACK|WIP/i.test(match)) {
    confidence += 0.3;
  }

  // Increase for future tense language
  if (/will|need to|should|must|나중에|이후에|추후에/i.test(match)) {
    confidence += 0.2;
  }

  // Decrease if in code comment (might be intentional)
  if (/\/\/|\/\*|#/.test(context.substring(0, 5))) {
    confidence -= 0.2;
  }

  // Increase for direct incomplete statements
  if (/incomplete|unfinished|pending|미완료|미구현/i.test(context)) {
    confidence += 0.3;
  }

  return Math.min(1, Math.max(0, confidence));
}

/**
 * Deduplicates similar items
 */
function deduplicateItems(items: IncompleteItem[]): IncompleteItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.pattern.toLowerCase().substring(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Generates reminder message
 */
function generateReminder(items: IncompleteItem[]): string {
  if (items.length === 0) return '';

  const lines: string[] = [
    `📋 **미완료 작업 감지** (${items.length}개)`,
    '',
    '다음 항목들이 완료되지 않은 것으로 보입니다:',
    ''
  ];

  const topItems = items.slice(0, 5);
  for (let i = 0; i < topItems.length; i++) {
    const item = topItems[i];
    lines.push(`${i + 1}. \`${item.pattern}\``);
    lines.push(`   _"${item.context.substring(0, 80)}..."_`);
  }

  if (items.length > 5) {
    lines.push(`   ... 외 ${items.length - 5}개`);
  }

  lines.push('');
  lines.push('작업을 계속 진행하거나 완료 상태를 명시해주세요.');

  return lines.join('\n');
}

/**
 * Resets enforcer state
 */
export function resetEnforcerState(): void {
  state = {
    incompleteItems: [],
    reminderCount: 0,
    sessionStartTime: Date.now(),
    responsesAnalyzed: 0
  };
}

/**
 * Gets current enforcer statistics
 */
export function getEnforcerStats(): {
  incompleteCount: number;
  items: IncompleteItem[];
  reminderCount: number;
  responsesAnalyzed: number;
  sessionDurationMs: number;
} {
  return {
    incompleteCount: state.incompleteItems.length,
    items: [...state.incompleteItems],
    reminderCount: state.reminderCount,
    responsesAnalyzed: state.responsesAnalyzed,
    sessionDurationMs: Date.now() - state.sessionStartTime
  };
}

/**
 * Manually marks an item as complete
 */
export function markItemComplete(index: number): boolean {
  if (index >= 0 && index < state.incompleteItems.length) {
    state.incompleteItems.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Clears all incomplete items
 */
export function clearIncompleteItems(): void {
  state.incompleteItems = [];
}

/**
 * Updates configuration
 */
export function updateEnforcerConfig(newConfig: Partial<TodoEnforcerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Hook: Detect incomplete work in expert responses
 */
const detectIncompleteHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin_todo_enforcer_detect',
  name: 'Todo Continuation Enforcer (Detect)',
  description: 'Detects incomplete work patterns in expert responses',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    state.responsesAnalyzed++;

    // Detect incomplete patterns
    const newItems = detectIncompletePatterns(
      context.response,
      `expert:${context.expertId}`
    );

    if (newItems.length > 0) {
      // Add to tracked items (limit total)
      state.incompleteItems.push(...newItems);
      if (state.incompleteItems.length > config.maxTrackedItems) {
        state.incompleteItems = state.incompleteItems.slice(-config.maxTrackedItems);
      }

      logger.debug({
        expertId: context.expertId,
        newItems: newItems.length,
        totalItems: state.incompleteItems.length
      }, '[Todo Enforcer] Incomplete patterns detected');

      // Inject reminder if configured
      if (config.injectReminders && newItems.length >= 2) {
        state.reminderCount++;
        state.lastReminderAt = new Date().toISOString();

        return {
          decision: 'continue',
          injectMessage: generateReminder(newItems),
          metadata: {
            incompleteItems: newItems.length,
            totalTracked: state.incompleteItems.length
          }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check incomplete items on workflow end
 */
const checkWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin_todo_enforcer_workflow_end',
  name: 'Todo Continuation Enforcer (Workflow End)',
  description: 'Checks for incomplete items when workflow ends',
  eventType: 'onWorkflowEnd',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    const incompleteCount = state.incompleteItems.length;

    if (incompleteCount > 0) {
      logger.warn({
        incompleteItems: incompleteCount,
        workflowSuccess: context.success
      }, '[Todo Enforcer] Workflow ending with incomplete items');

      if (config.blockIncomplete && incompleteCount >= 3) {
        return {
          decision: 'block',
          reason: `${incompleteCount}개의 미완료 작업이 있습니다. 작업을 완료하거나 명시적으로 건너뛰기를 선언해주세요.`,
          metadata: { incompleteItems: state.incompleteItems }
        };
      }

      // Inject final reminder
      const reminder = generateReminder(state.incompleteItems);
      return {
        decision: 'continue',
        injectMessage: reminder,
        metadata: { incompleteItems: state.incompleteItems }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check during Ralph Loop iterations
 */
const checkRalphLoopHook: HookDefinition<OnRalphLoopIterationContext> = {
  id: 'builtin_todo_enforcer_ralph_loop',
  name: 'Todo Continuation Enforcer (Ralph Loop)',
  description: 'Checks for incomplete items during Ralph Loop iterations',
  eventType: 'onRalphLoopIteration',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Detect new incomplete items
    const newItems = detectIncompletePatterns(context.output, `ralph:${context.taskId}`);

    if (newItems.length > 0) {
      state.incompleteItems.push(...newItems);

      // Limit tracked items
      if (state.incompleteItems.length > config.maxTrackedItems) {
        state.incompleteItems = state.incompleteItems.slice(-config.maxTrackedItems);
      }
    }

    // If completion detected but we have incomplete items, warn
    if (context.completionDetected && state.incompleteItems.length > 0) {
      logger.warn({
        iteration: context.iteration,
        incompleteItems: state.incompleteItems.length
      }, '[Todo Enforcer] Completion detected but items remain');

      return {
        decision: 'continue',
        injectMessage: `⚠️ 완료 신호가 감지되었지만 ${state.incompleteItems.length}개의 미완료 항목이 있습니다.`,
        metadata: { incompleteItems: state.incompleteItems }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Registers all todo enforcer hooks
 */
export function registerTodoContinuationEnforcerHooks(): void {
  registerHook(detectIncompleteHook);
  registerHook(checkWorkflowEndHook);
  registerHook(checkRalphLoopHook);

  logger.debug('Todo Continuation Enforcer hooks registered');
}

export default {
  registerTodoContinuationEnforcerHooks,
  getEnforcerStats,
  resetEnforcerState,
  markItemComplete,
  clearIncompleteItems,
  updateEnforcerConfig
};
