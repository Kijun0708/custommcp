// src/features/mcp-loader/types.ts

/**
 * MCP Loader Types
 *
 * Type definitions for Claude Code style MCP configuration loading.
 */

/**
 * MCP Server configuration (Claude Code format)
 */
export interface McpServerConfig {
  /** Server command */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Whether to auto-start */
  disabled?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * MCP configuration file format
 */
export interface McpConfigFile {
  /** MCP servers configuration */
  mcpServers?: Record<string, McpServerConfig>;
}

/**
 * Loaded MCP server state
 */
export interface LoadedMcpServer {
  /** Server name/ID */
  name: string;
  /** Configuration */
  config: McpServerConfig;
  /** Source file */
  sourceFile: string;
  /** Scope: project, user, global */
  scope: 'project' | 'user' | 'global';
  /** Process ID if running */
  pid?: number;
  /** Whether server is running */
  running: boolean;
  /** Start time */
  startedAt?: number;
  /** Last error */
  lastError?: string;
  /** Tool names exposed by this server */
  tools?: string[];
}

/**
 * MCP loader configuration
 */
export interface McpLoaderConfig {
  /** Whether MCP loading is enabled */
  enabled: boolean;
  /** Config file names to look for */
  configFileNames: string[];
  /** Project-level config directories */
  projectPaths: string[];
  /** User-level config directories */
  userPaths: string[];
  /** Global config directories */
  globalPaths: string[];
  /** Auto-start enabled servers */
  autoStart: boolean;
  /** Merge configs (true) or override (false) */
  mergeConfigs: boolean;
  /** Cache loaded configs */
  cacheConfigs: boolean;
  /** Cache TTL in ms */
  cacheTtlMs: number;
}

/**
 * MCP loader statistics
 */
export interface McpLoaderStats {
  /** Total servers loaded */
  totalServersLoaded: number;
  /** Servers by scope */
  serversByScope: Record<string, number>;
  /** Running servers count */
  runningServers: number;
  /** Config files found */
  configFilesFound: number;
  /** Load errors count */
  loadErrors: number;
  /** Last load time */
  lastLoadTime?: number;
}
