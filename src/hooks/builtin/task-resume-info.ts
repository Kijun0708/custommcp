// src/hooks/builtin/task-resume-info.ts

/**
 * Task Resume Info Hook
 *
 * Extracts and formats session IDs from task metadata for resume functionality.
 * Enables seamless continuation of interrupted tasks.
 *
 * Features:
 * - Session ID extraction
 * - Task metadata parsing
 * - Resume information formatting
 * - Context preservation hints
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext,
  OnWorkflowStartContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Resume information
 */
interface ResumeInfo {
  sessionId: string;
  taskId?: string;
  timestamp: number;
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Task resume info configuration
 */
interface TaskResumeInfoConfig {
  /** Whether resume info extraction is enabled */
  enabled: boolean;
  /** Patterns to detect session IDs */
  sessionIdPatterns: RegExp[];
  /** Patterns to detect task IDs */
  taskIdPatterns: RegExp[];
  /** Auto-inject resume hints */
  autoInjectHints: boolean;
  /** Store extracted info */
  storeExtractedInfo: boolean;
  /** Max stored resume infos */
  maxStoredInfos: number;
}

/**
 * Task resume info statistics
 */
interface TaskResumeInfoStats {
  totalExtractions: number;
  sessionIdsExtracted: number;
  taskIdsExtracted: number;
  resumeHintsInjected: number;
  lastExtraction?: ResumeInfo;
}

// State
let config: TaskResumeInfoConfig = {
  enabled: true,
  sessionIdPatterns: [
    /session[_-]?id[:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i,
    /\bses[_-]([a-zA-Z0-9]{8,})\b/,
    /\bwork[_-](\d+[_-][a-zA-Z0-9]+)\b/,
    /session:\s*['"`]?([^'"`\s,}]+)['"`]?/i,
    /"sessionId":\s*"([^"]+)"/,
    /agent[_-]?id[:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i
  ],
  taskIdPatterns: [
    /task[_-]?id[:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i,
    /\btask[_-](\d+[_-][a-zA-Z0-9]+)\b/,
    /"taskId":\s*"([^"]+)"/,
    /boulder[_-]?id[:\s]*['"]?([a-zA-Z0-9_-]+)['"]?/i
  ],
  autoInjectHints: true,
  storeExtractedInfo: true,
  maxStoredInfos: 20
};

let stats: TaskResumeInfoStats = {
  totalExtractions: 0,
  sessionIdsExtracted: 0,
  taskIdsExtracted: 0,
  resumeHintsInjected: 0
};

const extractedInfos: ResumeInfo[] = [];

/**
 * Extracts session ID from text
 */
function extractSessionId(text: string): string | null {
  for (const pattern of config.sessionIdPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extracts task ID from text
 */
function extractTaskId(text: string): string | null {
  for (const pattern of config.taskIdPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extracts context snippet around ID
 */
function extractContextSnippet(text: string, id: string, windowSize: number = 100): string {
  const index = text.indexOf(id);
  if (index === -1) return '';

  const start = Math.max(0, index - windowSize);
  const end = Math.min(text.length, index + id.length + windowSize);

  let snippet = text.substring(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Stores extracted resume info
 */
function storeResumeInfo(info: ResumeInfo): void {
  if (!config.storeExtractedInfo) return;

  extractedInfos.push(info);

  // Trim old entries
  while (extractedInfos.length > config.maxStoredInfos) {
    extractedInfos.shift();
  }

  stats.lastExtraction = info;
}

/**
 * Generates resume hint message
 */
function generateResumeHint(info: ResumeInfo): string {
  let hint = '\n\n---\n📋 **Resume Information Detected**\n\n';

  if (info.sessionId) {
    hint += `- **Session ID:** \`${info.sessionId}\`\n`;
  }

  if (info.taskId) {
    hint += `- **Task ID:** \`${info.taskId}\`\n`;
  }

  hint += `- **Detected at:** ${new Date(info.timestamp).toLocaleTimeString()}\n`;

  if (info.context) {
    hint += `\n**Context:**\n\`\`\`\n${info.context.substring(0, 200)}\n\`\`\`\n`;
  }

  hint += '\n_This information can be used to resume or reference this task._\n---\n';

  return hint;
}

/**
 * Hook: Extract resume info from tool calls
 */
const extractFromToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:task-resume-info:extract-tool-call',
  name: 'Task Resume Info (Extract from Tool Call)',
  description: 'Extracts resume information from tool call inputs',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const inputStr = JSON.stringify(context.toolInput);

    const sessionId = extractSessionId(inputStr);
    const taskId = extractTaskId(inputStr);

    if (!sessionId && !taskId) {
      return { decision: 'continue' };
    }

    stats.totalExtractions++;

    const info: ResumeInfo = {
      sessionId: sessionId || '',
      taskId: taskId || undefined,
      timestamp: Date.now(),
      context: extractContextSnippet(inputStr, sessionId || taskId || ''),
      metadata: { source: 'tool_call', tool: context.toolName }
    };

    if (sessionId) stats.sessionIdsExtracted++;
    if (taskId) stats.taskIdsExtracted++;

    storeResumeInfo(info);

    logger.debug({
      sessionId,
      taskId,
      tool: context.toolName
    }, 'Resume info extracted from tool call');

    return {
      decision: 'continue',
      metadata: {
        resumeInfoExtracted: true,
        sessionId,
        taskId
      }
    };
  }
};

/**
 * Hook: Extract resume info from tool results
 */
const extractFromToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:task-resume-info:extract-tool-result',
  name: 'Task Resume Info (Extract from Tool Result)',
  description: 'Extracts resume information from tool results',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const result = context.toolResult;
    if (!result || typeof result !== 'string') {
      return { decision: 'continue' };
    }

    const sessionId = extractSessionId(result);
    const taskId = extractTaskId(result);

    if (!sessionId && !taskId) {
      return { decision: 'continue' };
    }

    stats.totalExtractions++;

    const info: ResumeInfo = {
      sessionId: sessionId || '',
      taskId: taskId || undefined,
      timestamp: Date.now(),
      context: extractContextSnippet(result, sessionId || taskId || ''),
      metadata: { source: 'tool_result', tool: context.toolName }
    };

    if (sessionId) stats.sessionIdsExtracted++;
    if (taskId) stats.taskIdsExtracted++;

    storeResumeInfo(info);

    // Auto-inject hint if configured
    if (config.autoInjectHints) {
      stats.resumeHintsInjected++;

      return {
        decision: 'continue',
        injectMessage: generateResumeHint(info),
        metadata: {
          resumeInfoExtracted: true,
          sessionId,
          taskId
        }
      };
    }

    return {
      decision: 'continue',
      metadata: {
        resumeInfoExtracted: true,
        sessionId,
        taskId
      }
    };
  }
};

/**
 * Hook: Extract resume info from expert results
 */
const extractFromExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:task-resume-info:extract-expert-result',
  name: 'Task Resume Info (Extract from Expert Result)',
  description: 'Extracts resume information from expert responses',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const response = context.response;
    if (!response) {
      return { decision: 'continue' };
    }

    const sessionId = extractSessionId(response);
    const taskId = extractTaskId(response);

    if (!sessionId && !taskId) {
      return { decision: 'continue' };
    }

    stats.totalExtractions++;

    const info: ResumeInfo = {
      sessionId: sessionId || '',
      taskId: taskId || undefined,
      timestamp: Date.now(),
      context: extractContextSnippet(response, sessionId || taskId || ''),
      metadata: { source: 'expert_result', expert: context.expertId }
    };

    if (sessionId) stats.sessionIdsExtracted++;
    if (taskId) stats.taskIdsExtracted++;

    storeResumeInfo(info);

    logger.debug({
      sessionId,
      taskId,
      expert: context.expertId
    }, 'Resume info extracted from expert result');

    return {
      decision: 'continue',
      metadata: {
        resumeInfoExtracted: true,
        sessionId,
        taskId
      }
    };
  }
};

/**
 * All task resume info hooks
 */
export const taskResumeInfoHooks = [
  extractFromToolCallHook,
  extractFromToolResultHook,
  extractFromExpertResultHook
] as HookDefinition[];

/**
 * Registers task resume info hooks
 */
export function registerTaskResumeInfoHooks(): void {
  for (const hook of taskResumeInfoHooks) {
    registerHook(hook);
  }
  logger.debug('Task resume info hooks registered');
}

/**
 * Gets task resume info statistics
 */
export function getTaskResumeInfoStats(): TaskResumeInfoStats & {
  config: TaskResumeInfoConfig;
  storedInfosCount: number;
} {
  return {
    ...stats,
    config,
    storedInfosCount: extractedInfos.length
  };
}

/**
 * Resets task resume info state
 */
export function resetTaskResumeInfoState(): void {
  stats = {
    totalExtractions: 0,
    sessionIdsExtracted: 0,
    taskIdsExtracted: 0,
    resumeHintsInjected: 0
  };
  extractedInfos.length = 0;
}

/**
 * Updates task resume info configuration
 */
export function updateTaskResumeInfoConfig(updates: Partial<TaskResumeInfoConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Task resume info config updated');
}

/**
 * Gets all extracted resume infos
 */
export function getExtractedResumeInfos(): ResumeInfo[] {
  return [...extractedInfos];
}

/**
 * Gets most recent resume info
 */
export function getMostRecentResumeInfo(): ResumeInfo | null {
  return extractedInfos.length > 0 ? extractedInfos[extractedInfos.length - 1] : null;
}

/**
 * Finds resume info by session ID
 */
export function findBySessionId(sessionId: string): ResumeInfo | undefined {
  return extractedInfos.find(info => info.sessionId === sessionId);
}

/**
 * Finds resume info by task ID
 */
export function findByTaskId(taskId: string): ResumeInfo | undefined {
  return extractedInfos.find(info => info.taskId === taskId);
}

/**
 * Clears stored resume infos
 */
export function clearStoredInfos(): void {
  extractedInfos.length = 0;
  logger.debug('Stored resume infos cleared');
}

export default {
  registerTaskResumeInfoHooks,
  getTaskResumeInfoStats,
  resetTaskResumeInfoState,
  updateTaskResumeInfoConfig,
  getExtractedResumeInfos,
  getMostRecentResumeInfo,
  findBySessionId,
  findByTaskId,
  clearStoredInfos
};
