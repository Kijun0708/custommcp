// src/hooks/builtin/aggressive-truncation.ts

/**
 * Aggressive Truncation Mode Hook
 *
 * Aggressively reduces output size when approaching token limits.
 * More aggressive than standard truncation for emergency situations.
 *
 * Features:
 * - Multi-level truncation strategies
 * - Content prioritization (keep important parts)
 * - Code block preservation
 * - Summary generation
 */

import {
  HookDefinition,
  HookResult,
  OnToolResultContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Truncation level
 */
type TruncationLevel = 'none' | 'light' | 'moderate' | 'aggressive' | 'extreme';

/**
 * Aggressive truncation configuration
 */
interface AggressiveTruncationConfig {
  /** Whether aggressive truncation is enabled */
  enabled: boolean;
  /** Auto-enable at this context usage ratio (0-1) */
  autoEnableThreshold: number;
  /** Current truncation level */
  currentLevel: TruncationLevel;
  /** Maximum output length per level */
  maxLengthByLevel: Record<TruncationLevel, number>;
  /** Whether to preserve code blocks */
  preserveCodeBlocks: boolean;
  /** Whether to preserve error messages */
  preserveErrors: boolean;
  /** Whether to add truncation notice */
  addTruncationNotice: boolean;
  /** Content types to prioritize keeping */
  priorityContent: string[];
}

/**
 * Aggressive truncation statistics
 */
interface AggressiveTruncationStats {
  totalTruncations: number;
  truncationsByLevel: Record<TruncationLevel, number>;
  bytesRemoved: number;
  lastTruncation?: {
    originalLength: number;
    truncatedLength: number;
    level: TruncationLevel;
    timestamp: number;
  };
}

// State
let config: AggressiveTruncationConfig = {
  enabled: true,
  autoEnableThreshold: 0.85,
  currentLevel: 'none',
  maxLengthByLevel: {
    none: Infinity,
    light: 50000,
    moderate: 30000,
    aggressive: 15000,
    extreme: 5000
  },
  preserveCodeBlocks: true,
  preserveErrors: true,
  addTruncationNotice: true,
  priorityContent: ['error', 'warning', 'result', 'summary', 'conclusion']
};

let stats: AggressiveTruncationStats = {
  totalTruncations: 0,
  truncationsByLevel: {
    none: 0,
    light: 0,
    moderate: 0,
    aggressive: 0,
    extreme: 0
  },
  bytesRemoved: 0
};

/**
 * Extracts code blocks from content
 */
function extractCodeBlocks(content: string): { code: string[]; rest: string } {
  const codeBlocks: string[] = [];
  let rest = content;

  // Extract fenced code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const matches = content.match(codeBlockRegex) || [];

  for (const match of matches) {
    codeBlocks.push(match);
    rest = rest.replace(match, '\n[CODE_BLOCK_PLACEHOLDER]\n');
  }

  return { code: codeBlocks, rest };
}

/**
 * Restores code blocks to content
 */
function restoreCodeBlocks(content: string, codeBlocks: string[]): string {
  let result = content;
  for (const block of codeBlocks) {
    result = result.replace('[CODE_BLOCK_PLACEHOLDER]', block);
  }
  return result;
}

/**
 * Identifies priority sections in content
 */
function extractPrioritySections(content: string): { priority: string; rest: string } {
  const priorityPatterns = config.priorityContent.map(p =>
    new RegExp(`(^|\\n)(#{1,3}\\s*${p}[^\\n]*\\n[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'gi')
  );

  let priority = '';
  let rest = content;

  for (const pattern of priorityPatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      if (!priority.includes(match)) {
        priority += match + '\n';
      }
    }
  }

  // Also extract error-like content
  if (config.preserveErrors) {
    const errorPatterns = [
      /error[:\s].*$/gim,
      /exception[:\s].*$/gim,
      /failed[:\s].*$/gim,
      /❌.*$/gim,
      /⚠️.*$/gim
    ];

    for (const pattern of errorPatterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        if (!priority.includes(match)) {
          priority += match + '\n';
        }
      }
    }
  }

  return { priority, rest };
}

/**
 * Truncates content with smart strategy
 */
function smartTruncate(content: string, maxLength: number, level: TruncationLevel): string {
  if (content.length <= maxLength) {
    return content;
  }

  let truncated = content;

  // Step 1: Extract and preserve code blocks if configured
  let codeBlocks: string[] = [];
  if (config.preserveCodeBlocks && level !== 'extreme') {
    const extracted = extractCodeBlocks(content);
    codeBlocks = extracted.code;
    truncated = extracted.rest;
  }

  // Step 2: Extract priority sections
  const { priority, rest } = extractPrioritySections(truncated);

  // Step 3: Calculate available space
  const reservedForNotice = config.addTruncationNotice ? 200 : 0;
  const reservedForPriority = Math.min(priority.length, maxLength * 0.3);
  const reservedForCode = config.preserveCodeBlocks
    ? Math.min(codeBlocks.join('\n').length, maxLength * 0.3)
    : 0;

  const availableForRest = maxLength - reservedForNotice - reservedForPriority - reservedForCode;

  // Step 4: Truncate rest content
  let truncatedRest = rest;
  if (truncatedRest.length > availableForRest) {
    // For aggressive/extreme, just take beginning and end
    if (level === 'aggressive' || level === 'extreme') {
      const halfLength = Math.floor(availableForRest / 2);
      truncatedRest = truncatedRest.substring(0, halfLength) +
        '\n\n... [중간 내용 생략] ...\n\n' +
        truncatedRest.substring(truncatedRest.length - halfLength);
    } else {
      // For lighter levels, prefer keeping the end (usually has results)
      truncatedRest = '... [시작 부분 생략] ...\n\n' +
        truncatedRest.substring(truncatedRest.length - availableForRest);
    }
  }

  // Step 5: Reassemble
  let result = '';

  if (priority && level !== 'extreme') {
    result += priority.substring(0, reservedForPriority) + '\n';
  }

  result += truncatedRest;

  // Restore code blocks for non-extreme levels
  if (codeBlocks.length > 0 && level !== 'extreme') {
    // In aggressive mode, only keep first code block
    const blocksToRestore = level === 'aggressive'
      ? codeBlocks.slice(0, 1)
      : codeBlocks;
    result = restoreCodeBlocks(result, blocksToRestore);
  }

  // Add truncation notice
  if (config.addTruncationNotice) {
    const removed = content.length - result.length;
    result = `⚠️ _출력이 ${level} 모드로 축소됨 (${removed.toLocaleString()}자 제거)_\n\n` + result;
  }

  return result;
}

/**
 * Determines truncation level based on context usage
 */
function determineTruncationLevel(contextUsageRatio: number): TruncationLevel {
  if (!config.enabled) return 'none';

  if (contextUsageRatio >= 0.95) return 'extreme';
  if (contextUsageRatio >= 0.90) return 'aggressive';
  if (contextUsageRatio >= 0.85) return 'moderate';
  if (contextUsageRatio >= 0.80) return 'light';
  return 'none';
}

/**
 * Hook: Truncate tool results
 */
const truncateToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:aggressive-truncation:tool-result',
  name: 'Aggressive Truncation (Tool Result)',
  description: 'Aggressively truncates tool results when needed',
  eventType: 'onToolResult',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || config.currentLevel === 'none') {
      return { decision: 'continue' };
    }

    const result = context.toolResult;
    if (!result || typeof result !== 'string') {
      return { decision: 'continue' };
    }

    const maxLength = config.maxLengthByLevel[config.currentLevel];
    if (result.length <= maxLength) {
      return { decision: 'continue' };
    }

    const truncated = smartTruncate(result, maxLength, config.currentLevel);
    const bytesRemoved = result.length - truncated.length;

    // Update stats
    stats.totalTruncations++;
    stats.truncationsByLevel[config.currentLevel]++;
    stats.bytesRemoved += bytesRemoved;
    stats.lastTruncation = {
      originalLength: result.length,
      truncatedLength: truncated.length,
      level: config.currentLevel,
      timestamp: Date.now()
    };

    logger.debug({
      tool: context.toolName,
      level: config.currentLevel,
      original: result.length,
      truncated: truncated.length
    }, 'Tool result aggressively truncated');

    return {
      decision: 'modify',
      modifiedData: { toolResult: truncated },
      metadata: {
        aggressiveTruncation: true,
        level: config.currentLevel,
        bytesRemoved
      }
    };
  }
};

/**
 * Hook: Truncate expert results
 */
const truncateExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:aggressive-truncation:expert-result',
  name: 'Aggressive Truncation (Expert Result)',
  description: 'Aggressively truncates expert responses when needed',
  eventType: 'onExpertResult',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || config.currentLevel === 'none') {
      return { decision: 'continue' };
    }

    const response = context.response;
    if (!response || typeof response !== 'string') {
      return { decision: 'continue' };
    }

    const maxLength = config.maxLengthByLevel[config.currentLevel];
    if (response.length <= maxLength) {
      return { decision: 'continue' };
    }

    const truncated = smartTruncate(response, maxLength, config.currentLevel);
    const bytesRemoved = response.length - truncated.length;

    // Update stats
    stats.totalTruncations++;
    stats.truncationsByLevel[config.currentLevel]++;
    stats.bytesRemoved += bytesRemoved;
    stats.lastTruncation = {
      originalLength: response.length,
      truncatedLength: truncated.length,
      level: config.currentLevel,
      timestamp: Date.now()
    };

    logger.debug({
      expert: context.expertId,
      level: config.currentLevel,
      original: response.length,
      truncated: truncated.length
    }, 'Expert result aggressively truncated');

    return {
      decision: 'modify',
      modifiedData: { response: truncated },
      metadata: {
        aggressiveTruncation: true,
        level: config.currentLevel,
        bytesRemoved
      }
    };
  }
};

/**
 * All aggressive truncation hooks
 */
export const aggressiveTruncationHooks = [
  truncateToolResultHook,
  truncateExpertResultHook
] as HookDefinition[];

/**
 * Registers aggressive truncation hooks
 */
export function registerAggressiveTruncationHooks(): void {
  for (const hook of aggressiveTruncationHooks) {
    registerHook(hook);
  }
  logger.debug('Aggressive truncation hooks registered');
}

/**
 * Gets aggressive truncation statistics
 */
export function getAggressiveTruncationStats(): AggressiveTruncationStats & {
  config: AggressiveTruncationConfig;
} {
  return {
    ...stats,
    config
  };
}

/**
 * Resets aggressive truncation state
 */
export function resetAggressiveTruncationState(): void {
  stats = {
    totalTruncations: 0,
    truncationsByLevel: {
      none: 0,
      light: 0,
      moderate: 0,
      aggressive: 0,
      extreme: 0
    },
    bytesRemoved: 0
  };
}

/**
 * Updates aggressive truncation configuration
 */
export function updateAggressiveTruncationConfig(updates: Partial<AggressiveTruncationConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Aggressive truncation config updated');
}

/**
 * Sets the truncation level
 */
export function setTruncationLevel(level: TruncationLevel): void {
  config.currentLevel = level;
  logger.info({ level }, 'Truncation level set');
}

/**
 * Auto-adjusts truncation level based on context usage
 */
export function autoAdjustLevel(contextUsageRatio: number): TruncationLevel {
  const newLevel = determineTruncationLevel(contextUsageRatio);

  if (newLevel !== config.currentLevel) {
    config.currentLevel = newLevel;
    logger.info({
      contextUsageRatio,
      newLevel
    }, 'Truncation level auto-adjusted');
  }

  return newLevel;
}

export default {
  registerAggressiveTruncationHooks,
  getAggressiveTruncationStats,
  resetAggressiveTruncationState,
  updateAggressiveTruncationConfig,
  setTruncationLevel,
  autoAdjustLevel
};
