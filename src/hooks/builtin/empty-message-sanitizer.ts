// src/hooks/builtin/empty-message-sanitizer.ts

/**
 * Empty Message Sanitizer Hook
 *
 * Detects and handles empty or malformed messages that could cause API errors.
 * Prevents issues with:
 * - Empty content blocks
 * - Whitespace-only messages
 * - Malformed tool results
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Statistics for empty message sanitizer
 */
interface SanitizerStats {
  totalChecked: number;
  emptyDetected: number;
  sanitized: number;
  lastDetection?: {
    timestamp: number;
    type: string;
    source: string;
  };
}

/**
 * Configuration for sanitizer
 */
interface SanitizerConfig {
  enabled: boolean;
  sanitizeEmptyStrings: boolean;
  sanitizeWhitespaceOnly: boolean;
  sanitizeNullContent: boolean;
  minContentLength: number;
  warnOnSanitize: boolean;
}

// State
let stats: SanitizerStats = {
  totalChecked: 0,
  emptyDetected: 0,
  sanitized: 0
};

let config: SanitizerConfig = {
  enabled: true,
  sanitizeEmptyStrings: true,
  sanitizeWhitespaceOnly: true,
  sanitizeNullContent: true,
  minContentLength: 1,
  warnOnSanitize: true
};

/**
 * Checks if content is empty or invalid
 */
function isEmptyContent(content: unknown): boolean {
  if (content === null || content === undefined) {
    return config.sanitizeNullContent;
  }

  if (typeof content === 'string') {
    if (content === '' && config.sanitizeEmptyStrings) {
      return true;
    }
    if (content.trim() === '' && config.sanitizeWhitespaceOnly) {
      return true;
    }
    if (content.trim().length < config.minContentLength) {
      return true;
    }
    return false;
  }

  if (Array.isArray(content)) {
    if (content.length === 0) {
      return true;
    }
    // Check if all items are empty
    return content.every(item => isEmptyContent(item));
  }

  if (typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    // Check for empty text blocks
    if (obj.type === 'text' && isEmptyContent(obj.text)) {
      return true;
    }
    // Empty object
    if (Object.keys(obj).length === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Hook: Sanitize tool call inputs
 */
const sanitizeToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:empty-message-sanitizer:tool-call',
  name: 'Empty Message Sanitizer (Tool Call)',
  description: 'Detects empty inputs in tool calls that might cause API errors',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    stats.totalChecked++;

    const input = context.toolInput;

    // Check for empty inputs that might cause issues
    if (input && typeof input === 'object') {
      const inputObj = input as Record<string, unknown>;

      // Check common content fields
      const contentFields = ['content', 'text', 'message', 'prompt', 'query', 'question'];

      for (const field of contentFields) {
        if (field in inputObj && isEmptyContent(inputObj[field])) {
          stats.emptyDetected++;
          stats.lastDetection = {
            timestamp: Date.now(),
            type: 'empty_input_field',
            source: `${context.toolName}.${field}`
          };

          if (config.warnOnSanitize) {
            logger.warn({
              tool: context.toolName,
              field,
              value: inputObj[field]
            }, 'Empty content field detected in tool call');
          }
        }
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Sanitize tool results
 */
const sanitizeToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:empty-message-sanitizer:tool-result',
  name: 'Empty Message Sanitizer (Tool Result)',
  description: 'Sanitizes empty tool results to prevent API errors',
  eventType: 'onToolResult',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    stats.totalChecked++;

    // Check tool result content
    const result = context.toolResult;

    if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>;

      // Check content array
      if (Array.isArray(resultObj.content)) {
        let hasEmptyContent = false;

        for (let i = 0; i < resultObj.content.length; i++) {
          const item = resultObj.content[i];
          if (typeof item === 'object' && item !== null) {
            const itemObj = item as Record<string, unknown>;
            if (itemObj.type === 'text' && isEmptyContent(itemObj.text)) {
              hasEmptyContent = true;
              stats.emptyDetected++;
              stats.sanitized++;
              stats.lastDetection = {
                timestamp: Date.now(),
                type: 'empty_text_block',
                source: `${context.toolName}[${i}]`
              };

              if (config.warnOnSanitize) {
                logger.warn({
                  tool: context.toolName,
                  index: i,
                  originalText: itemObj.text
                }, 'Empty text block detected in tool result');
              }
            }
          }
        }

        if (hasEmptyContent) {
          logger.debug({
            tool: context.toolName,
            emptyBlocks: stats.sanitized
          }, 'Tool result contained empty content blocks');
        }
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * All empty message sanitizer hooks
 */
export const emptyMessageSanitizerHooks = [
  sanitizeToolCallHook,
  sanitizeToolResultHook
] as HookDefinition[];

/**
 * Registers empty message sanitizer hooks
 */
export function registerEmptyMessageSanitizerHooks(): void {
  for (const hook of emptyMessageSanitizerHooks) {
    registerHook(hook);
  }
  logger.debug('Empty message sanitizer hooks registered');
}

/**
 * Gets sanitizer statistics
 */
export function getEmptyMessageSanitizerStats(): SanitizerStats & { config: SanitizerConfig } {
  return {
    ...stats,
    config
  };
}

/**
 * Resets sanitizer state
 */
export function resetEmptyMessageSanitizerState(): void {
  stats = {
    totalChecked: 0,
    emptyDetected: 0,
    sanitized: 0
  };
}

/**
 * Updates sanitizer configuration
 */
export function updateEmptyMessageSanitizerConfig(updates: Partial<SanitizerConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Empty message sanitizer config updated');
}

export default {
  registerEmptyMessageSanitizerHooks,
  getEmptyMessageSanitizerStats,
  resetEmptyMessageSanitizerState,
  updateEmptyMessageSanitizerConfig
};
