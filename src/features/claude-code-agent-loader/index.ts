// src/features/claude-code-agent-loader/index.ts

/**
 * Claude Code Agent Loader
 *
 * Loads agents from Claude Code-compatible markdown files.
 *
 * Agent files are loaded from:
 * 1. Project: ./.claude/agents/*.md (highest priority)
 * 2. User: ~/.claude/agents/*.md
 * 3. OpenCode Project: ./.opencode/agents/*.md
 * 4. OpenCode Global: ~/.config/opencode/agents/*.md (lowest priority)
 *
 * Agents with the same name are merged, with higher priority sources
 * overriding lower priority ones.
 *
 * Usage:
 * ```typescript
 * import { getAgentManager, loadAllAgents } from './features/claude-code-agent-loader';
 *
 * // Get singleton manager
 * const manager = getAgentManager();
 *
 * // Load all agents
 * const agents = manager.getAgents();
 *
 * // Get specific agent
 * const agent = manager.getAgentByName('my-agent');
 *
 * // Get agent prompt
 * const prompt = manager.getAgentPrompt('my-agent');
 * ```
 */

// Types
export type {
  AgentMetadata,
  LoadedAgent,
  AgentSourceConfig,
  AgentLoaderConfig,
  AgentLoadResult,
  AgentLoadError,
  AgentRegistryState
} from './types.js';

export { DEFAULT_AGENT_LOADER_CONFIG } from './types.js';

// Loader
export {
  loadAllAgents,
  loadAgentByName,
  getAgentPromptWithMetadata,
  validateAgent
} from './loader.js';

// Manager
import {
  LoadedAgent,
  AgentLoaderConfig,
  AgentLoadResult,
  AgentRegistryState,
  DEFAULT_AGENT_LOADER_CONFIG
} from './types.js';
import {
  loadAllAgents,
  loadAgentByName,
  getAgentPromptWithMetadata,
  validateAgent
} from './loader.js';
import { logger } from '../../utils/logger.js';

/**
 * Agent Manager class
 *
 * Singleton manager for loading and caching agents.
 */
export class AgentManager {
  private static instance: AgentManager | null = null;

  private config: AgentLoaderConfig;
  private state: AgentRegistryState;
  private cwd: string;

  private constructor(config?: Partial<AgentLoaderConfig>, cwd?: string) {
    this.config = { ...DEFAULT_AGENT_LOADER_CONFIG, ...config };
    this.cwd = cwd || process.cwd();
    this.state = {
      agents: new Map(),
      cacheValid: false,
      lastLoadErrors: []
    };
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(config?: Partial<AgentLoaderConfig>, cwd?: string): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager(config, cwd);
    }
    return AgentManager.instance;
  }

  /**
   * Resets the singleton instance (for testing)
   */
  static resetInstance(): void {
    AgentManager.instance = null;
  }

  /**
   * Loads or returns cached agents
   */
  getAgents(forceReload: boolean = false): LoadedAgent[] {
    if (forceReload || !this.state.cacheValid || this.isCacheExpired()) {
      this.reload();
    }
    return Array.from(this.state.agents.values());
  }

  /**
   * Gets an agent by name
   */
  getAgentByName(name: string): LoadedAgent | undefined {
    this.ensureLoaded();
    return Array.from(this.state.agents.values())
      .find(a => a.name.toLowerCase() === name.toLowerCase());
  }

  /**
   * Gets an agent by ID
   */
  getAgentById(id: string): LoadedAgent | undefined {
    this.ensureLoaded();
    return this.state.agents.get(id);
  }

  /**
   * Gets agent prompt with metadata injected
   */
  getAgentPrompt(nameOrId: string): string | null {
    const agent = this.getAgentByName(nameOrId) || this.getAgentById(nameOrId);
    if (!agent) return null;
    return getAgentPromptWithMetadata(agent);
  }

  /**
   * Lists all agent names
   */
  listAgentNames(): string[] {
    this.ensureLoaded();
    return Array.from(this.state.agents.values()).map(a => a.name);
  }

  /**
   * Reloads all agents from disk
   */
  reload(): AgentLoadResult {
    const result = loadAllAgents(this.config, this.cwd);

    // Update state
    this.state.agents.clear();
    for (const agent of result.agents) {
      // Validate agent
      const errors = validateAgent(agent);
      if (errors.length > 0) {
        logger.warn({
          agentId: agent.id,
          errors
        }, 'Agent validation warnings');
      }

      this.state.agents.set(agent.id, agent);
    }

    this.state.lastLoadAt = result.loadedAt;
    this.state.lastLoadErrors = result.errors;
    this.state.cacheValid = true;

    logger.info({
      agentCount: this.state.agents.size,
      errorCount: result.errors.length
    }, 'Agent manager reloaded');

    return result;
  }

  /**
   * Invalidates the cache
   */
  invalidateCache(): void {
    this.state.cacheValid = false;
  }

  /**
   * Gets the last load errors
   */
  getLastErrors(): AgentLoadResult['errors'] {
    return this.state.lastLoadErrors;
  }

  /**
   * Gets manager statistics
   */
  getStats(): {
    agentCount: number;
    cacheValid: boolean;
    lastLoadAt?: Date;
    errorCount: number;
    bySource: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    for (const agent of this.state.agents.values()) {
      bySource[agent.sourceType] = (bySource[agent.sourceType] || 0) + 1;
    }

    return {
      agentCount: this.state.agents.size,
      cacheValid: this.state.cacheValid,
      lastLoadAt: this.state.lastLoadAt,
      errorCount: this.state.lastLoadErrors.length,
      bySource
    };
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<AgentLoaderConfig>): void {
    this.config = { ...this.config, ...config };
    this.invalidateCache();
  }

  /**
   * Ensures agents are loaded
   */
  private ensureLoaded(): void {
    if (!this.state.cacheValid || this.isCacheExpired()) {
      this.reload();
    }
  }

  /**
   * Checks if cache is expired
   */
  private isCacheExpired(): boolean {
    if (!this.state.lastLoadAt) return true;
    const elapsed = Date.now() - this.state.lastLoadAt.getTime();
    return elapsed > this.config.cacheTtlMs;
  }
}

/**
 * Gets the Agent Manager singleton
 */
export function getAgentManager(
  config?: Partial<AgentLoaderConfig>,
  cwd?: string
): AgentManager {
  return AgentManager.getInstance(config, cwd);
}

export default {
  getAgentManager,
  loadAllAgents,
  loadAgentByName,
  getAgentPromptWithMetadata,
  validateAgent
};
