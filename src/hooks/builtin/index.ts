// src/hooks/builtin/index.ts

/**
 * Built-in Hooks Index
 *
 * Exports all built-in hooks for easy registration.
 */

export { loggingHooks, registerLoggingHooks } from './logging.js';
export { contextInjectorHooks, registerContextInjectorHooks } from './context-injector.js';
export { rateLimitHooks, registerRateLimitHooks } from './rate-limit-handler.js';
export { errorRecoveryHooks, registerErrorRecoveryHooks } from './error-recovery.js';
export { keywordDetectorHooks, registerKeywordDetectorHooks } from './keyword-detector.js';
export { permissionCheckerHooks, registerPermissionCheckerHooks } from './permission-checker.js';
export { costTrackerHooks, registerCostTrackingHook } from './cost-tracker.js';
export {
  registerContextMonitorHooks,
  getContextUsageStats,
  resetContextState,
  updateContextMonitorConfig
} from './context-window-monitor.js';
export {
  registerToolOutputTruncatorHook,
  updateTruncatorConfig,
  getTruncatorStats
} from './tool-output-truncator.js';
export {
  registerTodoContinuationEnforcerHooks,
  getEnforcerStats,
  resetEnforcerState,
  updateEnforcerConfig,
  addTodo,
  updateTodoStatus,
  clearTodos,
  getTrackedTodos,
  setContinuationCallback,
  setRecoveryMode,
  checkIdle
} from './todo-continuation-enforcer.js';
export {
  registerSessionRecoveryHooks,
  getSessionRecoveryStats,
  resetSessionRecoveryState,
  updateSessionRecoveryConfig
} from './session-recovery.js';
export {
  registerEditErrorRecoveryHooks,
  getEditRecoveryStats,
  resetEditRecoveryState,
  updateEditRecoveryConfig
} from './edit-error-recovery.js';
export {
  registerCommentCheckerHooks,
  getCommentCheckerStats,
  resetCommentCheckerState,
  updateCommentCheckerConfig
} from './comment-checker.js';
export {
  registerDirectoryInjectorHooks,
  getDirectoryInjectorStats,
  resetDirectoryInjectorState,
  clearDirectoryInjectorCache,
  updateDirectoryInjectorConfig
} from './directory-injector.js';
export {
  registerMagicKeywordsHooks,
  getMagicKeywordsStats,
  resetMagicKeywordsState,
  clearActiveKeywords,
  updateMagicKeywordsConfig,
  MagicKeywordType
} from './magic-keywords.js';
export {
  registerEmptyMessageSanitizerHooks,
  getEmptyMessageSanitizerStats,
  resetEmptyMessageSanitizerState,
  updateEmptyMessageSanitizerConfig
} from './empty-message-sanitizer.js';
export {
  registerThinkingBlockValidatorHooks,
  getThinkingBlockValidatorStats,
  resetThinkingBlockValidatorState,
  updateThinkingBlockValidatorConfig,
  validateContent
} from './thinking-block-validator.js';
export {
  registerPreemptiveCompactionHooks,
  getPreemptiveCompactionStats,
  resetPreemptiveCompactionState,
  updatePreemptiveCompactionConfig,
  triggerCompaction,
  addPreservedMarker,
  getPreservedContext
} from './preemptive-compaction.js';
export {
  registerCompactionContextInjectorHooks,
  getCompactionContextInjectorStats,
  resetCompactionContextInjectorState,
  updateCompactionContextInjectorConfig,
  addContextElement,
  getPreservedContextElements,
  clearPreservedElements
} from './compaction-context-injector.js';
export {
  registerSessionNotificationHooks,
  getSessionNotificationStats,
  getNotificationHistory,
  resetSessionNotificationState,
  updateSessionNotificationConfig
} from './session-notification.js';
export {
  registerAgentUsageReminderHooks,
  getAgentUsageReminderStats,
  resetAgentUsageReminderState,
  updateAgentUsageReminderConfig,
  detectExperts
} from './agent-usage-reminder.js';
export {
  registerAutoResumeHooks,
  getAutoResumeStats,
  resetAutoResumeState,
  updateAutoResumeConfig,
  checkForResume,
  saveCurrentState
} from './auto-resume.js';
export {
  registerDoomLoopDetectorHooks,
  getDoomLoopDetectorStats,
  resetDoomLoopDetectorState,
  updateDoomLoopDetectorConfig,
  breakLoop
} from './doom-loop-detector.js';
export {
  registerAggressiveTruncationHooks,
  getAggressiveTruncationStats,
  resetAggressiveTruncationState,
  updateAggressiveTruncationConfig,
  setTruncationLevel,
  autoAdjustLevel
} from './aggressive-truncation.js';
export {
  registerDynamicContextPruningHooks,
  getDynamicContextPruningStats,
  resetDynamicContextPruningState,
  updateDynamicContextPruningConfig,
  triggerPrune,
  getContextSummary,
  addAnchor
} from './dynamic-context-pruning.js';

// Phase 1: Core Hooks
export {
  registerRulesInjectorHooks,
  getRulesInjectorStats,
  resetRulesInjectorState,
  updateRulesInjectorConfig,
  getLoadedRules
} from './rules-injector.js';
export {
  registerThinkModeHooks,
  getThinkModeStats,
  resetThinkModeState,
  updateThinkModeConfig,
  activateThinkMode,
  deactivateThinkMode
} from './think-mode.js';
export {
  registerAutoSlashCommandHooks,
  getAutoSlashCommandStats,
  resetAutoSlashCommandState,
  updateAutoSlashCommandConfig
} from './auto-slash-command.js';
export {
  registerSisyphusOrchestratorHooks,
  getSisyphusOrchestratorStats,
  resetSisyphusOrchestratorState,
  updateSisyphusOrchestratorConfig
} from './sisyphus-orchestrator.js';

// Phase 2: Stability Hooks
export {
  registerAnthropicContextRecoveryHooks,
  getAnthropicRecoveryStats,
  resetAnthropicRecoveryState,
  updateAnthropicRecoveryConfig
} from './anthropic-context-recovery.js';
export {
  registerNonInteractiveEnvHooks,
  getNonInteractiveEnvStats,
  resetNonInteractiveEnvState,
  updateNonInteractiveEnvConfig,
  addDangerousPattern,
  setInteractiveMode
} from './non-interactive-env.js';
export {
  registerStartWorkHooks,
  getStartWorkStats,
  resetStartWorkState,
  updateStartWorkConfig,
  manualCheckpoint,
  getCurrentSession,
  resumeSession,
  listSessions
} from './start-work.js';
export {
  registerTaskResumeInfoHooks,
  getTaskResumeInfoStats,
  resetTaskResumeInfoState,
  updateTaskResumeInfoConfig,
  getExtractedResumeInfos,
  getMostRecentResumeInfo,
  findBySessionId,
  findByTaskId,
  clearStoredInfos
} from './task-resume-info.js';

// Phase 4: UX Hooks
export {
  registerAutoUpdateCheckerHooks,
  getAutoUpdateCheckerStats,
  resetAutoUpdateCheckerState,
  updateAutoUpdateCheckerConfig,
  manualUpdateCheck,
  getLastVersionInfo
} from './auto-update-checker.js';
export {
  registerTaskToastManagerHooks,
  getTaskToastManagerStats,
  resetTaskToastManagerState,
  updateTaskToastManagerConfig,
  getToastHistory,
  showToast
} from './task-toast-manager.js';
export {
  registerHookMessageInjectorHooks,
  getHookMessageInjectorStats,
  resetHookMessageInjectorState,
  updateHookMessageInjectorConfig,
  queueMessage,
  flushMessages,
  getPendingMessages,
  clearMessageQueue,
  injectImmediate
} from './hook-message-injector.js';
export {
  registerPrometheusMdOnlyHooks,
  getPrometheusMdOnlyStats,
  resetPrometheusMdOnlyState,
  updatePrometheusMdOnlyConfig,
  processMarkdown,
  validateMarkdown
} from './prometheus-md-only.js';

// Phase 5: HUD Hooks
export {
  registerHudStateUpdaterHooks,
  getHudStats,
  hudStateUpdaterHooks
} from './hud-state-updater.js';

import { registerLoggingHooks } from './logging.js';
import { registerContextInjectorHooks } from './context-injector.js';
import { registerRateLimitHooks } from './rate-limit-handler.js';
import { registerErrorRecoveryHooks } from './error-recovery.js';
import { registerKeywordDetectorHooks } from './keyword-detector.js';
import { registerPermissionCheckerHooks } from './permission-checker.js';
import { costTrackingHook } from './cost-tracker.js';
import { registerContextMonitorHooks } from './context-window-monitor.js';
import { registerToolOutputTruncatorHook } from './tool-output-truncator.js';
import { registerTodoContinuationEnforcerHooks } from './todo-continuation-enforcer.js';
import { registerSessionRecoveryHooks } from './session-recovery.js';
import { registerEditErrorRecoveryHooks } from './edit-error-recovery.js';
import { registerCommentCheckerHooks } from './comment-checker.js';
import { registerDirectoryInjectorHooks } from './directory-injector.js';
import { registerMagicKeywordsHooks } from './magic-keywords.js';
import { registerEmptyMessageSanitizerHooks } from './empty-message-sanitizer.js';
import { registerThinkingBlockValidatorHooks } from './thinking-block-validator.js';
import { registerPreemptiveCompactionHooks } from './preemptive-compaction.js';
import { registerCompactionContextInjectorHooks } from './compaction-context-injector.js';
import { registerSessionNotificationHooks } from './session-notification.js';
import { registerAgentUsageReminderHooks } from './agent-usage-reminder.js';
import { registerAutoResumeHooks } from './auto-resume.js';
import { registerDoomLoopDetectorHooks } from './doom-loop-detector.js';
import { registerAggressiveTruncationHooks } from './aggressive-truncation.js';
import { registerDynamicContextPruningHooks } from './dynamic-context-pruning.js';
// Phase 1: Core Hooks
import { registerRulesInjectorHooks } from './rules-injector.js';
import { registerThinkModeHooks } from './think-mode.js';
import { registerAutoSlashCommandHooks } from './auto-slash-command.js';
import { registerSisyphusOrchestratorHooks } from './sisyphus-orchestrator.js';
// Phase 2: Stability Hooks
import { registerAnthropicContextRecoveryHooks } from './anthropic-context-recovery.js';
import { registerNonInteractiveEnvHooks } from './non-interactive-env.js';
import { registerStartWorkHooks } from './start-work.js';
import { registerTaskResumeInfoHooks } from './task-resume-info.js';
// Phase 4: UX Hooks
import { registerAutoUpdateCheckerHooks } from './auto-update-checker.js';
import { registerTaskToastManagerHooks } from './task-toast-manager.js';
import { registerHookMessageInjectorHooks } from './hook-message-injector.js';
import { registerPrometheusMdOnlyHooks } from './prometheus-md-only.js';
import { registerHudStateUpdaterHooks } from './hud-state-updater.js';
import { getHookManager } from '../manager.js';

/**
 * Registers all built-in hooks.
 */
export function registerAllBuiltinHooks(): void {
  registerLoggingHooks();
  registerContextInjectorHooks();
  registerRateLimitHooks();
  registerErrorRecoveryHooks();
  registerKeywordDetectorHooks();
  registerPermissionCheckerHooks();

  // Phase 2: Context Management Hooks
  registerContextMonitorHooks();
  registerToolOutputTruncatorHook();
  registerTodoContinuationEnforcerHooks();

  // Phase 3: Stability/Recovery Hooks
  registerSessionRecoveryHooks();
  registerEditErrorRecoveryHooks();
  registerCommentCheckerHooks();

  // Phase 4: Directory Injector Hooks
  registerDirectoryInjectorHooks();

  // Phase 5: Magic Keywords Hooks
  registerMagicKeywordsHooks();

  // Medium Priority: Message Sanitization Hooks
  registerEmptyMessageSanitizerHooks();
  registerThinkingBlockValidatorHooks();

  // Medium Priority: Compaction Hooks
  registerPreemptiveCompactionHooks();
  registerCompactionContextInjectorHooks();

  // Lower Priority: Notification and Reminder Hooks
  registerSessionNotificationHooks();
  registerAgentUsageReminderHooks();

  // Experimental: Auto-resume and Loop Detection
  registerAutoResumeHooks();
  registerDoomLoopDetectorHooks();
  registerAggressiveTruncationHooks();
  registerDynamicContextPruningHooks();

  // New Phase 1: Core Hooks (oh-my-opencode)
  registerRulesInjectorHooks();
  registerThinkModeHooks();
  registerAutoSlashCommandHooks();
  registerSisyphusOrchestratorHooks();

  // New Phase 2: Stability Hooks (oh-my-opencode)
  registerAnthropicContextRecoveryHooks();
  registerNonInteractiveEnvHooks();
  registerStartWorkHooks();
  registerTaskResumeInfoHooks();

  // New Phase 4: UX Hooks (oh-my-opencode)
  registerAutoUpdateCheckerHooks();
  registerTaskToastManagerHooks();
  registerHookMessageInjectorHooks();
  registerPrometheusMdOnlyHooks();

  // Phase 5: HUD State Updater Hooks
  registerHudStateUpdaterHooks();

  // Cost Tracking Hook (low priority, runs after others)
  const hookManager = getHookManager();
  hookManager.registerHook(costTrackingHook);
}
