// src/features/command-discovery/types.ts

/**
 * Command Discovery Types
 *
 * Type definitions for the command discovery system.
 */

/**
 * Command definition from a command file
 */
export interface CommandDefinition {
  /** Unique command name (used as trigger) */
  name: string;
  /** Description of what the command does */
  description: string;
  /** Command prompt template */
  prompt: string;
  /** Optional aliases for the command */
  aliases?: string[];
  /** Whether command is enabled */
  enabled?: boolean;
  /** Tags for categorization */
  tags?: string[];
  /** Required context (files, variables, etc.) */
  context?: CommandContext;
  /** Optional parameters the command accepts */
  parameters?: CommandParameter[];
}

/**
 * Command parameter definition
 */
export interface CommandParameter {
  /** Parameter name */
  name: string;
  /** Parameter description */
  description: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array';
  /** Whether parameter is required */
  required?: boolean;
  /** Default value */
  default?: string | number | boolean | string[];
}

/**
 * Command context requirements
 */
export interface CommandContext {
  /** Files to include in context */
  files?: string[];
  /** Environment variables to include */
  env?: string[];
  /** Git information to include */
  git?: boolean;
  /** Directory structure to include */
  tree?: boolean;
}

/**
 * Loaded command with metadata
 */
export interface LoadedCommand {
  /** Command definition */
  definition: CommandDefinition;
  /** Source file path */
  sourcePath: string;
  /** Source directory type */
  sourceType: 'project' | 'claude' | 'global';
  /** Load timestamp */
  loadedAt: number;
  /** Whether command is valid */
  valid: boolean;
  /** Validation errors if any */
  errors?: string[];
}

/**
 * Command discovery configuration
 */
export interface CommandDiscoveryConfig {
  /** Whether discovery is enabled */
  enabled: boolean;
  /** Directories to scan (relative to project root) */
  projectDirs: string[];
  /** User-level directories to scan */
  userDirs: string[];
  /** Global config directories */
  globalDirs: string[];
  /** File extensions to consider */
  extensions: string[];
  /** Whether to watch for changes */
  watchEnabled: boolean;
  /** Scan interval in milliseconds (if not watching) */
  scanIntervalMs: number;
  /** Whether to allow override of built-in commands */
  allowOverride: boolean;
}

/**
 * Command discovery statistics
 */
export interface CommandDiscoveryStats {
  /** Total commands discovered */
  totalCommands: number;
  /** Commands by source type */
  commandsBySource: Record<string, number>;
  /** Last scan timestamp */
  lastScanAt?: number;
  /** Directories scanned */
  scannedDirs: string[];
  /** Errors encountered */
  errors: string[];
  /** Commands that failed validation */
  invalidCommands: string[];
}

/**
 * Default command discovery configuration
 */
export const DEFAULT_COMMAND_DISCOVERY_CONFIG: CommandDiscoveryConfig = {
  enabled: true,
  projectDirs: [
    '.opencode/command',
    '.opencode/commands',
    '.claude/commands'
  ],
  userDirs: [
    '~/.opencode/commands',
    '~/.claude/commands'
  ],
  globalDirs: [
    '~/.config/opencode/command',
    '~/.config/opencode/commands',
    '~/.config/claude/commands'
  ],
  extensions: ['.json', '.yaml', '.yml', '.md'],
  watchEnabled: false,
  scanIntervalMs: 60000, // 1 minute
  allowOverride: false
};

/**
 * Example command definition (for reference)
 */
export const EXAMPLE_COMMAND: CommandDefinition = {
  name: 'review-pr',
  description: 'Review a pull request with detailed analysis',
  prompt: `Review the following pull request:

{{pr_url}}

Please analyze:
1. Code quality and best practices
2. Potential bugs or issues
3. Security concerns
4. Performance implications
5. Test coverage

Provide a detailed review with actionable suggestions.`,
  aliases: ['pr', 'pull-request'],
  enabled: true,
  tags: ['git', 'review', 'code-quality'],
  parameters: [
    {
      name: 'pr_url',
      description: 'URL of the pull request',
      type: 'string',
      required: true
    },
    {
      name: 'focus',
      description: 'Specific area to focus on',
      type: 'string',
      required: false,
      default: 'all'
    }
  ]
};
