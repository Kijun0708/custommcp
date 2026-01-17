// src/hooks/builtin/think-mode.ts

/**
 * Think Mode Hook
 *
 * Detects "think" keyword and activates extended thinking mode.
 * Enables deeper analysis for complex problems.
 *
 * Features:
 * - Keyword detection (think, 생각, 분석, deep)
 * - Extended thinking prompt injection
 * - Thinking budget configuration
 * - Auto-deactivation after response
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnExpertCallContext,
  OnExpertResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Think mode trigger keywords
 */
interface ThinkKeyword {
  keyword: string;
  level: 'normal' | 'deep' | 'extreme';
  language: string;
}

/**
 * Think mode configuration
 */
interface ThinkModeConfig {
  /** Whether think mode is enabled */
  enabled: boolean;
  /** Keywords that trigger think mode */
  keywords: ThinkKeyword[];
  /** Default thinking level */
  defaultLevel: 'normal' | 'deep' | 'extreme';
  /** Token budget by level */
  tokenBudget: Record<string, number>;
  /** Whether to inject thinking prompt */
  injectPrompt: boolean;
  /** Auto-deactivate after expert response */
  autoDeactivate: boolean;
}

/**
 * Think mode statistics
 */
interface ThinkModeStats {
  totalActivations: number;
  activationsByLevel: Record<string, number>;
  lastActivationTime?: number;
  currentlyActive: boolean;
  currentLevel?: string;
}

// State
let config: ThinkModeConfig = {
  enabled: true,
  keywords: [
    // English
    { keyword: 'think', level: 'normal', language: 'en' },
    { keyword: 'think hard', level: 'deep', language: 'en' },
    { keyword: 'think deeply', level: 'deep', language: 'en' },
    { keyword: 'deep think', level: 'deep', language: 'en' },
    { keyword: 'analyze', level: 'normal', language: 'en' },
    { keyword: 'deep analysis', level: 'deep', language: 'en' },
    { keyword: 'reason through', level: 'deep', language: 'en' },
    { keyword: 'step by step', level: 'normal', language: 'en' },
    // Korean
    { keyword: '생각', level: 'normal', language: 'ko' },
    { keyword: '깊이 생각', level: 'deep', language: 'ko' },
    { keyword: '심층 분석', level: 'deep', language: 'ko' },
    { keyword: '분석', level: 'normal', language: 'ko' },
    { keyword: '추론', level: 'normal', language: 'ko' },
    { keyword: '단계별', level: 'normal', language: 'ko' },
    // Extreme level
    { keyword: 'ultrathink', level: 'extreme', language: 'en' },
    { keyword: 'ultrawork', level: 'extreme', language: 'en' }, // oh-my-opencode magic keyword
    { keyword: 'maximum reasoning', level: 'extreme', language: 'en' },
    { keyword: '최대 추론', level: 'extreme', language: 'ko' }
  ],
  defaultLevel: 'normal',
  tokenBudget: {
    normal: 10000,
    deep: 20000,
    extreme: 50000
  },
  injectPrompt: true,
  autoDeactivate: true
};

let stats: ThinkModeStats = {
  totalActivations: 0,
  activationsByLevel: {
    normal: 0,
    deep: 0,
    extreme: 0
  },
  currentlyActive: false
};

/**
 * Detects think mode keywords in text
 */
function detectThinkKeyword(text: string): ThinkKeyword | null {
  if (!text) return null;

  const lowerText = text.toLowerCase();

  // Sort by keyword length (longer first) to match more specific patterns first
  const sortedKeywords = [...config.keywords].sort(
    (a, b) => b.keyword.length - a.keyword.length
  );

  for (const kw of sortedKeywords) {
    if (lowerText.includes(kw.keyword.toLowerCase())) {
      return kw;
    }
  }

  return null;
}

/**
 * Generates thinking prompt based on level
 */
function generateThinkingPrompt(level: string): string {
  const prompts: Record<string, string> = {
    normal: `
🧠 **Extended Thinking Mode Activated**

Take your time to think through this problem carefully:
1. Identify the core problem and constraints
2. Consider multiple approaches
3. Evaluate trade-offs
4. Present your reasoning before the solution

Think step by step.`,

    deep: `
🧠💭 **Deep Thinking Mode Activated**

This requires careful, thorough analysis:
1. **Understand**: What exactly is being asked? What are the hidden requirements?
2. **Explore**: Consider at least 3 different approaches
3. **Evaluate**: What are the pros, cons, and risks of each approach?
4. **Synthesize**: Combine insights into a comprehensive solution
5. **Verify**: Double-check your reasoning and conclusions

Take all the time you need. Quality of thought matters more than speed.`,

    extreme: `
🧠💭🔥 **Maximum Reasoning Mode Activated**

This is a complex problem requiring the deepest level of analysis:

**Phase 1 - Problem Decomposition**
- Break down into fundamental components
- Identify all constraints and edge cases
- Map dependencies and relationships

**Phase 2 - Multi-Perspective Analysis**
- Consider from at least 5 different angles
- Play devil's advocate with your own ideas
- Look for non-obvious solutions

**Phase 3 - Synthesis & Validation**
- Build up from first principles
- Cross-validate conclusions
- Stress-test your solution

**Phase 4 - Articulation**
- Present clear reasoning chain
- Highlight key insights and trade-offs
- Provide confidence levels for conclusions

This is your time to demonstrate exceptional reasoning. Be thorough.`
  };

  return prompts[level] || prompts.normal;
}

/**
 * Hook: Detect think mode on tool call
 */
const detectThinkModeOnToolCallHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:think-mode:detect-tool-call',
  name: 'Think Mode (Detect on Tool Call)',
  description: 'Detects think mode keywords in tool calls',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check tool input for think keywords
    const inputStr = JSON.stringify(context.toolInput);
    const detected = detectThinkKeyword(inputStr);

    if (detected) {
      stats.totalActivations++;
      stats.activationsByLevel[detected.level]++;
      stats.lastActivationTime = Date.now();
      stats.currentlyActive = true;
      stats.currentLevel = detected.level;

      logger.info({
        keyword: detected.keyword,
        level: detected.level,
        tool: context.toolName
      }, 'Think mode activated by tool call');
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Inject thinking prompt on expert call
 */
const injectThinkingOnExpertCallHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin:think-mode:inject-expert-call',
  name: 'Think Mode (Inject on Expert Call)',
  description: 'Injects thinking prompt when think mode is active or detected',
  eventType: 'onExpertCall',
  priority: 'high',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check if already active or detect in prompt
    let level = stats.currentLevel;

    if (!stats.currentlyActive) {
      const detected = detectThinkKeyword(context.prompt);
      if (detected) {
        level = detected.level;
        stats.totalActivations++;
        stats.activationsByLevel[detected.level]++;
        stats.lastActivationTime = Date.now();
        stats.currentlyActive = true;
        stats.currentLevel = level;

        logger.info({
          keyword: detected.keyword,
          level: detected.level,
          expert: context.expertId
        }, 'Think mode activated by expert call');
      }
    }

    if (!stats.currentlyActive || !level) {
      return { decision: 'continue' };
    }

    // Inject thinking prompt
    if (config.injectPrompt) {
      const thinkingPrompt = generateThinkingPrompt(level);

      return {
        decision: 'modify',
        modifiedData: {
          promptPrefix: thinkingPrompt,
          thinkingBudget: config.tokenBudget[level]
        },
        metadata: {
          thinkModeActive: true,
          thinkLevel: level,
          thinkingBudget: config.tokenBudget[level]
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Hook: Deactivate think mode after expert response
 */
const deactivateAfterResponseHook: HookDefinition<OnExpertResultContext> = {
  id: 'builtin:think-mode:deactivate',
  name: 'Think Mode (Deactivate)',
  description: 'Deactivates think mode after expert response',
  eventType: 'onExpertResult',
  priority: 'low',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled || !config.autoDeactivate) {
      return { decision: 'continue' };
    }

    if (stats.currentlyActive) {
      logger.debug({
        expert: context.expertId,
        level: stats.currentLevel
      }, 'Think mode deactivated after response');

      stats.currentlyActive = false;
      stats.currentLevel = undefined;
    }

    return { decision: 'continue' };
  }
};

/**
 * All think mode hooks
 */
export const thinkModeHooks = [
  detectThinkModeOnToolCallHook,
  injectThinkingOnExpertCallHook,
  deactivateAfterResponseHook
] as HookDefinition[];

/**
 * Registers think mode hooks
 */
export function registerThinkModeHooks(): void {
  for (const hook of thinkModeHooks) {
    registerHook(hook);
  }
  logger.debug('Think mode hooks registered');
}

/**
 * Gets think mode statistics
 */
export function getThinkModeStats(): ThinkModeStats & {
  config: ThinkModeConfig;
} {
  return {
    ...stats,
    config
  };
}

/**
 * Resets think mode state
 */
export function resetThinkModeState(): void {
  stats = {
    totalActivations: 0,
    activationsByLevel: {
      normal: 0,
      deep: 0,
      extreme: 0
    },
    currentlyActive: false
  };
}

/**
 * Updates think mode configuration
 */
export function updateThinkModeConfig(updates: Partial<ThinkModeConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Think mode config updated');
}

/**
 * Manually activates think mode
 */
export function activateThinkMode(level: 'normal' | 'deep' | 'extreme' = 'normal'): void {
  stats.currentlyActive = true;
  stats.currentLevel = level;
  stats.totalActivations++;
  stats.activationsByLevel[level]++;
  stats.lastActivationTime = Date.now();
  logger.info({ level }, 'Think mode manually activated');
}

/**
 * Manually deactivates think mode
 */
export function deactivateThinkMode(): void {
  stats.currentlyActive = false;
  stats.currentLevel = undefined;
  logger.info('Think mode manually deactivated');
}

/**
 * Checks if think mode is currently active
 */
export function isThinkModeActive(): boolean {
  return stats.currentlyActive;
}

export default {
  registerThinkModeHooks,
  getThinkModeStats,
  resetThinkModeState,
  updateThinkModeConfig,
  activateThinkMode,
  deactivateThinkMode,
  isThinkModeActive
};
