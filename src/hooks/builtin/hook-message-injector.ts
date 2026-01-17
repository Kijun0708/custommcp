// src/hooks/builtin/hook-message-injector.ts

/**
 * Hook Message Injector
 *
 * Centralized message injection system for hooks.
 * Manages priority, formatting, and aggregation of injected messages.
 *
 * Features:
 * - Message queue management
 * - Priority-based ordering
 * - Message deduplication
 * - Format standardization
 * - Aggregation of similar messages
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
 * Message priority
 */
type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Injected message
 */
interface InjectedMessage {
  id: string;
  content: string;
  priority: MessagePriority;
  source: string;
  timestamp: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hook message injector configuration
 */
interface HookMessageInjectorConfig {
  /** Whether message injection is enabled */
  enabled: boolean;
  /** Max messages to queue */
  maxQueueSize: number;
  /** Deduplicate similar messages */
  deduplicateMessages: boolean;
  /** Deduplication window in ms */
  deduplicationWindowMs: number;
  /** Aggregate similar messages */
  aggregateSimilar: boolean;
  /** Max aggregated message count before collapsing */
  maxAggregateCount: number;
  /** Format output as markdown */
  markdownFormat: boolean;
  /** Include source information */
  includeSource: boolean;
  /** Include timestamp */
  includeTimestamp: boolean;
  /** Separator between messages */
  messageSeparator: string;
}

/**
 * Hook message injector statistics
 */
interface HookMessageInjectorStats {
  totalMessagesInjected: number;
  messagesByPriority: Record<MessagePriority, number>;
  messagesDeduplicated: number;
  messagesAggregated: number;
  lastInjectionTime?: number;
}

// State
let config: HookMessageInjectorConfig = {
  enabled: true,
  maxQueueSize: 100,
  deduplicateMessages: true,
  deduplicationWindowMs: 5000, // 5 seconds
  aggregateSimilar: true,
  maxAggregateCount: 5,
  markdownFormat: true,
  includeSource: false,
  includeTimestamp: true,
  messageSeparator: '\n\n---\n\n'
};

let stats: HookMessageInjectorStats = {
  totalMessagesInjected: 0,
  messagesByPriority: {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0
  },
  messagesDeduplicated: 0,
  messagesAggregated: 0
};

const messageQueue: InjectedMessage[] = [];
const recentMessages: Map<string, { count: number; lastTime: number }> = new Map();
let messageCounter = 0;

/**
 * Generates message hash for deduplication
 */
function getMessageHash(content: string, category?: string): string {
  // Simplified hash - just use first 100 chars + category
  const normalized = content.substring(0, 100).toLowerCase().replace(/\s+/g, ' ');
  return `${category || 'default'}:${normalized}`;
}

/**
 * Gets priority value for sorting
 */
function getPriorityValue(priority: MessagePriority): number {
  switch (priority) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'normal': return 2;
    case 'low': return 1;
  }
}

/**
 * Queues a message for injection
 */
export function queueMessage(
  content: string,
  options?: {
    priority?: MessagePriority;
    source?: string;
    category?: string;
    metadata?: Record<string, unknown>;
  }
): string | null {
  if (!config.enabled) return null;

  const priority = options?.priority || 'normal';
  const source = options?.source || 'unknown';
  const category = options?.category;

  // Check deduplication
  if (config.deduplicateMessages) {
    const hash = getMessageHash(content, category);
    const recent = recentMessages.get(hash);
    const now = Date.now();

    if (recent && (now - recent.lastTime) < config.deduplicationWindowMs) {
      recent.count++;
      recent.lastTime = now;
      stats.messagesDeduplicated++;

      // Check aggregation threshold
      if (config.aggregateSimilar && recent.count >= config.maxAggregateCount) {
        stats.messagesAggregated++;
        return null; // Don't add more, already aggregated
      }

      return null;
    }

    recentMessages.set(hash, { count: 1, lastTime: now });

    // Clean old entries
    for (const [key, value] of recentMessages) {
      if (now - value.lastTime > config.deduplicationWindowMs * 2) {
        recentMessages.delete(key);
      }
    }
  }

  const message: InjectedMessage = {
    id: `msg_${++messageCounter}`,
    content,
    priority,
    source,
    timestamp: Date.now(),
    category,
    metadata: options?.metadata
  };

  messageQueue.push(message);

  // Trim queue if needed
  while (messageQueue.length > config.maxQueueSize) {
    // Remove lowest priority oldest messages
    messageQueue.sort((a, b) => {
      const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });
    messageQueue.pop();
  }

  stats.totalMessagesInjected++;
  stats.messagesByPriority[priority]++;
  stats.lastInjectionTime = message.timestamp;

  logger.debug({
    messageId: message.id,
    priority,
    source
  }, 'Message queued for injection');

  return message.id;
}

/**
 * Formats a message for output
 */
function formatMessage(message: InjectedMessage): string {
  let formatted = message.content;

  if (config.markdownFormat) {
    // Wrap in blockquote for visual distinction
    if (message.priority === 'critical') {
      formatted = `> ⚠️ **CRITICAL**\n>\n> ${formatted.replace(/\n/g, '\n> ')}`;
    } else if (message.priority === 'high') {
      formatted = `> ❗ ${formatted.replace(/\n/g, '\n> ')}`;
    }
  }

  if (config.includeSource) {
    formatted += `\n\n_Source: ${message.source}_`;
  }

  if (config.includeTimestamp) {
    formatted += `\n_${new Date(message.timestamp).toLocaleTimeString()}_`;
  }

  return formatted;
}

/**
 * Flushes and formats all queued messages
 */
export function flushMessages(): string | null {
  if (messageQueue.length === 0) {
    return null;
  }

  // Sort by priority then timestamp
  messageQueue.sort((a, b) => {
    const priorityDiff = getPriorityValue(b.priority) - getPriorityValue(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return a.timestamp - b.timestamp;
  });

  const formatted = messageQueue
    .map(formatMessage)
    .join(config.messageSeparator);

  // Clear queue
  messageQueue.length = 0;

  return formatted;
}

/**
 * Gets pending messages without flushing
 */
export function getPendingMessages(): InjectedMessage[] {
  return [...messageQueue];
}

/**
 * Clears message queue
 */
export function clearMessageQueue(): void {
  messageQueue.length = 0;
  logger.debug('Message queue cleared');
}

/**
 * Hook: Process and inject queued messages on tool call
 */
const processMessagesOnToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:hook-message-injector:process-on-call',
  name: 'Hook Message Injector (Process on Tool Call)',
  description: 'Processes queued messages before tool execution',
  eventType: 'onToolCall',
  priority: 'high', // Run early to inject messages
  enabled: true,

  handler: async (): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const messages = flushMessages();

    if (messages) {
      return {
        decision: 'continue',
        injectMessage: messages,
        metadata: {
          messagesInjected: true,
          messageCount: messageQueue.length
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Inject remaining messages on tool result
 */
const injectMessagesOnResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:hook-message-injector:inject-on-result',
  name: 'Hook Message Injector (Inject on Result)',
  description: 'Injects any remaining queued messages after tool execution',
  eventType: 'onToolResult',
  priority: 'low', // Run late to collect all messages
  enabled: true,

  handler: async (): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const messages = flushMessages();

    if (messages) {
      return {
        decision: 'continue',
        injectMessage: messages,
        metadata: {
          messagesInjected: true
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All hook message injector hooks
 */
export const hookMessageInjectorHooks = [
  processMessagesOnToolCallHook,
  injectMessagesOnResultHook
] as HookDefinition[];

/**
 * Registers hook message injector hooks
 */
export function registerHookMessageInjectorHooks(): void {
  for (const hook of hookMessageInjectorHooks) {
    registerHook(hook);
  }
  logger.debug('Hook message injector hooks registered');
}

/**
 * Gets hook message injector statistics
 */
export function getHookMessageInjectorStats(): HookMessageInjectorStats & {
  config: HookMessageInjectorConfig;
  queueSize: number;
} {
  return {
    ...stats,
    config,
    queueSize: messageQueue.length
  };
}

/**
 * Resets hook message injector state
 */
export function resetHookMessageInjectorState(): void {
  stats = {
    totalMessagesInjected: 0,
    messagesByPriority: {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0
    },
    messagesDeduplicated: 0,
    messagesAggregated: 0
  };
  messageQueue.length = 0;
  recentMessages.clear();
  messageCounter = 0;
}

/**
 * Updates hook message injector configuration
 */
export function updateHookMessageInjectorConfig(updates: Partial<HookMessageInjectorConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Hook message injector config updated');
}

/**
 * Injects a message immediately (bypasses queue)
 */
export function injectImmediate(
  content: string,
  priority: MessagePriority = 'normal'
): string {
  const message: InjectedMessage = {
    id: `imm_${++messageCounter}`,
    content,
    priority,
    source: 'immediate',
    timestamp: Date.now()
  };

  stats.totalMessagesInjected++;
  stats.messagesByPriority[priority]++;
  stats.lastInjectionTime = message.timestamp;

  return formatMessage(message);
}

export default {
  registerHookMessageInjectorHooks,
  getHookMessageInjectorStats,
  resetHookMessageInjectorState,
  updateHookMessageInjectorConfig,
  queueMessage,
  flushMessages,
  getPendingMessages,
  clearMessageQueue,
  injectImmediate
};
