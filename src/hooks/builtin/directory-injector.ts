// src/hooks/builtin/directory-injector.ts

/**
 * Directory Injector Hooks
 *
 * Automatically injects context from directory-specific files:
 * - AGENTS.md: Agent instructions and capabilities
 * - README.md: Project documentation
 * - .claude/rules/: Custom rules for Claude
 *
 * Features:
 * - Automatic file detection
 * - Hierarchical scanning (current → parent directories)
 * - Caching for performance
 * - Configurable injection points
 */

import {
  HookDefinition,
  HookResult,
  OnExpertCallContext,
  OnWorkflowStartContext,
  OnToolCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Injector types
 */
type InjectorType = 'agents' | 'readme' | 'rules';

/**
 * Cached content entry
 */
interface CacheEntry {
  content: string;
  timestamp: number;
  filePath: string;
}

/**
 * Configuration
 */
interface DirectoryInjectorConfig {
  /** Enable agents.md injection */
  enableAgents: boolean;
  /** Enable readme.md injection */
  enableReadme: boolean;
  /** Enable rules injection */
  enableRules: boolean;
  /** Maximum parent directories to scan */
  maxParentScan: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** Maximum content length per file */
  maxContentLength: number;
  /** File names for agents */
  agentsFileNames: string[];
  /** File names for readme */
  readmeFileNames: string[];
  /** Rules directory name */
  rulesDirectory: string;
  /** Inject on expert calls */
  injectOnExpertCall: boolean;
  /** Inject on workflow start */
  injectOnWorkflowStart: boolean;
  /** Inject on specific tools */
  injectOnTools: string[];
}

const DEFAULT_CONFIG: DirectoryInjectorConfig = {
  enableAgents: true,
  enableReadme: true,
  enableRules: true,
  maxParentScan: 5,
  cacheTtlMs: 300000, // 5 minutes
  maxContentLength: 10000,
  agentsFileNames: ['AGENTS.md', 'agents.md', 'AGENT.md', 'agent.md'],
  readmeFileNames: ['README.md', 'readme.md', 'Readme.md'],
  rulesDirectory: '.claude/rules',
  injectOnExpertCall: true,
  injectOnWorkflowStart: true,
  injectOnTools: ['consult_expert', 'design_with_experts', 'orchestrate_task']
};

let config: DirectoryInjectorConfig = { ...DEFAULT_CONFIG };

/**
 * Cache storage
 */
const cache: Map<string, CacheEntry> = new Map();

/**
 * State tracking
 */
interface InjectorState {
  /** Total injections */
  totalInjections: number;
  /** Injections by type */
  injectionsByType: Record<InjectorType, number>;
  /** Cache hits */
  cacheHits: number;
  /** Cache misses */
  cacheMisses: number;
  /** Files found */
  filesFound: Map<string, string>;
  /** Last scan timestamp */
  lastScanAt?: number;
}

let state: InjectorState = {
  totalInjections: 0,
  injectionsByType: {
    agents: 0,
    readme: 0,
    rules: 0
  },
  cacheHits: 0,
  cacheMisses: 0,
  filesFound: new Map()
};

/**
 * Finds a file by scanning current and parent directories
 */
function findFile(startDir: string, fileNames: string[]): string | null {
  let currentDir = startDir;
  let scanned = 0;

  while (scanned < config.maxParentScan) {
    for (const fileName of fileNames) {
      const filePath = join(currentDir, fileName);
      if (existsSync(filePath)) {
        try {
          const stat = statSync(filePath);
          if (stat.isFile()) {
            return filePath;
          }
        } catch {
          // Ignore stat errors
        }
      }
    }

    // Move to parent directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root
      break;
    }
    currentDir = parentDir;
    scanned++;
  }

  return null;
}

/**
 * Finds all rule files in rules directory
 */
function findRuleFiles(startDir: string): string[] {
  const ruleFiles: string[] = [];
  let currentDir = startDir;
  let scanned = 0;

  while (scanned < config.maxParentScan) {
    const rulesDir = join(currentDir, config.rulesDirectory);
    if (existsSync(rulesDir)) {
      try {
        const stat = statSync(rulesDir);
        if (stat.isDirectory()) {
          const files = readdirSync(rulesDir);
          for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.txt')) {
              ruleFiles.push(join(rulesDir, file));
            }
          }
          if (ruleFiles.length > 0) {
            return ruleFiles;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Move to parent directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
    scanned++;
  }

  return ruleFiles;
}

/**
 * Reads file content with caching
 */
function readFileWithCache(filePath: string): string | null {
  const cacheKey = filePath;
  const now = Date.now();

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && (now - cached.timestamp) < config.cacheTtlMs) {
    state.cacheHits++;
    return cached.content;
  }

  state.cacheMisses++;

  try {
    let content = readFileSync(filePath, 'utf-8');

    // Truncate if too long
    if (content.length > config.maxContentLength) {
      content = content.substring(0, config.maxContentLength) +
        `\n\n... [truncated, ${content.length - config.maxContentLength} chars omitted]`;
    }

    // Update cache
    cache.set(cacheKey, {
      content,
      timestamp: now,
      filePath
    });

    return content;
  } catch (error) {
    logger.debug({ filePath, error }, '[Directory Injector] Failed to read file');
    return null;
  }
}

/**
 * Builds injection content for a directory
 */
function buildInjectionContent(cwd: string): string | null {
  const sections: string[] = [];

  // Agents injection
  if (config.enableAgents) {
    const agentsFile = findFile(cwd, config.agentsFileNames);
    if (agentsFile) {
      const content = readFileWithCache(agentsFile);
      if (content) {
        state.filesFound.set('agents', agentsFile);
        state.injectionsByType.agents++;
        sections.push(`## 📋 Agent Instructions (${basename(agentsFile)})\n\n${content}`);
      }
    }
  }

  // README injection
  if (config.enableReadme) {
    const readmeFile = findFile(cwd, config.readmeFileNames);
    if (readmeFile) {
      const content = readFileWithCache(readmeFile);
      if (content) {
        state.filesFound.set('readme', readmeFile);
        state.injectionsByType.readme++;
        sections.push(`## 📖 Project README (${basename(readmeFile)})\n\n${content}`);
      }
    }
  }

  // Rules injection
  if (config.enableRules) {
    const ruleFiles = findRuleFiles(cwd);
    if (ruleFiles.length > 0) {
      const rulesContent: string[] = [];
      for (const ruleFile of ruleFiles) {
        const content = readFileWithCache(ruleFile);
        if (content) {
          rulesContent.push(`### ${basename(ruleFile)}\n\n${content}`);
        }
      }
      if (rulesContent.length > 0) {
        state.filesFound.set('rules', ruleFiles[0]);
        state.injectionsByType.rules++;
        sections.push(`## 📏 Custom Rules\n\n${rulesContent.join('\n\n---\n\n')}`);
      }
    }
  }

  if (sections.length === 0) {
    return null;
  }

  state.totalInjections++;
  state.lastScanAt = Date.now();

  return `\n\n---\n\n# 🗂️ Directory Context\n\n${sections.join('\n\n---\n\n')}\n\n---\n`;
}

/**
 * Updates configuration
 */
export function updateDirectoryInjectorConfig(newConfig: Partial<DirectoryInjectorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Gets injector statistics
 */
export function getDirectoryInjectorStats(): {
  totalInjections: number;
  injectionsByType: Record<InjectorType, number>;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  filesFound: Record<string, string>;
  cacheSize: number;
} {
  const totalCacheAccess = state.cacheHits + state.cacheMisses;
  return {
    totalInjections: state.totalInjections,
    injectionsByType: { ...state.injectionsByType },
    cacheHits: state.cacheHits,
    cacheMisses: state.cacheMisses,
    cacheHitRate: totalCacheAccess > 0 ? state.cacheHits / totalCacheAccess : 0,
    filesFound: Object.fromEntries(state.filesFound),
    cacheSize: cache.size
  };
}

/**
 * Resets injector state
 */
export function resetDirectoryInjectorState(): void {
  state = {
    totalInjections: 0,
    injectionsByType: {
      agents: 0,
      readme: 0,
      rules: 0
    },
    cacheHits: 0,
    cacheMisses: 0,
    filesFound: new Map()
  };
}

/**
 * Clears the cache
 */
export function clearDirectoryInjectorCache(): void {
  cache.clear();
}

/**
 * Hook: Inject context on expert calls
 */
const expertCallInjectorHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_directory_injector_expert',
  name: 'Directory Injector (Expert Call)',
  description: 'Injects directory context (AGENTS.md, README, rules) on expert calls',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!config.injectOnExpertCall) {
      return { decision: 'continue' };
    }

    const injectionContent = buildInjectionContent(context.cwd);

    if (injectionContent) {
      logger.debug({
        expertId: context.expertId,
        cwd: context.cwd
      }, '[Directory Injector] Injecting context for expert call');

      return {
        decision: 'modify',
        modifiedData: {
          context: (context.context || '') + injectionContent
        },
        metadata: {
          injectedFiles: Object.fromEntries(state.filesFound)
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Inject context on workflow start
 */
const workflowStartInjectorHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin_directory_injector_workflow',
  name: 'Directory Injector (Workflow Start)',
  description: 'Injects directory context on workflow start',
  eventType: 'onWorkflowStart',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!config.injectOnWorkflowStart) {
      return { decision: 'continue' };
    }

    const injectionContent = buildInjectionContent(context.cwd);

    if (injectionContent) {
      logger.debug({
        cwd: context.cwd,
        ralphLoopMode: context.ralphLoopMode
      }, '[Directory Injector] Injecting context for workflow');

      return {
        decision: 'continue',
        injectMessage: injectionContent,
        metadata: {
          injectedFiles: Object.fromEntries(state.filesFound)
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Inject context on specific tool calls
 */
const toolCallInjectorHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin_directory_injector_tool',
  name: 'Directory Injector (Tool Call)',
  description: 'Injects directory context on specific tool calls',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (config.injectOnTools.length === 0) {
      return { decision: 'continue' };
    }

    // Check if this tool should trigger injection
    if (!config.injectOnTools.includes(context.toolName)) {
      return { decision: 'continue' };
    }

    const injectionContent = buildInjectionContent(context.cwd);

    if (injectionContent) {
      logger.debug({
        toolName: context.toolName,
        cwd: context.cwd
      }, '[Directory Injector] Injecting context for tool call');

      // For tool calls, inject into the context parameter if available
      const modifiedInput = { ...context.toolInput };
      if ('context' in modifiedInput && typeof modifiedInput.context === 'string') {
        modifiedInput.context = modifiedInput.context + injectionContent;
      }

      return {
        decision: 'modify',
        modifiedData: {
          toolInput: modifiedInput
        },
        metadata: {
          injectedFiles: Object.fromEntries(state.filesFound)
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Registers all directory injector hooks
 */
export function registerDirectoryInjectorHooks(): void {
  registerHook(expertCallInjectorHook);
  registerHook(workflowStartInjectorHook);
  registerHook(toolCallInjectorHook);

  logger.debug('Directory Injector hooks registered');
}

export default {
  registerDirectoryInjectorHooks,
  updateDirectoryInjectorConfig,
  getDirectoryInjectorStats,
  resetDirectoryInjectorState,
  clearDirectoryInjectorCache
};
