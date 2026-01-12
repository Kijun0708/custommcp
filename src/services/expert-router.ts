// src/services/expert-router.ts

import { ExpertResponse } from '../types.js';
import { experts, FALLBACK_CHAIN } from '../experts/index.js';
import { callExpert, RateLimitExceededError } from './cliproxy-client.js';
import { callExpertWithTools } from './expert-with-tools.js';
import { logger } from '../utils/logger.js';

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
    return await callExpert(expert, prompt, { context, skipCache });
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
        const result = await callExpert(fallbackExpert, prompt, { context, skipCache });

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

/**
 * 도구 사용 가능한 전문가 호출 (폴백 지원)
 */
export async function callExpertWithToolsAndFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  enableTools: boolean = true
): Promise<ExpertResponse> {
  const expert = experts[expertId];

  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }

  try {
    return await callExpertWithTools(expert, prompt, {
      context,
      skipCache,
      enableTools: enableTools && expert.toolChoice !== "none"
    });
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
        const result = await callExpertWithTools(fallbackExpert, prompt, {
          context,
          skipCache,
          enableTools: enableTools && fallbackExpert.toolChoice !== "none"
        });

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
