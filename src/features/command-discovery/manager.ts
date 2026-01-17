// src/features/command-discovery/manager.ts

/**
 * Command Discovery Manager
 *
 * Singleton manager for the command discovery system.
 * Handles scanning, caching, and providing command definitions.
 */

import { logger } from '../../utils/logger.js';
import {
  CommandDefinition,
  LoadedCommand,
  CommandDiscoveryConfig,
  CommandDiscoveryStats
} from './types.js';
import {
  loadCommandDiscoveryConfig,
  saveCommandDiscoveryConfig,
  scanAllDirectories,
  getCachedCommands,
  updateCommandCache,
  getLastScanTime,
  clearCommandCache
} from './storage.js';

/**
 * Command Discovery Manager
 */
class CommandDiscoveryManager {
  private config: CommandDiscoveryConfig;
  private scanTimer?: NodeJS.Timeout;
  private errors: string[] = [];
  private invalidCommands: string[] = [];

  constructor() {
    this.config = loadCommandDiscoveryConfig();
    logger.info({
      enabled: this.config.enabled,
      projectDirs: this.config.projectDirs.length,
      userDirs: this.config.userDirs.length,
      globalDirs: this.config.globalDirs.length
    }, 'CommandDiscoveryManager initialized');
  }

  /**
   * Initializes the manager and performs initial scan
   */
  initialize(cwd?: string): void {
    if (!this.config.enabled) {
      logger.info('Command discovery disabled');
      return;
    }

    // Perform initial scan
    this.scan(cwd);

    // Set up periodic scanning if configured
    if (this.config.scanIntervalMs > 0 && !this.config.watchEnabled) {
      this.scanTimer = setInterval(() => {
        this.scan(cwd);
      }, this.config.scanIntervalMs);
    }
  }

  /**
   * Scans all directories for commands
   */
  scan(cwd?: string): void {
    this.errors = [];
    this.invalidCommands = [];

    try {
      const commands = scanAllDirectories(this.config, cwd);

      // Track invalid commands
      for (const cmd of commands) {
        if (!cmd.valid) {
          this.invalidCommands.push(`${cmd.sourcePath}: ${cmd.errors?.join(', ')}`);
        }
      }

      // Update cache with valid commands only
      updateCommandCache(commands.filter(c => c.valid));

      logger.info({
        total: commands.length,
        valid: commands.filter(c => c.valid).length,
        invalid: this.invalidCommands.length
      }, 'Command scan complete');
    } catch (error: any) {
      this.errors.push(error.message);
      logger.error({ error: error.message }, 'Command scan failed');
    }
  }

  /**
   * Gets a command by name or alias
   */
  getCommand(nameOrAlias: string): LoadedCommand | undefined {
    const cache = getCachedCommands();
    return cache.get(nameOrAlias);
  }

  /**
   * Gets all discovered commands
   */
  getAllCommands(): LoadedCommand[] {
    const cache = getCachedCommands();
    const seen = new Set<string>();
    const result: LoadedCommand[] = [];

    for (const cmd of cache.values()) {
      if (!seen.has(cmd.definition.name)) {
        seen.add(cmd.definition.name);
        result.push(cmd);
      }
    }

    return result;
  }

  /**
   * Gets commands by tag
   */
  getCommandsByTag(tag: string): LoadedCommand[] {
    return this.getAllCommands().filter(cmd =>
      cmd.definition.tags?.includes(tag)
    );
  }

  /**
   * Gets commands by source type
   */
  getCommandsBySource(sourceType: 'project' | 'claude' | 'global'): LoadedCommand[] {
    return this.getAllCommands().filter(cmd =>
      cmd.sourceType === sourceType
    );
  }

  /**
   * Checks if a command exists
   */
  hasCommand(nameOrAlias: string): boolean {
    return getCachedCommands().has(nameOrAlias);
  }

  /**
   * Executes a command's prompt with parameters
   */
  executeCommand(nameOrAlias: string, params?: Record<string, any>): string | null {
    const cmd = this.getCommand(nameOrAlias);
    if (!cmd) return null;

    let prompt = cmd.definition.prompt;

    // Replace parameter placeholders
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        // Support both {{key}} and ${key} syntax
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        prompt = prompt.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value));
      }
    }

    return prompt;
  }

  /**
   * Gets discovery statistics
   */
  getStats(): CommandDiscoveryStats {
    const commands = this.getAllCommands();
    const commandsBySource: Record<string, number> = {
      project: 0,
      claude: 0,
      global: 0
    };

    for (const cmd of commands) {
      commandsBySource[cmd.sourceType]++;
    }

    return {
      totalCommands: commands.length,
      commandsBySource,
      lastScanAt: getLastScanTime(),
      scannedDirs: [
        ...this.config.projectDirs,
        ...this.config.userDirs,
        ...this.config.globalDirs
      ],
      errors: this.errors,
      invalidCommands: this.invalidCommands
    };
  }

  /**
   * Gets current configuration
   */
  getConfig(): CommandDiscoveryConfig {
    return { ...this.config };
  }

  /**
   * Updates configuration
   */
  updateConfig(updates: Partial<CommandDiscoveryConfig>): void {
    this.config = { ...this.config, ...updates };
    saveCommandDiscoveryConfig(this.config);

    // Reinitialize if needed
    if (updates.enabled !== undefined) {
      if (this.config.enabled) {
        this.initialize();
      } else {
        this.shutdown();
      }
    }

    logger.info({ config: this.config }, 'Command discovery config updated');
  }

  /**
   * Adds a custom directory to scan
   */
  addDirectory(dir: string, type: 'project' | 'user' | 'global'): void {
    switch (type) {
      case 'project':
        if (!this.config.projectDirs.includes(dir)) {
          this.config.projectDirs.push(dir);
        }
        break;
      case 'user':
        if (!this.config.userDirs.includes(dir)) {
          this.config.userDirs.push(dir);
        }
        break;
      case 'global':
        if (!this.config.globalDirs.includes(dir)) {
          this.config.globalDirs.push(dir);
        }
        break;
    }
    saveCommandDiscoveryConfig(this.config);
    this.scan();
  }

  /**
   * Removes a custom directory
   */
  removeDirectory(dir: string): void {
    this.config.projectDirs = this.config.projectDirs.filter(d => d !== dir);
    this.config.userDirs = this.config.userDirs.filter(d => d !== dir);
    this.config.globalDirs = this.config.globalDirs.filter(d => d !== dir);
    saveCommandDiscoveryConfig(this.config);
  }

  /**
   * Forces a rescan
   */
  rescan(cwd?: string): void {
    clearCommandCache();
    this.scan(cwd);
  }

  /**
   * Shuts down the manager
   */
  shutdown(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }
    clearCommandCache();
  }
}

// Singleton instance
let instance: CommandDiscoveryManager | null = null;

/**
 * Gets the command discovery manager instance
 */
export function getCommandDiscoveryManager(): CommandDiscoveryManager {
  if (!instance) {
    instance = new CommandDiscoveryManager();
  }
  return instance;
}

/**
 * Resets the manager (for testing)
 */
export function resetCommandDiscoveryManager(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
