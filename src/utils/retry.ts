// src/utils/retry.ts

import { config } from '../config.js';
import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
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
