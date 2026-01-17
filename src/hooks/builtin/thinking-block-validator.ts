// src/hooks/builtin/thinking-block-validator.ts

/**
 * Thinking Block Validator Hook
 *
 * Validates thinking block format in API responses.
 * Ensures thinking blocks follow proper format:
 * - Proper opening/closing tags
 * - No nested thinking blocks
 * - Reasonable length limits
 */

import {
  HookDefinition,
  HookResult,
  OnExpertResultContext,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Validation issue types
 */
type ValidationIssue =
  | 'unclosed_tag'
  | 'unopened_tag'
  | 'nested_thinking'
  | 'empty_thinking'
  | 'excessive_length'
  | 'malformed_tag';

/**
 * Statistics for thinking block validator
 */
interface ValidatorStats {
  totalChecked: number;
  issuesFound: number;
  issuesByType: Record<ValidationIssue, number>;
  lastIssue?: {
    timestamp: number;
    type: ValidationIssue;
    source: string;
  };
}

/**
 * Configuration for validator
 */
interface ValidatorConfig {
  enabled: boolean;
  maxThinkingLength: number;
  warnOnIssue: boolean;
  autoFix: boolean;
  allowNestedThinking: boolean;
}

// State
let stats: ValidatorStats = {
  totalChecked: 0,
  issuesFound: 0,
  issuesByType: {
    unclosed_tag: 0,
    unopened_tag: 0,
    nested_thinking: 0,
    empty_thinking: 0,
    excessive_length: 0,
    malformed_tag: 0
  }
};

let config: ValidatorConfig = {
  enabled: true,
  maxThinkingLength: 50000, // ~12k tokens
  warnOnIssue: true,
  autoFix: false,
  allowNestedThinking: false
};

/**
 * Thinking block pattern
 */
const THINKING_OPEN = /<thinking>/gi;
const THINKING_CLOSE = /<\/thinking>/gi;
const THINKING_BLOCK = /<thinking>([\s\S]*?)<\/thinking>/gi;

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  issues: {
    type: ValidationIssue;
    message: string;
    position?: number;
  }[];
  fixedContent?: string;
}

/**
 * Validates thinking blocks in content
 */
function validateThinkingBlocks(content: string, source: string): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  let fixedContent = content;

  // Count opening and closing tags
  const openTags = content.match(THINKING_OPEN) || [];
  const closeTags = content.match(THINKING_CLOSE) || [];

  // Check for unclosed tags
  if (openTags.length > closeTags.length) {
    const diff = openTags.length - closeTags.length;
    issues.push({
      type: 'unclosed_tag',
      message: `${diff} unclosed <thinking> tag(s) found`
    });

    if (config.autoFix) {
      // Add missing closing tags at the end
      fixedContent += '</thinking>'.repeat(diff);
    }
  }

  // Check for unopened closing tags
  if (closeTags.length > openTags.length) {
    const diff = closeTags.length - openTags.length;
    issues.push({
      type: 'unopened_tag',
      message: `${diff} </thinking> tag(s) without opening tag`
    });

    if (config.autoFix) {
      // Remove extra closing tags (simple approach)
      let remaining = diff;
      fixedContent = fixedContent.replace(THINKING_CLOSE, (match) => {
        if (remaining > 0) {
          remaining--;
          return '';
        }
        return match;
      });
    }
  }

  // Check for nested thinking blocks (if not allowed)
  if (!config.allowNestedThinking) {
    let depth = 0;
    let hasNested = false;
    let pos = 0;
    const regex = /<\/?thinking>/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[0].toLowerCase() === '<thinking>') {
        depth++;
        if (depth > 1) {
          hasNested = true;
          pos = match.index;
          break;
        }
      } else {
        depth--;
      }
    }

    if (hasNested) {
      issues.push({
        type: 'nested_thinking',
        message: 'Nested thinking blocks detected',
        position: pos
      });
    }
  }

  // Check for empty thinking blocks
  const emptyPattern = /<thinking>\s*<\/thinking>/gi;
  if (emptyPattern.test(content)) {
    issues.push({
      type: 'empty_thinking',
      message: 'Empty thinking block detected'
    });

    if (config.autoFix) {
      fixedContent = fixedContent.replace(emptyPattern, '');
    }
  }

  // Check for excessive length
  const blocks = content.match(THINKING_BLOCK) || [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].length > config.maxThinkingLength) {
      issues.push({
        type: 'excessive_length',
        message: `Thinking block ${i + 1} exceeds max length (${blocks[i].length} > ${config.maxThinkingLength})`
      });
    }
  }

  // Check for malformed tags (partial matches)
  const malformedPatterns = [
    /<thinking[^>]*[^/]>/gi,  // <thinking with extra chars
    /<\/thinking[^>]+>/gi,   // </thinking with extra chars
    /<thinking\s+>/gi,       // <thinking with space
    /<\s+thinking>/gi,       // < thinking with space
  ];

  for (const pattern of malformedPatterns) {
    if (pattern.test(content)) {
      issues.push({
        type: 'malformed_tag',
        message: 'Malformed thinking tag detected'
      });
      break;
    }
  }

  // Record statistics
  for (const issue of issues) {
    stats.issuesFound++;
    stats.issuesByType[issue.type]++;
    stats.lastIssue = {
      timestamp: Date.now(),
      type: issue.type,
      source
    };

    if (config.warnOnIssue) {
      logger.warn({
        source,
        issue: issue.type,
        message: issue.message
      }, 'Thinking block validation issue');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    fixedContent: config.autoFix ? fixedContent : undefined
  };
}

/**
 * Extracts text content from various formats
 */
function extractTextContent(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    const texts = data
      .map(item => extractTextContent(item))
      .filter(t => t !== null);
    return texts.length > 0 ? texts.join('\n') : null;
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    if (obj.type === 'text' && typeof obj.text === 'string') {
      return obj.text;
    }

    if (typeof obj.content === 'string') {
      return obj.content;
    }

    if (Array.isArray(obj.content)) {
      return extractTextContent(obj.content);
    }
  }

  return null;
}

/**
 * Hook: Validate expert results
 */
const validateExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:thinking-block-validator:expert',
  name: 'Thinking Block Validator (Expert)',
  description: 'Validates thinking block format in expert responses',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    stats.totalChecked++;

    const content = context.response;
    if (!content) return { decision: 'continue' };

    // Only validate if there are thinking tags
    if (!THINKING_OPEN.test(content)) return { decision: 'continue' };

    const result = validateThinkingBlocks(content, `expert:${context.expertId}`);

    if (!result.valid) {
      logger.debug({
        expert: context.expertId,
        issueCount: result.issues.length,
        issues: result.issues.map(i => i.type)
      }, 'Thinking block issues in expert result');
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Validate tool results
 */
const validateToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:thinking-block-validator:tool',
  name: 'Thinking Block Validator (Tool)',
  description: 'Validates thinking block format in tool results',
  eventType: 'onToolResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    stats.totalChecked++;

    const content = extractTextContent(context.toolResult);
    if (!content) return { decision: 'continue' };

    // Only validate if there are thinking tags
    if (!THINKING_OPEN.test(content)) return { decision: 'continue' };

    const result = validateThinkingBlocks(content, `tool:${context.toolName}`);

    if (!result.valid) {
      logger.debug({
        tool: context.toolName,
        issueCount: result.issues.length,
        issues: result.issues.map(i => i.type)
      }, 'Thinking block issues in tool result');
    }

    return { decision: 'continue' };
  }
};

/**
 * All thinking block validator hooks
 */
export const thinkingBlockValidatorHooks = [
  validateExpertResultHook,
  validateToolResultHook
] as HookDefinition[];

/**
 * Registers thinking block validator hooks
 */
export function registerThinkingBlockValidatorHooks(): void {
  for (const hook of thinkingBlockValidatorHooks) {
    registerHook(hook);
  }
  logger.debug('Thinking block validator hooks registered');
}

/**
 * Gets validator statistics
 */
export function getThinkingBlockValidatorStats(): ValidatorStats & { config: ValidatorConfig } {
  return {
    ...stats,
    config
  };
}

/**
 * Resets validator state
 */
export function resetThinkingBlockValidatorState(): void {
  stats = {
    totalChecked: 0,
    issuesFound: 0,
    issuesByType: {
      unclosed_tag: 0,
      unopened_tag: 0,
      nested_thinking: 0,
      empty_thinking: 0,
      excessive_length: 0,
      malformed_tag: 0
    }
  };
}

/**
 * Updates validator configuration
 */
export function updateThinkingBlockValidatorConfig(updates: Partial<ValidatorConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Thinking block validator config updated');
}

/**
 * Validates content manually
 */
export function validateContent(content: string): ValidationResult {
  return validateThinkingBlocks(content, 'manual');
}

export default {
  registerThinkingBlockValidatorHooks,
  getThinkingBlockValidatorStats,
  resetThinkingBlockValidatorState,
  updateThinkingBlockValidatorConfig,
  validateContent
};
