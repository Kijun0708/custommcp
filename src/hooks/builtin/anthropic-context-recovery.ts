// src/hooks/builtin/anthropic-context-recovery.ts

/**
 * Anthropic Context Window Recovery Hook
 *
 * Automatically detects and recovers from Anthropic context window exhaustion.
 * Handles the specific error patterns from Claude API.
 *
 * Features:
 * - Context limit detection
 * - Automatic compaction trigger
 * - Graceful degradation
 * - Recovery state management
 */

import {
  HookDefinition,
  HookResult,
  OnErrorContext,
  OnExpertCallContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Context recovery configuration
 */
interface AnthropicRecoveryConfig {
  /** Whether recovery is enabled */
  enabled: boolean;
  /** Error patterns that indicate context exhaustion */
  contextExhaustionPatterns: string[];
  /** Token threshold to trigger preemptive action */
  tokenWarningThreshold: number;
  /** Auto-trigger compaction on detection */
  autoCompaction: boolean;
  /** Max consecutive recovery attempts */
  maxRecoveryAttempts: number;
  /** Cooldown between recovery attempts (ms) */
  recoveryCooldownMs: number;
}

/**
 * Context recovery statistics
 */
interface AnthropicRecoveryStats {
  totalDetections: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  compactionsTriggered: number;
  lastDetectionTime?: number;
  lastRecoveryTime?: number;
  currentRecoveryAttempts: number;
}

// State
let config: AnthropicRecoveryConfig = {
  enabled: true,
  contextExhaustionPatterns: [
    'context_length_exceeded',
    'context window',
    'maximum context length',
    'token limit',
    'too many tokens',
    'prompt is too long',
    'exceeds the maximum',
    'context limit',
    'max_tokens'
  ],
  tokenWarningThreshold: 180000, // ~180K tokens warning
  autoCompaction: true,
  maxRecoveryAttempts: 3,
  recoveryCooldownMs: 5000
};

let stats: AnthropicRecoveryStats = {
  totalDetections: 0,
  successfulRecoveries: 0,
  failedRecoveries: 0,
  compactionsTriggered: 0,
  currentRecoveryAttempts: 0
};

let lastRecoveryAttempt = 0;
let recoveryInProgress = false;

/**
 * Checks if error indicates context exhaustion
 */
function isContextExhaustedError(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();

  return config.contextExhaustionPatterns.some(pattern =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Extracts token count from error message if available
 */
function extractTokenCount(errorMessage: string): number | null {
  // Try various patterns
  const patterns = [
    /(\d{1,3}(?:,\d{3})*)\s*tokens?/i,
    /token count[:\s]+(\d+)/i,
    /(\d+)\s*\/\s*\d+\s*tokens/i
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''), 10);
    }
  }

  return null;
}

/**
 * Generates recovery message
 */
function generateRecoveryMessage(attempt: number, maxAttempts: number): string {
  return `
🔄 **Context Window Recovery** (Attempt ${attempt}/${maxAttempts})

The context window limit has been reached. Initiating recovery:

1. ✂️ Compacting conversation history
2. 📋 Preserving critical context
3. 🔄 Resuming from checkpoint

Please wait while recovery completes...
`;
}

/**
 * Generates failure message
 */
function generateFailureMessage(): string {
  return `
❌ **Context Recovery Failed**

Unable to recover from context exhaustion after ${config.maxRecoveryAttempts} attempts.

**Recommended actions:**
1. Start a new conversation
2. Reduce the scope of your request
3. Break the task into smaller parts

The conversation history may need to be cleared to continue.
`;
}

/**
 * Hook: Detect context exhaustion on error
 */
const detectContextExhaustionHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:anthropic-context-recovery:detect',
  name: 'Anthropic Context Recovery (Detect)',
  description: 'Detects Anthropic context window exhaustion errors',
  eventType: 'onError',
  priority: 'critical',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check if this is a context exhaustion error
    if (!isContextExhaustedError(context.errorMessage)) {
      return { decision: 'continue' };
    }

    stats.totalDetections++;
    stats.lastDetectionTime = Date.now();

    const tokenCount = extractTokenCount(context.errorMessage);

    logger.warn({
      error: context.errorMessage,
      tokenCount,
      source: context.source,
      recoveryAttempts: stats.currentRecoveryAttempts
    }, 'Anthropic context window exhaustion detected');

    // Check cooldown
    const now = Date.now();
    if (now - lastRecoveryAttempt < config.recoveryCooldownMs) {
      logger.debug('Recovery cooldown active, skipping');
      return { decision: 'continue' };
    }

    // Check max attempts
    if (stats.currentRecoveryAttempts >= config.maxRecoveryAttempts) {
      stats.failedRecoveries++;
      stats.currentRecoveryAttempts = 0;

      return {
        decision: 'block',
        reason: generateFailureMessage(),
        metadata: {
          contextRecoveryFailed: true,
          attempts: config.maxRecoveryAttempts
        }
      };
    }

    // Attempt recovery
    stats.currentRecoveryAttempts++;
    lastRecoveryAttempt = now;
    recoveryInProgress = true;

    if (config.autoCompaction) {
      stats.compactionsTriggered++;
    }

    const recoveryMessage = generateRecoveryMessage(
      stats.currentRecoveryAttempts,
      config.maxRecoveryAttempts
    );

    return {
      decision: 'continue',
      injectMessage: recoveryMessage,
      metadata: {
        contextRecoveryTriggered: true,
        attempt: stats.currentRecoveryAttempts,
        tokenCount,
        autoCompaction: config.autoCompaction
      }
    };
  }
};

/**
 * Hook: Monitor expert calls for token usage
 */
const monitorExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:anthropic-context-recovery:monitor-call',
  name: 'Anthropic Context Recovery (Monitor Call)',
  description: 'Monitors expert calls for potential context issues',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // If recovery is in progress, add context preservation hint
    if (recoveryInProgress) {
      return {
        decision: 'modify',
        modifiedData: {
          contextHint: 'Recovery mode active - minimize context usage'
        },
        metadata: { recoveryMode: true }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track successful responses after recovery
 */
const trackRecoverySuccessHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:anthropic-context-recovery:track-success',
  name: 'Anthropic Context Recovery (Track Success)',
  description: 'Tracks successful expert responses after recovery attempt',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // If we were in recovery mode and got a successful response
    if (recoveryInProgress && context.response) {
      stats.successfulRecoveries++;
      stats.lastRecoveryTime = Date.now();
      recoveryInProgress = false;
      stats.currentRecoveryAttempts = 0;

      logger.info('Context recovery successful');

      return {
        decision: 'continue',
        injectMessage: '✅ Context recovery successful. Continuing...',
        metadata: { recoverySuccess: true }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All Anthropic context recovery hooks
 */
export const anthropicContextRecoveryHooks = [
  detectContextExhaustionHook,
  monitorExpertCallHook,
  trackRecoverySuccessHook
] as HookDefinition[];

/**
 * Registers Anthropic context recovery hooks
 */
export function registerAnthropicContextRecoveryHooks(): void {
  for (const hook of anthropicContextRecoveryHooks) {
    registerHook(hook);
  }
  logger.debug('Anthropic context recovery hooks registered');
}

/**
 * Gets Anthropic context recovery statistics
 */
export function getAnthropicRecoveryStats(): AnthropicRecoveryStats & {
  config: AnthropicRecoveryConfig;
  recoveryInProgress: boolean;
} {
  return {
    ...stats,
    config,
    recoveryInProgress
  };
}

/**
 * Resets Anthropic context recovery state
 */
export function resetAnthropicRecoveryState(): void {
  stats = {
    totalDetections: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    compactionsTriggered: 0,
    currentRecoveryAttempts: 0
  };
  lastRecoveryAttempt = 0;
  recoveryInProgress = false;
}

/**
 * Updates Anthropic context recovery configuration
 */
export function updateAnthropicRecoveryConfig(updates: Partial<AnthropicRecoveryConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Anthropic context recovery config updated');
}

/**
 * Manually triggers recovery mode
 */
export function triggerRecoveryMode(): void {
  recoveryInProgress = true;
  stats.currentRecoveryAttempts++;
  lastRecoveryAttempt = Date.now();
  logger.info('Manual recovery mode triggered');
}

/**
 * Exits recovery mode
 */
export function exitRecoveryMode(success: boolean): void {
  if (success) {
    stats.successfulRecoveries++;
  } else {
    stats.failedRecoveries++;
  }
  recoveryInProgress = false;
  stats.currentRecoveryAttempts = 0;
  logger.info({ success }, 'Recovery mode exited');
}

export default {
  registerAnthropicContextRecoveryHooks,
  getAnthropicRecoveryStats,
  resetAnthropicRecoveryState,
  updateAnthropicRecoveryConfig,
  triggerRecoveryMode,
  exitRecoveryMode
};
