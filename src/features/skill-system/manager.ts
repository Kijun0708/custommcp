// src/features/skill-system/manager.ts

/**
 * Skill Manager
 *
 * Manages skill execution, activation, and MCP process lifecycle.
 * Provides high-level skill orchestration capabilities.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import {
  LoadedSkill,
  SkillExecutionContext,
  SkillExecutionResult,
  SkillMcpProcess,
  SkillState
} from './types.js';
import {
  loadAllSkills,
  getSkill,
  getAllSkills,
  recordSkillUsage,
  enableSkill,
  disableSkill,
  reloadSkills,
  getLoaderStats
} from './loader.js';

/**
 * Skill manager configuration
 */
interface SkillManagerConfig {
  /** Whether skill manager is enabled */
  enabled: boolean;
  /** Auto-start MCP servers for skills */
  autoStartMcp: boolean;
  /** Default execution timeout in ms */
  defaultTimeoutMs: number;
  /** Max concurrent skill executions */
  maxConcurrentExecutions: number;
  /** MCP process restart attempts */
  mcpRestartAttempts: number;
}

/**
 * Skill manager statistics
 */
interface SkillManagerStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  activeSkills: number;
  runningMcpProcesses: number;
  lastExecutionTime?: number;
}

// State
let config: SkillManagerConfig = {
  enabled: true,
  autoStartMcp: true,
  defaultTimeoutMs: 30000,
  maxConcurrentExecutions: 5,
  mcpRestartAttempts: 3
};

let stats: SkillManagerStats = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  averageExecutionTime: 0,
  activeSkills: 0,
  runningMcpProcesses: 0
};

const mcpProcesses: Map<string, ChildProcess> = new Map();
const executionTimes: number[] = [];
let currentExecutions = 0;

/**
 * Initializes the skill manager
 */
export function initializeSkillManager(basePath?: string): void {
  if (!config.enabled) {
    logger.info('Skill manager is disabled');
    return;
  }

  // Load all skills
  const skills = loadAllSkills(basePath);
  stats.activeSkills = skills.filter(s => s.enabled).length;

  // Auto-start MCP servers if configured
  if (config.autoStartMcp) {
    for (const skill of skills) {
      if (skill.mcp && skill.enabled) {
        startMcpProcess(skill).catch(err => {
          logger.warn({ skillId: skill.id, error: err.message }, 'Failed to auto-start MCP');
        });
      }
    }
  }

  logger.info({
    totalSkills: skills.length,
    activeSkills: stats.activeSkills
  }, 'Skill manager initialized');
}

/**
 * Starts MCP process for a skill
 */
export async function startMcpProcess(skill: LoadedSkill): Promise<boolean> {
  if (!skill.mcp) {
    return false;
  }

  // Check if already running
  if (mcpProcesses.has(skill.id)) {
    const existing = mcpProcesses.get(skill.id);
    if (existing && !existing.killed) {
      logger.debug({ skillId: skill.id }, 'MCP process already running');
      return true;
    }
  }

  const mcpConfig = skill.mcp;
  const cwd = mcpConfig.cwd || (skill.filePath ? path.dirname(skill.filePath) : process.cwd());

  try {
    const proc = spawn(mcpConfig.command, mcpConfig.args || [], {
      cwd,
      env: { ...process.env, ...mcpConfig.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.on('error', (err) => {
      logger.error({ skillId: skill.id, error: err.message }, 'MCP process error');
      skill.mcpProcess = {
        running: false,
        lastError: err.message
      };
    });

    proc.on('exit', (code) => {
      logger.info({ skillId: skill.id, code }, 'MCP process exited');
      mcpProcesses.delete(skill.id);
      stats.runningMcpProcesses--;

      if (skill.mcpProcess) {
        skill.mcpProcess.running = false;
      }
    });

    mcpProcesses.set(skill.id, proc);
    stats.runningMcpProcesses++;

    skill.mcpProcess = {
      pid: proc.pid,
      running: true,
      startedAt: Date.now()
    };

    skill.state = 'active';

    logger.info({
      skillId: skill.id,
      pid: proc.pid,
      command: mcpConfig.command
    }, 'MCP process started');

    return true;
  } catch (error: any) {
    logger.error({ skillId: skill.id, error: error.message }, 'Failed to start MCP process');

    skill.mcpProcess = {
      running: false,
      lastError: error.message
    };

    return false;
  }
}

/**
 * Stops MCP process for a skill
 */
export function stopMcpProcess(skillId: string): boolean {
  const proc = mcpProcesses.get(skillId);
  if (!proc) {
    return false;
  }

  try {
    proc.kill('SIGTERM');
    mcpProcesses.delete(skillId);
    stats.runningMcpProcesses--;

    const skill = getSkill(skillId);
    if (skill && skill.mcpProcess) {
      skill.mcpProcess.running = false;
    }

    logger.info({ skillId }, 'MCP process stopped');
    return true;
  } catch (error: any) {
    logger.error({ skillId, error: error.message }, 'Failed to stop MCP process');
    return false;
  }
}

/**
 * Executes a skill
 */
export async function executeSkill(
  skillId: string,
  context: SkillExecutionContext
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  stats.totalExecutions++;
  stats.lastExecutionTime = startTime;

  const skill = getSkill(skillId);
  if (!skill) {
    stats.failedExecutions++;
    return {
      success: false,
      error: `Skill not found: ${skillId}`,
      duration: Date.now() - startTime
    };
  }

  if (!skill.enabled) {
    stats.failedExecutions++;
    return {
      success: false,
      error: `Skill is disabled: ${skillId}`,
      duration: Date.now() - startTime
    };
  }

  // Check concurrency limit
  if (currentExecutions >= config.maxConcurrentExecutions) {
    stats.failedExecutions++;
    return {
      success: false,
      error: 'Max concurrent executions reached',
      duration: Date.now() - startTime
    };
  }

  currentExecutions++;

  try {
    // Record usage
    recordSkillUsage(skillId);

    // If skill has MCP, ensure it's running
    if (skill.mcp && (!skill.mcpProcess || !skill.mcpProcess.running)) {
      await startMcpProcess(skill);
    }

    // Execute based on skill type
    let output: string;

    if (skill.prompt) {
      // Prompt-based skill - return the prompt with context substitution
      output = substituteContext(skill.prompt, context);
    } else if (skill.mcpProcess?.running) {
      // MCP-based skill - would need MCP client communication
      output = `MCP skill ${skillId} is active (PID: ${skill.mcpProcess.pid})`;
    } else {
      output = `Skill ${skillId} executed`;
    }

    const duration = Date.now() - startTime;
    executionTimes.push(duration);

    if (executionTimes.length > 100) {
      executionTimes.shift();
    }

    stats.successfulExecutions++;
    stats.averageExecutionTime =
      executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;

    logger.debug({
      skillId,
      duration,
      success: true
    }, 'Skill executed');

    return {
      success: true,
      output,
      duration,
      metadata: {
        skillName: skill.name,
        skillScope: skill.scope
      }
    };
  } catch (error: any) {
    stats.failedExecutions++;

    logger.error({
      skillId,
      error: error.message
    }, 'Skill execution failed');

    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  } finally {
    currentExecutions--;
  }
}

/**
 * Substitutes context variables in skill prompt
 */
function substituteContext(prompt: string, context: SkillExecutionContext): string {
  let result = prompt;

  // Replace common variables
  result = result.replace(/\{\{input\}\}/g, context.input);
  result = result.replace(/\{\{cwd\}\}/g, context.cwd);
  result = result.replace(/\{\{timestamp\}\}/g, new Date().toISOString());

  // Replace context variables
  if (context.context) {
    for (const [key, value] of Object.entries(context.context)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }

  // Replace env variables
  for (const [key, value] of Object.entries(context.env)) {
    result = result.replace(new RegExp(`\\{\\{env\\.${key}\\}\\}`, 'g'), value);
  }

  return result;
}

/**
 * Activates a skill
 */
export async function activateSkill(skillId: string): Promise<boolean> {
  const skill = getSkill(skillId);
  if (!skill) {
    return false;
  }

  enableSkill(skillId);

  // Start MCP if configured
  if (skill.mcp && config.autoStartMcp) {
    await startMcpProcess(skill);
  }

  stats.activeSkills = getAllSkills().filter(s => s.enabled).length;

  logger.info({ skillId }, 'Skill activated');
  return true;
}

/**
 * Deactivates a skill
 */
export function deactivateSkill(skillId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) {
    return false;
  }

  disableSkill(skillId);

  // Stop MCP if running
  if (mcpProcesses.has(skillId)) {
    stopMcpProcess(skillId);
  }

  stats.activeSkills = getAllSkills().filter(s => s.enabled).length;

  logger.info({ skillId }, 'Skill deactivated');
  return true;
}

/**
 * Gets skill by name or ID
 */
export function findSkill(nameOrId: string): LoadedSkill | undefined {
  // Try by ID first
  let skill = getSkill(nameOrId);
  if (skill) return skill;

  // Try by name
  const skills = getAllSkills();
  skill = skills.find(s =>
    s.name.toLowerCase() === nameOrId.toLowerCase() ||
    s.id.endsWith(`:${nameOrId}`)
  );

  return skill;
}

/**
 * Lists all skills
 */
export function listSkills(options?: {
  scope?: string;
  enabled?: boolean;
  tag?: string;
}): LoadedSkill[] {
  let skills = getAllSkills();

  if (options?.scope) {
    skills = skills.filter(s => s.scope === options.scope);
  }

  if (options?.enabled !== undefined) {
    skills = skills.filter(s => s.enabled === options.enabled);
  }

  if (options?.tag) {
    const tag = options.tag;
    skills = skills.filter(s => s.tags?.includes(tag));
  }

  return skills;
}

/**
 * Gets skill manager statistics
 */
export function getSkillManagerStats(): SkillManagerStats & {
  config: SkillManagerConfig;
  loaderStats: ReturnType<typeof getLoaderStats>;
} {
  return {
    ...stats,
    config,
    loaderStats: getLoaderStats()
  };
}

/**
 * Updates skill manager configuration
 */
export function updateSkillManagerConfig(updates: Partial<SkillManagerConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Skill manager config updated');
}

/**
 * Resets skill manager state
 */
export function resetSkillManagerState(): void {
  // Stop all MCP processes
  for (const [skillId] of mcpProcesses) {
    stopMcpProcess(skillId);
  }

  stats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    activeSkills: 0,
    runningMcpProcesses: 0
  };

  executionTimes.length = 0;
  currentExecutions = 0;

  logger.info('Skill manager state reset');
}

/**
 * Reloads all skills
 */
export function reloadAllSkills(): LoadedSkill[] {
  // Stop all MCP processes first
  for (const [skillId] of mcpProcesses) {
    stopMcpProcess(skillId);
  }

  const skills = reloadSkills();
  stats.activeSkills = skills.filter(s => s.enabled).length;

  // Restart MCP processes if configured
  if (config.autoStartMcp) {
    for (const skill of skills) {
      if (skill.mcp && skill.enabled) {
        startMcpProcess(skill).catch(err => {
          logger.warn({ skillId: skill.id, error: err.message }, 'Failed to restart MCP');
        });
      }
    }
  }

  logger.info({ count: skills.length }, 'Skills reloaded');
  return skills;
}

/**
 * Gets running MCP processes
 */
export function getRunningMcpProcesses(): Array<{
  skillId: string;
  pid?: number;
  startedAt?: number;
}> {
  const result: Array<{
    skillId: string;
    pid?: number;
    startedAt?: number;
  }> = [];

  for (const [skillId, proc] of mcpProcesses) {
    if (!proc.killed) {
      const skill = getSkill(skillId);
      result.push({
        skillId,
        pid: proc.pid,
        startedAt: skill?.mcpProcess?.startedAt
      });
    }
  }

  return result;
}

/**
 * Shuts down the skill manager
 */
export function shutdownSkillManager(): void {
  logger.info('Shutting down skill manager');

  // Stop all MCP processes
  for (const [skillId] of mcpProcesses) {
    stopMcpProcess(skillId);
  }

  logger.info('Skill manager shut down');
}

export default {
  initializeSkillManager,
  startMcpProcess,
  stopMcpProcess,
  executeSkill,
  activateSkill,
  deactivateSkill,
  findSkill,
  listSkills,
  getSkillManagerStats,
  updateSkillManagerConfig,
  resetSkillManagerState,
  reloadAllSkills,
  getRunningMcpProcesses,
  shutdownSkillManager
};
