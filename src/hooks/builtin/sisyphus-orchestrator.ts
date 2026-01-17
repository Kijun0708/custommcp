// src/hooks/builtin/sisyphus-orchestrator.ts

/**
 * Sisyphus Orchestrator Hook (oh-my-opencode Style)
 *
 * Main orchestration hook that enforces delegation-based task completion.
 * Named after Sisyphus - continuously working to push the boulder uphill.
 *
 * Core Principles (from oh-my-opencode):
 * 1. DELEGATION REQUIRED - Orchestrator should NEVER modify code directly
 * 2. SUBAGENTS LIE - Always verify subagent work independently
 * 3. PERSISTENCE - Keep pushing until the boulder reaches the top
 *
 * Features:
 * - Delegation enforcement with warnings
 * - "Subagents LIE" verification reminders
 * - Pending file path tracking
 * - Session state management
 * - Integration with Boulder State
 * - Auto-continuation on idle
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext,
  OnExpertCallContext,
  OnExpertResultContext,
  OnWorkflowStartContext,
  OnWorkflowEndContext,
  OnWorkflowPhaseContext,
  OnErrorContext,
  OnAssistantResponseContext,
  OnBoulderContinuationContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { getBoulderManager } from '../../features/boulder-state/manager.js';

// ============ Types ============

/**
 * Task intent classification
 */
type TaskIntent =
  | 'conceptual'
  | 'implementation'
  | 'debugging'
  | 'refactoring'
  | 'research'
  | 'review'
  | 'documentation'
  | 'quick'
  | 'unknown';

/**
 * Workflow phase
 */
type WorkflowPhase =
  | 'intent'
  | 'assessment'
  | 'exploration'
  | 'planning'
  | 'implementation'
  | 'verification'
  | 'recovery'
  | 'completion';

/**
 * Tools that modify files (delegation targets)
 */
const CODE_MODIFYING_TOOLS = [
  'write_file',
  'edit_file',
  'create_file',
  'delete_file',
  'move_file',
  'rename_file',
  'patch_file',
  'apply_diff'
];

/**
 * Orchestrator configuration
 */
interface OrchestratorConfig {
  /** Whether orchestration is enabled */
  enabled: boolean;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Enforce delegation (warn when orchestrator tries to modify code) */
  enforceDelegation: boolean;
  /** Inject "Subagents LIE" warning */
  injectSubagentWarning: boolean;
  /** Track pending file modifications */
  trackPendingFiles: boolean;
  /** Auto-continue on idle */
  autoContinue: boolean;
  /** Intent classification patterns */
  intentPatterns: Record<TaskIntent, string[]>;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  enabled: true,
  maxAttempts: 3,
  enforceDelegation: true,
  injectSubagentWarning: true,
  trackPendingFiles: true,
  autoContinue: true,
  intentPatterns: {
    conceptual: ['design', 'architect', 'plan', 'strategy', '설계', '아키텍처', '계획'],
    implementation: ['implement', 'create', 'build', 'add', '구현', '생성', '추가'],
    debugging: ['fix', 'bug', 'error', 'debug', '수정', '버그', '에러'],
    refactoring: ['refactor', 'improve', 'optimize', '리팩토링', '개선', '최적화'],
    research: ['research', 'investigate', 'explore', '조사', '탐구'],
    review: ['review', 'check', 'validate', '리뷰', '검토'],
    documentation: ['document', 'readme', 'comment', '문서', '설명'],
    quick: ['quick', 'simple', 'small', '빠른', '간단'],
    unknown: []
  }
};

let config: OrchestratorConfig = { ...DEFAULT_CONFIG };

/**
 * Session state for Sisyphus orchestrator
 */
interface SessionState {
  /** Current task ID */
  currentTaskId?: string;
  /** Current task intent */
  currentIntent?: TaskIntent;
  /** Current workflow phase */
  currentPhase: WorkflowPhase;
  /** Files with pending modifications */
  pendingFilePaths: Set<string>;
  /** Whether last event was an abort error */
  lastEventWasAbortError: boolean;
  /** Subagent calls made in current session */
  subagentCallCount: number;
  /** Warnings issued count */
  warningsIssued: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Total delegations in session */
  totalDelegations: number;
  /** Direct modification attempts (violations) */
  directModificationAttempts: number;
}

let sessionState: SessionState = {
  currentPhase: 'intent',
  pendingFilePaths: new Set(),
  lastEventWasAbortError: false,
  subagentCallCount: 0,
  warningsIssued: 0,
  lastActivityAt: Date.now(),
  totalDelegations: 0,
  directModificationAttempts: 0
};

/**
 * Statistics
 */
interface OrchestratorStats {
  totalTasksOrchestrated: number;
  successfulTasks: number;
  failedTasks: number;
  totalSubagentCalls: number;
  delegationViolations: number;
  averageTaskDuration: number;
}

let stats: OrchestratorStats = {
  totalTasksOrchestrated: 0,
  successfulTasks: 0,
  failedTasks: 0,
  totalSubagentCalls: 0,
  delegationViolations: 0,
  averageTaskDuration: 0
};

const taskDurations: number[] = [];

// ============ Utility Functions ============

/**
 * Classifies task intent from prompt
 */
function classifyIntent(prompt: string): TaskIntent {
  const lowerPrompt = prompt.toLowerCase();

  for (const [intent, patterns] of Object.entries(config.intentPatterns)) {
    if (intent === 'unknown') continue;

    for (const pattern of patterns) {
      if (lowerPrompt.includes(pattern.toLowerCase())) {
        return intent as TaskIntent;
      }
    }
  }

  return 'unknown';
}

/**
 * Generates the DELEGATION REQUIRED warning message
 */
function generateDelegationWarning(toolName: string, filePath?: string): string {
  return `⚠️ [CRITICAL SYSTEM DIRECTIVE - DELEGATION REQUIRED]

🚨 **직접 코드 수정 시도가 감지되었습니다!**

Tool: \`${toolName}\`${filePath ? `\nFile: \`${filePath}\`` : ''}

📋 **Sisyphus 오케스트레이션 규칙:**
1. 오케스트레이터(당신)는 **절대로** 직접 코드를 수정하면 안 됩니다
2. 코드 수정은 반드시 **서브에이전트에게 위임**해야 합니다
3. 위임 후에는 결과를 **직접 검증**해야 합니다

🎯 **올바른 접근 방식:**
- \`consult_expert\` 또는 \`route_by_category\`를 사용하여 전문가에게 위임
- 위임 시 명확한 지시사항과 검증 기준을 포함
- 결과를 LSP, 테스트, 또는 직접 읽기로 검증

❌ **금지된 행동:**
- 직접 파일 쓰기/수정
- 서브에이전트 응답을 검증 없이 신뢰

다시 시도하되, 이번에는 적절한 전문가에게 위임하세요.`;
}

/**
 * Generates the SUBAGENTS LIE warning message
 */
function generateSubagentWarning(expertId: string): string {
  return `⚠️ [VERIFICATION REMINDER - SUBAGENTS LIE]

📋 **서브에이전트 응답 검증 필요**

Expert: \`${expertId}\`

🔍 **중요한 사실:**
- 서브에이전트는 때때로 **거짓말**을 합니다
- "완료했습니다", "수정했습니다"는 **검증 없이 신뢰하면 안 됩니다**

✅ **검증 체크리스트:**
1. [ ] 파일이 실제로 수정되었는지 직접 확인
2. [ ] LSP로 타입 에러 확인
3. [ ] 테스트 실행으로 기능 검증
4. [ ] 빌드가 성공하는지 확인

🎯 **다음 단계:**
- 위 검증 항목 중 하나 이상을 수행하세요
- 검증 결과에 따라 다음 작업을 결정하세요`;
}

/**
 * Records activity
 */
function recordActivity(): void {
  sessionState.lastActivityAt = Date.now();

  const boulderManager = getBoulderManager();
  boulderManager.recordActivity();
}

/**
 * Adds pending file path
 */
function addPendingFile(filePath: string): void {
  sessionState.pendingFilePaths.add(filePath);

  if (config.trackPendingFiles) {
    const boulderManager = getBoulderManager();
    boulderManager.addPendingFilePath(filePath);
  }
}

/**
 * Removes pending file path
 */
function removePendingFile(filePath: string): void {
  sessionState.pendingFilePaths.delete(filePath);

  if (config.trackPendingFiles) {
    const boulderManager = getBoulderManager();
    boulderManager.removePendingFilePath(filePath);
  }
}

// ============ Hooks ============

/**
 * Hook: Initialize orchestration on workflow start
 */
const workflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:sisyphus:workflow-start',
  name: 'Sisyphus Orchestrator (Workflow Start)',
  description: 'Initializes Sisyphus orchestration at workflow start',
  eventType: 'onWorkflowStart',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Reset session state
    sessionState = {
      currentTaskId: `sisyphus_${Date.now()}`,
      currentIntent: classifyIntent(context.request),
      currentPhase: 'intent',
      pendingFilePaths: new Set(),
      lastEventWasAbortError: false,
      subagentCallCount: 0,
      warningsIssued: 0,
      lastActivityAt: Date.now(),
      totalDelegations: 0,
      directModificationAttempts: 0
    };

    stats.totalTasksOrchestrated++;

    logger.info({
      taskId: sessionState.currentTaskId,
      intent: sessionState.currentIntent
    }, '[Sisyphus] Orchestration initialized');

    const message = `🎯 **Sisyphus 오케스트레이션 시작**

**Task ID:** \`${sessionState.currentTaskId}\`
**Intent:** ${sessionState.currentIntent}

📋 **오케스트레이션 규칙:**
1. 코드 수정은 반드시 전문가에게 **위임**
2. 서브에이전트 응답은 반드시 **검증**
3. 모든 작업이 완료될 때까지 **계속 진행**

🚀 작업을 시작하세요!`;

    return {
      decision: 'continue',
      injectMessage: message,
      metadata: {
        sisyphusTaskId: sessionState.currentTaskId,
        intent: sessionState.currentIntent
      }
    };
  }
};

/**
 * Hook: Enforce delegation on tool calls
 */
const enforceDelgationHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:sisyphus:enforce-delegation',
  name: 'Sisyphus Orchestrator (Enforce Delegation)',
  description: 'Warns when orchestrator attempts direct code modification',
  eventType: 'onToolCall',
  priority: 'critical',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.enforceDelegation) {
      return { decision: 'continue' };
    }

    recordActivity();

    // Check if this is a code-modifying tool
    if (CODE_MODIFYING_TOOLS.some(tool => context.toolName.toLowerCase().includes(tool))) {
      const filePath = (context.toolInput as any)?.file_path ||
                       (context.toolInput as any)?.path ||
                       (context.toolInput as any)?.filePath;

      sessionState.directModificationAttempts++;
      sessionState.warningsIssued++;
      stats.delegationViolations++;

      logger.warn({
        tool: context.toolName,
        filePath,
        violations: sessionState.directModificationAttempts
      }, '[Sisyphus] Direct modification attempt detected');

      // Add to pending files for tracking
      if (filePath) {
        addPendingFile(filePath);
      }

      const warning = generateDelegationWarning(context.toolName, filePath);

      return {
        decision: 'continue',  // Don't block, just warn
        injectMessage: warning,
        metadata: {
          delegationViolation: true,
          tool: context.toolName,
          filePath,
          violationCount: sessionState.directModificationAttempts
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track tool results for pending files
 */
const trackToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:sisyphus:track-tool-result',
  name: 'Sisyphus Orchestrator (Track Tool Result)',
  description: 'Tracks tool results for file modification tracking',
  eventType: 'onToolResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.trackPendingFiles) {
      return { decision: 'continue' };
    }

    recordActivity();

    // If tool succeeded and was file-modifying, remove from pending
    if (context.success) {
      const filePath = (context.toolInput as any)?.file_path ||
                       (context.toolInput as any)?.path ||
                       (context.toolInput as any)?.filePath;

      if (filePath && sessionState.pendingFilePaths.has(filePath)) {
        removePendingFile(filePath);

        logger.debug({
          tool: context.toolName,
          filePath
        }, '[Sisyphus] File modification completed');
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track expert calls (delegation)
 */
const trackExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:sisyphus:track-expert-call',
  name: 'Sisyphus Orchestrator (Track Expert Call)',
  description: 'Tracks expert calls as delegations',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    recordActivity();

    sessionState.subagentCallCount++;
    sessionState.totalDelegations++;
    stats.totalSubagentCalls++;

    logger.debug({
      expertId: context.expertId,
      delegationCount: sessionState.totalDelegations
    }, '[Sisyphus] Expert delegation made');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Inject subagent warning after expert result
 */
const subagentWarningHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:sisyphus:subagent-warning',
  name: 'Sisyphus Orchestrator (Subagent Warning)',
  description: 'Injects "Subagents LIE" warning after expert responses',
  eventType: 'onExpertResult',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.injectSubagentWarning) {
      return { decision: 'continue' };
    }

    recordActivity();

    // Check if response claims completion
    const claimsCompletion = /(?:완료|완성|done|complete|finished|수정했|implemented)/i.test(context.response);

    if (claimsCompletion) {
      const warning = generateSubagentWarning(context.expertId);

      logger.debug({
        expertId: context.expertId,
        claimsCompletion
      }, '[Sisyphus] Subagent claimed completion - warning injected');

      return {
        decision: 'continue',
        injectMessage: warning,
        metadata: {
          subagentWarning: true,
          expertId: context.expertId,
          claimsCompletion
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track workflow phase transitions
 */
const phaseTransitionHook: HookDefinition<OnWorkflowPhaseContext> = {
  id: 'builtin:sisyphus:phase-transition',
  name: 'Sisyphus Orchestrator (Phase Transition)',
  description: 'Tracks workflow phase transitions',
  eventType: 'onWorkflowPhase',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    recordActivity();

    const newPhase = context.phaseId as WorkflowPhase;
    const oldPhase = sessionState.currentPhase;
    sessionState.currentPhase = newPhase;

    logger.debug({
      oldPhase,
      newPhase,
      attemptNumber: context.attemptNumber
    }, '[Sisyphus] Phase transition');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Handle errors with recovery guidance
 */
const errorRecoveryHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:sisyphus:error-recovery',
  name: 'Sisyphus Orchestrator (Error Recovery)',
  description: 'Handles errors and provides recovery guidance',
  eventType: 'onError',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check if this is an abort error
    const isAbortError = /abort|cancel|interrupt/i.test(context.errorMessage);
    sessionState.lastEventWasAbortError = isAbortError;

    // Update Boulder state
    const boulderManager = getBoulderManager();
    boulderManager.setLastEventWasAbortError(isAbortError);

    logger.warn({
      error: context.errorMessage,
      source: context.source,
      isAbort: isAbortError,
      recoverable: context.recoverable
    }, '[Sisyphus] Error occurred');

    if (!context.recoverable) {
      stats.failedTasks++;

      return {
        decision: 'continue',
        injectMessage: `❌ [Sisyphus 복구 불가 에러]

에러: ${context.errorMessage}
소스: ${context.source}

이 에러는 복구가 불가능합니다. 사용자에게 상황을 설명하고 대안을 제시하세요.`
      };
    }

    sessionState.currentPhase = 'recovery';

    return {
      decision: 'continue',
      injectMessage: `⚠️ [Sisyphus 복구 모드]

에러: ${context.errorMessage}
소스: ${context.source}

복구를 시도합니다. 다른 접근 방식을 사용하세요.`
    };
  }
};

/**
 * Hook: Handle assistant response for code modification detection
 */
const assistantResponseHook: HookDefinition<OnAssistantResponseContext> = {
  id: 'builtin:sisyphus:assistant-response',
  name: 'Sisyphus Orchestrator (Assistant Response)',
  description: 'Monitors assistant responses for delegation compliance',
  eventType: 'onAssistantResponse',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    recordActivity();

    // Check if response contains code modifications without delegation
    if (context.hasCodeModifications && !context.containsDelegation) {
      sessionState.directModificationAttempts++;

      logger.warn({
        modifiedFiles: context.modifiedFiles,
        containsDelegation: context.containsDelegation
      }, '[Sisyphus] Code modification without delegation detected');
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Handle boulder continuation trigger
 */
const boulderContinuationHook: HookDefinition<OnBoulderContinuationContext> = {
  id: 'builtin:sisyphus:boulder-continuation',
  name: 'Sisyphus Orchestrator (Boulder Continuation)',
  description: 'Handles boulder continuation prompts',
  eventType: 'onBoulderContinuation',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.autoContinue) {
      return { decision: 'continue' };
    }

    // Generate continuation prompt
    const boulderManager = getBoulderManager();
    const prompt = boulderManager.generateContinuationPrompt();

    if (prompt) {
      boulderManager.incrementContinuationCount();

      logger.info({
        boulderId: context.boulderId,
        remainingTasks: context.remainingTasksCount,
        attempts: context.attemptsMade
      }, '[Sisyphus] Boulder continuation triggered');

      return {
        decision: 'continue',
        injectMessage: prompt,
        metadata: {
          boulderContinuation: true,
          boulderId: context.boulderId,
          remainingTasks: context.remainingTasksCount
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Finalize on workflow end
 */
const workflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:sisyphus:workflow-end',
  name: 'Sisyphus Orchestrator (Workflow End)',
  description: 'Finalizes Sisyphus orchestration at workflow end',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const duration = Date.now() - sessionState.lastActivityAt;
    taskDurations.push(duration);
    if (taskDurations.length > 100) {
      taskDurations.shift();
    }
    stats.averageTaskDuration = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length;

    if (context.success) {
      stats.successfulTasks++;
    } else {
      stats.failedTasks++;
    }

    logger.info({
      taskId: sessionState.currentTaskId,
      success: context.success,
      delegations: sessionState.totalDelegations,
      violations: sessionState.directModificationAttempts,
      pendingFiles: sessionState.pendingFilePaths.size
    }, '[Sisyphus] Orchestration completed');

    // Warn if there are pending files
    if (sessionState.pendingFilePaths.size > 0) {
      const files = Array.from(sessionState.pendingFilePaths).join('\n- ');

      return {
        decision: 'continue',
        injectMessage: `⚠️ [Sisyphus 완료 경고]

작업이 완료되었지만 다음 파일들의 수정이 확인되지 않았습니다:
- ${files}

이 파일들이 올바르게 수정되었는지 확인하세요.`
      };
    }

    return { decision: 'continue' };
  }
};

// ============ All Hooks ============

export const sisyphusOrchestratorHooks = [
  workflowStartHook,
  enforceDelgationHook,
  trackToolResultHook,
  trackExpertCallHook,
  subagentWarningHook,
  phaseTransitionHook,
  errorRecoveryHook,
  assistantResponseHook,
  boulderContinuationHook,
  workflowEndHook
] as HookDefinition[];

// ============ Public API ============

/**
 * Registers Sisyphus orchestrator hooks
 */
export function registerSisyphusOrchestratorHooks(): void {
  for (const hook of sisyphusOrchestratorHooks) {
    registerHook(hook);
  }
  logger.debug('Sisyphus orchestrator hooks registered (oh-my-opencode style)');
}

/**
 * Gets orchestrator statistics
 */
export function getSisyphusOrchestratorStats(): OrchestratorStats & {
  sessionState: {
    currentTaskId?: string;
    currentIntent?: TaskIntent;
    currentPhase: WorkflowPhase;
    pendingFilesCount: number;
    delegations: number;
    violations: number;
  };
} {
  return {
    ...stats,
    sessionState: {
      currentTaskId: sessionState.currentTaskId,
      currentIntent: sessionState.currentIntent,
      currentPhase: sessionState.currentPhase,
      pendingFilesCount: sessionState.pendingFilePaths.size,
      delegations: sessionState.totalDelegations,
      violations: sessionState.directModificationAttempts
    }
  };
}

/**
 * Resets orchestrator state
 */
export function resetSisyphusOrchestratorState(): void {
  stats = {
    totalTasksOrchestrated: 0,
    successfulTasks: 0,
    failedTasks: 0,
    totalSubagentCalls: 0,
    delegationViolations: 0,
    averageTaskDuration: 0
  };

  sessionState = {
    currentPhase: 'intent',
    pendingFilePaths: new Set(),
    lastEventWasAbortError: false,
    subagentCallCount: 0,
    warningsIssued: 0,
    lastActivityAt: Date.now(),
    totalDelegations: 0,
    directModificationAttempts: 0
  };

  taskDurations.length = 0;
}

/**
 * Updates orchestrator configuration
 */
export function updateSisyphusOrchestratorConfig(updates: Partial<OrchestratorConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Sisyphus orchestrator config updated');
}

/**
 * Gets pending file paths
 */
export function getPendingFilePaths(): string[] {
  return Array.from(sessionState.pendingFilePaths);
}

/**
 * Manually triggers delegation warning
 */
export function triggerDelegationWarning(toolName: string, filePath?: string): string {
  sessionState.warningsIssued++;
  return generateDelegationWarning(toolName, filePath);
}

/**
 * Manually triggers subagent warning
 */
export function triggerSubagentWarning(expertId: string): string {
  sessionState.warningsIssued++;
  return generateSubagentWarning(expertId);
}

export default {
  registerSisyphusOrchestratorHooks,
  getSisyphusOrchestratorStats,
  resetSisyphusOrchestratorState,
  updateSisyphusOrchestratorConfig,
  getPendingFilePaths,
  triggerDelegationWarning,
  triggerSubagentWarning
};
