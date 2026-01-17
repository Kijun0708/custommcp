// src/hooks/builtin/rules-injector.ts

/**
 * Rules Injector Hook
 *
 * Automatically injects rules from .claude/rules/ directory into context.
 * Rules define project conventions, coding standards, and guidelines.
 *
 * Features:
 * - Auto-discovery of rule files
 * - Priority-based rule ordering
 * - Caching for performance
 * - Pattern-based rule activation
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
import * as fs from 'fs';
import * as path from 'path';

/**
 * Rule file definition
 */
interface RuleFile {
  name: string;
  path: string;
  content: string;
  priority: number;
  patterns?: string[];
  lastModified: number;
}

/**
 * Rules injector configuration
 */
interface RulesInjectorConfig {
  /** Whether rules injection is enabled */
  enabled: boolean;
  /** Rules directory paths to scan */
  rulesPaths: string[];
  /** Maximum total rules content length */
  maxContentLength: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
  /** File extensions to load */
  extensions: string[];
  /** Whether to include file name as header */
  includeHeaders: boolean;
}

/**
 * Rules injector statistics
 */
interface RulesInjectorStats {
  totalInjections: number;
  rulesLoaded: number;
  cacheHits: number;
  cacheMisses: number;
  lastInjectionTime?: number;
  totalBytesInjected: number;
}

// State
let config: RulesInjectorConfig = {
  enabled: true,
  rulesPaths: [
    '.claude/rules',
    '.opencode/rules',
    '.rules'
  ],
  maxContentLength: 20000,
  cacheTtlMs: 300000, // 5 minutes
  extensions: ['.md', '.txt', '.rule'],
  includeHeaders: true
};

let stats: RulesInjectorStats = {
  totalInjections: 0,
  rulesLoaded: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalBytesInjected: 0
};

let rulesCache: Map<string, RuleFile[]> = new Map();
let lastCacheTime = 0;

/**
 * Extracts priority from filename (e.g., "01-coding-style.md" -> 1)
 */
function extractPriority(filename: string): number {
  const match = filename.match(/^(\d+)[-_]/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 100; // Default priority
}

/**
 * Extracts patterns from rule content (lines starting with @pattern:)
 */
function extractPatterns(content: string): string[] {
  const patterns: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const match = line.match(/^@pattern:\s*(.+)$/i);
    if (match) {
      patterns.push(match[1].trim());
    }
  }

  return patterns;
}

/**
 * Scans directory for rule files
 */
function scanRulesDirectory(dirPath: string): RuleFile[] {
  const rules: RuleFile[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      return rules;
    }

    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!config.extensions.includes(ext)) {
        continue;
      }

      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const priority = extractPriority(file);
        const patterns = extractPatterns(content);

        rules.push({
          name: path.basename(file, ext),
          path: filePath,
          content,
          priority,
          patterns: patterns.length > 0 ? patterns : undefined,
          lastModified: stat.mtimeMs
        });
      } catch (error: any) {
        logger.warn({ file, error: error.message }, 'Failed to read rule file');
      }
    }
  } catch (error: any) {
    logger.debug({ dirPath, error: error.message }, 'Rules directory not accessible');
  }

  return rules;
}

/**
 * Loads all rules from configured paths
 */
function loadAllRules(basePath?: string): RuleFile[] {
  const cacheKey = basePath || process.cwd();
  const now = Date.now();

  // Check cache
  if (rulesCache.has(cacheKey) && (now - lastCacheTime) < config.cacheTtlMs) {
    stats.cacheHits++;
    return rulesCache.get(cacheKey)!;
  }

  stats.cacheMisses++;
  const allRules: RuleFile[] = [];

  for (const rulesPath of config.rulesPaths) {
    const fullPath = basePath
      ? path.join(basePath, rulesPath)
      : path.join(process.cwd(), rulesPath);

    const rules = scanRulesDirectory(fullPath);
    allRules.push(...rules);
  }

  // Sort by priority
  allRules.sort((a, b) => a.priority - b.priority);

  // Update cache
  rulesCache.set(cacheKey, allRules);
  lastCacheTime = now;
  stats.rulesLoaded = allRules.length;

  logger.debug({ rulesCount: allRules.length, cacheKey }, 'Rules loaded');

  return allRules;
}

/**
 * Filters rules by context/pattern
 */
function filterRulesByContext(rules: RuleFile[], context?: string): RuleFile[] {
  if (!context) {
    return rules.filter(r => !r.patterns || r.patterns.length === 0);
  }

  return rules.filter(rule => {
    // Include rules without patterns
    if (!rule.patterns || rule.patterns.length === 0) {
      return true;
    }

    // Check if any pattern matches the context
    return rule.patterns.some(pattern => {
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(context);
      } catch {
        return context.toLowerCase().includes(pattern.toLowerCase());
      }
    });
  });
}

/**
 * Formats rules for injection
 */
function formatRulesForInjection(rules: RuleFile[]): string {
  if (rules.length === 0) {
    return '';
  }

  let content = '\n\n---\n## 📋 Project Rules\n\n';
  let totalLength = content.length;

  for (const rule of rules) {
    const header = config.includeHeaders
      ? `### ${rule.name}\n\n`
      : '';

    const ruleContent = header + rule.content + '\n\n';

    if (totalLength + ruleContent.length > config.maxContentLength) {
      content += '\n_[추가 규칙 생략됨 - 컨텍스트 제한]_\n';
      break;
    }

    content += ruleContent;
    totalLength += ruleContent.length;
  }

  return content;
}

/**
 * Hook: Inject rules on expert call
 */
const injectRulesOnExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:rules-injector:expert-call',
  name: 'Rules Injector (Expert Call)',
  description: 'Injects project rules into expert call context',
  eventType: 'onExpertCall',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const rules = loadAllRules();
    const filteredRules = filterRulesByContext(rules, context.prompt);

    if (filteredRules.length === 0) {
      return { decision: 'continue' };
    }

    const rulesContent = formatRulesForInjection(filteredRules);

    stats.totalInjections++;
    stats.lastInjectionTime = Date.now();
    stats.totalBytesInjected += rulesContent.length;

    logger.debug({
      expert: context.expertId,
      rulesCount: filteredRules.length,
      contentLength: rulesContent.length
    }, 'Rules injected into expert call');

    return {
      decision: 'modify',
      modifiedData: {
        contextAppend: rulesContent
      },
      metadata: {
        rulesInjected: true,
        rulesCount: filteredRules.length
      }
    };
  }
};

/**
 * Hook: Inject rules on workflow start
 */
const injectRulesOnWorkflowStartHook: HookDefinition<OnWorkflowStartContext> = {
  id: 'builtin:rules-injector:workflow-start',
  name: 'Rules Injector (Workflow Start)',
  description: 'Injects project rules at workflow start',
  eventType: 'onWorkflowStart',
  priority: 'normal',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const rules = loadAllRules();

    if (rules.length === 0) {
      return { decision: 'continue' };
    }

    const rulesContent = formatRulesForInjection(rules);

    stats.totalInjections++;
    stats.lastInjectionTime = Date.now();
    stats.totalBytesInjected += rulesContent.length;

    logger.info({
      request: context.request.substring(0, 50),
      rulesCount: rules.length
    }, 'Rules injected at workflow start');

    return {
      decision: 'continue',
      injectMessage: rulesContent,
      metadata: {
        rulesInjected: true,
        rulesCount: rules.length
      }
    };
  }
};

/**
 * All rules injector hooks
 */
export const rulesInjectorHooks = [
  injectRulesOnExpertCallHook,
  injectRulesOnWorkflowStartHook
] as HookDefinition[];

/**
 * Registers rules injector hooks
 */
export function registerRulesInjectorHooks(): void {
  for (const hook of rulesInjectorHooks) {
    registerHook(hook);
  }
  logger.debug('Rules injector hooks registered');
}

/**
 * Gets rules injector statistics
 */
export function getRulesInjectorStats(): RulesInjectorStats & {
  config: RulesInjectorConfig;
  cachedRulesCount: number;
} {
  return {
    ...stats,
    config,
    cachedRulesCount: rulesCache.size
  };
}

/**
 * Resets rules injector state
 */
export function resetRulesInjectorState(): void {
  stats = {
    totalInjections: 0,
    rulesLoaded: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalBytesInjected: 0
  };
  rulesCache.clear();
  lastCacheTime = 0;
}

/**
 * Updates rules injector configuration
 */
export function updateRulesInjectorConfig(updates: Partial<RulesInjectorConfig>): void {
  config = { ...config, ...updates };
  // Clear cache on config change
  rulesCache.clear();
  lastCacheTime = 0;
  logger.info({ config }, 'Rules injector config updated');
}

/**
 * Clears rules cache
 */
export function clearRulesCache(): void {
  rulesCache.clear();
  lastCacheTime = 0;
  logger.debug('Rules cache cleared');
}

/**
 * Gets loaded rules (for debugging)
 */
export function getLoadedRules(basePath?: string): RuleFile[] {
  return loadAllRules(basePath);
}

export default {
  registerRulesInjectorHooks,
  getRulesInjectorStats,
  resetRulesInjectorState,
  updateRulesInjectorConfig,
  clearRulesCache,
  getLoadedRules
};
