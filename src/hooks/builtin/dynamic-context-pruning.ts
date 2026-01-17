// src/hooks/builtin/dynamic-context-pruning.ts

/**
 * Dynamic Context Pruning Hook
 *
 * Intelligently prunes context to maintain optimal working memory.
 * Uses relevance scoring and decay factors to prioritize content.
 *
 * Features:
 * - Relevance-based content scoring
 * - Time-based decay
 * - Category-aware pruning
 * - Anchor preservation (critical content)
 * - Gradual pruning vs. aggressive pruning modes
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnToolResultContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Content category for pruning decisions
 */
type ContentCategory =
  | 'code'
  | 'error'
  | 'decision'
  | 'todo'
  | 'reference'
  | 'exploration'
  | 'discussion'
  | 'output'
  | 'other';

/**
 * Tracked content item
 */
interface TrackedContent {
  id: string;
  category: ContentCategory;
  content: string;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  relevanceScore: number;
  isAnchor: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Pruning strategy
 */
type PruningStrategy = 'gradual' | 'aggressive' | 'category-based' | 'time-based';

/**
 * Dynamic context pruning configuration
 */
interface DynamicPruningConfig {
  /** Whether pruning is enabled */
  enabled: boolean;
  /** Current pruning strategy */
  strategy: PruningStrategy;
  /** Target context size (characters) */
  targetContextSize: number;
  /** Threshold to trigger pruning (ratio of target) */
  pruningThreshold: number;
  /** Time decay factor (relevance reduction per hour) */
  timeDecayFactor: number;
  /** Category weights for relevance calculation */
  categoryWeights: Record<ContentCategory, number>;
  /** Minimum relevance score to keep */
  minRelevanceScore: number;
  /** Maximum items to track */
  maxTrackedItems: number;
  /** Anchor patterns (content matching these is never pruned) */
  anchorPatterns: string[];
}

/**
 * Dynamic pruning statistics
 */
interface DynamicPruningStats {
  totalPruningOperations: number;
  itemsPruned: number;
  bytesPruned: number;
  itemsPreserved: number;
  anchorsProtected: number;
  lastPruneTime?: number;
  averageRelevanceScore: number;
}

// State
let config: DynamicPruningConfig = {
  enabled: true,
  strategy: 'gradual',
  targetContextSize: 100000, // 100KB target
  pruningThreshold: 0.8, // Prune when at 80% of target
  timeDecayFactor: 0.1, // 10% reduction per hour
  categoryWeights: {
    code: 0.9,
    error: 1.0,
    decision: 0.95,
    todo: 0.85,
    reference: 0.7,
    exploration: 0.5,
    discussion: 0.4,
    output: 0.6,
    other: 0.3
  },
  minRelevanceScore: 0.2,
  maxTrackedItems: 500,
  anchorPatterns: [
    'IMPORTANT',
    'CRITICAL',
    'DO NOT',
    'MUST',
    'ERROR:',
    '🔴',
    '❌'
  ]
};

let stats: DynamicPruningStats = {
  totalPruningOperations: 0,
  itemsPruned: 0,
  bytesPruned: 0,
  itemsPreserved: 0,
  anchorsProtected: 0,
  averageRelevanceScore: 0
};

let trackedContent: Map<string, TrackedContent> = new Map();
let currentContextSize = 0;

/**
 * Generates a unique content ID
 */
function generateContentId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Categorizes content based on patterns
 */
function categorizeContent(content: string): ContentCategory {
  const lower = content.toLowerCase();

  // Code detection
  if (content.includes('```') || /^(function|class|const|let|var|import|export|def|async)\s/m.test(content)) {
    return 'code';
  }

  // Error detection
  if (/error|exception|failed|❌|🔴/i.test(content)) {
    return 'error';
  }

  // Decision detection
  if (/decided|decision|chose|选择|결정|approach|strategy/i.test(content)) {
    return 'decision';
  }

  // Todo detection
  if (/todo|task|pending|작업|할 일|\[ \]|\[x\]/i.test(content)) {
    return 'todo';
  }

  // Reference detection (file paths, URLs)
  if (/\.(ts|js|py|java|go|rs|md|json|yaml):|https?:\/\//i.test(content)) {
    return 'reference';
  }

  // Exploration detection
  if (/searching|looking for|found|검색|탐색/i.test(content)) {
    return 'exploration';
  }

  // Output detection
  if (/output|result|결과|반환/i.test(content)) {
    return 'output';
  }

  // Discussion detection
  if (content.length > 500 && !content.includes('```')) {
    return 'discussion';
  }

  return 'other';
}

/**
 * Checks if content matches anchor patterns
 */
function isAnchor(content: string): boolean {
  return config.anchorPatterns.some(pattern =>
    content.toUpperCase().includes(pattern.toUpperCase())
  );
}

/**
 * Calculates relevance score for content
 */
function calculateRelevance(item: TrackedContent): number {
  const now = Date.now();
  const ageHours = (now - item.timestamp) / 3600000;

  // Base score from category weight
  let score = config.categoryWeights[item.category];

  // Apply time decay
  score *= Math.exp(-config.timeDecayFactor * ageHours);

  // Boost for recent access
  const accessAgeHours = (now - item.lastAccessed) / 3600000;
  if (accessAgeHours < 1) {
    score *= 1.5;
  }

  // Boost for multiple accesses
  score *= Math.min(1 + (item.accessCount * 0.1), 2.0);

  // Anchors get maximum score
  if (item.isAnchor) {
    score = 1.0;
  }

  return Math.min(score, 1.0);
}

/**
 * Updates relevance scores for all tracked content
 */
function updateRelevanceScores(): void {
  let totalScore = 0;

  for (const [id, item] of trackedContent) {
    item.relevanceScore = calculateRelevance(item);
    totalScore += item.relevanceScore;
  }

  stats.averageRelevanceScore = trackedContent.size > 0
    ? totalScore / trackedContent.size
    : 0;
}

/**
 * Prunes content based on current strategy
 */
function pruneContent(): number {
  if (!config.enabled || currentContextSize < config.targetContextSize * config.pruningThreshold) {
    return 0;
  }

  updateRelevanceScores();

  // Convert to array and sort by relevance
  const items = Array.from(trackedContent.values())
    .filter(item => !item.isAnchor)
    .sort((a, b) => a.relevanceScore - b.relevanceScore);

  let prunedBytes = 0;
  let prunedCount = 0;
  const targetPrune = currentContextSize - (config.targetContextSize * 0.7); // Prune to 70%

  for (const item of items) {
    if (prunedBytes >= targetPrune) break;

    // Check minimum relevance
    if (item.relevanceScore >= config.minRelevanceScore && config.strategy === 'gradual') {
      continue;
    }

    // Remove item
    trackedContent.delete(item.id);
    prunedBytes += item.content.length;
    prunedCount++;
  }

  // Update stats
  stats.totalPruningOperations++;
  stats.itemsPruned += prunedCount;
  stats.bytesPruned += prunedBytes;
  stats.lastPruneTime = Date.now();
  currentContextSize -= prunedBytes;

  logger.info({
    strategy: config.strategy,
    prunedCount,
    prunedBytes,
    remainingItems: trackedContent.size
  }, 'Context pruned');

  return prunedBytes;
}

/**
 * Tracks new content
 */
function trackContent(content: string, metadata?: Record<string, unknown>): string {
  if (!config.enabled) return '';

  // Enforce max tracked items
  if (trackedContent.size >= config.maxTrackedItems) {
    pruneContent();
  }

  const id = generateContentId();
  const category = categorizeContent(content);
  const anchor = isAnchor(content);

  const item: TrackedContent = {
    id,
    category,
    content: content.substring(0, 10000), // Limit individual item size
    timestamp: Date.now(),
    accessCount: 1,
    lastAccessed: Date.now(),
    relevanceScore: config.categoryWeights[category],
    isAnchor: anchor,
    metadata
  };

  trackedContent.set(id, item);
  currentContextSize += item.content.length;

  if (anchor) {
    stats.anchorsProtected++;
  }

  // Check if pruning needed
  if (currentContextSize > config.targetContextSize * config.pruningThreshold) {
    pruneContent();
  }

  return id;
}

/**
 * Marks content as accessed (boosts relevance)
 */
function accessContent(id: string): void {
  const item = trackedContent.get(id);
  if (item) {
    item.accessCount++;
    item.lastAccessed = Date.now();
  }
}

/**
 * Hook: Track tool call context
 */
const trackToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:dynamic-context-pruning:track-tool-call',
  name: 'Dynamic Context Pruning (Track Tool Call)',
  description: 'Tracks tool calls for context management',
  eventType: 'onToolCall',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const contentSummary = `Tool: ${context.toolName}\nInput: ${JSON.stringify(context.toolInput).substring(0, 500)}`;
    trackContent(contentSummary, { type: 'tool_call', tool: context.toolName });

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track tool results
 */
const trackToolResultHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin:dynamic-context-pruning:track-tool-result',
  name: 'Dynamic Context Pruning (Track Tool Result)',
  description: 'Tracks tool results for context management',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    const result = context.toolResult;
    if (result && typeof result === 'string') {
      trackContent(result.substring(0, 5000), {
        type: 'tool_result',
        tool: context.toolName,
        success: context.success
      });
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Track expert results
 */
const trackExpertResultHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:dynamic-context-pruning:track-expert-result',
  name: 'Dynamic Context Pruning (Track Expert Result)',
  description: 'Tracks expert responses for context management',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    trackContent(context.response.substring(0, 5000), {
      type: 'expert_result',
      expert: context.expertId
    });

    return { decision: 'continue' };
  }
};

/**
 * All dynamic context pruning hooks
 */
export const dynamicContextPruningHooks = [
  trackToolCallHook,
  trackToolResultHook,
  trackExpertResultHook
] as HookDefinition[];

/**
 * Registers dynamic context pruning hooks
 */
export function registerDynamicContextPruningHooks(): void {
  for (const hook of dynamicContextPruningHooks) {
    registerHook(hook);
  }
  logger.debug('Dynamic context pruning hooks registered');
}

/**
 * Gets dynamic context pruning statistics
 */
export function getDynamicContextPruningStats(): DynamicPruningStats & {
  config: DynamicPruningConfig;
  currentContextSize: number;
  trackedItemCount: number;
} {
  updateRelevanceScores();

  return {
    ...stats,
    config,
    currentContextSize,
    trackedItemCount: trackedContent.size
  };
}

/**
 * Resets dynamic context pruning state
 */
export function resetDynamicContextPruningState(): void {
  stats = {
    totalPruningOperations: 0,
    itemsPruned: 0,
    bytesPruned: 0,
    itemsPreserved: 0,
    anchorsProtected: 0,
    averageRelevanceScore: 0
  };
  trackedContent.clear();
  currentContextSize = 0;
}

/**
 * Updates dynamic context pruning configuration
 */
export function updateDynamicContextPruningConfig(updates: Partial<DynamicPruningConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Dynamic context pruning config updated');
}

/**
 * Manually triggers pruning
 */
export function triggerPrune(): number {
  const originalThreshold = config.pruningThreshold;
  config.pruningThreshold = 0; // Force pruning
  const pruned = pruneContent();
  config.pruningThreshold = originalThreshold;
  return pruned;
}

/**
 * Gets a summary of tracked content
 */
export function getContextSummary(): {
  byCategory: Record<ContentCategory, number>;
  anchors: number;
  totalSize: number;
  oldestItem?: number;
  newestItem?: number;
} {
  const byCategory: Record<ContentCategory, number> = {
    code: 0,
    error: 0,
    decision: 0,
    todo: 0,
    reference: 0,
    exploration: 0,
    discussion: 0,
    output: 0,
    other: 0
  };

  let anchors = 0;
  let oldest = Infinity;
  let newest = 0;

  for (const item of trackedContent.values()) {
    byCategory[item.category]++;
    if (item.isAnchor) anchors++;
    if (item.timestamp < oldest) oldest = item.timestamp;
    if (item.timestamp > newest) newest = item.timestamp;
  }

  return {
    byCategory,
    anchors,
    totalSize: currentContextSize,
    oldestItem: oldest === Infinity ? undefined : oldest,
    newestItem: newest === 0 ? undefined : newest
  };
}

/**
 * Adds an anchor to specific content
 */
export function addAnchor(contentId: string): boolean {
  const item = trackedContent.get(contentId);
  if (item) {
    item.isAnchor = true;
    stats.anchorsProtected++;
    return true;
  }
  return false;
}

export default {
  registerDynamicContextPruningHooks,
  getDynamicContextPruningStats,
  resetDynamicContextPruningState,
  updateDynamicContextPruningConfig,
  triggerPrune,
  getContextSummary,
  addAnchor,
  trackContent,
  accessContent
};
