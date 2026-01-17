// src/hooks/builtin/start-work.ts

/**
 * Start Work Hook
 *
 * Initializes work sessions and manages boulder state for task tracking.
 * Creates checkpoints and preserves context across sessions.
 *
 * Features:
 * - Work session initialization
 * - Boulder state management
 * - Task checkpoint creation
 * - Context preservation
 */

import {
  HookDefinition,
  HookResult,
  OnWorkflowStartContext,
  OnWorkflowEndContext,
  OnToolCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Work session state
 */
interface WorkSession {
  id: string;
  startTime: number;
  lastActivityTime: number;
  taskDescription?: string;
  currentPhase: string;
  checkpoints: Checkpoint[];
  metadata: Record<string, unknown>;
}

/**
 * Checkpoint
 */
interface Checkpoint {
  id: string;
  timestamp: number;
  phase: string;
  description: string;
  data?: Record<string, unknown>;
}

/**
 * Start work configuration
 */
interface StartWorkConfig {
  /** Whether start work tracking is enabled */
  enabled: boolean;
  /** Directory for boulder state storage */
  boulderDir: string;
  /** Auto-create checkpoints */
  autoCheckpoint: boolean;
  /** Checkpoint interval in ms */
  checkpointIntervalMs: number;
  /** Max checkpoints to keep */
  maxCheckpoints: number;
  /** Save state to disk */
  persistToDisk: boolean;
}

/**
 * Start work statistics
 */
interface StartWorkStats {
  totalSessionsStarted: number;
  totalSessionsCompleted: number;
  totalCheckpoints: number;
  currentSessionId?: string;
  averageSessionDuration: number;
  lastSessionStartTime?: number;
}

// State
let config: StartWorkConfig = {
  enabled: true,
  boulderDir: '.sisyphus',
  autoCheckpoint: true,
  checkpointIntervalMs: 60000, // 1 minute
  maxCheckpoints: 50,
  persistToDisk: true
};

let stats: StartWorkStats = {
  totalSessionsStarted: 0,
  totalSessionsCompleted: 0,
  totalCheckpoints: 0,
  averageSessionDuration: 0
};

let currentSession: WorkSession | null = null;
let lastCheckpointTime = 0;
const sessionDurations: number[] = [];

/**
 * Generates unique session ID
 */
function generateSessionId(): string {
  return `work_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generates unique checkpoint ID
 */
function generateCheckpointId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Gets boulder directory path
 */
function getBoulderPath(): string {
  return path.join(process.cwd(), config.boulderDir);
}

/**
 * Ensures boulder directory exists
 */
function ensureBoulderDir(): void {
  const dir = getBoulderPath();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Saves session state to disk
 */
function saveSessionState(session: WorkSession): void {
  if (!config.persistToDisk) return;

  try {
    ensureBoulderDir();
    const filePath = path.join(getBoulderPath(), `session_${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8');
    logger.debug({ sessionId: session.id }, 'Session state saved');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to save session state');
  }
}

/**
 * Loads session state from disk
 */
function loadSessionState(sessionId: string): WorkSession | null {
  try {
    const filePath = path.join(getBoulderPath(), `session_${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error: any) {
    logger.warn({ error: error.message, sessionId }, 'Failed to load session state');
  }
  return null;
}

/**
 * Creates a new work session
 */
function createSession(taskDescription?: string): WorkSession {
  const session: WorkSession = {
    id: generateSessionId(),
    startTime: Date.now(),
    lastActivityTime: Date.now(),
    taskDescription,
    currentPhase: 'initialization',
    checkpoints: [],
    metadata: {}
  };

  currentSession = session;
  stats.totalSessionsStarted++;
  stats.currentSessionId = session.id;
  stats.lastSessionStartTime = session.startTime;

  // Save initial state
  saveSessionState(session);

  logger.info({
    sessionId: session.id,
    taskDescription
  }, 'Work session started');

  return session;
}

/**
 * Creates a checkpoint
 */
function createCheckpoint(
  phase: string,
  description: string,
  data?: Record<string, unknown>
): Checkpoint | null {
  if (!currentSession) return null;

  const checkpoint: Checkpoint = {
    id: generateCheckpointId(),
    timestamp: Date.now(),
    phase,
    description,
    data
  };

  currentSession.checkpoints.push(checkpoint);
  currentSession.lastActivityTime = Date.now();
  currentSession.currentPhase = phase;

  // Trim old checkpoints
  while (currentSession.checkpoints.length > config.maxCheckpoints) {
    currentSession.checkpoints.shift();
  }

  stats.totalCheckpoints++;
  lastCheckpointTime = Date.now();

  // Save state
  saveSessionState(currentSession);

  logger.debug({
    checkpointId: checkpoint.id,
    phase,
    description
  }, 'Checkpoint created');

  return checkpoint;
}

/**
 * Completes the current session
 */
function completeSession(success: boolean): void {
  if (!currentSession) return;

  const duration = Date.now() - currentSession.startTime;
  sessionDurations.push(duration);

  if (sessionDurations.length > 100) {
    sessionDurations.shift();
  }

  stats.averageSessionDuration =
    sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length;

  stats.totalSessionsCompleted++;

  // Create final checkpoint
  createCheckpoint(
    'completion',
    success ? 'Session completed successfully' : 'Session ended with errors',
    { success, duration }
  );

  logger.info({
    sessionId: currentSession.id,
    success,
    duration,
    checkpoints: currentSession.checkpoints.length
  }, 'Work session completed');

  currentSession = null;
  stats.currentSessionId = undefined;
}

/**
 * Generates session start message
 */
function generateStartMessage(session: WorkSession): string {
  return `
🚀 **Work Session Started**

| 항목 | 값 |
|------|-----|
| Session ID | \`${session.id}\` |
| Started | ${new Date(session.startTime).toLocaleTimeString()} |
| Task | ${session.taskDescription || 'Not specified'} |

Checkpoints will be automatically created to track progress.
Use \`boulder_status\` to check current state.
`;
}

/**
 * Hook: Initialize work session on workflow start
 */
const initializeWorkSessionHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:start-work:initialize',
  name: 'Start Work (Initialize)',
  description: 'Initializes work session at workflow start',
  eventType: 'onWorkflowStart',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Extract task description from context
    const taskDescription = (context as any).request ||
      (context as any).prompt ||
      (context as any).workflowName;

    const session = createSession(taskDescription);
    const message = generateStartMessage(session);

    return {
      decision: 'continue',
      injectMessage: message,
      metadata: {
        workSessionId: session.id,
        workSessionStarted: true
      }
    };
  }
};

/**
 * Hook: Auto-checkpoint on tool calls
 */
const autoCheckpointHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:start-work:auto-checkpoint',
  name: 'Start Work (Auto Checkpoint)',
  description: 'Creates automatic checkpoints during work',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.autoCheckpoint || !currentSession) {
      return { decision: 'continue' };
    }

    // Update activity time
    currentSession.lastActivityTime = Date.now();

    // Check if enough time has passed for checkpoint
    const timeSinceLastCheckpoint = Date.now() - lastCheckpointTime;

    if (timeSinceLastCheckpoint >= config.checkpointIntervalMs) {
      createCheckpoint(
        'activity',
        `Tool call: ${context.toolName}`,
        { toolName: context.toolName }
      );
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Complete work session on workflow end
 */
const completeWorkSessionHook: HookDefinition<OnWorkflowEndContext> = {
  id: 'builtin:start-work:complete',
  name: 'Start Work (Complete)',
  description: 'Completes work session at workflow end',
  eventType: 'onWorkflowEnd',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !currentSession) {
      return { decision: 'continue' };
    }

    completeSession(context.success);

    return {
      decision: 'continue',
      metadata: {
        workSessionCompleted: true,
        success: context.success
      }
    };
  }
};

/**
 * All start work hooks
 */
export const startWorkHooks = [
  initializeWorkSessionHook,
  autoCheckpointHook,
  completeWorkSessionHook
] as HookDefinition[];

/**
 * Registers start work hooks
 */
export function registerStartWorkHooks(): void {
  for (const hook of startWorkHooks) {
    registerHook(hook);
  }
  logger.debug('Start work hooks registered');
}

/**
 * Gets start work statistics
 */
export function getStartWorkStats(): StartWorkStats & {
  config: StartWorkConfig;
  currentSession: WorkSession | null;
} {
  return {
    ...stats,
    config,
    currentSession
  };
}

/**
 * Resets start work state
 */
export function resetStartWorkState(): void {
  stats = {
    totalSessionsStarted: 0,
    totalSessionsCompleted: 0,
    totalCheckpoints: 0,
    averageSessionDuration: 0
  };
  currentSession = null;
  lastCheckpointTime = 0;
  sessionDurations.length = 0;
}

/**
 * Updates start work configuration
 */
export function updateStartWorkConfig(updates: Partial<StartWorkConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Start work config updated');
}

/**
 * Manually creates a checkpoint
 */
export function manualCheckpoint(phase: string, description: string, data?: Record<string, unknown>): Checkpoint | null {
  return createCheckpoint(phase, description, data);
}

/**
 * Gets current session
 */
export function getCurrentSession(): WorkSession | null {
  return currentSession;
}

/**
 * Resumes a previous session
 */
export function resumeSession(sessionId: string): boolean {
  const session = loadSessionState(sessionId);
  if (session) {
    currentSession = session;
    currentSession.lastActivityTime = Date.now();
    stats.currentSessionId = session.id;

    createCheckpoint('resume', 'Session resumed');

    logger.info({ sessionId }, 'Session resumed');
    return true;
  }
  return false;
}

/**
 * Lists available sessions
 */
export function listSessions(): string[] {
  try {
    const dir = getBoulderPath();
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
      .filter(f => f.startsWith('session_') && f.endsWith('.json'))
      .map(f => f.replace('session_', '').replace('.json', ''));
  } catch {
    return [];
  }
}

export default {
  registerStartWorkHooks,
  getStartWorkStats,
  resetStartWorkState,
  updateStartWorkConfig,
  manualCheckpoint,
  getCurrentSession,
  resumeSession,
  listSessions
};
