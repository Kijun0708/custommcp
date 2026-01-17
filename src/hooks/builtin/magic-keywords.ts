// src/hooks/builtin/magic-keywords.ts

/**
 * Magic Keywords Hook
 *
 * Automatically triggers special behaviors when magic keywords are detected.
 * Inspired by oh-my-opencode's magic keyword system.
 *
 * Keywords:
 * - ultrawork/ulw: Maximum performance orchestration mode
 * - search/find: Multi-agent parallel search
 * - analyze/investigate: Multi-phase expert consultation
 * - deepdive: Thorough research mode
 * - quickfix: Fast bug fix mode
 * - refactor: Code refactoring mode
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext,
  OnExpertCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Magic keyword types
 */
export type MagicKeywordType =
  | 'ultrawork'
  | 'search'
  | 'analyze'
  | 'deepdive'
  | 'quickfix'
  | 'refactor'
  | 'review'
  | 'document';

/**
 * Magic keyword definition
 */
interface MagicKeywordDefinition {
  /** Keyword type */
  type: MagicKeywordType;
  /** Trigger patterns */
  patterns: RegExp[];
  /** Description */
  description: string;
  /** Recommended expert */
  recommendedExpert?: string;
  /** Recommended workflow */
  recommendedWorkflow?: string;
  /** Context injection */
  contextInjection: string;
  /** Priority boost */
  priorityBoost: boolean;
  /** Enable parallel execution */
  enableParallel: boolean;
}

/**
 * Magic keyword definitions
 */
const MAGIC_KEYWORDS: MagicKeywordDefinition[] = [
  {
    type: 'ultrawork',
    patterns: [
      /\bultrawork\b/i,
      /\bulw\b/i,
      /\b울트라워크\b/,
      /\b최대\s*성능\b/,
      /\bmaximum\s*performance\b/i
    ],
    description: '최대 성능 오케스트레이션 모드',
    recommendedWorkflow: 'orchestrate_task',
    contextInjection: `
🚀 **ULTRAWORK 모드 활성화**

이 요청은 최대 성능 모드로 처리됩니다:
- 모든 관련 전문가 병렬 동원
- 철저한 분석 및 검토
- 완전한 구현까지 진행
- 품질 우선, 속도 조절

작업 완료까지 중단하지 마세요.
`,
    priorityBoost: true,
    enableParallel: true
  },
  {
    type: 'search',
    patterns: [
      /\bsearch\s+(?:for|the|all)\b/i,
      /\bfind\s+(?:all|every|where)\b/i,
      /\b찾아\s*(?:줘|봐|주세요)\b/,
      /\b검색\s*(?:해|해줘|해주세요)\b/,
      /\b어디.*있/
    ],
    description: '멀티 에이전트 병렬 검색 모드',
    recommendedExpert: 'explorer',
    contextInjection: `
🔍 **SEARCH 모드 활성화**

검색 최적화 전략:
- 여러 검색 패턴 동시 시도
- 파일명, 내용, 심볼 모두 검색
- 결과 중복 제거 및 정렬
- 관련성 높은 결과 우선 표시
`,
    priorityBoost: false,
    enableParallel: true
  },
  {
    type: 'analyze',
    patterns: [
      /\banalyze\b/i,
      /\binvestigate\b/i,
      /\bexamine\b/i,
      /\b분석\s*(?:해|해줘|해주세요)\b/,
      /\b조사\s*(?:해|해줘|해주세요)\b/,
      /\b살펴\s*(?:봐|봐줘|주세요)\b/
    ],
    description: '멀티 페이즈 전문가 분석 모드',
    recommendedExpert: 'researcher',
    recommendedWorkflow: 'research_topic',
    contextInjection: `
🔬 **ANALYZE 모드 활성화**

심층 분석 전략:
1. 전체 구조 파악
2. 세부 요소 분석
3. 패턴 및 문제점 식별
4. 개선 방안 도출

철저하고 체계적으로 분석합니다.
`,
    priorityBoost: false,
    enableParallel: false
  },
  {
    type: 'deepdive',
    patterns: [
      /\bdeep\s*dive\b/i,
      /\bthorough\b/i,
      /\bin\s*depth\b/i,
      /\b깊이\s*(?:있게|분석|파고)\b/,
      /\b철저\s*(?:히|하게)\b/,
      /\b상세\s*(?:히|하게)\b/
    ],
    description: '철저한 심층 연구 모드',
    recommendedExpert: 'researcher',
    recommendedWorkflow: 'research_topic',
    contextInjection: `
🏊 **DEEPDIVE 모드 활성화**

심층 연구 전략:
- 모든 관련 자료 수집
- 역사적 맥락 파악
- 대안 및 트레이드오프 분석
- 상세한 문서화

시간이 걸리더라도 완벽하게 조사합니다.
`,
    priorityBoost: false,
    enableParallel: false
  },
  {
    type: 'quickfix',
    patterns: [
      /\bquick\s*fix\b/i,
      /\bhotfix\b/i,
      /\bfast\s*fix\b/i,
      /\b빨리\s*(?:고쳐|수정|fix)\b/i,
      /\b급한?\s*(?:버그|오류|에러)\b/,
      /\b당장\b/
    ],
    description: '빠른 버그 수정 모드',
    recommendedExpert: 'strategist',
    contextInjection: `
⚡ **QUICKFIX 모드 활성화**

신속 수정 전략:
- 핵심 문제만 집중 해결
- 최소 변경으로 안정화
- 부가 기능 개선은 나중에
- 즉시 테스트 가능한 수정

속도 우선, 안정성 확보.
`,
    priorityBoost: true,
    enableParallel: false
  },
  {
    type: 'refactor',
    patterns: [
      /\brefactor\b/i,
      /\brestructure\b/i,
      /\breorganize\b/i,
      /\b리팩토링?\b/i,
      /\b리팩터\b/,
      /\b구조\s*(?:개선|변경|정리)\b/,
      /\b코드\s*정리\b/
    ],
    description: '코드 리팩토링 모드',
    recommendedExpert: 'reviewer',
    recommendedWorkflow: 'review_code',
    contextInjection: `
🔧 **REFACTOR 모드 활성화**

리팩토링 전략:
- 기존 동작 보존 (회귀 방지)
- 단계적 변경
- 각 단계 테스트
- 가독성 및 유지보수성 향상

안전하고 점진적으로 개선합니다.
`,
    priorityBoost: false,
    enableParallel: false
  },
  {
    type: 'review',
    patterns: [
      /\breview\b/i,
      /\bcode\s*review\b/i,
      /\bpr\s*review\b/i,
      /\b리뷰\s*(?:해|해줘|부탁)\b/,
      /\b코드\s*(?:검토|점검)\b/,
      /\b봐\s*(?:줘|주세요)\b/
    ],
    description: '코드 리뷰 모드',
    recommendedExpert: 'reviewer',
    recommendedWorkflow: 'review_code',
    contextInjection: `
👀 **REVIEW 모드 활성화**

코드 리뷰 관점:
- 버그 및 논리 오류
- 성능 문제
- 보안 취약점
- 코딩 스타일 및 베스트 프랙티스

건설적이고 구체적인 피드백을 제공합니다.
`,
    priorityBoost: false,
    enableParallel: false
  },
  {
    type: 'document',
    patterns: [
      /\bdocument\b/i,
      /\bwrite\s*docs?\b/i,
      /\breadme\b/i,
      /\b문서\s*(?:화|작성|만들어)\b/,
      /\b설명\s*(?:추가|작성)\b/,
      /\bAPI\s*문서\b/i
    ],
    description: '문서화 모드',
    recommendedExpert: 'writer',
    contextInjection: `
📝 **DOCUMENT 모드 활성화**

문서화 전략:
- 명확하고 간결한 설명
- 예제 코드 포함
- 사용법 및 API 문서
- 유지보수 용이한 구조

읽기 쉽고 유용한 문서를 작성합니다.
`,
    priorityBoost: false,
    enableParallel: false
  }
];

/**
 * Configuration
 */
interface MagicKeywordsConfig {
  /** Enable magic keywords */
  enabled: boolean;
  /** Inject context when triggered */
  injectContext: boolean;
  /** Show activation message */
  showActivation: boolean;
  /** Enabled keyword types */
  enabledKeywords: MagicKeywordType[];
}

const DEFAULT_CONFIG: MagicKeywordsConfig = {
  enabled: true,
  injectContext: true,
  showActivation: true,
  enabledKeywords: ['ultrawork', 'search', 'analyze', 'deepdive', 'quickfix', 'refactor', 'review', 'document']
};

let config: MagicKeywordsConfig = { ...DEFAULT_CONFIG };

/**
 * State tracking
 */
interface MagicKeywordsState {
  /** Total activations */
  totalActivations: number;
  /** Activations by type */
  activationsByType: Record<MagicKeywordType, number>;
  /** Last activation */
  lastActivation?: {
    type: MagicKeywordType;
    timestamp: number;
    source: string;
  };
  /** Active keywords in current session */
  activeKeywords: Set<MagicKeywordType>;
}

let state: MagicKeywordsState = {
  totalActivations: 0,
  activationsByType: {
    ultrawork: 0,
    search: 0,
    analyze: 0,
    deepdive: 0,
    quickfix: 0,
    refactor: 0,
    review: 0,
    document: 0
  },
  activeKeywords: new Set()
};

/**
 * Detects magic keywords in text
 */
function detectMagicKeywords(text: string): MagicKeywordDefinition[] {
  const detected: MagicKeywordDefinition[] = [];

  for (const keyword of MAGIC_KEYWORDS) {
    // Skip disabled keywords
    if (!config.enabledKeywords.includes(keyword.type)) {
      continue;
    }

    for (const pattern of keyword.patterns) {
      if (pattern.test(text)) {
        detected.push(keyword);
        break;
      }
    }
  }

  return detected;
}

/**
 * Records keyword activation
 */
function recordActivation(keyword: MagicKeywordDefinition, source: string): void {
  state.totalActivations++;
  state.activationsByType[keyword.type]++;
  state.lastActivation = {
    type: keyword.type,
    timestamp: Date.now(),
    source
  };
  state.activeKeywords.add(keyword.type);
}

/**
 * Builds injection message for activated keywords
 */
function buildInjectionMessage(keywords: MagicKeywordDefinition[]): string {
  if (keywords.length === 0) return '';

  const sections: string[] = [];

  for (const keyword of keywords) {
    sections.push(keyword.contextInjection.trim());
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Gets recommended settings for keywords
 */
export function getKeywordRecommendations(keywords: MagicKeywordDefinition[]): {
  experts: string[];
  workflows: string[];
  enableParallel: boolean;
  priorityBoost: boolean;
} {
  const experts = new Set<string>();
  const workflows = new Set<string>();
  let enableParallel = false;
  let priorityBoost = false;

  for (const keyword of keywords) {
    if (keyword.recommendedExpert) {
      experts.add(keyword.recommendedExpert);
    }
    if (keyword.recommendedWorkflow) {
      workflows.add(keyword.recommendedWorkflow);
    }
    if (keyword.enableParallel) {
      enableParallel = true;
    }
    if (keyword.priorityBoost) {
      priorityBoost = true;
    }
  }

  return {
    experts: Array.from(experts),
    workflows: Array.from(workflows),
    enableParallel,
    priorityBoost
  };
}

/**
 * Updates configuration
 */
export function updateMagicKeywordsConfig(newConfig: Partial<MagicKeywordsConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Gets magic keywords statistics
 */
export function getMagicKeywordsStats(): {
  totalActivations: number;
  activationsByType: Record<MagicKeywordType, number>;
  lastActivation?: MagicKeywordsState['lastActivation'];
  activeKeywords: MagicKeywordType[];
  availableKeywords: Array<{ type: MagicKeywordType; description: string; enabled: boolean }>;
} {
  return {
    totalActivations: state.totalActivations,
    activationsByType: { ...state.activationsByType },
    lastActivation: state.lastActivation,
    activeKeywords: Array.from(state.activeKeywords),
    availableKeywords: MAGIC_KEYWORDS.map(k => ({
      type: k.type,
      description: k.description,
      enabled: config.enabledKeywords.includes(k.type)
    }))
  };
}

/**
 * Resets magic keywords state
 */
export function resetMagicKeywordsState(): void {
  state = {
    totalActivations: 0,
    activationsByType: {
      ultrawork: 0,
      search: 0,
      analyze: 0,
      deepdive: 0,
      quickfix: 0,
      refactor: 0,
      review: 0,
      document: 0
    },
    activeKeywords: new Set()
  };
}

/**
 * Clears active keywords for new task
 */
export function clearActiveKeywords(): void {
  state.activeKeywords.clear();
}

/**
 * Hook: Detect magic keywords in tool calls
 */
const toolCallMagicHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin_magic_keywords_tool',
  name: 'Magic Keywords (Tool Call)',
  description: 'Detects magic keywords in tool inputs',
  eventType: 'onToolCall',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) {
      return { decision: 'continue' };
    }

    // Check relevant tools
    const relevantTools = ['consult_expert', 'orchestrate_task', 'design_with_experts', 'research_topic'];
    if (!relevantTools.includes(context.toolName)) {
      return { decision: 'continue' };
    }

    // Extract text to check
    const textToCheck = [
      context.toolInput.prompt,
      context.toolInput.question,
      context.toolInput.request,
      context.toolInput.topic,
      context.toolInput.context
    ].filter(Boolean).join(' ');

    if (!textToCheck) {
      return { decision: 'continue' };
    }

    // Detect keywords
    const detectedKeywords = detectMagicKeywords(textToCheck);

    if (detectedKeywords.length === 0) {
      return { decision: 'continue' };
    }

    // Record activations
    for (const keyword of detectedKeywords) {
      recordActivation(keyword, `tool:${context.toolName}`);
    }

    logger.info({
      tool: context.toolName,
      keywords: detectedKeywords.map(k => k.type)
    }, '[Magic Keywords] Keywords detected in tool call');

    // Build response
    const recommendations = getKeywordRecommendations(detectedKeywords);
    const injectionMessage = config.injectContext ? buildInjectionMessage(detectedKeywords) : '';

    // Modify tool input if needed
    const modifiedInput = { ...context.toolInput };

    // Add context injection
    if (injectionMessage && typeof modifiedInput.context === 'string') {
      modifiedInput.context = injectionMessage + '\n\n' + modifiedInput.context;
    } else if (injectionMessage) {
      modifiedInput.context = injectionMessage;
    }

    return {
      decision: 'modify',
      modifiedData: {
        toolInput: modifiedInput
      },
      injectMessage: config.showActivation
        ? `✨ 매직 키워드 활성화: ${detectedKeywords.map(k => `**${k.type}**`).join(', ')}`
        : undefined,
      metadata: {
        detectedKeywords: detectedKeywords.map(k => k.type),
        recommendations
      }
    };
  }
};

/**
 * Hook: Detect magic keywords in expert calls
 */
const expertCallMagicHook: HookDefinition<OnExpertCallContext> = {
  id: 'builtin_magic_keywords_expert',
  name: 'Magic Keywords (Expert Call)',
  description: 'Detects magic keywords in expert prompts',
  eventType: 'onExpertCall',
  priority: 'high',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) {
      return { decision: 'continue' };
    }

    // Check prompt and context
    const textToCheck = [context.prompt, context.context].filter(Boolean).join(' ');

    if (!textToCheck) {
      return { decision: 'continue' };
    }

    // Detect keywords
    const detectedKeywords = detectMagicKeywords(textToCheck);

    if (detectedKeywords.length === 0) {
      return { decision: 'continue' };
    }

    // Record activations (only if not already active in this session)
    for (const keyword of detectedKeywords) {
      if (!state.activeKeywords.has(keyword.type)) {
        recordActivation(keyword, `expert:${context.expertId}`);
      }
    }

    logger.info({
      expert: context.expertId,
      keywords: detectedKeywords.map(k => k.type)
    }, '[Magic Keywords] Keywords detected in expert call');

    // Build injection
    const injectionMessage = config.injectContext ? buildInjectionMessage(detectedKeywords) : '';

    if (!injectionMessage) {
      return { decision: 'continue' };
    }

    return {
      decision: 'modify',
      modifiedData: {
        context: (context.context || '') + '\n\n' + injectionMessage
      },
      metadata: {
        detectedKeywords: detectedKeywords.map(k => k.type)
      }
    };
  }
};

/**
 * Registers magic keywords hooks
 */
export function registerMagicKeywordsHooks(): void {
  registerHook(toolCallMagicHook);
  registerHook(expertCallMagicHook);

  logger.debug('Magic Keywords hooks registered');
}

export default {
  registerMagicKeywordsHooks,
  updateMagicKeywordsConfig,
  getMagicKeywordsStats,
  resetMagicKeywordsState,
  clearActiveKeywords,
  detectMagicKeywords,
  getKeywordRecommendations,
  MAGIC_KEYWORDS
};
