// src/features/skill-system/types.ts

/**
 * Skill System Types
 *
 * Type definitions for the dynamic skill loading system.
 */

/**
 * Skill scope - where the skill is defined
 */
export type SkillScope = 'project' | 'user' | 'global' | 'builtin';

/**
 * Skill definition
 */
export interface SkillDefinition {
  /** Unique skill identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Scope where skill was loaded from */
  scope: SkillScope;
  /** File path if loaded from file */
  filePath?: string;
  /** Skill version */
  version?: string;
  /** Author */
  author?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Whether skill is enabled */
  enabled: boolean;
  /** Skill configuration */
  config?: Record<string, unknown>;
  /** MCP server configuration if skill uses embedded MCP */
  mcp?: SkillMcpConfig;
  /** Prompt/instructions for the skill */
  prompt?: string;
  /** Tools available in this skill */
  tools?: string[];
  /** Required capabilities */
  requires?: string[];
  /** Preferred expert ID for this skill */
  expert?: string;
  /** Argument hint (what parameters the skill expects) */
  argumentHint?: string;
}

/**
 * Skill MCP configuration
 */
export interface SkillMcpConfig {
  /** MCP server command */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Working directory */
  cwd?: string;
  /** Auto-start on load */
  autoStart?: boolean;
}

/**
 * Loaded skill instance
 */
export interface LoadedSkill extends SkillDefinition {
  /** Load timestamp */
  loadedAt: number;
  /** Last used timestamp */
  lastUsedAt?: number;
  /** Usage count */
  usageCount: number;
  /** Runtime state */
  state: SkillState;
  /** MCP server process if running */
  mcpProcess?: SkillMcpProcess;
}

/**
 * Skill state
 */
export type SkillState = 'loaded' | 'active' | 'disabled' | 'error';

/**
 * Skill MCP process
 */
export interface SkillMcpProcess {
  /** Process ID */
  pid?: number;
  /** Server URL */
  url?: string;
  /** Whether server is running */
  running: boolean;
  /** Start time */
  startedAt?: number;
  /** Last error */
  lastError?: string;
}

/**
 * Skill execution context
 */
export interface SkillExecutionContext {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** User input/prompt */
  input: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Skill execution result
 */
export interface SkillExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Output/response */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  duration: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Skill loader configuration
 */
export interface SkillLoaderConfig {
  /** Whether skill loading is enabled */
  enabled: boolean;
  /** Project-level skills directory */
  projectPaths: string[];
  /** User-level skills directory */
  userPaths: string[];
  /** Global skills directory */
  globalPaths: string[];
  /** File extensions to load */
  extensions: string[];
  /** Auto-load skills on startup */
  autoLoad: boolean;
  /** Auto-enable loaded skills */
  autoEnable: boolean;
  /** Watch for file changes */
  watchChanges: boolean;
  /** Cache loaded skills */
  cacheSkills: boolean;
  /** Cache TTL in ms */
  cacheTtlMs: number;
}

/**
 * Skill loader statistics
 */
export interface SkillLoaderStats {
  totalSkillsLoaded: number;
  skillsByScope: Record<SkillScope, number>;
  skillsByState: Record<SkillState, number>;
  totalExecutions: number;
  lastLoadTime?: number;
  loadErrors: number;
}

/**
 * Skill file format
 */
export interface SkillFileFormat {
  /** Skill metadata */
  skill: {
    id?: string;
    name: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
    expert?: string;
    argumentHint?: string;
  };
  /** Configuration */
  config?: Record<string, unknown>;
  /** MCP configuration */
  mcp?: SkillMcpConfig;
  /** Prompt/instructions */
  prompt?: string;
  /** Tools */
  tools?: string[];
  /** Requirements */
  requires?: string[];
}
