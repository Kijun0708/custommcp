// src/features/claude-code-agent-loader/types.ts

/**
 * Claude Code Agent Loader Types
 *
 * Types for loading and managing agents from Claude Code-compatible
 * markdown files in ~/.claude/agents/ and ./.claude/agents/ directories.
 */

/**
 * Agent metadata from frontmatter
 */
export interface AgentMetadata {
  /** Agent name (from frontmatter or filename) */
  name: string;
  /** Agent description */
  description?: string;
  /** Tools the agent can use */
  tools?: string[];
  /** Agent mode (subagent, standalone, etc.) */
  mode?: 'subagent' | 'standalone' | 'collaborative';
  /** Model to use for this agent */
  model?: string;
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Tags for categorization */
  tags?: string[];
  /** Whether agent is enabled */
  enabled?: boolean;
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Loaded agent definition
 */
export interface LoadedAgent {
  /** Unique agent ID (derived from path) */
  id: string;
  /** Agent name */
  name: string;
  /** Source file path */
  sourcePath: string;
  /** Source type */
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project';
  /** Parsed metadata from frontmatter */
  metadata: AgentMetadata;
  /** Agent prompt (markdown body) */
  prompt: string;
  /** Raw file content */
  rawContent: string;
  /** When the file was last modified */
  lastModified: Date;
  /** File hash for change detection */
  contentHash: string;
}

/**
 * Agent source directory configuration
 */
export interface AgentSourceConfig {
  /** Directory path */
  path: string;
  /** Source type */
  type: 'user' | 'project' | 'opencode-global' | 'opencode-project';
  /** Priority (lower = higher priority in merge) */
  priority: number;
  /** Whether this source is enabled */
  enabled: boolean;
}

/**
 * Agent loader configuration
 */
export interface AgentLoaderConfig {
  /** User agents directory (~/.claude/agents/) */
  userAgentsDir: string;
  /** Project agents directory (.claude/agents/) */
  projectAgentsDir: string;
  /** OpenCode global agents (~/.config/opencode/agents/) */
  opencodeGlobalDir?: string;
  /** OpenCode project agents (.opencode/agents/) */
  opencodeProjectDir?: string;
  /** Whether to watch for file changes */
  watchForChanges: boolean;
  /** File extensions to load */
  fileExtensions: string[];
  /** Whether to merge agents with same name (project overrides user) */
  mergeByName: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

/**
 * Default configuration
 */
export const DEFAULT_AGENT_LOADER_CONFIG: AgentLoaderConfig = {
  userAgentsDir: '~/.claude/agents',
  projectAgentsDir: '.claude/agents',
  opencodeGlobalDir: '~/.config/opencode/agents',
  opencodeProjectDir: '.opencode/agents',
  watchForChanges: false,
  fileExtensions: ['.md', '.markdown'],
  mergeByName: true,
  cacheTtlMs: 60000 // 1 minute
};

/**
 * Agent load result
 */
export interface AgentLoadResult {
  /** Successfully loaded agents */
  agents: LoadedAgent[];
  /** Errors encountered during loading */
  errors: AgentLoadError[];
  /** Sources that were checked */
  sourcesChecked: string[];
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Agent load error
 */
export interface AgentLoadError {
  /** File path that caused the error */
  filePath: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'parse' | 'read' | 'validation' | 'unknown';
}

/**
 * Agent registry state
 */
export interface AgentRegistryState {
  /** Loaded agents by ID */
  agents: Map<string, LoadedAgent>;
  /** Last full load timestamp */
  lastLoadAt?: Date;
  /** Whether cache is valid */
  cacheValid: boolean;
  /** Errors from last load */
  lastLoadErrors: AgentLoadError[];
}
