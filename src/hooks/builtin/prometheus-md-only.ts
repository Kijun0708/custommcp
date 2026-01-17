// src/hooks/builtin/prometheus-md-only.ts

/**
 * Prometheus MD Only Hook
 *
 * Ensures responses follow markdown-only format for better readability.
 * Cleans up non-markdown artifacts and enforces consistent formatting.
 *
 * Features:
 * - Response format validation
 * - Non-markdown cleanup
 * - Thinking block preservation
 * - Code block formatting
 * - Table formatting
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
 * Format issue
 */
interface FormatIssue {
  type: 'unclosed_block' | 'malformed_table' | 'excessive_whitespace' | 'raw_html' | 'broken_link';
  location?: number;
  description: string;
}

/**
 * Prometheus MD only configuration
 */
interface PrometheusMdOnlyConfig {
  /** Whether MD only enforcement is enabled */
  enabled: boolean;
  /** Clean raw HTML */
  cleanHtml: boolean;
  /** Fix unclosed code blocks */
  fixCodeBlocks: boolean;
  /** Normalize tables */
  normalizeTables: boolean;
  /** Remove excessive whitespace */
  normalizeWhitespace: boolean;
  /** Preserve thinking blocks */
  preserveThinkingBlocks: boolean;
  /** Max consecutive newlines */
  maxConsecutiveNewlines: number;
  /** Add language hint to code blocks */
  addLanguageHints: boolean;
  /** Validate links */
  validateLinks: boolean;
}

/**
 * Prometheus MD only statistics
 */
interface PrometheusMdOnlyStats {
  totalProcessed: number;
  issuesFound: number;
  issuesByType: Record<string, number>;
  responsesFixed: number;
  lastIssues?: FormatIssue[];
}

// State
let config: PrometheusMdOnlyConfig = {
  enabled: true,
  cleanHtml: true,
  fixCodeBlocks: true,
  normalizeTables: true,
  normalizeWhitespace: true,
  preserveThinkingBlocks: true,
  maxConsecutiveNewlines: 3,
  addLanguageHints: true,
  validateLinks: false
};

let stats: PrometheusMdOnlyStats = {
  totalProcessed: 0,
  issuesFound: 0,
  issuesByType: {},
  responsesFixed: 0
};

/**
 * Detects format issues in content
 */
function detectFormatIssues(content: string): FormatIssue[] {
  const issues: FormatIssue[] = [];

  // Check for unclosed code blocks
  const codeBlockStarts = (content.match(/```/g) || []).length;
  if (codeBlockStarts % 2 !== 0) {
    issues.push({
      type: 'unclosed_block',
      description: 'Unclosed code block detected'
    });
  }

  // Check for malformed tables
  const tableLines = content.split('\n').filter(line => line.includes('|'));
  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    const pipeCount = (line.match(/\|/g) || []).length;
    if (i > 0 && tableLines[i - 1]) {
      const prevPipeCount = (tableLines[i - 1].match(/\|/g) || []).length;
      if (Math.abs(pipeCount - prevPipeCount) > 1) {
        issues.push({
          type: 'malformed_table',
          description: 'Table columns inconsistent'
        });
        break;
      }
    }
  }

  // Check for excessive whitespace
  if (/\n{4,}/.test(content)) {
    issues.push({
      type: 'excessive_whitespace',
      description: 'Excessive consecutive newlines'
    });
  }

  // Check for raw HTML
  if (config.cleanHtml && /<[a-z][\s\S]*>/i.test(content)) {
    // Exclude common markdown-safe HTML
    const htmlMatch = content.match(/<(?!br|hr|img|a |\/a>)[a-z][\s\S]*?>/i);
    if (htmlMatch) {
      issues.push({
        type: 'raw_html',
        location: content.indexOf(htmlMatch[0]),
        description: 'Raw HTML detected'
      });
    }
  }

  // Check for broken links
  if (config.validateLinks) {
    const brokenLinks = content.match(/\[([^\]]*)\]\(\s*\)/g);
    if (brokenLinks) {
      issues.push({
        type: 'broken_link',
        description: `${brokenLinks.length} broken link(s) detected`
      });
    }
  }

  return issues;
}

/**
 * Fixes format issues in content
 */
function fixFormatIssues(content: string): string {
  let fixed = content;

  // Preserve thinking blocks
  const thinkingBlocks: string[] = [];
  if (config.preserveThinkingBlocks) {
    fixed = fixed.replace(/<thinking>[\s\S]*?<\/thinking>/g, (match) => {
      thinkingBlocks.push(match);
      return `__THINKING_BLOCK_${thinkingBlocks.length - 1}__`;
    });
  }

  // Fix unclosed code blocks
  if (config.fixCodeBlocks) {
    const parts = fixed.split('```');
    if (parts.length % 2 === 0) {
      // Odd number of ``` means unclosed
      fixed += '\n```';
    }
  }

  // Add language hints to code blocks
  if (config.addLanguageHints) {
    fixed = fixed.replace(/```\n/g, (match, offset) => {
      // Try to detect language from content
      const afterMatch = fixed.substring(offset + match.length, offset + match.length + 100);

      if (/^(import|from|def |class )/m.test(afterMatch)) {
        return '```python\n';
      } else if (/^(const |let |var |function |import |export )/m.test(afterMatch)) {
        return '```typescript\n';
      } else if (/^(\{|\[|"[a-zA-Z]+":)/m.test(afterMatch)) {
        return '```json\n';
      } else if (/^#!/m.test(afterMatch)) {
        return '```bash\n';
      }

      return match;
    });
  }

  // Clean raw HTML
  if (config.cleanHtml) {
    // Convert common HTML to markdown
    fixed = fixed.replace(/<b>([^<]*)<\/b>/gi, '**$1**');
    fixed = fixed.replace(/<i>([^<]*)<\/i>/gi, '*$1*');
    fixed = fixed.replace(/<code>([^<]*)<\/code>/gi, '`$1`');
    fixed = fixed.replace(/<br\s*\/?>/gi, '\n');
    fixed = fixed.replace(/<hr\s*\/?>/gi, '\n---\n');

    // Remove other HTML tags but keep content
    fixed = fixed.replace(/<[^>]+>([^<]*)<\/[^>]+>/gi, '$1');
  }

  // Normalize whitespace
  if (config.normalizeWhitespace) {
    const maxNewlines = config.maxConsecutiveNewlines;
    const newlineRegex = new RegExp(`\\n{${maxNewlines + 1},}`, 'g');
    fixed = fixed.replace(newlineRegex, '\n'.repeat(maxNewlines));

    // Trim trailing whitespace from lines
    fixed = fixed.split('\n').map(line => line.trimEnd()).join('\n');
  }

  // Restore thinking blocks
  if (config.preserveThinkingBlocks) {
    for (let i = 0; i < thinkingBlocks.length; i++) {
      fixed = fixed.replace(`__THINKING_BLOCK_${i}__`, thinkingBlocks[i]);
    }
  }

  return fixed;
}

/**
 * Processes content through MD only pipeline
 */
function processContent(content: string): { content: string; issues: FormatIssue[]; fixed: boolean } {
  if (!content || typeof content !== 'string') {
    return { content: content || '', issues: [], fixed: false };
  }

  stats.totalProcessed++;

  const issues = detectFormatIssues(content);

  for (const issue of issues) {
    stats.issuesFound++;
    stats.issuesByType[issue.type] = (stats.issuesByType[issue.type] || 0) + 1;
  }

  if (issues.length > 0) {
    const fixed = fixFormatIssues(content);
    stats.responsesFixed++;
    stats.lastIssues = issues;

    logger.debug({
      issueCount: issues.length,
      types: issues.map(i => i.type)
    }, 'Format issues fixed');

    return { content: fixed, issues, fixed: true };
  }

  return { content, issues: [], fixed: false };
}

/**
 * Hook: Process expert results
 */
const processExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:prometheus-md-only:expert-result',
  name: 'Prometheus MD Only (Expert Result)',
  description: 'Ensures expert responses follow MD format',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !context.response) {
      return { decision: 'continue' };
    }

    const result = processContent(context.response);

    if (result.fixed) {
      return {
        decision: 'continue',
        modifiedData: { content: result.content },
        metadata: {
          mdOnlyProcessed: true,
          issuesFixed: result.issues.length
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Process tool results
 */
const processToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:prometheus-md-only:tool-result',
  name: 'Prometheus MD Only (Tool Result)',
  description: 'Ensures tool results follow MD format',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) {
      return { decision: 'continue' };
    }

    const toolResult = context.toolResult;
    if (!toolResult || typeof toolResult !== 'string') {
      return { decision: 'continue' };
    }

    const result = processContent(toolResult);

    if (result.fixed) {
      return {
        decision: 'continue',
        modifiedData: { content: result.content },
        metadata: {
          mdOnlyProcessed: true,
          issuesFixed: result.issues.length
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All prometheus MD only hooks
 */
export const prometheusMdOnlyHooks = [
  processExpertResultHook,
  processToolResultHook
] as HookDefinition[];

/**
 * Registers prometheus MD only hooks
 */
export function registerPrometheusMdOnlyHooks(): void {
  for (const hook of prometheusMdOnlyHooks) {
    registerHook(hook);
  }
  logger.debug('Prometheus MD only hooks registered');
}

/**
 * Gets prometheus MD only statistics
 */
export function getPrometheusMdOnlyStats(): PrometheusMdOnlyStats & {
  config: PrometheusMdOnlyConfig;
} {
  return {
    ...stats,
    config
  };
}

/**
 * Resets prometheus MD only state
 */
export function resetPrometheusMdOnlyState(): void {
  stats = {
    totalProcessed: 0,
    issuesFound: 0,
    issuesByType: {},
    responsesFixed: 0
  };
}

/**
 * Updates prometheus MD only configuration
 */
export function updatePrometheusMdOnlyConfig(updates: Partial<PrometheusMdOnlyConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Prometheus MD only config updated');
}

/**
 * Manually processes content
 */
export function processMarkdown(content: string): {
  content: string;
  issues: FormatIssue[];
  fixed: boolean;
} {
  return processContent(content);
}

/**
 * Validates markdown content
 */
export function validateMarkdown(content: string): FormatIssue[] {
  return detectFormatIssues(content);
}

export default {
  registerPrometheusMdOnlyHooks,
  getPrometheusMdOnlyStats,
  resetPrometheusMdOnlyState,
  updatePrometheusMdOnlyConfig,
  processMarkdown,
  validateMarkdown
};
