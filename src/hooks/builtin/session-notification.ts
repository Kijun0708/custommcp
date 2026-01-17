// src/hooks/builtin/session-notification.ts

/**
 * Session Notification Hook
 *
 * Provides notifications for important session events:
 * - Session/workflow start
 * - Error occurrences
 * - Session/workflow completion
 *
 * Can be configured to send notifications via various channels
 * (logging, external webhooks, etc.)
 */

import {
  HookDefinition,
  HookResult,
  OnServerStartContext,
  OnServerStopContext,
  OnWorkflowStartContext,
  OnWorkflowEndContext,
  OnErrorContext,
  OnRateLimitContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Notification types
 */
type NotificationType =
  | 'session_start'
  | 'session_stop'
  | 'workflow_start'
  | 'workflow_complete'
  | 'workflow_failed'
  | 'error'
  | 'rate_limit';

/**
 * Notification severity levels
 */
type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Notification record
 */
interface NotificationRecord {
  type: NotificationType;
  severity: NotificationSeverity;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for session notification
 */
interface NotificationConfig {
  /** Whether notifications are enabled */
  enabled: boolean;
  /** Whether to log notifications */
  logNotifications: boolean;
  /** Whether to inject notification messages */
  injectMessages: boolean;
  /** Minimum severity to notify */
  minSeverity: NotificationSeverity;
  /** Max notifications to keep in history */
  maxHistory: number;
  /** Notify on session start */
  notifyOnSessionStart: boolean;
  /** Notify on workflow start */
  notifyOnWorkflowStart: boolean;
  /** Notify on workflow completion */
  notifyOnWorkflowComplete: boolean;
  /** Notify on errors */
  notifyOnError: boolean;
  /** Notify on rate limits */
  notifyOnRateLimit: boolean;
}

/**
 * Statistics for notifications
 */
interface NotificationStats {
  totalNotifications: number;
  notificationsByType: Record<NotificationType, number>;
  notificationsBySeverity: Record<NotificationSeverity, number>;
  lastNotification?: NotificationRecord;
}

// State
let config: NotificationConfig = {
  enabled: true,
  logNotifications: true,
  injectMessages: false,
  minSeverity: 'info',
  maxHistory: 50,
  notifyOnSessionStart: true,
  notifyOnWorkflowStart: false,
  notifyOnWorkflowComplete: true,
  notifyOnError: true,
  notifyOnRateLimit: true
};

let stats: NotificationStats = {
  totalNotifications: 0,
  notificationsByType: {
    session_start: 0,
    session_stop: 0,
    workflow_start: 0,
    workflow_complete: 0,
    workflow_failed: 0,
    error: 0,
    rate_limit: 0
  },
  notificationsBySeverity: {
    info: 0,
    warning: 0,
    error: 0,
    critical: 0
  }
};

let notificationHistory: NotificationRecord[] = [];

/**
 * Severity order for comparison
 */
const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3
};

/**
 * Checks if severity meets minimum threshold
 */
function meetsSeverityThreshold(severity: NotificationSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[config.minSeverity];
}

/**
 * Creates and records a notification
 */
function createNotification(
  type: NotificationType,
  severity: NotificationSeverity,
  message: string,
  metadata?: Record<string, unknown>
): NotificationRecord | null {
  if (!config.enabled || !meetsSeverityThreshold(severity)) {
    return null;
  }

  const notification: NotificationRecord = {
    type,
    severity,
    message,
    timestamp: Date.now(),
    metadata
  };

  // Update stats
  stats.totalNotifications++;
  stats.notificationsByType[type]++;
  stats.notificationsBySeverity[severity]++;
  stats.lastNotification = notification;

  // Add to history
  notificationHistory.push(notification);
  if (notificationHistory.length > config.maxHistory) {
    notificationHistory = notificationHistory.slice(-config.maxHistory);
  }

  // Log if enabled
  if (config.logNotifications) {
    const logMethod = severity === 'critical' || severity === 'error'
      ? 'error'
      : severity === 'warning'
        ? 'warn'
        : 'info';

    logger[logMethod]({
      type,
      severity,
      ...metadata
    }, `[Notification] ${message}`);
  }

  return notification;
}

/**
 * Hook: Notify on server start
 */
const notifyServerStartHook: HookDefinition<OnServerStartContext> = {
  id: 'builtin:session-notification:server-start',
  name: 'Session Notification (Server Start)',
  description: 'Notifies when the MCP server starts',
  eventType: 'onServerStart',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.notifyOnSessionStart) return { decision: 'continue' };

    const notification = createNotification(
      'session_start',
      'info',
      `LLM Router MCP 서버 시작 (v${context.version}, ${context.toolCount} tools)`,
      {
        version: context.version,
        toolCount: context.toolCount
      }
    );

    if (notification && config.injectMessages) {
      return {
        decision: 'continue',
        injectMessage: `🚀 ${notification.message}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Notify on server stop
 */
const notifyServerStopHook: HookDefinition<OnServerStopContext> = {
  id: 'builtin:session-notification:server-stop',
  name: 'Session Notification (Server Stop)',
  description: 'Notifies when the MCP server stops',
  eventType: 'onServerStop',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    const uptimeMinutes = Math.round(context.uptimeMs / 60000);

    createNotification(
      'session_stop',
      'info',
      `서버 종료 (실행 시간: ${uptimeMinutes}분)`,
      { uptimeMs: context.uptimeMs }
    );

    return { decision: 'continue' };
  }
};

/**
 * Hook: Notify on workflow start
 */
const notifyWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:session-notification:workflow-start',
  name: 'Session Notification (Workflow Start)',
  description: 'Notifies when a workflow starts',
  eventType: 'onWorkflowStart',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.notifyOnWorkflowStart) return { decision: 'continue' };

    const requestPreview = context.request.length > 50
      ? context.request.substring(0, 50) + '...'
      : context.request;

    createNotification(
      'workflow_start',
      'info',
      `워크플로우 시작: ${requestPreview}`,
      {
        ralphLoopMode: context.ralphLoopMode,
        maxAttempts: context.maxAttempts
      }
    );

    return { decision: 'continue' };
  }
};

/**
 * Hook: Notify on workflow end
 */
const notifyWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:session-notification:workflow-end',
  name: 'Session Notification (Workflow End)',
  description: 'Notifies when a workflow completes or fails',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.notifyOnWorkflowComplete) return { decision: 'continue' };

    const durationSeconds = Math.round(context.totalDurationMs / 1000);
    const type = context.success ? 'workflow_complete' : 'workflow_failed';
    const severity = context.success ? 'info' : 'warning';

    const message = context.success
      ? `워크플로우 완료 (${durationSeconds}초, ${context.phasesExecuted.length} phases)`
      : `워크플로우 실패 (${context.escalated ? '에스컬레이션됨' : '실패'})`;

    const notification = createNotification(
      type,
      severity,
      message,
      {
        success: context.success,
        phases: context.phasesExecuted,
        durationMs: context.totalDurationMs,
        escalated: context.escalated
      }
    );

    if (notification && config.injectMessages && !context.success) {
      return {
        decision: 'continue',
        injectMessage: `⚠️ ${notification.message}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Notify on errors
 */
const notifyErrorHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:session-notification:error',
  name: 'Session Notification (Error)',
  description: 'Notifies when errors occur',
  eventType: 'onError',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.notifyOnError) return { decision: 'continue' };

    const severity: NotificationSeverity = context.recoverable ? 'warning' : 'error';

    const notification = createNotification(
      'error',
      severity,
      `에러 발생: ${context.errorMessage}`,
      {
        source: context.source,
        errorCode: context.errorCode,
        recoverable: context.recoverable
      }
    );

    if (notification && config.injectMessages) {
      return {
        decision: 'continue',
        injectMessage: `❌ [${context.source}] ${context.errorMessage}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Notify on rate limits
 */
const notifyRateLimitHook: HookDefinition<OnRateLimitContext> = {
  id: 'builtin:session-notification:rate-limit',
  name: 'Session Notification (Rate Limit)',
  description: 'Notifies when rate limits are hit',
  eventType: 'onRateLimit',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.notifyOnRateLimit) return { decision: 'continue' };

    const retryInfo = context.retryAfterSeconds
      ? ` (재시도: ${context.retryAfterSeconds}초 후)`
      : '';

    const notification = createNotification(
      'rate_limit',
      'warning',
      `Rate limit 도달: ${context.provider}/${context.model}${retryInfo}`,
      {
        provider: context.provider,
        model: context.model,
        expertId: context.expertId,
        retryAfterSeconds: context.retryAfterSeconds,
        fallbackAvailable: context.fallbackAvailable
      }
    );

    if (notification && config.injectMessages) {
      return {
        decision: 'continue',
        injectMessage: `⏳ ${notification.message}`
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * All session notification hooks
 */
export const sessionNotificationHooks = [
  notifyServerStartHook,
  notifyServerStopHook,
  notifyWorkflowStartHook,
  notifyWorkflowEndHook,
  notifyErrorHook,
  notifyRateLimitHook
] as HookDefinition[];

/**
 * Registers session notification hooks
 */
export function registerSessionNotificationHooks(): void {
  for (const hook of sessionNotificationHooks) {
    registerHook(hook);
  }
  logger.debug('Session notification hooks registered');
}

/**
 * Gets notification statistics
 */
export function getSessionNotificationStats(): NotificationStats & {
  config: NotificationConfig;
  historyCount: number;
} {
  return {
    ...stats,
    config,
    historyCount: notificationHistory.length
  };
}

/**
 * Gets notification history
 */
export function getNotificationHistory(limit?: number): NotificationRecord[] {
  if (limit) {
    return notificationHistory.slice(-limit);
  }
  return [...notificationHistory];
}

/**
 * Resets notification state
 */
export function resetSessionNotificationState(): void {
  stats = {
    totalNotifications: 0,
    notificationsByType: {
      session_start: 0,
      session_stop: 0,
      workflow_start: 0,
      workflow_complete: 0,
      workflow_failed: 0,
      error: 0,
      rate_limit: 0
    },
    notificationsBySeverity: {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0
    }
  };
  notificationHistory = [];
}

/**
 * Updates notification configuration
 */
export function updateSessionNotificationConfig(updates: Partial<NotificationConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Session notification config updated');
}

export default {
  registerSessionNotificationHooks,
  getSessionNotificationStats,
  getNotificationHistory,
  resetSessionNotificationState,
  updateSessionNotificationConfig
};
