// src/utils/rate-limit.ts

import { logger } from './logger.js';

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

export function isRateLimitError(error: unknown, responseText?: string): boolean {
  // HTTP 429 체크
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (err.status === 429) return true;
    if (err.response && typeof err.response === 'object') {
      const response = err.response as Record<string, unknown>;
      if (response.status === 429) return true;
    }
  }

  // 응답 텍스트에서 패턴 매칭
  const text = responseText || (error instanceof Error ? error.message : String(error)) || '';
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
