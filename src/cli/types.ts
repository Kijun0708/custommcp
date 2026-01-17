// src/cli/types.ts

/**
 * CLI Types for custommcp installation and management
 */

/**
 * Supported subscription/platform types
 */
export type SubscriptionType = 'claude' | 'chatgpt' | 'gemini';

/**
 * Installation options
 */
export interface InstallOptions {
  /** Non-interactive mode (no TUI) */
  noTui?: boolean;
  /** Target subscriptions to configure */
  subscriptions?: SubscriptionType[];
  /** Skip agent installation */
  skipAgents?: boolean;
  /** Skip command installation */
  skipCommands?: boolean;
  /** Custom working directory */
  cwd?: string;
  /** Force overwrite existing config */
  force?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * CLI configuration state
 */
export interface CliConfig {
  /** Version */
  version: string;
  /** Installed subscriptions */
  subscriptions: SubscriptionType[];
  /** Installation timestamp */
  installedAt: string;
  /** Last update check */
  lastUpdateCheck?: string;
  /** MCP server paths */
  mcpServerPaths: {
    config: string;
    agents: string;
    commands: string;
  };
}

/**
 * Claude Code settings.json structure
 */
export interface ClaudeCodeSettings {
  mcpServers?: Record<string, McpServerConfig>;
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

/**
 * Doctor check result
 */
export interface DoctorCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

/**
 * Doctor report
 */
export interface DoctorReport {
  timestamp: string;
  checks: DoctorCheckResult[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

/**
 * Update info
 */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes?: string;
  releaseUrl?: string;
}

/**
 * Default agent definition for installation
 */
export interface DefaultAgent {
  name: string;
  filename: string;
  content: string;
  description: string;
}

/**
 * Default command definition for installation
 */
export interface DefaultCommand {
  name: string;
  namespace?: string;
  filename: string;
  content: string;
  description: string;
}
