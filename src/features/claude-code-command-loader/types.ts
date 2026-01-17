// src/features/claude-code-command-loader/types.ts

/**
 * Claude Code Command Loader Types
 *
 * Types for loading and managing slash commands from Claude Code-compatible
 * markdown files with recursive namespace support.
 *
 * Directory structure becomes command namespace:
 * - .claude/commands/git/commit.md → /git:commit
 * - .claude/commands/test/unit.md → /test:unit
 */

/**
 * Command metadata from frontmatter
 */
export interface CommandMetadata {
  /** Command name (from frontmatter or filename) */
  name: string;
  /** Command description */
  description?: string;
  /** Short help text */
  help?: string;
  /** Command aliases */
  aliases?: string[];
  /** Whether command is hidden from help */
  hidden?: boolean;
  /** Whether command is enabled */
  enabled?: boolean;
  /** Required permissions */
  permissions?: string[];
  /** Tags for categorization */
  tags?: string[];
  /** Arguments schema (JSON Schema) */
  argsSchema?: Record<string, unknown>;
  /** Example usages */
  examples?: string[];
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Loaded command definition
 */
export interface LoadedCommand {
  /** Full command ID with namespace (e.g., "git:commit") */
  id: string;
  /** Command name without namespace */
  name: string;
  /** Namespace (e.g., "git" for "git:commit") */
  namespace?: string;
  /** Full slash command (e.g., "/git:commit") */
  slashCommand: string;
  /** Source file path */
  sourcePath: string;
  /** Source type */
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project';
  /** Parsed metadata from frontmatter */
  metadata: CommandMetadata;
  /** Command prompt/template (markdown body) */
  prompt: string;
  /** Raw file content */
  rawContent: string;
  /** When the file was last modified */
  lastModified: Date;
  /** File hash for change detection */
  contentHash: string;
}

/**
 * Command source directory configuration
 */
export interface CommandSourceConfig {
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
 * Command loader configuration
 */
export interface CommandLoaderConfig {
  /** User commands directory (~/.claude/commands/) */
  userCommandsDir: string;
  /** Project commands directory (.claude/commands/) */
  projectCommandsDir: string;
  /** OpenCode global commands (~/.config/opencode/command/) */
  opencodeGlobalDir?: string;
  /** OpenCode project commands (.opencode/command/) */
  opencodeProjectDir?: string;
  /** Whether to watch for file changes */
  watchForChanges: boolean;
  /** File extensions to load */
  fileExtensions: string[];
  /** Whether to merge commands with same ID (project overrides user) */
  mergeById: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Namespace separator (default: ':') */
  namespaceSeparator: string;
}

/**
 * Default configuration
 */
export const DEFAULT_COMMAND_LOADER_CONFIG: CommandLoaderConfig = {
  userCommandsDir: '~/.claude/commands',
  projectCommandsDir: '.claude/commands',
  opencodeGlobalDir: '~/.config/opencode/command',
  opencodeProjectDir: '.opencode/command',
  watchForChanges: false,
  fileExtensions: ['.md', '.markdown'],
  mergeById: true,
  cacheTtlMs: 60000, // 1 minute
  namespaceSeparator: ':'
};

/**
 * Command load result
 */
export interface CommandLoadResult {
  /** Successfully loaded commands */
  commands: LoadedCommand[];
  /** Errors encountered during loading */
  errors: CommandLoadError[];
  /** Sources that were checked */
  sourcesChecked: string[];
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Command load error
 */
export interface CommandLoadError {
  /** File path that caused the error */
  filePath: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'parse' | 'read' | 'validation' | 'unknown';
}

/**
 * Command registry state
 */
export interface CommandRegistryState {
  /** Loaded commands by ID */
  commands: Map<string, LoadedCommand>;
  /** Commands by namespace */
  namespaces: Map<string, LoadedCommand[]>;
  /** Last full load timestamp */
  lastLoadAt?: Date;
  /** Whether cache is valid */
  cacheValid: boolean;
  /** Errors from last load */
  lastLoadErrors: CommandLoadError[];
}

/**
 * Namespace info
 */
export interface NamespaceInfo {
  /** Namespace name */
  name: string;
  /** Commands in this namespace */
  commands: string[];
  /** Child namespaces */
  children: string[];
}
