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
  markItemComplete,
  clearIncompleteItems,
  updateEnforcerConfig
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

  // Cost Tracking Hook (low priority, runs after others)
  const hookManager = getHookManager();
  hookManager.registerHook(costTrackingHook);
}
