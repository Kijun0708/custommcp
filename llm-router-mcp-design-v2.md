# LLM Router MCP 설계 문서 v2.0

## 개요

CLIProxyAPI를 통해 GPT, Gemini, Claude를 호출하는 MCP 서버.
Claude Code에서 멀티 LLM 협업을 가능하게 하는 오케스트레이션 도구.

### 핵심 가치
- **Claude Code가 팀장**, GPT/Gemini/다른 Claude가 **팀원**
- 각 LLM의 강점에 맞는 역할 분배
- Rate Limit 자동 처리 및 폴백
- 백그라운드 병렬 실행 지원

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| **언어** | TypeScript | MCP SDK 공식 권장, 타입 안전성 |
| **런타임** | Node.js | MCP 표준 |
| **Transport** | stdio | Claude Code 로컬 연동 |
| **검증** | Zod | 런타임 타입 검증 |
| **로깅** | pino | 고성능 구조화 로깅 |
| **캐싱** | lru-cache | 메모리 기반 LRU 캐시 |

---

## 프로젝트 구조

```
llm-router-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── .env.example
├── src/
│   ├── index.ts                  # 메인 진입점
│   ├── types.ts                  # 타입 정의
│   ├── constants.ts              # 상수 (URL, 모델명 등)
│   ├── config.ts                 # 환경변수 및 설정 로더
│   │
│   ├── experts/                  # 전문가 정의
│   │   ├── index.ts              # 전문가 export
│   │   ├── strategist.ts         # GPT 5.2 (전략/설계)
│   │   ├── researcher.ts         # Claude Sonnet (조사/분석)
│   │   ├── reviewer.ts           # Gemini 3.0 Pro (리뷰/검토)
│   │   ├── frontend.ts           # Gemini 3.0 Pro (UI/UX)
│   │   ├── writer.ts             # Gemini 3.0 Flash (문서)
│   │   └── explorer.ts           # Gemini 3.0 Flash (빠른 탐색) ⭐ NEW
│   │
│   ├── tools/                    # MCP 도구
│   │   ├── index.ts              # 도구 등록
│   │   ├── consult-expert.ts     # 개별 전문가 자문
│   │   ├── design-workflow.ts    # 설계 워크플로우
│   │   ├── review-workflow.ts    # 리뷰 워크플로우
│   │   ├── research-workflow.ts  # 조사 워크플로우
│   │   ├── frontend-workflow.ts  # UI/UX 워크플로우
│   │   ├── document-workflow.ts  # 문서 작성 워크플로우
│   │   ├── category-task.ts      # 카테고리 기반 라우팅 ⭐ NEW
│   │   ├── background-task.ts    # 백그라운드 실행 ⭐ NEW
│   │   └── health-check.ts       # 헬스체크 ⭐ NEW
│   │
│   ├── services/                 # 외부 서비스
│   │   ├── cliproxy-client.ts    # CLIProxyAPI 클라이언트
│   │   ├── expert-router.ts      # 폴백 라우팅 ⭐ NEW
│   │   └── background-manager.ts # 백그라운드 작업 관리 ⭐ NEW
│   │
│   └── utils/                    # 유틸리티
│       ├── logger.ts             # 로깅 ⭐ NEW
│       ├── cache.ts              # 응답 캐싱 ⭐ NEW
│       ├── rate-limit.ts         # Rate Limit 감지/처리 ⭐ NEW
│       ├── retry.ts              # 재시도 로직 ⭐ NEW
│       ├── formatter.ts          # 응답 포맷터
│       └── error-handler.ts      # 에러 처리
│
└── dist/                         # 빌드 결과
    └── index.js
```

---

## 타입 정의

```typescript
// src/types.ts

export interface Expert {
  id: string;
  name: string;
  model: string;
  role: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  useCases: string[];
  fallbacks?: string[];  // ⭐ NEW: 폴백 전문가 목록
}

export interface ExpertResponse {
  response: string;
  actualExpert: string;
  fellBack: boolean;
  cached: boolean;
  latencyMs: number;
}

// ⭐ NEW: Rate Limit 관련
export interface RateLimitInfo {
  isLimited: boolean;
  retryAfter?: number;
  provider: 'openai' | 'anthropic' | 'google';
}

export interface APIError {
  type: 'rate_limit' | 'api_error' | 'network_error' | 'auth_error' | 'timeout';
  status?: number;
  message: string;
  retryable: boolean;
  retryAfter?: number;
}

// ⭐ NEW: 백그라운드 작업 관련
export interface BackgroundTask {
  id: string;
  expert: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

// ⭐ NEW: 카테고리 정의
export interface Category {
  id: string;
  defaultExpert: string;
  model?: string;
  temperature?: number;
  description: string;
  promptAppend?: string;
}

// ⭐ NEW: 설정 타입
export interface Config {
  cliproxyUrl: string;
  cache: {
    enabled: boolean;
    ttlMs: number;
    maxSize: number;
  };
  retry: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  concurrency: {
    default: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
  };
  models: {
    strategist: string;
    researcher: string;
    reviewer: string;
    frontend: string;
    writer: string;
    explorer: string;
  };
}
```

---

## 설정 및 환경변수

```typescript
// src/config.ts

import { Config } from './types';

export function loadConfig(): Config {
  return {
    cliproxyUrl: process.env.CLIPROXY_URL || 'http://localhost:8787',
    
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttlMs: parseInt(process.env.CACHE_TTL_MS || '1800000'), // 30분
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100')
    },
    
    retry: {
      maxRetries: parseInt(process.env.RETRY_MAX || '3'),
      baseDelayMs: parseInt(process.env.RETRY_BASE_DELAY_MS || '1000'),
      maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '30000')
    },
    
    concurrency: {
      default: parseInt(process.env.CONCURRENCY_DEFAULT || '5'),
      byProvider: {
        anthropic: parseInt(process.env.CONCURRENCY_ANTHROPIC || '3'),
        openai: parseInt(process.env.CONCURRENCY_OPENAI || '5'),
        google: parseInt(process.env.CONCURRENCY_GOOGLE || '10')
      },
      byModel: {
        'claude-opus-4-5': 2,
        'gpt-5.2': 3,
        'gemini-3.0-flash': 10
      }
    },
    
    models: {
      strategist: process.env.MODEL_STRATEGIST || 'gpt-5.2',
      researcher: process.env.MODEL_RESEARCHER || 'claude-sonnet-4-5-20250929',
      reviewer: process.env.MODEL_REVIEWER || 'gemini-3.0-pro',
      frontend: process.env.MODEL_FRONTEND || 'gemini-3.0-pro',
      writer: process.env.MODEL_WRITER || 'gemini-3.0-flash',
      explorer: process.env.MODEL_EXPLORER || 'gemini-3.0-flash'
    }
  };
}

export const config = loadConfig();
```

### .env.example

```bash
# CLIProxyAPI 설정
CLIPROXY_URL=http://localhost:8787

# 캐시 설정
CACHE_ENABLED=true
CACHE_TTL_MS=1800000
CACHE_MAX_SIZE=100

# 재시도 설정
RETRY_MAX=3
RETRY_BASE_DELAY_MS=1000
RETRY_MAX_DELAY_MS=30000

# 동시성 설정
CONCURRENCY_DEFAULT=5
CONCURRENCY_ANTHROPIC=3
CONCURRENCY_OPENAI=5
CONCURRENCY_GOOGLE=10

# 모델 오버라이드 (선택)
MODEL_STRATEGIST=gpt-5.2
MODEL_RESEARCHER=claude-sonnet-4-5-20250929
MODEL_REVIEWER=gemini-3.0-pro
MODEL_FRONTEND=gemini-3.0-pro
MODEL_WRITER=gemini-3.0-flash
MODEL_EXPLORER=gemini-3.0-flash

# 로깅
LOG_LEVEL=info
```

---

## 유틸리티

### 로거

```typescript
// src/utils/logger.ts

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname'
    }
  }
});

export function createExpertLogger(expertId: string) {
  return logger.child({ expert: expertId });
}
```

### 캐시

```typescript
// src/utils/cache.ts

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';

interface CacheEntry {
  response: string;
  expertId: string;
  timestamp: Date;
}

const cache = new LRUCache<string, CacheEntry>({
  max: config.cache.maxSize,
  ttl: config.cache.ttlMs
});

function generateCacheKey(expertId: string, prompt: string, context?: string): string {
  const content = `${expertId}:${prompt}:${context || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function getCached(expertId: string, prompt: string, context?: string): CacheEntry | null {
  if (!config.cache.enabled) return null;
  
  const key = generateCacheKey(expertId, prompt, context);
  const entry = cache.get(key);
  
  if (entry) {
    logger.debug({ expertId, cacheKey: key }, 'Cache hit');
  }
  
  return entry || null;
}

export function setCache(expertId: string, prompt: string, response: string, context?: string): void {
  if (!config.cache.enabled) return;
  
  const key = generateCacheKey(expertId, prompt, context);
  cache.set(key, {
    response,
    expertId,
    timestamp: new Date()
  });
  
  logger.debug({ expertId, cacheKey: key }, 'Cache set');
}

export function clearCache(): void {
  cache.clear();
  logger.info('Cache cleared');
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxSize: config.cache.maxSize,
    ttlMs: config.cache.ttlMs
  };
}
```

### Rate Limit 처리

```typescript
// src/utils/rate-limit.ts

import { RateLimitInfo } from '../types';
import { logger } from './logger';

// Rate Limit 패턴 매칭
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too.?many.?requests/i,
  /quota.?exceeded/i,
  /resource.?exhausted/i,
  /try.?again.?later/i,
  /overloaded/i,
  /capacity/i,
  /429/
];

export function isRateLimitError(error: any, responseText?: string): boolean {
  // HTTP 429 체크
  if (error?.status === 429) return true;
  if (error?.response?.status === 429) return true;
  
  // 응답 텍스트에서 패턴 매칭
  const text = responseText || error?.message || String(error) || '';
  return RATE_LIMIT_PATTERNS.some(pattern => pattern.test(text));
}

export function parseRetryAfter(headers: Headers): number | null {
  const retryAfter = headers.get('retry-after') || headers.get('Retry-After');
  if (!retryAfter) return null;
  
  // 초 단위 숫자
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  
  // HTTP 날짜 형식
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  
  return null;
}

export function detectProvider(model: string): 'openai' | 'anthropic' | 'google' {
  if (model.includes('gpt') || model.includes('openai')) return 'openai';
  if (model.includes('claude') || model.includes('anthropic')) return 'anthropic';
  if (model.includes('gemini') || model.includes('google')) return 'google';
  return 'google'; // 기본값
}

// Rate Limit 추적
const rateLimitTracker = new Map<string, {
  limitedAt: Date;
  retryAfter: number;
}>();

export function markRateLimited(model: string, retryAfterMs: number): void {
  rateLimitTracker.set(model, {
    limitedAt: new Date(),
    retryAfter: retryAfterMs
  });
  logger.warn({ model, retryAfterMs }, 'Model rate limited');
}

export function isCurrentlyLimited(model: string): boolean {
  const info = rateLimitTracker.get(model);
  if (!info) return false;
  
  const elapsed = Date.now() - info.limitedAt.getTime();
  if (elapsed >= info.retryAfter) {
    rateLimitTracker.delete(model);
    return false;
  }
  
  return true;
}

export function getRateLimitStatus(): Record<string, { limited: boolean; retryInMs?: number }> {
  const status: Record<string, { limited: boolean; retryInMs?: number }> = {};
  
  for (const [model, info] of rateLimitTracker) {
    const elapsed = Date.now() - info.limitedAt.getTime();
    const remaining = info.retryAfter - elapsed;
    
    if (remaining > 0) {
      status[model] = { limited: true, retryInMs: remaining };
    } else {
      rateLimitTracker.delete(model);
      status[model] = { limited: false };
    }
  }
  
  return status;
}
```

### 재시도 로직

```typescript
// src/utils/retry.ts

import { config } from '../config';
import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: config.retry.maxRetries,
  baseDelayMs: config.retry.baseDelayMs,
  maxDelayMs: config.retry.maxDelayMs,
  shouldRetry: () => true
};

function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  // 지수 백오프 + 지터
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt >= opts.maxRetries) {
        logger.error({ attempt, error: lastError.message }, 'All retries exhausted');
        throw lastError;
      }
      
      if (!opts.shouldRetry(error, attempt)) {
        logger.debug({ attempt, error: lastError.message }, 'Retry condition not met, throwing');
        throw lastError;
      }
      
      const delay = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs);
      logger.debug({ attempt, delayMs: delay }, 'Retrying after delay');
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Retry failed with unknown error');
}
```

---

## 전문가 정의

### 1. Strategist (GPT 5.2)

```typescript
// src/experts/strategist.ts

import { Expert } from '../types';
import { config } from '../config';

export const strategist: Expert = {
  id: "strategist",
  name: "GPT Strategist",
  model: config.models.strategist,
  
  role: "전략/설계/아키텍처 전문가",
  
  systemPrompt: `당신은 시니어 소프트웨어 아키텍트입니다.

## 역할
- 복잡한 문제를 분해하고 설계 방향 제시
- 아키텍처 결정에 대한 트레이드오프 분석
- 디버깅 전략 수립
- 알고리즘 설계 자문

## 응답 원칙
- 핵심만 간결하게
- 제안은 최대 3개
- 실행 가능한 구체적 방안

## 응답 형식
### 핵심 분석
[문제의 핵심을 1-2문장으로]

### 제안
1. [가장 추천하는 방안]
2. [대안 1]
3. [대안 2]

### 주의사항
- [고려해야 할 점들]`,

  temperature: 0.2,
  maxTokens: 2000,
  
  fallbacks: ["researcher"],  // GPT 한도 초과 시 Claude로 폴백
  
  useCases: [
    "새로운 기능 설계",
    "아키텍처 결정",
    "복잡한 버그 디버깅 전략",
    "알고리즘 설계",
    "기술 선택 자문"
  ]
};
```

### 2. Researcher (Claude Sonnet 4.5)

```typescript
// src/experts/researcher.ts

import { Expert } from '../types';
import { config } from '../config';

export const researcher: Expert = {
  id: "researcher",
  name: "Claude Researcher",
  model: config.models.researcher,
  
  role: "조사/분석/탐색 전문가",
  
  systemPrompt: `당신은 시니어 리서처입니다.

## 역할
- 문서 분석 및 요약
- 코드베이스 탐색 및 패턴 파악
- 레퍼런스 조사 및 정리
- 라이브러리/프레임워크 사용법 분석

## 응답 원칙
- 근거 기반 분석
- 핵심 정보만 추출
- 구조화된 정리

## 응답 형식
### 요약
[핵심 내용 2-3문장]

### 상세 분석
[구조화된 분석 내용]

### 참고사항
- [추가로 알아두면 좋은 것들]`,

  temperature: 0.1,
  maxTokens: 3000,
  
  fallbacks: ["reviewer"],  // Claude 한도 초과 시 Gemini Pro로 폴백
  
  useCases: [
    "문서 분석",
    "코드베이스 탐색",
    "레퍼런스 조사",
    "라이브러리 사용법 정리",
    "대량 코드 분석"
  ]
};
```

### 3. Reviewer (Gemini 3.0 Pro)

```typescript
// src/experts/reviewer.ts

import { Expert } from '../types';
import { config } from '../config';

export const reviewer: Expert = {
  id: "reviewer",
  name: "Gemini Reviewer",
  model: config.models.reviewer,
  
  role: "코드 리뷰/버그 탐지 전문가",
  
  systemPrompt: `당신은 시니어 코드 리뷰어입니다.

## 역할
- 코드 리뷰 및 버그 탐지
- 성능/보안 이슈 분석
- 코드 품질 평가
- 베스트 프랙티스 제안

## 응답 원칙
- 문제점은 심각도 순으로
- 구체적인 개선 방안 제시
- 긍정적인 부분도 언급

## 응답 형식
### 발견된 문제
1. 🔴 [심각] ...
2. 🟡 [주의] ...
3. 🟢 [권장] ...

### 개선 제안
- [구체적인 개선 방안]

### 잘된 점
- [칭찬할 부분]`,

  temperature: 0.1,
  maxTokens: 2000,
  
  fallbacks: ["explorer"],  // Gemini Pro 한도 초과 시 Flash로 폴백
  
  useCases: [
    "코드 리뷰",
    "버그 찾기",
    "성능 분석",
    "보안 검토",
    "코드 품질 평가"
  ]
};
```

### 4. Frontend (Gemini 3.0 Pro)

```typescript
// src/experts/frontend.ts

import { Expert } from '../types';
import { config } from '../config';

export const frontend: Expert = {
  id: "frontend",
  name: "Gemini Frontend",
  model: config.models.frontend,
  
  role: "UI/UX/프론트엔드 전문가",
  
  systemPrompt: `당신은 시니어 프론트엔드 엔지니어이자 UI/UX 디자이너입니다.

## 역할
- UI/UX 설계 및 피드백
- 프론트엔드 컴포넌트 설계
- 반응형 디자인
- 접근성(a11y) 검토
- CSS/스타일링 자문

## 응답 원칙
- 사용자 경험 중심
- 시각적 예시 제공
- 실용적인 구현 방안

## 응답 형식
### UI/UX 분석
[현재 상태 평가]

### 개선 제안
- [시각적/기능적 개선점]

### 구현 가이드
- [구체적인 구현 방법]`,

  temperature: 0.3,
  maxTokens: 2000,
  
  fallbacks: ["writer"],
  
  useCases: [
    "UI/UX 설계",
    "컴포넌트 설계",
    "반응형 디자인",
    "접근성 검토",
    "CSS/스타일링"
  ]
};
```

### 5. Writer (Gemini 3.0 Flash)

```typescript
// src/experts/writer.ts

import { Expert } from '../types';
import { config } from '../config';

export const writer: Expert = {
  id: "writer",
  name: "Gemini Writer",
  model: config.models.writer,
  
  role: "문서 작성/정리 전문가",
  
  systemPrompt: `당신은 테크니컬 라이터입니다.

## 역할
- 기술 문서 작성
- README, API 문서 작성
- 주석 및 코드 설명
- 보고서/제안서 작성
- 기존 문서 개선

## 응답 원칙
- 명확하고 간결한 문장
- 일관된 용어 사용
- 구조화된 문서

## 응답 형식
적절한 마크다운 형식으로 문서 제공`,

  temperature: 0.2,
  maxTokens: 3000,
  
  fallbacks: ["explorer"],
  
  useCases: [
    "README 작성",
    "API 문서화",
    "기술 문서 작성",
    "코드 주석 개선",
    "보고서 작성"
  ]
};
```

### 6. Explorer (Gemini 3.0 Flash) ⭐ NEW

```typescript
// src/experts/explorer.ts

import { Expert } from '../types';
import { config } from '../config';

export const explorer: Expert = {
  id: "explorer",
  name: "Fast Explorer",
  model: config.models.explorer,
  
  role: "빠른 코드베이스 탐색/패턴 매칭 전문가",
  
  systemPrompt: `당신은 코드베이스 탐색 전문가입니다.

## 역할
- 빠른 파일/심볼 검색
- 패턴 매칭 및 grep
- 코드 구조 빠르게 파악
- 간단한 질문 즉답

## 응답 원칙
- 최대한 빠르고 간결하게
- 핵심 위치만 알려줌
- 상세 분석은 다른 전문가에게 위임 권장

## 응답 형식
### 결과
[파일 경로나 위치 목록]

### 요약
[1-2문장 요약]

### 추가 조사 필요 시
[다른 전문가 추천]`,

  temperature: 0.1,
  maxTokens: 1000,  // 짧은 응답으로 빠르게
  
  fallbacks: [],  // 가장 저렴한 모델이므로 폴백 없음
  
  useCases: [
    "파일 찾기",
    "심볼 검색",
    "패턴 매칭",
    "코드 구조 파악",
    "간단한 질문"
  ]
};
```

### 전문가 Export

```typescript
// src/experts/index.ts

import { Expert } from '../types';
import { strategist } from './strategist';
import { researcher } from './researcher';
import { reviewer } from './reviewer';
import { frontend } from './frontend';
import { writer } from './writer';
import { explorer } from './explorer';

export const experts: Record<string, Expert> = {
  strategist,
  researcher,
  reviewer,
  frontend,
  writer,
  explorer
};

export type ExpertId = keyof typeof experts;

// 폴백 매핑
export const FALLBACK_CHAIN: Record<string, string[]> = {
  strategist: ['researcher', 'reviewer'],
  researcher: ['reviewer', 'explorer'],
  reviewer: ['explorer'],
  frontend: ['writer', 'explorer'],
  writer: ['explorer'],
  explorer: []
};

export { strategist, researcher, reviewer, frontend, writer, explorer };
```

---

## 카테고리 정의 ⭐ NEW

```typescript
// src/categories.ts

import { Category } from './types';

export const categories: Record<string, Category> = {
  visual: {
    id: 'visual',
    defaultExpert: 'frontend',
    model: 'gemini-3.0-pro',
    temperature: 0.7,
    description: 'UI/UX, 디자인, 프론트엔드 작업',
    promptAppend: '사용자 경험과 시각적 아름다움을 최우선으로 고려하세요.'
  },
  
  'business-logic': {
    id: 'business-logic',
    defaultExpert: 'strategist',
    model: 'gpt-5.2',
    temperature: 0.1,
    description: '백엔드 로직, 아키텍처, 전략적 결정',
    promptAppend: '확장성, 유지보수성, 성능을 고려한 설계를 제시하세요.'
  },
  
  research: {
    id: 'research',
    defaultExpert: 'researcher',
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.1,
    description: '조사, 분석, 문서 탐색',
    promptAppend: '근거를 명확히 제시하고 출처를 밝히세요.'
  },
  
  quick: {
    id: 'quick',
    defaultExpert: 'explorer',
    model: 'gemini-3.0-flash',
    temperature: 0.1,
    description: '빠른 탐색, 간단한 질문, 파일 찾기',
    promptAppend: '최대한 빠르고 간결하게 답변하세요.'
  },
  
  review: {
    id: 'review',
    defaultExpert: 'reviewer',
    model: 'gemini-3.0-pro',
    temperature: 0.1,
    description: '코드 리뷰, 버그 탐지, 품질 검사',
    promptAppend: '심각도 순으로 문제를 정리하고 구체적 개선안을 제시하세요.'
  },
  
  documentation: {
    id: 'documentation',
    defaultExpert: 'writer',
    model: 'gemini-3.0-flash',
    temperature: 0.2,
    description: '문서 작성, README, API 문서화',
    promptAppend: '명확하고 구조화된 문서를 작성하세요.'
  }
};

export type CategoryId = keyof typeof categories;
```

---

## 서비스

### CLIProxyAPI 클라이언트

```typescript
// src/services/cliproxy-client.ts

import { Expert, ExpertResponse, APIError } from '../types';
import { config } from '../config';
import { logger, createExpertLogger } from '../utils/logger';
import { getCached, setCache } from '../utils/cache';
import { isRateLimitError, parseRetryAfter, markRateLimited, isCurrentlyLimited } from '../utils/rate-limit';
import { withRetry } from '../utils/retry';

interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  max_tokens: number;
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// 커스텀 에러 클래스
export class RateLimitExceededError extends Error {
  constructor(
    public expertId: string,
    public model: string,
    public retryAfterMs: number
  ) {
    super(
      `Rate limit exceeded for ${expertId} (${model}). ` +
      `Retry after: ${Math.round(retryAfterMs / 1000)}s`
    );
    this.name = 'RateLimitExceededError';
  }
}

export class ExpertCallError extends Error {
  constructor(
    public expertId: string,
    public originalError: Error,
    public retryable: boolean
  ) {
    super(`Expert ${expertId} call failed: ${originalError.message}`);
    this.name = 'ExpertCallError';
  }
}

export async function callExpert(
  expert: Expert,
  prompt: string,
  context?: string,
  skipCache: boolean = false
): Promise<ExpertResponse> {
  const expertLogger = createExpertLogger(expert.id);
  const startTime = Date.now();
  
  // 1. 현재 Rate Limit 상태 체크
  if (isCurrentlyLimited(expert.model)) {
    expertLogger.warn('Model is currently rate limited, will try fallback');
    throw new RateLimitExceededError(expert.id, expert.model, 0);
  }
  
  // 2. 캐시 체크
  if (!skipCache) {
    const cached = getCached(expert.id, prompt, context);
    if (cached) {
      return {
        response: cached.response,
        actualExpert: expert.id,
        fellBack: false,
        cached: true,
        latencyMs: Date.now() - startTime
      };
    }
  }
  
  // 3. 프롬프트 조합
  const fullPrompt = context 
    ? `${prompt}\n\n[컨텍스트]\n${context}` 
    : prompt;

  const request: ChatRequest = {
    model: expert.model,
    messages: [
      { role: "system", content: expert.systemPrompt },
      { role: "user", content: fullPrompt }
    ],
    temperature: expert.temperature,
    max_tokens: expert.maxTokens
  };

  expertLogger.debug({ model: expert.model }, 'Calling CLIProxyAPI');

  // 4. API 호출 (재시도 로직 포함)
  const response = await withRetry(
    async () => {
      const res = await fetch(`${config.cliproxyUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60000)  // 60초 타임아웃
      });

      // Rate Limit 체크
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers) || 60000;
        markRateLimited(expert.model, retryAfter);
        throw new RateLimitExceededError(expert.id, expert.model, retryAfter);
      }

      if (!res.ok) {
        const errorText = await res.text();
        
        // 응답 텍스트에서 Rate Limit 패턴 체크
        if (isRateLimitError(null, errorText)) {
          const retryAfter = 60000; // 기본 1분
          markRateLimited(expert.model, retryAfter);
          throw new RateLimitExceededError(expert.id, expert.model, retryAfter);
        }
        
        throw new Error(`API error (${res.status}): ${errorText}`);
      }

      return res.json() as Promise<ChatResponse>;
    },
    {
      maxRetries: config.retry.maxRetries,
      shouldRetry: (error) => {
        // Rate Limit 에러는 재시도하지 않음 (폴백으로 처리)
        if (error instanceof RateLimitExceededError) return false;
        // 네트워크 에러나 5xx는 재시도
        return true;
      }
    }
  );

  const content = response.choices[0].message.content;
  const latencyMs = Date.now() - startTime;

  // 5. 캐시 저장
  setCache(expert.id, prompt, content, context);

  expertLogger.info({ latencyMs }, 'Expert call completed');

  return {
    response: content,
    actualExpert: expert.id,
    fellBack: false,
    cached: false,
    latencyMs
  };
}
```

### 전문가 라우터 (폴백 지원) ⭐ NEW

```typescript
// src/services/expert-router.ts

import { Expert, ExpertResponse } from '../types';
import { experts, FALLBACK_CHAIN } from '../experts';
import { callExpert, RateLimitExceededError } from './cliproxy-client';
import { logger } from '../utils/logger';

export async function callExpertWithFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false
): Promise<ExpertResponse> {
  const expert = experts[expertId];
  
  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }
  
  try {
    return await callExpert(expert, prompt, context, skipCache);
  } catch (error) {
    // Rate Limit이 아닌 에러는 그대로 throw
    if (!(error instanceof RateLimitExceededError)) {
      throw error;
    }
    
    logger.warn({ expertId, error: error.message }, 'Primary expert rate limited, trying fallbacks');
    
    // 폴백 체인 시도
    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    
    for (const fallbackId of fallbacks) {
      try {
        logger.info({ from: expertId, to: fallbackId }, 'Attempting fallback');
        
        const fallbackExpert = experts[fallbackId];
        const result = await callExpert(fallbackExpert, prompt, context, skipCache);
        
        logger.info({ fallbackId }, 'Fallback succeeded');
        
        return {
          ...result,
          fellBack: true,
          actualExpert: fallbackId
        };
      } catch (fallbackError) {
        logger.warn({ fallbackId, error: (fallbackError as Error).message }, 'Fallback also failed');
        continue;
      }
    }
    
    // 모든 폴백 실패
    throw new Error(
      `All experts exhausted for ${expertId}. ` +
      `Tried: ${expertId}, ${fallbacks.join(', ')}. ` +
      `Please try again later.`
    );
  }
}

// 병렬 호출 지원
export async function callExpertsParallel(
  calls: Array<{ expertId: string; prompt: string; context?: string }>
): Promise<ExpertResponse[]> {
  return Promise.all(
    calls.map(({ expertId, prompt, context }) =>
      callExpertWithFallback(expertId, prompt, context)
    )
  );
}
```

### 백그라운드 작업 관리자 ⭐ NEW

```typescript
// src/services/background-manager.ts

import { BackgroundTask } from '../types';
import { callExpertWithFallback } from './expert-router';
import { logger } from '../utils/logger';
import { config } from '../config';
import crypto from 'crypto';

// 백그라운드 작업 저장소
const tasks = new Map<string, BackgroundTask>();

// 동시성 제어
const runningByProvider = new Map<string, number>();
const runningByModel = new Map<string, number>();

function getProvider(model: string): string {
  if (model.includes('gpt') || model.includes('openai')) return 'openai';
  if (model.includes('claude') || model.includes('anthropic')) return 'anthropic';
  return 'google';
}

function canStartTask(model: string): boolean {
  const provider = getProvider(model);
  
  // 모델별 한도 체크
  const modelLimit = config.concurrency.byModel[model] || Infinity;
  const modelRunning = runningByModel.get(model) || 0;
  if (modelRunning >= modelLimit) return false;
  
  // 프로바이더별 한도 체크
  const providerLimit = config.concurrency.byProvider[provider] || config.concurrency.default;
  const providerRunning = runningByProvider.get(provider) || 0;
  if (providerRunning >= providerLimit) return false;
  
  return true;
}

function incrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, (runningByModel.get(model) || 0) + 1);
  runningByProvider.set(provider, (runningByProvider.get(provider) || 0) + 1);
}

function decrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, Math.max(0, (runningByModel.get(model) || 1) - 1));
  runningByProvider.set(provider, Math.max(0, (runningByProvider.get(provider) || 1) - 1));
}

// 대기 큐
const pendingQueue: Array<{
  taskId: string;
  expertId: string;
  model: string;
  prompt: string;
  context?: string;
}> = [];

function processQueue(): void {
  while (pendingQueue.length > 0) {
    const next = pendingQueue[0];
    if (!canStartTask(next.model)) break;
    
    pendingQueue.shift();
    executeTask(next.taskId, next.expertId, next.prompt, next.context);
  }
}

async function executeTask(
  taskId: string,
  expertId: string,
  prompt: string,
  context?: string
): Promise<void> {
  const task = tasks.get(taskId);
  if (!task || task.status === 'cancelled') return;
  
  const model = task.expert; // 실제로는 experts[expertId].model
  incrementRunning(model);
  
  task.status = 'running';
  tasks.set(taskId, task);
  
  logger.info({ taskId, expertId }, 'Background task started');
  
  try {
    const result = await callExpertWithFallback(expertId, prompt, context);
    
    const updatedTask: BackgroundTask = {
      ...task,
      status: 'completed',
      result: result.response,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);
    
    logger.info({ taskId, expertId, latencyMs: result.latencyMs }, 'Background task completed');
  } catch (error) {
    const updatedTask: BackgroundTask = {
      ...task,
      status: 'failed',
      error: (error as Error).message,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);
    
    logger.error({ taskId, expertId, error: (error as Error).message }, 'Background task failed');
  } finally {
    decrementRunning(model);
    processQueue();
  }
}

export function startBackgroundTask(
  expertId: string,
  prompt: string,
  context?: string,
  taskId?: string
): BackgroundTask {
  const id = taskId || crypto.randomUUID();
  
  const task: BackgroundTask = {
    id,
    expert: expertId,
    status: 'pending',
    startedAt: new Date()
  };
  
  tasks.set(id, task);
  
  // experts에서 모델 정보 가져오기 (실제 구현에서)
  const model = 'gemini-3.0-flash'; // 기본값, 실제로는 experts[expertId].model
  
  if (canStartTask(model)) {
    executeTask(id, expertId, prompt, context);
  } else {
    pendingQueue.push({ taskId: id, expertId, model, prompt, context });
    logger.debug({ taskId: id }, 'Task queued, waiting for capacity');
  }
  
  return task;
}

export function getTaskStatus(taskId: string): BackgroundTask | null {
  return tasks.get(taskId) || null;
}

export function getTaskResult(taskId: string): { status: string; result?: string; error?: string } {
  const task = tasks.get(taskId);
  if (!task) {
    return { status: 'not_found' };
  }
  
  return {
    status: task.status,
    result: task.result,
    error: task.error
  };
}

export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  
  if (task.status === 'pending' || task.status === 'running') {
    task.status = 'cancelled';
    task.completedAt = new Date();
    tasks.set(taskId, task);
    
    // 대기 큐에서 제거
    const queueIndex = pendingQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex !== -1) {
      pendingQueue.splice(queueIndex, 1);
    }
    
    logger.info({ taskId }, 'Task cancelled');
    return true;
  }
  
  return false;
}

export function listTasks(status?: BackgroundTask['status']): BackgroundTask[] {
  const allTasks = Array.from(tasks.values());
  if (status) {
    return allTasks.filter(t => t.status === status);
  }
  return allTasks;
}

export function cleanupOldTasks(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [taskId, task] of tasks) {
    const taskAge = now - task.startedAt.getTime();
    if (taskAge > maxAgeMs && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
      tasks.delete(taskId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info({ cleaned }, 'Old tasks cleaned up');
  }
  
  return cleaned;
}

export function getStats() {
  const allTasks = Array.from(tasks.values());
  return {
    total: allTasks.length,
    pending: allTasks.filter(t => t.status === 'pending').length,
    running: allTasks.filter(t => t.status === 'running').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
    failed: allTasks.filter(t => t.status === 'failed').length,
    cancelled: allTasks.filter(t => t.status === 'cancelled').length,
    queueLength: pendingQueue.length,
    concurrency: {
      byProvider: Object.fromEntries(runningByProvider),
      byModel: Object.fromEntries(runningByModel)
    }
  };
}
```

---

## MCP 도구 정의

### 1. consult_expert (핵심 도구)

```typescript
// src/tools/consult-expert.ts

import { z } from "zod";
import { experts, ExpertId } from "../experts";
import { callExpertWithFallback } from "../services/expert-router";

export const consultExpertSchema = z.object({
  expert: z.enum(["strategist", "researcher", "reviewer", "frontend", "writer", "explorer"])
    .describe("자문할 전문가"),
  
  question: z.string()
    .min(10, "질문은 최소 10자 이상")
    .max(5000, "질문은 최대 5000자")
    .describe("전문가에게 할 질문"),
  
  context: z.string()
    .max(10000, "컨텍스트는 최대 10000자")
    .optional()
    .describe("관련 코드, 설계 문서 등 추가 컨텍스트"),
  
  skip_cache: z.boolean()
    .default(false)
    .optional()
    .describe("캐시 무시하고 새로 호출")
}).strict();

export const consultExpertTool = {
  name: "consult_expert",
  
  title: "외부 AI 전문가 자문",
  
  description: `외부 AI 전문가에게 자문을 구합니다.

## 전문가 목록

### strategist (GPT 5.2)
- 역할: 전략, 설계, 아키텍처, 디버깅 전략
- 사용 시점: 복잡한 설계 결정, 아키텍처 자문, 새로운 기능 설계

### researcher (Claude Sonnet)
- 역할: 문서 분석, 코드 탐색, 레퍼런스 조사
- 사용 시점: 라이브러리 사용법, 코드베이스 분석, 대량 문서 처리

### reviewer (Gemini 3.0 Pro)
- 역할: 코드 리뷰, 버그 탐지, 성능/보안 분석
- 사용 시점: 코드 품질 검토, 버그 찾기, 보안 점검

### frontend (Gemini 3.0 Pro)
- 역할: UI/UX 설계, 프론트엔드 컴포넌트, CSS/스타일링
- 사용 시점: UI 설계, 반응형 디자인, 접근성 검토

### writer (Gemini 3.0 Flash)
- 역할: 문서 작성, README, API 문서화
- 사용 시점: 기술 문서 작성, 문서 정리, 보고서 작성

### explorer (Gemini 3.0 Flash)
- 역할: 빠른 코드베이스 탐색, 패턴 매칭, 간단한 질문
- 사용 시점: 파일 찾기, 빠른 답변, 구조 파악

## Rate Limit 자동 처리
- 전문가가 한도 초과 시 자동으로 대체 전문가로 폴백
- 폴백 시 응답에 알림 포함

## 사용 예시
- 설계 자문: expert="strategist", question="REST vs GraphQL 어떤 게 나을까요?"
- 코드 분석: expert="researcher", question="이 코드의 동작 방식을 분석해주세요"
- 코드 리뷰: expert="reviewer", question="이 코드의 문제점을 찾아주세요"
- UI 피드백: expert="frontend", question="이 대시보드 레이아웃 개선점은?"
- 문서 작성: expert="writer", question="이 API의 README를 작성해주세요"
- 빠른 탐색: expert="explorer", question="인증 관련 파일들이 어디에 있나요?"`,

  inputSchema: consultExpertSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleConsultExpert(params: z.infer<typeof consultExpertSchema>) {
  try {
    const result = await callExpertWithFallback(
      params.expert,
      params.question,
      params.context,
      params.skip_cache
    );
    
    const expert = experts[params.expert];
    const actualExpert = experts[result.actualExpert];
    
    let response = `## ${actualExpert.name} 응답\n\n${result.response}`;
    
    // 폴백 알림
    if (result.fellBack) {
      response += `\n\n---\n⚠️ **알림**: 원래 요청한 \`${expert.name}\`이(가) 한도 초과로 \`${actualExpert.name}\`으로 대체되었습니다.`;
    }
    
    // 캐시 히트 알림
    if (result.cached) {
      response += `\n\n_📦 캐시된 응답 (${result.latencyMs}ms)_`;
    }
    
    return {
      content: [{
        type: "text",
        text: response
      }],
      metadata: {
        expert: result.actualExpert,
        fellBack: result.fellBack,
        cached: result.cached,
        latencyMs: result.latencyMs
      }
    };
    
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 전문가 호출 실패\n\n` +
              `**요청 전문가**: ${params.expert}\n` +
              `**오류**: ${(error as Error).message}\n\n` +
              `💡 잠시 후 다시 시도하거나 다른 전문가를 사용해보세요.`
      }],
      isError: true
    };
  }
}
```

### 2. route_by_category (카테고리 라우팅) ⭐ NEW

```typescript
// src/tools/category-task.ts

import { z } from "zod";
import { categories, CategoryId } from "../categories";
import { experts } from "../experts";
import { callExpertWithFallback } from "../services/expert-router";

export const categoryTaskSchema = z.object({
  category: z.enum(["visual", "business-logic", "research", "quick", "review", "documentation"])
    .describe("작업 카테고리"),
  
  prompt: z.string()
    .min(5, "프롬프트는 최소 5자 이상")
    .describe("작업 내용"),
  
  context: z.string()
    .optional()
    .describe("추가 컨텍스트"),
  
  override_expert: z.enum(["strategist", "researcher", "reviewer", "frontend", "writer", "explorer"])
    .optional()
    .describe("카테고리 기본 전문가 대신 사용할 전문가")
}).strict();

export const categoryTaskTool = {
  name: "route_by_category",
  
  title: "카테고리 기반 작업 라우팅",
  
  description: `작업 카테고리에 따라 최적의 전문가에게 자동 라우팅합니다.

## 카테고리

### visual
- 기본 전문가: frontend (Gemini Pro)
- 용도: UI/UX, 디자인, 프론트엔드 작업
- 특성: 높은 창의성 (temperature 0.7)

### business-logic
- 기본 전문가: strategist (GPT 5.2)
- 용도: 백엔드 로직, 아키텍처, 전략적 결정
- 특성: 낮은 창의성, 높은 정확도 (temperature 0.1)

### research
- 기본 전문가: researcher (Claude Sonnet)
- 용도: 조사, 분석, 문서 탐색
- 특성: 근거 기반 분석

### quick
- 기본 전문가: explorer (Gemini Flash)
- 용도: 빠른 탐색, 간단한 질문, 파일 찾기
- 특성: 빠른 응답, 짧은 출력

### review
- 기본 전문가: reviewer (Gemini Pro)
- 용도: 코드 리뷰, 버그 탐지, 품질 검사

### documentation
- 기본 전문가: writer (Gemini Flash)
- 용도: 문서 작성, README, API 문서화

## 사용 예시
- category="visual", prompt="대시보드 컴포넌트 설계해줘"
- category="business-logic", prompt="결제 시스템 아키텍처 제안해줘"
- category="quick", prompt="src 폴더에 있는 테스트 파일들 찾아줘"`,

  inputSchema: categoryTaskSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export async function handleCategoryTask(params: z.infer<typeof categoryTaskSchema>) {
  const category = categories[params.category];
  const expertId = params.override_expert || category.defaultExpert;
  
  // 카테고리별 프롬프트 보강
  const enhancedPrompt = category.promptAppend
    ? `${params.prompt}\n\n[지침]\n${category.promptAppend}`
    : params.prompt;
  
  try {
    const result = await callExpertWithFallback(
      expertId,
      enhancedPrompt,
      params.context
    );
    
    const expert = experts[result.actualExpert];
    
    return {
      content: [{
        type: "text",
        text: `## ${expert.name} 응답\n` +
              `_카테고리: ${category.description}_\n\n` +
              `${result.response}` +
              (result.fellBack ? `\n\n---\n⚠️ 폴백: ${expertId} → ${result.actualExpert}` : '')
      }],
      metadata: {
        category: params.category,
        expert: result.actualExpert,
        fellBack: result.fellBack,
        latencyMs: result.latencyMs
      }
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 카테고리 작업 실패\n\n` +
              `**카테고리**: ${params.category}\n` +
              `**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
```

### 3. background_expert (백그라운드 실행) ⭐ NEW

```typescript
// src/tools/background-task.ts

import { z } from "zod";
import { 
  startBackgroundTask, 
  getTaskResult, 
  cancelTask, 
  listTasks,
  getStats 
} from "../services/background-manager";

// 백그라운드 시작
export const backgroundStartSchema = z.object({
  expert: z.enum(["strategist", "researcher", "reviewer", "frontend", "writer", "explorer"])
    .describe("실행할 전문가"),
  
  prompt: z.string()
    .describe("작업 내용"),
  
  context: z.string()
    .optional()
    .describe("추가 컨텍스트"),
  
  task_id: z.string()
    .optional()
    .describe("커스텀 작업 ID (미지정 시 자동 생성)")
}).strict();

export const backgroundStartTool = {
  name: "background_expert_start",
  
  title: "백그라운드 전문가 실행",
  
  description: `전문가를 백그라운드에서 비동기로 실행합니다.

## 사용 시점
- 메인 작업과 병렬로 조사가 필요할 때
- 여러 전문가의 의견을 동시에 받고 싶을 때
- 긴 분석 작업을 기다리지 않고 진행하고 싶을 때

## 반환값
- task_id: 결과 조회용 ID
- status: "pending" | "running"

## 결과 조회
background_expert_result(task_id) 도구로 조회

## 사용 예시
1. 병렬 조사 시작:
   - background_expert_start(expert="researcher", prompt="라이브러리A 분석")
   - background_expert_start(expert="researcher", prompt="라이브러리B 분석")
2. 다른 작업 진행
3. 결과 수집: background_expert_result(task_id)`,

  inputSchema: backgroundStartSchema,
  
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export function handleBackgroundStart(params: z.infer<typeof backgroundStartSchema>) {
  const task = startBackgroundTask(
    params.expert,
    params.prompt,
    params.context,
    params.task_id
  );
  
  return {
    content: [{
      type: "text",
      text: `## 🚀 백그라운드 작업 시작\n\n` +
            `- **작업 ID**: \`${task.id}\`\n` +
            `- **전문가**: ${params.expert}\n` +
            `- **상태**: ${task.status}\n\n` +
            `결과 조회: \`background_expert_result(task_id="${task.id}")\``
    }],
    metadata: {
      task_id: task.id,
      status: task.status
    }
  };
}

// 결과 조회
export const backgroundResultSchema = z.object({
  task_id: z.string().describe("조회할 작업 ID")
}).strict();

export const backgroundResultTool = {
  name: "background_expert_result",
  
  title: "백그라운드 작업 결과 조회",
  
  description: `백그라운드 작업의 결과를 조회합니다.

## 반환 상태
- pending: 대기 중
- running: 실행 중
- completed: 완료 (result 포함)
- failed: 실패 (error 포함)
- cancelled: 취소됨
- not_found: 작업 ID 없음`,

  inputSchema: backgroundResultSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundResult(params: z.infer<typeof backgroundResultSchema>) {
  const result = getTaskResult(params.task_id);
  
  if (result.status === 'not_found') {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 작업을 찾을 수 없음\n\n작업 ID \`${params.task_id}\`가 존재하지 않습니다.`
      }],
      isError: true
    };
  }
  
  if (result.status === 'completed') {
    return {
      content: [{
        type: "text",
        text: `## ✅ 작업 완료\n\n${result.result}`
      }],
      metadata: { status: 'completed' }
    };
  }
  
  if (result.status === 'failed') {
    return {
      content: [{
        type: "text",
        text: `## ❌ 작업 실패\n\n**오류**: ${result.error}`
      }],
      isError: true,
      metadata: { status: 'failed' }
    };
  }
  
  return {
    content: [{
      type: "text",
      text: `## ⏳ 작업 진행 중\n\n` +
            `- **작업 ID**: \`${params.task_id}\`\n` +
            `- **상태**: ${result.status}\n\n` +
            `잠시 후 다시 조회해주세요.`
    }],
    metadata: { status: result.status }
  };
}

// 작업 취소
export const backgroundCancelSchema = z.object({
  task_id: z.string().describe("취소할 작업 ID")
}).strict();

export const backgroundCancelTool = {
  name: "background_expert_cancel",
  title: "백그라운드 작업 취소",
  description: "진행 중인 백그라운드 작업을 취소합니다.",
  inputSchema: backgroundCancelSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundCancel(params: z.infer<typeof backgroundCancelSchema>) {
  const success = cancelTask(params.task_id);
  
  return {
    content: [{
      type: "text",
      text: success
        ? `## ✅ 작업 취소됨\n\n작업 ID \`${params.task_id}\`가 취소되었습니다.`
        : `## ⚠️ 취소 실패\n\n작업을 취소할 수 없습니다. (이미 완료되었거나 존재하지 않음)`
    }]
  };
}

// 작업 목록
export const backgroundListSchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"])
    .optional()
    .describe("필터링할 상태")
}).strict();

export const backgroundListTool = {
  name: "background_expert_list",
  title: "백그라운드 작업 목록",
  description: "모든 백그라운드 작업 목록과 상태를 조회합니다.",
  inputSchema: backgroundListSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export function handleBackgroundList(params: z.infer<typeof backgroundListSchema>) {
  const tasks = listTasks(params.status);
  const stats = getStats();
  
  if (tasks.length === 0) {
    return {
      content: [{
        type: "text",
        text: `## 백그라운드 작업 목록\n\n작업이 없습니다.`
      }]
    };
  }
  
  const taskList = tasks.map(t => 
    `- \`${t.id}\`: **${t.expert}** - ${t.status}` +
    (t.status === 'completed' ? ' ✅' : '') +
    (t.status === 'failed' ? ' ❌' : '') +
    (t.status === 'running' ? ' 🔄' : '') +
    (t.status === 'pending' ? ' ⏳' : '')
  ).join('\n');
  
  return {
    content: [{
      type: "text",
      text: `## 백그라운드 작업 목록\n\n` +
            `**통계**: ${stats.running} 실행 중, ${stats.pending} 대기 중, ` +
            `${stats.completed} 완료, ${stats.failed} 실패\n\n` +
            taskList
    }],
    metadata: { stats }
  };
}
```

### 4. design_with_experts (설계 워크플로우)

```typescript
// src/tools/design-workflow.ts

import { z } from "zod";
import { experts } from "../experts";
import { callExpertWithFallback, callExpertsParallel } from "../services/expert-router";

export const designWorkflowSchema = z.object({
  topic: z.string()
    .min(5, "주제는 최소 5자 이상")
    .describe("설계 주제 (예: '트레이딩 알고리즘', '인증 시스템')"),
  
  requirements: z.string()
    .optional()
    .describe("요구사항 목록"),
  
  constraints: z.string()
    .optional()
    .describe("제약조건 (기술 스택, 성능 요구 등)"),
  
  skip_review: z.boolean()
    .default(false)
    .describe("리뷰 단계 건너뛰기 (기본: false)"),
  
  parallel: z.boolean()
    .default(false)
    .describe("설계와 조사를 병렬로 실행 (기본: false)")
}).strict();

export const designWorkflowTool = {
  name: "design_with_experts",
  
  title: "전문가 협업 설계",
  
  description: `설계 작업을 전문가 협업으로 진행합니다.

## 자동 워크플로우
1. **GPT Strategist**: 설계 방향 및 아키텍처 제안
2. **Gemini Reviewer**: 설계안 검토 및 피드백 (skip_review=false일 때)

## 옵션
- parallel=true: Claude Researcher가 관련 레퍼런스 병렬 조사

## 반환값
- strategy: GPT의 설계 제안
- review: Gemini의 검토 의견 (선택)
- research: Claude의 레퍼런스 조사 (parallel=true일 때)

## 사용 예시
topic: "주식 자동매매 룰엔진"
requirements: "YAML 룰파일, 실시간 처리, 백테스트"
constraints: "Rust, PostgreSQL, 1ms 이하 응답"`,

  inputSchema: designWorkflowSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  }
};

export async function handleDesignWorkflow(params: z.infer<typeof designWorkflowSchema>) {
  const strategyPrompt = `
[설계 요청]
주제: ${params.topic}
요구사항: ${params.requirements || "없음"}
제약조건: ${params.constraints || "없음"}

설계 방향과 아키텍처를 제안해주세요.
  `.trim();
  
  let strategy: string;
  let review: string = '';
  let research: string = '';
  let fellBack = false;
  
  try {
    if (params.parallel) {
      // 병렬 실행: 설계 + 조사
      const [strategyResult, researchResult] = await callExpertsParallel([
        { expertId: 'strategist', prompt: strategyPrompt },
        { 
          expertId: 'researcher', 
          prompt: `[레퍼런스 조사]\n주제: ${params.topic}\n\n관련 라이브러리, 패턴, 베스트 프랙티스를 조사해주세요.` 
        }
      ]);
      
      strategy = strategyResult.response;
      research = researchResult.response;
      fellBack = strategyResult.fellBack || researchResult.fellBack;
    } else {
      // 순차 실행
      const strategyResult = await callExpertWithFallback('strategist', strategyPrompt);
      strategy = strategyResult.response;
      fellBack = strategyResult.fellBack;
    }
    
    // 리뷰 (선택)
    if (!params.skip_review) {
      const reviewPrompt = `
[설계 리뷰 요청]
주제: ${params.topic}

GPT 제안:
${strategy}

이 설계의 문제점과 개선점을 검토해주세요.
      `.trim();
      
      const reviewResult = await callExpertWithFallback('reviewer', reviewPrompt);
      review = reviewResult.response;
      fellBack = fellBack || reviewResult.fellBack;
    }
    
    // 결과 포맷팅
    let output = `## 설계 결과: ${params.topic}\n\n`;
    output += `### 🎯 GPT Strategist 제안\n${strategy}\n\n`;
    
    if (research) {
      output += `### 📚 Claude Researcher 조사\n${research}\n\n`;
    }
    
    if (review) {
      output += `### 🔍 Gemini Reviewer 검토\n${review}\n\n`;
    }
    
    output += `---\n위 전문가 의견을 참고하여 설계를 진행하세요.`;
    
    if (fellBack) {
      output += `\n\n⚠️ 일부 전문가가 한도 초과로 대체되었습니다.`;
    }
    
    return {
      content: [{ type: "text", text: output }],
      metadata: { fellBack }
    };
    
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 설계 워크플로우 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
```

### 5. review_code (코드 리뷰 워크플로우)

```typescript
// src/tools/review-workflow.ts

import { z } from "zod";
import { callExpertWithFallback, callExpertsParallel } from "../services/expert-router";

export const reviewCodeSchema = z.object({
  code: z.string()
    .min(10, "코드는 최소 10자 이상")
    .describe("리뷰할 코드"),
  
  language: z.string()
    .optional()
    .describe("프로그래밍 언어 (자동 감지)"),
  
  focus: z.enum(["bugs", "performance", "security", "style", "all"])
    .default("all")
    .describe("집중할 리뷰 영역"),
  
  include_strategist: z.boolean()
    .default(false)
    .describe("GPT 설계 관점 리뷰 추가"),
  
  parallel: z.boolean()
    .default(true)
    .describe("병렬 실행 (include_strategist=true일 때)")
}).strict();

export const reviewCodeTool = {
  name: "review_code",
  
  title: "코드 리뷰",
  
  description: `코드 리뷰를 전문가에게 요청합니다.

## 기본 워크플로우
- **Gemini Reviewer**: 버그, 성능, 보안, 스타일 검토

## 옵션
- include_strategist=true: GPT의 설계 관점 리뷰 추가
- focus: 특정 영역에 집중 (bugs/performance/security/style/all)

## 사용 예시
code: "function fetchData() { ... }"
focus: "security"
include_strategist: true`,

  inputSchema: reviewCodeSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleReviewCode(params: z.infer<typeof reviewCodeSchema>) {
  const focusGuide: Record<string, string> = {
    bugs: "버그, 엣지케이스, 예외처리",
    performance: "성능 이슈, 병목점, 최적화",
    security: "보안 취약점, 인젝션, 인증",
    style: "코드 스타일, 가독성, 네이밍",
    all: "전체 (버그, 성능, 보안, 스타일)"
  };
  
  const reviewPrompt = `
[코드 리뷰 요청]
언어: ${params.language || "자동 감지"}
집중 영역: ${focusGuide[params.focus]}

\`\`\`
${params.code}
\`\`\`

위 코드를 리뷰해주세요.
  `.trim();

  try {
    let geminiReview: string;
    let gptReview: string = '';
    
    if (params.include_strategist && params.parallel) {
      // 병렬 실행
      const [reviewResult, strategyResult] = await callExpertsParallel([
        { expertId: 'reviewer', prompt: reviewPrompt },
        { 
          expertId: 'strategist', 
          prompt: `[설계 관점 코드 리뷰]\n\`\`\`\n${params.code}\n\`\`\`\n\n설계/구조 관점에서 검토해주세요.` 
        }
      ]);
      
      geminiReview = reviewResult.response;
      gptReview = strategyResult.response;
    } else {
      // 순차 실행
      const reviewResult = await callExpertWithFallback('reviewer', reviewPrompt);
      geminiReview = reviewResult.response;
      
      if (params.include_strategist) {
        const strategyResult = await callExpertWithFallback(
          'strategist',
          `[설계 관점 코드 리뷰]\n\`\`\`\n${params.code}\n\`\`\`\n\n설계/구조 관점에서 검토해주세요.`
        );
        gptReview = strategyResult.response;
      }
    }
    
    let output = `## 코드 리뷰 결과\n\n`;
    output += `### 🔍 Gemini Reviewer\n${geminiReview}\n\n`;
    
    if (gptReview) {
      output += `### 🎯 GPT Strategist (설계 관점)\n${gptReview}`;
    }
    
    return {
      content: [{ type: "text", text: output }]
    };
    
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 코드 리뷰 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
```

### 6. research_topic (조사 워크플로우)

```typescript
// src/tools/research-workflow.ts

import { z } from "zod";
import { callExpertWithFallback } from "../services/expert-router";

export const researchTopicSchema = z.object({
  topic: z.string()
    .min(3, "주제는 최소 3자 이상")
    .describe("조사 주제"),
  
  depth: z.enum(["quick", "normal", "deep"])
    .default("normal")
    .describe("조사 깊이"),
  
  context: z.string()
    .optional()
    .describe("추가 컨텍스트 (프로젝트 정보 등)")
}).strict();

export const researchTopicTool = {
  name: "research_topic",
  
  title: "주제 조사",
  
  description: `주제에 대한 조사를 Claude Researcher에게 요청합니다.

## 깊이 옵션
- quick: 핵심만 빠르게
- normal: 일반적인 수준
- deep: 심층 분석

## 사용 시점
- 라이브러리 사용법 조사
- 코드베이스 분석
- 기술 비교 분석

## 사용 예시
topic: "React Query vs SWR 비교"
depth: "deep"`,

  inputSchema: researchTopicSchema,
  
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  }
};

export async function handleResearchTopic(params: z.infer<typeof researchTopicSchema>) {
  const depthGuide: Record<string, string> = {
    quick: "핵심만 간단히 (2-3문장)",
    normal: "일반적인 수준으로 상세히",
    deep: "심층적으로 모든 측면을 분석"
  };
  
  const researchPrompt = `
[조사 요청]
주제: ${params.topic}
깊이: ${depthGuide[params.depth]}
${params.context ? `\n컨텍스트:\n${params.context}` : ""}

위 주제에 대해 ${depthGuide[params.depth]} 조사해주세요.
  `.trim();

  try {
    const result = await callExpertWithFallback('researcher', researchPrompt, params.context);
    
    return {
      content: [{
        type: "text",
        text: `## 조사 결과: ${params.topic}\n\n` +
              `### 📚 Claude Researcher\n${result.response}` +
              (result.fellBack ? `\n\n⚠️ 폴백: researcher → ${result.actualExpert}` : '')
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `## ⚠️ 조사 실패\n\n**오류**: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}
```

### 7. health_check (헬스체크) ⭐ NEW

```typescript
// src/tools/health-check.ts

import { z } from "zod";
import { config } from "../config";
import { getRateLimitStatus } from "../utils/rate-limit";
import { getCacheStats, clearCache } from "../utils/cache";
import { getStats as getBackgroundStats, cleanupOldTasks } from "../services/background-manager";
import { experts } from "../experts";

export const healthCheckSchema = z.object({
  include_details: z.boolean()
    .default(false)
    .describe("상세 정보 포함"),
  
  clear_cache: z.boolean()
    .default(false)
    .describe("캐시 초기화"),
  
  cleanup_tasks: z.boolean()
    .default(false)
    .describe("오래된 백그라운드 작업 정리")
}).strict();

export const healthCheckTool = {
  name: "llm_router_health",
  
  title: "LLM Router 상태 확인",
  
  description: `LLM Router MCP 서버의 상태를 확인합니다.

## 확인 항목
- CLIProxyAPI 연결 상태
- Rate Limit 현황
- 캐시 통계
- 백그라운드 작업 현황
- 등록된 전문가 목록

## 관리 기능
- clear_cache: 응답 캐시 초기화
- cleanup_tasks: 완료된 백그라운드 작업 정리`,

  inputSchema: healthCheckSchema,
  
  annotations: {
    readOnlyHint: false,  // 캐시 정리 가능
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }
};

export async function handleHealthCheck(params: z.infer<typeof healthCheckSchema>) {
  // 캐시 정리
  if (params.clear_cache) {
    clearCache();
  }
  
  // 오래된 작업 정리
  let cleanedTasks = 0;
  if (params.cleanup_tasks) {
    cleanedTasks = cleanupOldTasks();
  }
  
  // CLIProxyAPI 연결 테스트
  let apiStatus = 'unknown';
  try {
    const res = await fetch(`${config.cliproxyUrl}/health`, {
      signal: AbortSignal.timeout(5000)
    });
    apiStatus = res.ok ? '✅ 연결됨' : `⚠️ 응답 오류 (${res.status})`;
  } catch (error) {
    apiStatus = '❌ 연결 실패';
  }
  
  // 통계 수집
  const rateLimitStatus = getRateLimitStatus();
  const cacheStats = getCacheStats();
  const backgroundStats = getBackgroundStats();
  
  let output = `## 🏥 LLM Router 상태\n\n`;
  
  output += `### CLIProxyAPI\n`;
  output += `- URL: \`${config.cliproxyUrl}\`\n`;
  output += `- 상태: ${apiStatus}\n\n`;
  
  output += `### 전문가 (${Object.keys(experts).length}명)\n`;
  for (const [id, expert] of Object.entries(experts)) {
    const limited = rateLimitStatus[expert.model]?.limited;
    output += `- **${id}**: ${expert.model} ${limited ? '🔴 한도초과' : '🟢'}\n`;
  }
  output += '\n';
  
  output += `### 캐시\n`;
  output += `- 항목 수: ${cacheStats.size}/${cacheStats.maxSize}\n`;
  output += `- TTL: ${cacheStats.ttlMs / 1000 / 60}분\n`;
  if (params.clear_cache) {
    output += `- ✅ 캐시 초기화됨\n`;
  }
  output += '\n';
  
  output += `### 백그라운드 작업\n`;
  output += `- 실행 중: ${backgroundStats.running}\n`;
  output += `- 대기 중: ${backgroundStats.pending} (큐: ${backgroundStats.queueLength})\n`;
  output += `- 완료: ${backgroundStats.completed}\n`;
  output += `- 실패: ${backgroundStats.failed}\n`;
  if (params.cleanup_tasks && cleanedTasks > 0) {
    output += `- ✅ ${cleanedTasks}개 작업 정리됨\n`;
  }
  
  if (params.include_details) {
    output += `\n### 상세 설정\n`;
    output += `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  }
  
  return {
    content: [{ type: "text", text: output }],
    metadata: {
      apiStatus,
      cacheStats,
      backgroundStats,
      rateLimitStatus
    }
  };
}
```

---

## 메인 서버

```typescript
// src/index.ts

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { logger } from "./utils/logger";
import { config } from "./config";

// 도구 임포트
import { consultExpertTool, consultExpertSchema, handleConsultExpert } from "./tools/consult-expert";
import { categoryTaskTool, categoryTaskSchema, handleCategoryTask } from "./tools/category-task";
import { 
  backgroundStartTool, backgroundStartSchema, handleBackgroundStart,
  backgroundResultTool, backgroundResultSchema, handleBackgroundResult,
  backgroundCancelTool, backgroundCancelSchema, handleBackgroundCancel,
  backgroundListTool, backgroundListSchema, handleBackgroundList
} from "./tools/background-task";
import { designWorkflowTool, designWorkflowSchema, handleDesignWorkflow } from "./tools/design-workflow";
import { reviewCodeTool, reviewCodeSchema, handleReviewCode } from "./tools/review-workflow";
import { researchTopicTool, researchTopicSchema, handleResearchTopic } from "./tools/research-workflow";
import { healthCheckTool, healthCheckSchema, handleHealthCheck } from "./tools/health-check";

// 서버 초기화
const server = new McpServer({
  name: "llm-router-mcp",
  version: "2.0.0"
});

// 도구 등록
function registerTools() {
  // 1. consult_expert
  server.tool(
    consultExpertTool.name,
    consultExpertTool.description,
    consultExpertSchema.shape,
    handleConsultExpert
  );

  // 2. route_by_category
  server.tool(
    categoryTaskTool.name,
    categoryTaskTool.description,
    categoryTaskSchema.shape,
    handleCategoryTask
  );

  // 3. background_expert_start
  server.tool(
    backgroundStartTool.name,
    backgroundStartTool.description,
    backgroundStartSchema.shape,
    handleBackgroundStart
  );

  // 4. background_expert_result
  server.tool(
    backgroundResultTool.name,
    backgroundResultTool.description,
    backgroundResultSchema.shape,
    handleBackgroundResult
  );

  // 5. background_expert_cancel
  server.tool(
    backgroundCancelTool.name,
    backgroundCancelTool.description,
    backgroundCancelSchema.shape,
    handleBackgroundCancel
  );

  // 6. background_expert_list
  server.tool(
    backgroundListTool.name,
    backgroundListTool.description,
    backgroundListSchema.shape,
    handleBackgroundList
  );

  // 7. design_with_experts
  server.tool(
    designWorkflowTool.name,
    designWorkflowTool.description,
    designWorkflowSchema.shape,
    handleDesignWorkflow
  );

  // 8. review_code
  server.tool(
    reviewCodeTool.name,
    reviewCodeTool.description,
    reviewCodeSchema.shape,
    handleReviewCode
  );

  // 9. research_topic
  server.tool(
    researchTopicTool.name,
    researchTopicTool.description,
    researchTopicSchema.shape,
    handleResearchTopic
  );

  // 10. llm_router_health
  server.tool(
    healthCheckTool.name,
    healthCheckTool.description,
    healthCheckSchema.shape,
    handleHealthCheck
  );

  logger.info({ toolCount: 10 }, 'Tools registered');
}

// 서버 실행
async function main() {
  logger.info({ 
    version: '2.0.0',
    cliproxyUrl: config.cliproxyUrl 
  }, 'Starting LLM Router MCP Server');
  
  registerTools();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('LLM Router MCP Server running on stdio');
}

main().catch((error) => {
  logger.fatal({ error }, 'Server startup failed');
  process.exit(1);
});
```

---

## 설정 파일

### package.json

```json
{
  "name": "llm-router-mcp",
  "version": "2.0.0",
  "description": "MCP server for multi-LLM orchestration via CLIProxyAPI",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "clean": "rm -rf dist",
    "lint": "eslint src/**/*.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0",
    "lru-cache": "^10.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "vitest": "^1.2.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

## Claude Code 설정

### ~/.claude/settings.json (또는 .mcp.json)

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["/path/to/llm-router-mcp/dist/index.js"],
      "env": {
        "CLIPROXY_URL": "http://localhost:8787",
        "LOG_LEVEL": "info",
        "CACHE_ENABLED": "true",
        "CACHE_TTL_MS": "1800000"
      }
    }
  }
}
```

---

## 도구 요약

| 도구 | 설명 | 사용 전문가 |
|------|------|------------|
| `consult_expert` | 개별 전문가 자문 | 선택 (1명) |
| `route_by_category` | 카테고리 기반 자동 라우팅 | 카테고리별 기본 전문가 |
| `background_expert_start` | 백그라운드 비동기 실행 | 선택 (1명) |
| `background_expert_result` | 백그라운드 결과 조회 | - |
| `background_expert_cancel` | 백그라운드 작업 취소 | - |
| `background_expert_list` | 백그라운드 작업 목록 | - |
| `design_with_experts` | 설계 워크플로우 | GPT → Gemini Pro |
| `review_code` | 코드 리뷰 | Gemini Pro (+ GPT 선택) |
| `research_topic` | 주제 조사 | Claude Sonnet |
| `llm_router_health` | 상태 확인 및 관리 | - |

---

## 전문가 요약

| ID | 모델 | 역할 | 비용 | 폴백 |
|----|------|------|------|------|
| `strategist` | GPT 5.2 | 전략/설계/아키텍처 | High | researcher |
| `researcher` | Claude Sonnet 4.5 | 조사/분석/탐색 | Medium | reviewer |
| `reviewer` | Gemini 3.0 Pro | 코드 리뷰/버그 탐지 | Medium | explorer |
| `frontend` | Gemini 3.0 Pro | UI/UX/프론트엔드 | Medium | writer |
| `writer` | Gemini 3.0 Flash | 문서 작성/정리 | Low | explorer |
| `explorer` | Gemini 3.0 Flash | 빠른 탐색/간단한 질문 | Low | - |

---

## 카테고리 요약

| 카테고리 | 기본 전문가 | 용도 | Temperature |
|----------|------------|------|-------------|
| `visual` | frontend | UI/UX, 디자인 | 0.7 |
| `business-logic` | strategist | 백엔드, 아키텍처 | 0.1 |
| `research` | researcher | 조사, 분석 | 0.1 |
| `quick` | explorer | 빠른 탐색 | 0.1 |
| `review` | reviewer | 코드 리뷰 | 0.1 |
| `documentation` | writer | 문서 작성 | 0.2 |

---

## 핵심 기능 요약

### ✅ 기존 기능
- 6명의 전문가 (역할별 LLM 배정)
- 워크플로우 도구 (설계, 리뷰, 조사)
- Zod 스키마 검증
- MCP 표준 준수

### ⭐ 추가된 기능 (v2.0)
- **Explorer 전문가**: 빠른 탐색 전용 (Gemini Flash)
- **Rate Limit 처리**: 자동 감지, 재시도, 폴백
- **백그라운드 실행**: 비동기 병렬 작업 지원
- **카테고리 라우팅**: 작업 유형별 자동 전문가 선택
- **응답 캐싱**: LRU 캐시로 중복 호출 방지
- **동시성 제어**: 프로바이더/모델별 한도 관리
- **헬스체크**: 상태 모니터링 및 관리
- **구조화된 로깅**: pino 기반 로깅
- **환경변수 설정**: 모델명, 한도 등 외부 설정

---

## 개발 순서

1. **환경 준비**
   ```bash
   # CLIProxyAPI 설치 & OAuth 로그인
   # Node.js 18+ 확인
   node --version
   ```

2. **프로젝트 생성**
   ```bash
   mkdir llm-router-mcp
   cd llm-router-mcp
   npm init -y
   npm install @modelcontextprotocol/sdk zod pino pino-pretty lru-cache
   npm install -D typescript @types/node vitest
   ```

3. **환경변수 설정**
   ```bash
   cp .env.example .env
   # .env 파일 편집
   ```

4. **코드 작성**
   - 위 설계대로 src/ 디렉토리 구조 생성
   - 유틸리티 → 서비스 → 전문가 → 도구 순서로 구현

5. **빌드 & 테스트**
   ```bash
   npm run build
   npx @modelcontextprotocol/inspector dist/index.js
   ```

6. **Claude Code 연결**
   ```bash
   # ~/.claude/settings.json에 MCP 등록
   # Claude Code 재시작
   ```

7. **동작 확인**
   ```
   # Claude Code에서
   "llm_router_health 실행해줘"
   "이 코드 리뷰해줘" (review_code 자동 호출)
   ```
