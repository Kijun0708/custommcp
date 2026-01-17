// src/hooks/builtin/compaction-context-injector.ts

/**
 * Compaction Context Injector Hook
 *
 * Preserves and injects critical context during compaction events.
 * Ensures important information survives context window compression.
 *
 * Features:
 * - Tracks critical context elements (decisions, TODOs, files)
 * - Generates context summary for injection after compaction
 * - Maintains continuity of important information
 * - Supports custom preservation markers
 */

import {
  HookDefinition,
  HookResult,
  OnWorkflowStartContext,
  OnWorkflowPhaseContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Context element types
 */
type ContextElementType =
  | 'decision'
  | 'todo'
  | 'file_reference'
  | 'error'
  | 'milestone'
  | 'user_preference'
  | 'constraint'
  | 'dependency';

/**
 * Context element to preserve
 */
interface ContextElement {
  type: ContextElementType;
  content: string;
  priority: number; // 1-10, higher = more important
  timestamp: number;
  source: string;
  tags: string[];
}

/**
 * Configuration for context injector
 */
interface InjectorConfig {
  /** Whether injector is enabled */
  enabled: boolean;
  /** Max elements to preserve */
  maxElements: number;
  /** Min priority to preserve (1-10) */
  minPriority: number;
  /** Whether to auto-inject on workflow start */
  autoInjectOnWorkflowStart: boolean;
  /** Whether to inject preserved context in summary form */
  summarizeOnInject: boolean;
  /** Max age for elements (ms) */
  maxElementAgeMs: number;
}

/**
 * Statistics for injector
 */
interface InjectorStats {
  totalElementsTracked: number;
  totalInjections: number;
  elementsPreserved: number;
  lastInjectionTime?: number;
  elementsByType: Record<ContextElementType, number>;
}

// State
let config: InjectorConfig = {
  enabled: true,
  maxElements: 50,
  minPriority: 3,
  autoInjectOnWorkflowStart: true,
  summarizeOnInject: true,
  maxElementAgeMs: 3600000 // 1 hour
};

let stats: InjectorStats = {
  totalElementsTracked: 0,
  totalInjections: 0,
  elementsPreserved: 0,
  elementsByType: {
    decision: 0,
    todo: 0,
    file_reference: 0,
    error: 0,
    milestone: 0,
    user_preference: 0,
    constraint: 0,
    dependency: 0
  }
};

let preservedElements: ContextElement[] = [];

/**
 * Adds a context element to preservation list
 */
function addElement(element: Omit<ContextElement, 'timestamp'>): void {
  const fullElement: ContextElement = {
    ...element,
    timestamp: Date.now()
  };

  // Check if similar element exists
  const existingIndex = preservedElements.findIndex(
    e => e.type === element.type && e.content === element.content
  );

  if (existingIndex >= 0) {
    // Update existing element
    preservedElements[existingIndex] = fullElement;
  } else {
    // Add new element
    preservedElements.push(fullElement);
    stats.totalElementsTracked++;
    stats.elementsByType[element.type]++;
  }

  // Enforce max elements limit
  if (preservedElements.length > config.maxElements) {
    // Sort by priority (desc) then timestamp (desc)
    preservedElements.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.timestamp - a.timestamp;
    });
    preservedElements = preservedElements.slice(0, config.maxElements);
  }
}

/**
 * Cleans up old elements
 */
function cleanupOldElements(): void {
  const cutoffTime = Date.now() - config.maxElementAgeMs;
  const before = preservedElements.length;

  preservedElements = preservedElements.filter(
    e => e.timestamp >= cutoffTime || e.priority >= 8
  );

  const removed = before - preservedElements.length;
  if (removed > 0) {
    logger.debug({ removed }, 'Cleaned up old context elements');
  }
}

/**
 * Gets preserved elements filtered by priority
 */
function getPreservedElements(minPriority: number = config.minPriority): ContextElement[] {
  cleanupOldElements();
  return preservedElements
    .filter(e => e.priority >= minPriority)
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Generates context summary for injection
 */
function generateContextSummary(): string | undefined {
  const elements = getPreservedElements();
  if (elements.length === 0) return undefined;

  const grouped: Record<ContextElementType, ContextElement[]> = {
    decision: [],
    todo: [],
    file_reference: [],
    error: [],
    milestone: [],
    user_preference: [],
    constraint: [],
    dependency: []
  };

  for (const element of elements) {
    grouped[element.type].push(element);
  }

  let summary = '📋 **보존된 컨텍스트 요약**\n\n';
  let hasContent = false;

  if (grouped.decision.length > 0) {
    hasContent = true;
    summary += '**주요 결정사항:**\n';
    for (const d of grouped.decision.slice(0, 5)) {
      summary += `- ${d.content}\n`;
    }
    summary += '\n';
  }

  if (grouped.todo.length > 0) {
    hasContent = true;
    summary += '**대기 중인 작업:**\n';
    for (const t of grouped.todo.slice(0, 5)) {
      summary += `- [ ] ${t.content}\n`;
    }
    summary += '\n';
  }

  if (grouped.file_reference.length > 0) {
    hasContent = true;
    summary += '**참조된 파일:**\n';
    const files = grouped.file_reference.slice(0, 5).map(f => f.content);
    summary += `\`${files.join('`, `')}\`\n\n`;
  }

  if (grouped.error.length > 0) {
    hasContent = true;
    summary += '**해결 필요한 오류:**\n';
    for (const e of grouped.error.slice(0, 3)) {
      summary += `- ⚠️ ${e.content}\n`;
    }
    summary += '\n';
  }

  if (grouped.constraint.length > 0) {
    hasContent = true;
    summary += '**제약 조건:**\n';
    for (const c of grouped.constraint.slice(0, 3)) {
      summary += `- ${c.content}\n`;
    }
    summary += '\n';
  }

  if (grouped.user_preference.length > 0) {
    hasContent = true;
    summary += '**사용자 선호:**\n';
    for (const p of grouped.user_preference.slice(0, 3)) {
      summary += `- ${p.content}\n`;
    }
    summary += '\n';
  }

  if (!hasContent) return undefined;

  summary += '_이 컨텍스트는 세션 연속성을 위해 보존되었습니다._';

  return summary;
}

/**
 * Extracts context elements from text
 */
function extractContextElements(text: string, source: string): void {
  // Extract decisions
  const decisionPatterns = [
    /결정[:：]\s*(.{10,100})/gi,
    /decision[:：]\s*(.{10,100})/gi,
    /decided\s+to\s+(.{10,100})/gi,
    /we'll\s+use\s+(.{10,50})/gi
  ];

  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addElement({
        type: 'decision',
        content: match[1].trim().substring(0, 100),
        priority: 7,
        source,
        tags: ['extracted']
      });
    }
  }

  // Extract TODOs
  const todoPatterns = [
    /TODO[:：]\s*(.{10,100})/gi,
    /FIXME[:：]\s*(.{10,100})/gi,
    /해야\s*할\s*일[:：]\s*(.{10,100})/gi,
    /다음\s*단계[:：]\s*(.{10,100})/gi
  ];

  for (const pattern of todoPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addElement({
        type: 'todo',
        content: match[1].trim().substring(0, 100),
        priority: 6,
        source,
        tags: ['extracted']
      });
    }
  }

  // Extract file references
  const filePattern = /(?:파일|file)[:：]?\s*[`"']?([/\\]?[\w/\\.-]+\.\w{1,5})[`"']?/gi;
  let fileMatch;
  while ((fileMatch = filePattern.exec(text)) !== null) {
    addElement({
      type: 'file_reference',
      content: fileMatch[1],
      priority: 4,
      source,
      tags: ['extracted']
    });
  }

  // Extract errors
  const errorPatterns = [
    /error[:：]\s*(.{10,100})/gi,
    /오류[:：]\s*(.{10,100})/gi,
    /failed\s+(?:to|with)[:：]?\s*(.{10,100})/gi
  ];

  for (const pattern of errorPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addElement({
        type: 'error',
        content: match[1].trim().substring(0, 100),
        priority: 8,
        source,
        tags: ['extracted']
      });
    }
  }

  // Extract constraints
  const constraintPatterns = [
    /제약[:：]\s*(.{10,100})/gi,
    /constraint[:：]\s*(.{10,100})/gi,
    /must\s+(?:be|have|use)\s+(.{10,50})/gi
  ];

  for (const pattern of constraintPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      addElement({
        type: 'constraint',
        content: match[1].trim().substring(0, 100),
        priority: 7,
        source,
        tags: ['extracted']
      });
    }
  }
}

/**
 * Hook: Inject preserved context on workflow start
 */
const injectOnWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:compaction-context-injector:workflow-start',
  name: 'Compaction Context Injector (Workflow Start)',
  description: 'Injects preserved context when a new workflow starts',
  eventType: 'onWorkflowStart',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.autoInjectOnWorkflowStart) {
      return { decision: 'continue' };
    }

    // Extract context from request
    extractContextElements(context.request, 'workflow_request');

    // Check if we have preserved context to inject
    const elements = getPreservedElements();
    if (elements.length === 0) {
      return { decision: 'continue' };
    }

    const summary = config.summarizeOnInject
      ? generateContextSummary()
      : undefined;

    if (summary) {
      stats.totalInjections++;
      stats.elementsPreserved = elements.length;
      stats.lastInjectionTime = Date.now();

      logger.info({
        elementsCount: elements.length,
        types: [...new Set(elements.map(e => e.type))]
      }, 'Context injected on workflow start');

      return {
        decision: 'continue',
        injectMessage: summary,
        metadata: { preservedElementsCount: elements.length }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Extract context from expert responses
 */
const extractFromExpertHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:compaction-context-injector:expert',
  name: 'Compaction Context Injector (Expert)',
  description: 'Extracts important context from expert responses',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    extractContextElements(context.response, `expert:${context.expertId}`);

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check for compaction triggers on phase transitions
 */
const checkOnPhaseTransitionHook: HookDefinition<OnWorkflowPhaseContext> = {
  id: 'builtin:compaction-context-injector:phase',
  name: 'Compaction Context Injector (Phase)',
  description: 'Manages context preservation during phase transitions',
  eventType: 'onWorkflowPhase',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Log phase transition with context state
    logger.debug({
      phase: context.phaseId,
      previousPhase: context.previousPhase,
      preservedElements: preservedElements.length
    }, 'Context state at phase transition');

    // Add milestone for phase completion
    if (context.previousPhase) {
      addElement({
        type: 'milestone',
        content: `Phase ${context.previousPhase} completed, now at ${context.phaseId}`,
        priority: 5,
        source: 'phase_transition',
        tags: ['system']
      });
    }

    return { decision: 'continue' };
  }
};

/**
 * All compaction context injector hooks
 */
export const compactionContextInjectorHooks = [
  injectOnWorkflowStartHook,
  extractFromExpertHook,
  checkOnPhaseTransitionHook
] as HookDefinition[];

/**
 * Registers compaction context injector hooks
 */
export function registerCompactionContextInjectorHooks(): void {
  for (const hook of compactionContextInjectorHooks) {
    registerHook(hook);
  }
  logger.debug('Compaction context injector hooks registered');
}

/**
 * Gets injector statistics
 */
export function getCompactionContextInjectorStats(): InjectorStats & {
  config: InjectorConfig;
  currentElementsCount: number;
} {
  return {
    ...stats,
    config,
    currentElementsCount: preservedElements.length
  };
}

/**
 * Resets injector state
 */
export function resetCompactionContextInjectorState(): void {
  stats = {
    totalElementsTracked: 0,
    totalInjections: 0,
    elementsPreserved: 0,
    elementsByType: {
      decision: 0,
      todo: 0,
      file_reference: 0,
      error: 0,
      milestone: 0,
      user_preference: 0,
      constraint: 0,
      dependency: 0
    }
  };

  preservedElements = [];
}

/**
 * Updates injector configuration
 */
export function updateCompactionContextInjectorConfig(updates: Partial<InjectorConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Compaction context injector config updated');
}

/**
 * Manually adds a context element
 */
export function addContextElement(
  type: ContextElementType,
  content: string,
  priority: number = 5,
  tags: string[] = []
): void {
  addElement({
    type,
    content,
    priority,
    source: 'manual',
    tags
  });
}

/**
 * Gets current preserved elements
 */
export function getPreservedContextElements(): ContextElement[] {
  return getPreservedElements();
}

/**
 * Clears all preserved elements
 */
export function clearPreservedElements(): void {
  preservedElements = [];
  logger.info('Preserved elements cleared');
}

export default {
  registerCompactionContextInjectorHooks,
  getCompactionContextInjectorStats,
  resetCompactionContextInjectorState,
  updateCompactionContextInjectorConfig,
  addContextElement,
  getPreservedContextElements,
  clearPreservedElements
};
