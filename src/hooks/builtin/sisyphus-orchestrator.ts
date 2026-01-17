// src/hooks/builtin/sisyphus-orchestrator.ts

/**
 * Sisyphus Orchestrator Hook
 *
 * Main orchestration hook that coordinates AI agents for complex tasks.
 * Named after Sisyphus - continuously working to push the boulder uphill.
 *
 * Features:
 * - Task classification and routing
 * - Multi-agent coordination
 * - Progress tracking
 * - Automatic retry and recovery
 * - Work session management
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
  OnErrorContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

// ============ Types ============

/**
 * Task intent classification
 */
type TaskIntent =
  | 'conceptual'      // Design, architecture, planning
  | 'implementation'  // Code writing, feature building
  | 'debugging'       // Bug fixing, error resolution
  | 'refactoring'     // Code improvement, optimization
  | 'research'        // Investigation, learning
  | 'review'          // Code review, validation
  | 'documentation'   // Writing docs, comments
  | 'quick'           // Simple, fast tasks
  | 'unknown';

/**
 * Workflow phase
 */
type WorkflowPhase =
  | 'intent'          // Understanding what to do
  | 'assessment'      // Analyzing scope and complexity
  | 'exploration'     // Gathering context
  | 'planning'        // Creating execution plan
  | 'implementation'  // Executing the plan
  | 'verification'    // Validating results
  | 'recovery'        // Handling failures
  | 'completion';     // Wrapping up

/**
 * Agent assignment
 */
interface AgentAssignment {
  agent: string;
  role: string;
  priority: number;
}

/**
 * Task state
 */
interface TaskState {
  id: string;
  intent: TaskIntent;
  phase: WorkflowPhase;
  prompt: string;
  agents: AgentAssignment[];
  attempts: number;
  errors: string[];
  startTime: number;
  lastUpdateTime: number;
  metadata: Record<string, unknown>;
}

/**
 * Orchestrator configuration
 */
interface OrchestratorConfig {
  /** Whether orchestration is enabled */
  enabled: boolean;
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Auto-classify task intent */
  autoClassify: boolean;
  /** Auto-assign agents */
  autoAssignAgents: boolean;
  /** Enable progress tracking */
  trackProgress: boolean;
  /** Intent classification patterns */
  intentPatterns: Record<TaskIntent, string[]>;
  /** Agent assignments by intent */
  agentsByIntent: Record<TaskIntent, AgentAssignment[]>;
}

/**
 * Orchestrator statistics
 */
interface OrchestratorStats {
  totalTasksOrchestrated: number;
  tasksByIntent: Record<string, number>;
  tasksByPhase: Record<string, number>;
  successfulTasks: number;
  failedTasks: number;
  totalAgentCalls: number;
  averageTaskDuration: number;
  currentActiveTasks: number;
}

// ============ State ============

let config: OrchestratorConfig = {
  enabled: true,
  maxAttempts: 3,
  autoClassify: true,
  autoAssignAgents: true,
  trackProgress: true,
  intentPatterns: {
    conceptual: [
      'design', 'architect', 'plan', 'strategy', 'approach',
      '설계', '아키텍처', '계획', '전략'
    ],
    implementation: [
      'implement', 'create', 'build', 'add', 'make', 'write code',
      '구현', '생성', '빌드', '추가', '만들'
    ],
    debugging: [
      'fix', 'bug', 'error', 'issue', 'problem', 'broken', 'not working',
      '수정', '버그', '에러', '오류', '문제'
    ],
    refactoring: [
      'refactor', 'improve', 'optimize', 'clean', 'reorganize',
      '리팩토링', '개선', '최적화', '정리'
    ],
    research: [
      'research', 'investigate', 'explore', 'understand', 'learn', 'find out',
      '조사', '탐구', '이해', '학습', '알아보'
    ],
    review: [
      'review', 'check', 'validate', 'verify', 'audit',
      '리뷰', '검토', '확인', '검증'
    ],
    documentation: [
      'document', 'readme', 'comment', 'explain', 'describe',
      '문서', '설명', '주석'
    ],
    quick: [
      'quick', 'simple', 'small', 'minor', 'tiny',
      '빠른', '간단', '작은', '사소한'
    ],
    unknown: []
  },
  agentsByIntent: {
    conceptual: [
      { agent: 'strategist', role: 'Lead architect', priority: 1 },
      { agent: 'metis', role: 'Analysis support', priority: 2 }
    ],
    implementation: [
      { agent: 'strategist', role: 'Implementation guide', priority: 1 },
      { agent: 'reviewer', role: 'Code quality', priority: 3 }
    ],
    debugging: [
      { agent: 'strategist', role: 'Debug strategy', priority: 1 },
      { agent: 'explorer', role: 'Code search', priority: 2 }
    ],
    refactoring: [
      { agent: 'reviewer', role: 'Quality assessment', priority: 1 },
      { agent: 'strategist', role: 'Refactor strategy', priority: 2 }
    ],
    research: [
      { agent: 'researcher', role: 'Primary researcher', priority: 1 },
      { agent: 'librarian', role: 'Knowledge support', priority: 2 }
    ],
    review: [
      { agent: 'reviewer', role: 'Primary reviewer', priority: 1 },
      { agent: 'momus', role: 'Critical analysis', priority: 2 }
    ],
    documentation: [
      { agent: 'writer', role: 'Documentation lead', priority: 1 },
      { agent: 'researcher', role: 'Content research', priority: 2 }
    ],
    quick: [
      { agent: 'explorer', role: 'Quick execution', priority: 1 }
    ],
    unknown: [
      { agent: 'strategist', role: 'General guidance', priority: 1 }
    ]
  }
};

let stats: OrchestratorStats = {
  totalTasksOrchestrated: 0,
  tasksByIntent: {},
  tasksByPhase: {},
  successfulTasks: 0,
  failedTasks: 0,
  totalAgentCalls: 0,
  averageTaskDuration: 0,
  currentActiveTasks: 0
};

const activeTasks: Map<string, TaskState> = new Map();
const taskDurations: number[] = [];

// ============ Utility Functions ============

/**
 * Generates unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

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
 * Gets agents for intent
 */
function getAgentsForIntent(intent: TaskIntent): AgentAssignment[] {
  return config.agentsByIntent[intent] || config.agentsByIntent.unknown;
}

/**
 * Creates new task state
 */
function createTaskState(prompt: string, intent?: TaskIntent): TaskState {
  const classifiedIntent = intent || (config.autoClassify ? classifyIntent(prompt) : 'unknown');
  const agents = config.autoAssignAgents ? getAgentsForIntent(classifiedIntent) : [];

  return {
    id: generateTaskId(),
    intent: classifiedIntent,
    phase: 'intent',
    prompt,
    agents,
    attempts: 0,
    errors: [],
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    metadata: {}
  };
}

/**
 * Updates task phase
 */
function updateTaskPhase(taskId: string, phase: WorkflowPhase): void {
  const task = activeTasks.get(taskId);
  if (task) {
    task.phase = phase;
    task.lastUpdateTime = Date.now();
    stats.tasksByPhase[phase] = (stats.tasksByPhase[phase] || 0) + 1;
  }
}

/**
 * Records task error
 */
function recordTaskError(taskId: string, error: string): void {
  const task = activeTasks.get(taskId);
  if (task) {
    task.errors.push(error);
    task.attempts++;
    task.lastUpdateTime = Date.now();
  }
}

/**
 * Completes task
 */
function completeTask(taskId: string, success: boolean): void {
  const task = activeTasks.get(taskId);
  if (task) {
    const duration = Date.now() - task.startTime;
    taskDurations.push(duration);

    if (taskDurations.length > 100) {
      taskDurations.shift();
    }

    stats.averageTaskDuration = taskDurations.reduce((a, b) => a + b, 0) / taskDurations.length;

    if (success) {
      stats.successfulTasks++;
    } else {
      stats.failedTasks++;
    }

    activeTasks.delete(taskId);
    stats.currentActiveTasks = activeTasks.size;
  }
}

/**
 * Generates orchestration message
 */
function generateOrchestrationMessage(task: TaskState): string {
  const agentList = task.agents
    .sort((a, b) => a.priority - b.priority)
    .map(a => `- **${a.agent}**: ${a.role}`)
    .join('\n');

  return `
🎯 **Task Orchestration**

**Task ID:** \`${task.id}\`
**Intent:** ${task.intent}
**Phase:** ${task.phase}

**Assigned Agents:**
${agentList}

**Guidance:**
${getPhaseGuidance(task.phase, task.intent)}
`;
}

/**
 * Gets guidance for current phase
 */
function getPhaseGuidance(phase: WorkflowPhase, intent: TaskIntent): string {
  const guidance: Record<WorkflowPhase, string> = {
    intent: 'Clarify the task requirements and objectives.',
    assessment: 'Analyze scope, complexity, and required resources.',
    exploration: 'Gather necessary context and information.',
    planning: 'Create a detailed execution plan.',
    implementation: 'Execute the plan step by step.',
    verification: 'Validate the results meet requirements.',
    recovery: 'Address any issues or failures.',
    completion: 'Finalize and document the work.'
  };

  return guidance[phase] || 'Proceed with the task.';
}

// ============ Hooks ============

/**
 * Hook: Initialize orchestration on workflow start
 */
const initializeOnWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:sisyphus-orchestrator:workflow-start',
  name: 'Sisyphus Orchestrator (Workflow Start)',
  description: 'Initializes task orchestration at workflow start',
  eventType: 'onWorkflowStart',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Create task state from workflow context
    const prompt = (context as any).prompt || (context as any).request || '';
    const task = createTaskState(prompt);

    activeTasks.set(task.id, task);
    stats.totalTasksOrchestrated++;
    stats.tasksByIntent[task.intent] = (stats.tasksByIntent[task.intent] || 0) + 1;
    stats.currentActiveTasks = activeTasks.size;

    logger.info({
      taskId: task.id,
      intent: task.intent,
      agents: task.agents.map(a => a.agent)
    }, 'Task orchestration initialized');

    const message = generateOrchestrationMessage(task);

    return {
      decision: 'continue',
      injectMessage: message,
      metadata: {
        orchestratorTaskId: task.id,
        intent: task.intent,
        phase: task.phase
      }
    };
  }
};

/**
 * Hook: Track phase transitions
 */
const trackPhaseTransitionHook: HookDefinition<OnWorkflowPhaseContext> = {
  id: 'builtin:sisyphus-orchestrator:phase-transition',
  name: 'Sisyphus Orchestrator (Phase Transition)',
  description: 'Tracks workflow phase transitions',
  eventType: 'onWorkflowPhase',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Find active task and update phase
    const taskId = (context as any).taskId;
    if (taskId && activeTasks.has(taskId)) {
      const phase = (context as any).phase as WorkflowPhase;
      if (phase) {
        updateTaskPhase(taskId, phase);
        logger.debug({ taskId, phase }, 'Task phase updated');
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Coordinate agent calls
 */
const coordinateAgentCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:sisyphus-orchestrator:coordinate-agent',
  name: 'Sisyphus Orchestrator (Coordinate Agent)',
  description: 'Coordinates agent calls based on task state',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    stats.totalAgentCalls++;

    // Check if we should suggest a different agent based on active task
    for (const task of activeTasks.values()) {
      const suggestedAgent = task.agents.find(a => a.priority === 1);

      if (suggestedAgent && suggestedAgent.agent !== context.expertId) {
        // Don't block, just add metadata about suggestion
        return {
          decision: 'continue',
          metadata: {
            orchestratorSuggestion: suggestedAgent.agent,
            currentAgent: context.expertId,
            taskIntent: task.intent
          }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Handle agent results
 */
const handleAgentResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:sisyphus-orchestrator:handle-result',
  name: 'Sisyphus Orchestrator (Handle Result)',
  description: 'Processes agent results for orchestration decisions',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Track successful agent calls
    logger.debug({
      expert: context.expertId,
      responseLength: context.response?.length
    }, 'Agent result received');

    return { decision: 'continue' };
  }
};

/**
 * Hook: Handle errors for recovery
 */
const handleErrorForRecoveryHook: HookDefinition<OnErrorContext> = {
  id: 'builtin:sisyphus-orchestrator:error-recovery',
  name: 'Sisyphus Orchestrator (Error Recovery)',
  description: 'Handles errors and triggers recovery phase',
  eventType: 'onError',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Find active task and record error
    for (const [taskId, task] of activeTasks.entries()) {
      if (task.attempts < config.maxAttempts) {
        recordTaskError(taskId, context.errorMessage);
        updateTaskPhase(taskId, 'recovery');

        logger.warn({
          taskId,
          error: context.errorMessage,
          attempts: task.attempts,
          maxAttempts: config.maxAttempts
        }, 'Task error recorded, entering recovery');

        return {
          decision: 'continue',
          injectMessage: `
⚠️ **Recovery Mode** (Attempt ${task.attempts}/${config.maxAttempts})

Error: ${context.errorMessage}

Attempting recovery strategy...
`,
          metadata: {
            orchestratorRecovery: true,
            taskId,
            attempts: task.attempts
          }
        };
      } else {
        // Max attempts reached
        completeTask(taskId, false);

        return {
          decision: 'continue',
          injectMessage: `
❌ **Task Failed** after ${config.maxAttempts} attempts

Errors encountered:
${task.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}
`,
          metadata: {
            orchestratorFailed: true,
            taskId
          }
        };
      }
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Finalize on workflow end
 */
const finalizeOnWorkflowEndHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:sisyphus-orchestrator:workflow-end',
  name: 'Sisyphus Orchestrator (Workflow End)',
  description: 'Finalizes task orchestration at workflow end',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Complete all active tasks
    for (const taskId of activeTasks.keys()) {
      completeTask(taskId, context.success);
    }

    logger.info({
      success: context.success,
      totalTasks: stats.totalTasksOrchestrated,
      successRate: stats.totalTasksOrchestrated > 0
        ? (stats.successfulTasks / stats.totalTasksOrchestrated * 100).toFixed(1) + '%'
        : 'N/A'
    }, 'Workflow orchestration completed');

    return { decision: 'continue' };
  }
};

// ============ Exports ============

/**
 * All Sisyphus orchestrator hooks
 */
export const sisyphusOrchestratorHooks = [
  initializeOnWorkflowStartHook,
  trackPhaseTransitionHook,
  coordinateAgentCallHook,
  handleAgentResultHook,
  handleErrorForRecoveryHook,
  finalizeOnWorkflowEndHook
] as HookDefinition[];

/**
 * Registers Sisyphus orchestrator hooks
 */
export function registerSisyphusOrchestratorHooks(): void {
  for (const hook of sisyphusOrchestratorHooks) {
    registerHook(hook);
  }
  logger.debug('Sisyphus orchestrator hooks registered');
}

/**
 * Gets orchestrator statistics
 */
export function getSisyphusOrchestratorStats(): OrchestratorStats & {
  config: OrchestratorConfig;
  activeTasks: Array<{ id: string; intent: TaskIntent; phase: WorkflowPhase }>;
} {
  return {
    ...stats,
    config,
    activeTasks: Array.from(activeTasks.values()).map(t => ({
      id: t.id,
      intent: t.intent,
      phase: t.phase
    }))
  };
}

/**
 * Resets orchestrator state
 */
export function resetSisyphusOrchestratorState(): void {
  stats = {
    totalTasksOrchestrated: 0,
    tasksByIntent: {},
    tasksByPhase: {},
    successfulTasks: 0,
    failedTasks: 0,
    totalAgentCalls: 0,
    averageTaskDuration: 0,
    currentActiveTasks: 0
  };
  activeTasks.clear();
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
 * Manually creates a task
 */
export function createOrchestrationTask(prompt: string, intent?: TaskIntent): string {
  const task = createTaskState(prompt, intent);
  activeTasks.set(task.id, task);
  stats.totalTasksOrchestrated++;
  stats.currentActiveTasks = activeTasks.size;
  return task.id;
}

/**
 * Gets task state
 */
export function getTaskState(taskId: string): TaskState | undefined {
  return activeTasks.get(taskId);
}

export default {
  registerSisyphusOrchestratorHooks,
  getSisyphusOrchestratorStats,
  resetSisyphusOrchestratorState,
  updateSisyphusOrchestratorConfig,
  createOrchestrationTask,
  getTaskState
};
