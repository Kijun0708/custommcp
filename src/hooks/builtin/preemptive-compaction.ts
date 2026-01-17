// src/hooks/builtin/preemptive-compaction.ts

/**
 * Preemptive Compaction Hook
 *
 * Triggers context compaction before hitting hard token limits.
 * Works with Context Window Monitor to detect approaching limits
 * and recommend/trigger compaction actions.
 *
 * Features:
 * - Monitors token usage and triggers at configurable threshold
 * - Preserves critical context markers during compaction
 * - Provides compaction strategies (aggressive, moderate, minimal)
 * - Tracks compaction history for optimization
 */

import {
  HookDefinition,
  HookResult,
  OnExpertResultContext,
  OnToolResultContext,
  OnWorkflowPhaseContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { getContextUsageStats } from './context-window-monitor.js';

/**
 * Compaction strategies
 */
type CompactionStrategy = 'aggressive' | 'moderate' | 'minimal';

/**
 * Configuration for preemptive compaction
 */
interface CompactionConfig {
  /** Whether preemptive compaction is enabled */
  enabled: boolean;
  /** Threshold to trigger compaction (0-1) */
  triggerThreshold: number;
  /** Default compaction strategy */
  defaultStrategy: CompactionStrategy;
  /** Max compactions per session */
  maxCompactionsPerSession: number;
  /** Cooldown between compactions (ms) */
  compactionCooldownMs: number;
  /** Whether to auto-recommend compaction */
  autoRecommend: boolean;
  /** Inject compaction message into context */
  injectCompactionMessage: boolean;
}

/**
 * Compaction statistics
 */
interface CompactionStats {
  totalCompactions: number;
  tokensRecovered: number;
  lastCompactionTime?: number;
  lastCompactionStrategy?: CompactionStrategy;
  compactionHistory: Array<{
    timestamp: number;
    strategy: CompactionStrategy;
    tokensBefore: number;
    tokensAfter: number;
    recovered: number;
  }>;
  recommendationsMade: number;
  recommendationsAccepted: number;
}

/**
 * Preserved context types
 */
interface PreservedContext {
  /** Important markers to preserve */
  markers: string[];
  /** Critical file paths mentioned */
  criticalPaths: string[];
  /** Key decisions made */
  decisions: string[];
  /** Pending tasks */
  pendingTasks: string[];
}

// State
let config: CompactionConfig = {
  enabled: true,
  triggerThreshold: 0.85,
  defaultStrategy: 'moderate',
  maxCompactionsPerSession: 3,
  compactionCooldownMs: 60000, // 1 minute
  autoRecommend: true,
  injectCompactionMessage: true
};

let stats: CompactionStats = {
  totalCompactions: 0,
  tokensRecovered: 0,
  compactionHistory: [],
  recommendationsMade: 0,
  recommendationsAccepted: 0
};

let preservedContext: PreservedContext = {
  markers: [],
  criticalPaths: [],
  decisions: [],
  pendingTasks: []
};

let sessionCompactionCount = 0;

/**
 * Checks if compaction should be triggered
 */
function shouldTriggerCompaction(): { should: boolean; reason?: string } {
  // Check if enabled
  if (!config.enabled) {
    return { should: false, reason: 'disabled' };
  }

  // Check session limit
  if (sessionCompactionCount >= config.maxCompactionsPerSession) {
    return { should: false, reason: 'max_compactions_reached' };
  }

  // Check cooldown
  if (stats.lastCompactionTime) {
    const timeSinceLast = Date.now() - stats.lastCompactionTime;
    if (timeSinceLast < config.compactionCooldownMs) {
      return { should: false, reason: 'cooldown_active' };
    }
  }

  // Check context usage
  const contextStats = getContextUsageStats();
  if (contextStats.usagePercentage >= config.triggerThreshold) {
    return {
      should: true,
      reason: `usage_${(contextStats.usagePercentage * 100).toFixed(0)}%`
    };
  }

  return { should: false, reason: 'threshold_not_met' };
}

/**
 * Gets compaction strategy based on usage level
 */
function getRecommendedStrategy(usagePercentage: number): CompactionStrategy {
  if (usagePercentage >= 0.95) {
    return 'aggressive';
  } else if (usagePercentage >= 0.90) {
    return 'moderate';
  }
  return 'minimal';
}

/**
 * Generates compaction recommendation message
 */
function generateCompactionMessage(strategy: CompactionStrategy, usagePercentage: number): string {
  const strategyDescriptions: Record<CompactionStrategy, string> = {
    aggressive: `**공격적 압축** (토큰 ~60% 회수 목표)
- 오래된 도구 결과 제거
- 반복 컨텍스트 병합
- 핵심 결정사항만 보존`,
    moderate: `**적당한 압축** (토큰 ~40% 회수 목표)
- 긴 출력 요약
- 중복 정보 제거
- 중요 컨텍스트 보존`,
    minimal: `**최소 압축** (토큰 ~20% 회수 목표)
- 불필요한 로그 제거
- 포맷팅 최적화
- 모든 핵심 정보 유지`
  };

  const preserved = preservedContext.markers.length > 0 ||
                   preservedContext.criticalPaths.length > 0 ||
                   preservedContext.decisions.length > 0;

  let message = `🗜️ **선제적 컨텍스트 압축 권장** (사용량: ${(usagePercentage * 100).toFixed(1)}%)\n\n`;
  message += `${strategyDescriptions[strategy]}\n\n`;

  if (preserved) {
    message += `**보존될 컨텍스트:**\n`;
    if (preservedContext.criticalPaths.length > 0) {
      message += `- 핵심 파일: ${preservedContext.criticalPaths.slice(0, 3).join(', ')}\n`;
    }
    if (preservedContext.decisions.length > 0) {
      message += `- 주요 결정: ${preservedContext.decisions.length}개\n`;
    }
    if (preservedContext.pendingTasks.length > 0) {
      message += `- 대기 작업: ${preservedContext.pendingTasks.length}개\n`;
    }
  }

  message += `\n_압축 후에도 작업 연속성이 유지됩니다._`;

  return message;
}

/**
 * Extracts important context from text
 */
function extractImportantContext(text: string): void {
  // Extract file paths
  const pathPattern = /(?:\/[\w.-]+)+(?:\.\w+)?|(?:\w:)?(?:\\[\w.-]+)+(?:\.\w+)?/g;
  const paths = text.match(pathPattern) || [];
  for (const path of paths) {
    if (!preservedContext.criticalPaths.includes(path) &&
        preservedContext.criticalPaths.length < 10) {
      // Only add paths that look like source code
      if (/\.(ts|js|py|go|rs|java|tsx|jsx|vue|svelte)$/.test(path)) {
        preservedContext.criticalPaths.push(path);
      }
    }
  }

  // Extract decision markers
  const decisionPatterns = [
    /결정[:：]\s*(.+)/gi,
    /decision[:：]\s*(.+)/gi,
    /선택[:：]\s*(.+)/gi,
    /chose[:：]\s*(.+)/gi
  ];

  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const decision = match[1].trim().substring(0, 100);
      if (!preservedContext.decisions.includes(decision) &&
          preservedContext.decisions.length < 5) {
        preservedContext.decisions.push(decision);
      }
    }
  }

  // Extract TODO/pending markers
  const todoPatterns = [
    /TODO[:：]\s*(.+)/gi,
    /FIXME[:：]\s*(.+)/gi,
    /다음[:：]\s*(.+)/gi,
    /pending[:：]\s*(.+)/gi
  ];

  for (const pattern of todoPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const task = match[1].trim().substring(0, 100);
      if (!preservedContext.pendingTasks.includes(task) &&
          preservedContext.pendingTasks.length < 5) {
        preservedContext.pendingTasks.push(task);
      }
    }
  }
}

/**
 * Records a compaction event
 */
function recordCompaction(strategy: CompactionStrategy, tokensBefore: number, tokensAfter: number): void {
  const recovered = tokensBefore - tokensAfter;

  stats.totalCompactions++;
  stats.tokensRecovered += recovered;
  stats.lastCompactionTime = Date.now();
  stats.lastCompactionStrategy = strategy;

  stats.compactionHistory.push({
    timestamp: Date.now(),
    strategy,
    tokensBefore,
    tokensAfter,
    recovered
  });

  // Keep only last 10 compaction records
  if (stats.compactionHistory.length > 10) {
    stats.compactionHistory = stats.compactionHistory.slice(-10);
  }

  sessionCompactionCount++;

  logger.info({
    strategy,
    tokensBefore,
    tokensAfter,
    recovered,
    totalCompactions: stats.totalCompactions
  }, 'Compaction recorded');
}

/**
 * Hook: Monitor expert results for compaction triggers
 */
const preemptiveCompactionExpertHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:preemptive-compaction:expert',
  name: 'Preemptive Compaction (Expert)',
  description: 'Monitors expert responses and triggers compaction when needed',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Extract important context from response
    extractImportantContext(context.response);

    // Check if compaction should be triggered
    const { should, reason } = shouldTriggerCompaction();

    if (should && config.autoRecommend) {
      const contextStats = getContextUsageStats();
      const strategy = getRecommendedStrategy(contextStats.usagePercentage);
      stats.recommendationsMade++;

      logger.info({
        reason,
        strategy,
        usage: (contextStats.usagePercentage * 100).toFixed(1) + '%'
      }, 'Compaction recommended');

      if (config.injectCompactionMessage) {
        const message = generateCompactionMessage(strategy, contextStats.usagePercentage);
        return {
          decision: 'continue',
          injectMessage: message,
          metadata: {
            compactionRecommended: true,
            strategy,
            usagePercentage: contextStats.usagePercentage
          }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Monitor tool results for context extraction
 */
const preemptiveCompactionToolHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:preemptive-compaction:tool',
  name: 'Preemptive Compaction (Tool)',
  description: 'Extracts important context from tool results',
  eventType: 'onToolResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Extract important context from tool result
    const resultText = typeof context.toolResult === 'string'
      ? context.toolResult
      : JSON.stringify(context.toolResult);

    extractImportantContext(resultText);

    return { decision: 'continue' };
  }
};

/**
 * Hook: Check compaction on workflow phase transitions
 */
const preemptiveCompactionWorkflowHook: HookDefinition<OnWorkflowPhaseContext> = {
  id: 'builtin:preemptive-compaction:workflow',
  name: 'Preemptive Compaction (Workflow)',
  description: 'Checks for compaction needs during workflow phase transitions',
  eventType: 'onWorkflowPhase',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const { should, reason } = shouldTriggerCompaction();

    if (should) {
      const contextStats = getContextUsageStats();
      const strategy = getRecommendedStrategy(contextStats.usagePercentage);

      logger.warn({
        phase: context.phaseId,
        previousPhase: context.previousPhase,
        reason,
        strategy
      }, 'Compaction needed during workflow phase transition');

      // Phase transitions are good points for compaction
      stats.recommendationsMade++;

      if (config.injectCompactionMessage) {
        return {
          decision: 'continue',
          injectMessage: `⚡ **워크플로우 단계 전환** - 컨텍스트 압축 권장\n` +
            `현재 단계: ${context.phaseId}\n` +
            `권장 전략: ${strategy}`,
          metadata: {
            compactionRecommended: true,
            phase: context.phaseId,
            strategy
          }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * All preemptive compaction hooks
 */
export const preemptiveCompactionHooks = [
  preemptiveCompactionExpertHook,
  preemptiveCompactionToolHook,
  preemptiveCompactionWorkflowHook
] as HookDefinition[];

/**
 * Registers preemptive compaction hooks
 */
export function registerPreemptiveCompactionHooks(): void {
  for (const hook of preemptiveCompactionHooks) {
    registerHook(hook);
  }
  logger.debug('Preemptive compaction hooks registered');
}

/**
 * Gets compaction statistics
 */
export function getPreemptiveCompactionStats(): CompactionStats & {
  config: CompactionConfig;
  preservedContext: PreservedContext;
  sessionCompactions: number;
} {
  return {
    ...stats,
    config,
    preservedContext,
    sessionCompactions: sessionCompactionCount
  };
}

/**
 * Resets compaction state
 */
export function resetPreemptiveCompactionState(): void {
  stats = {
    totalCompactions: 0,
    tokensRecovered: 0,
    compactionHistory: [],
    recommendationsMade: 0,
    recommendationsAccepted: 0
  };

  preservedContext = {
    markers: [],
    criticalPaths: [],
    decisions: [],
    pendingTasks: []
  };

  sessionCompactionCount = 0;
}

/**
 * Updates compaction configuration
 */
export function updatePreemptiveCompactionConfig(updates: Partial<CompactionConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Preemptive compaction config updated');
}

/**
 * Manually triggers a compaction record
 */
export function triggerCompaction(
  strategy: CompactionStrategy,
  tokensBefore: number,
  tokensAfter: number
): void {
  recordCompaction(strategy, tokensBefore, tokensAfter);
}

/**
 * Adds a marker to preserved context
 */
export function addPreservedMarker(marker: string): void {
  if (!preservedContext.markers.includes(marker) &&
      preservedContext.markers.length < 20) {
    preservedContext.markers.push(marker);
  }
}

/**
 * Gets preserved context for compaction
 */
export function getPreservedContext(): PreservedContext {
  return { ...preservedContext };
}

export default {
  registerPreemptiveCompactionHooks,
  getPreemptiveCompactionStats,
  resetPreemptiveCompactionState,
  updatePreemptiveCompactionConfig,
  triggerCompaction,
  addPreservedMarker,
  getPreservedContext
};
