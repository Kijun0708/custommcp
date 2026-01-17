// src/features/claude-code-command-loader/index.ts

/**
 * Claude Code Command Loader
 *
 * Loads slash commands from Claude Code-compatible markdown files
 * with recursive namespace support.
 *
 * Command files are loaded from (in priority order):
 * 1. Project: ./.claude/commands/ (highest priority)
 * 2. User: ~/.claude/commands/
 * 3. OpenCode Project: ./.opencode/command/
 * 4. OpenCode Global: ~/.config/opencode/command/ (lowest priority)
 *
 * Directory structure becomes namespace:
 * - commands/commit.md → /commit
 * - commands/git/commit.md → /git:commit
 * - commands/git/branch/create.md → /git:branch:create
 *
 * Usage:
 * ```typescript
 * import { getCommandManager } from './features/claude-code-command-loader';
 *
 * const manager = getCommandManager();
 *
 * // Get all commands
 * const commands = manager.getCommands();
 *
 * // Get command by ID
 * const cmd = manager.getCommandById('git:commit');
 *
 * // Get command by slash
 * const cmd = manager.getCommandBySlash('/git:commit');
 *
 * // Get commands in namespace
 * const gitCommands = manager.getCommandsInNamespace('git');
 * ```
 */

// Types
export type {
  CommandMetadata,
  LoadedCommand,
  CommandSourceConfig,
  CommandLoaderConfig,
  CommandLoadResult,
  CommandLoadError,
  CommandRegistryState,
  NamespaceInfo
} from './types.js';

export { DEFAULT_COMMAND_LOADER_CONFIG } from './types.js';

// Loader
export {
  loadAllCommands,
  loadCommandById,
  getCommandsByNamespace,
  getNamespaces,
  validateCommand,
  generateCommandHelp
} from './loader.js';

// Manager
import {
  LoadedCommand,
  CommandLoaderConfig,
  CommandLoadResult,
  CommandRegistryState,
  NamespaceInfo,
  DEFAULT_COMMAND_LOADER_CONFIG
} from './types.js';
import {
  loadAllCommands,
  loadCommandById,
  getCommandsByNamespace,
  getNamespaces,
  validateCommand,
  generateCommandHelp
} from './loader.js';
import { logger } from '../../utils/logger.js';

/**
 * Command Manager class
 *
 * Singleton manager for loading and caching commands.
 */
export class CommandManager {
  private static instance: CommandManager | null = null;

  private config: CommandLoaderConfig;
  private state: CommandRegistryState;
  private cwd: string;

  private constructor(config?: Partial<CommandLoaderConfig>, cwd?: string) {
    this.config = { ...DEFAULT_COMMAND_LOADER_CONFIG, ...config };
    this.cwd = cwd || process.cwd();
    this.state = {
      commands: new Map(),
      namespaces: new Map(),
      cacheValid: false,
      lastLoadErrors: []
    };
  }

  /**
   * Gets the singleton instance
   */
  static getInstance(config?: Partial<CommandLoaderConfig>, cwd?: string): CommandManager {
    if (!CommandManager.instance) {
      CommandManager.instance = new CommandManager(config, cwd);
    }
    return CommandManager.instance;
  }

  /**
   * Resets the singleton instance (for testing)
   */
  static resetInstance(): void {
    CommandManager.instance = null;
  }

  /**
   * Loads or returns cached commands
   */
  getCommands(forceReload: boolean = false): LoadedCommand[] {
    if (forceReload || !this.state.cacheValid || this.isCacheExpired()) {
      this.reload();
    }
    return Array.from(this.state.commands.values());
  }

  /**
   * Gets a command by ID (e.g., "git:commit")
   */
  getCommandById(id: string): LoadedCommand | undefined {
    this.ensureLoaded();
    return this.state.commands.get(id.toLowerCase());
  }

  /**
   * Gets a command by slash command (e.g., "/git:commit")
   */
  getCommandBySlash(slashCommand: string): LoadedCommand | undefined {
    const id = slashCommand.startsWith('/') ? slashCommand.slice(1) : slashCommand;
    return this.getCommandById(id);
  }

  /**
   * Gets commands in a namespace
   */
  getCommandsInNamespace(namespace: string): LoadedCommand[] {
    this.ensureLoaded();
    return this.state.namespaces.get(namespace.toLowerCase()) || [];
  }

  /**
   * Gets all namespaces
   */
  getNamespaces(): NamespaceInfo[] {
    this.ensureLoaded();
    const commands = Array.from(this.state.commands.values());
    const namespaceNames = getNamespaces(commands);

    return namespaceNames.map(name => {
      const commandsInNs = this.getCommandsInNamespace(name);
      const childNamespaces = namespaceNames.filter(n =>
        n.startsWith(name + this.config.namespaceSeparator) &&
        n.split(this.config.namespaceSeparator).length ===
          name.split(this.config.namespaceSeparator).length + 1
      );

      return {
        name,
        commands: commandsInNs.map(c => c.id),
        children: childNamespaces
      };
    });
  }

  /**
   * Lists all command IDs
   */
  listCommandIds(): string[] {
    this.ensureLoaded();
    return Array.from(this.state.commands.keys());
  }

  /**
   * Lists all slash commands
   */
  listSlashCommands(): string[] {
    this.ensureLoaded();
    return Array.from(this.state.commands.values()).map(c => c.slashCommand);
  }

  /**
   * Gets command prompt
   */
  getCommandPrompt(idOrSlash: string): string | null {
    const command = this.getCommandById(idOrSlash) || this.getCommandBySlash(idOrSlash);
    return command?.prompt || null;
  }

  /**
   * Gets command help
   */
  getCommandHelp(idOrSlash: string): string | null {
    const command = this.getCommandById(idOrSlash) || this.getCommandBySlash(idOrSlash);
    return command ? generateCommandHelp(command) : null;
  }

  /**
   * Searches commands by name, description, or tags
   */
  searchCommands(query: string): LoadedCommand[] {
    this.ensureLoaded();
    const lowerQuery = query.toLowerCase();

    return Array.from(this.state.commands.values()).filter(cmd => {
      // Search in name
      if (cmd.name.toLowerCase().includes(lowerQuery)) return true;
      // Search in ID
      if (cmd.id.toLowerCase().includes(lowerQuery)) return true;
      // Search in description
      if (cmd.metadata.description?.toLowerCase().includes(lowerQuery)) return true;
      // Search in tags
      if (cmd.metadata.tags?.some(t => t.toLowerCase().includes(lowerQuery))) return true;
      return false;
    });
  }

  /**
   * Reloads all commands from disk
   */
  reload(): CommandLoadResult {
    const result = loadAllCommands(this.config, this.cwd);

    // Update state
    this.state.commands.clear();
    this.state.namespaces.clear();

    for (const command of result.commands) {
      // Validate command
      const errors = validateCommand(command);
      if (errors.length > 0) {
        logger.warn({
          commandId: command.id,
          errors
        }, 'Command validation warnings');
      }

      this.state.commands.set(command.id.toLowerCase(), command);

      // Add to namespace index
      if (command.namespace) {
        const ns = command.namespace.toLowerCase();
        if (!this.state.namespaces.has(ns)) {
          this.state.namespaces.set(ns, []);
        }
        this.state.namespaces.get(ns)!.push(command);
      }
    }

    this.state.lastLoadAt = result.loadedAt;
    this.state.lastLoadErrors = result.errors;
    this.state.cacheValid = true;

    logger.info({
      commandCount: this.state.commands.size,
      namespaceCount: this.state.namespaces.size,
      errorCount: result.errors.length
    }, 'Command manager reloaded');

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
  getLastErrors(): CommandLoadResult['errors'] {
    return this.state.lastLoadErrors;
  }

  /**
   * Gets manager statistics
   */
  getStats(): {
    commandCount: number;
    namespaceCount: number;
    cacheValid: boolean;
    lastLoadAt?: Date;
    errorCount: number;
    bySource: Record<string, number>;
  } {
    const bySource: Record<string, number> = {};
    for (const command of this.state.commands.values()) {
      bySource[command.sourceType] = (bySource[command.sourceType] || 0) + 1;
    }

    return {
      commandCount: this.state.commands.size,
      namespaceCount: this.state.namespaces.size,
      cacheValid: this.state.cacheValid,
      lastLoadAt: this.state.lastLoadAt,
      errorCount: this.state.lastLoadErrors.length,
      bySource
    };
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<CommandLoaderConfig>): void {
    this.config = { ...this.config, ...config };
    this.invalidateCache();
  }

  /**
   * Generates help for all commands
   */
  generateAllHelp(): string {
    this.ensureLoaded();

    const commands = Array.from(this.state.commands.values())
      .filter(c => !c.metadata.hidden)
      .sort((a, b) => a.id.localeCompare(b.id));

    const lines: string[] = ['# Available Commands', ''];

    // Group by namespace
    const byNamespace = new Map<string, LoadedCommand[]>();
    const rootCommands: LoadedCommand[] = [];

    for (const cmd of commands) {
      if (cmd.namespace) {
        const ns = cmd.namespace;
        if (!byNamespace.has(ns)) {
          byNamespace.set(ns, []);
        }
        byNamespace.get(ns)!.push(cmd);
      } else {
        rootCommands.push(cmd);
      }
    }

    // Root commands
    if (rootCommands.length > 0) {
      lines.push('## General Commands', '');
      for (const cmd of rootCommands) {
        lines.push(`- **${cmd.slashCommand}**: ${cmd.metadata.description || cmd.name}`);
      }
      lines.push('');
    }

    // Namespaced commands
    for (const [ns, cmds] of Array.from(byNamespace.entries()).sort()) {
      lines.push(`## ${ns}`, '');
      for (const cmd of cmds.sort((a, b) => a.id.localeCompare(b.id))) {
        lines.push(`- **${cmd.slashCommand}**: ${cmd.metadata.description || cmd.name}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Ensures commands are loaded
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
 * Gets the Command Manager singleton
 */
export function getCommandManager(
  config?: Partial<CommandLoaderConfig>,
  cwd?: string
): CommandManager {
  return CommandManager.getInstance(config, cwd);
}

export default {
  getCommandManager,
  loadAllCommands,
  loadCommandById,
  getCommandsByNamespace,
  getNamespaces,
  validateCommand,
  generateCommandHelp
};
