// src/services/expert-router.ts

import { ExpertResponse } from '../types.js';
import { experts, FALLBACK_CHAIN } from '../experts/index.js';
import { callExpert, RateLimitExceededError } from './cliproxy-client.js';
import { callExpertWithTools } from './expert-with-tools.js';
import { logger } from '../utils/logger.js';
import { executeHooks } from '../hooks/index.js';
import { wrapWithPreamble, hasPreamble } from '../utils/worker-preamble.js';

export async function callExpertWithFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  imagePath?: string,
  applyPreamble: boolean = false
): Promise<ExpertResponse> {
  const expert = experts[expertId];

  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }

  const startTime = Date.now();

  // Execute onExpertCall hooks
  const preHookResult = await executeHooks('onExpertCall', {
    expertId,
    model: expert.model,
    prompt,
    context,
    skipCache
  });

  // Check if hooks blocked the call
  if (preHookResult.decision === 'block') {
    throw new Error(`Expert call blocked by hook: ${preHookResult.reason || 'No reason provided'}`);
  }

  // Apply any injected context from hooks
  const finalContext = preHookResult.injectMessage
    ? (context ? `${context}\n\n${preHookResult.injectMessage}` : preHookResult.injectMessage)
    : context;

  // Worker Preamble 적용 (orchestrate 모드에서만)
  const finalPrompt = (applyPreamble && !hasPreamble(prompt))
    ? wrapWithPreamble(prompt)
    : prompt;

  try {
    const result = await callExpert(expert, finalPrompt, { context: finalContext, skipCache, imagePath });
    const durationMs = Date.now() - startTime;

    // Execute onExpertResult hooks
    await executeHooks('onExpertResult', {
      expertId,
      model: expert.model,
      response: result.response,
      responseLength: result.response.length,
      durationMs,
      fromCache: result.cached || false,
      usedFallback: false
    });

    return result;
  } catch (error) {
    // Rate Limit이 아닌 에러는 그대로 throw
    if (!(error instanceof RateLimitExceededError)) {
      // Execute onError hook for non-rate-limit errors
      await executeHooks('onError', {
        errorMessage: (error as Error).message,
        source: `expert:${expertId}`,
        recoverable: false
      });
      throw error;
    }

    // Execute onRateLimit hook
    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    await executeHooks('onRateLimit', {
      provider: getProviderFromModel(expert.model),
      model: expert.model,
      expertId,
      fallbackAvailable: fallbacks.length > 0
    });

    logger.warn({ expertId, error: error.message }, 'Primary expert rate limited, trying fallbacks');

    // 폴백 체인 시도
    for (const fallbackId of fallbacks) {
      try {
        logger.info({ from: expertId, to: fallbackId }, 'Attempting fallback');

        const fallbackExpert = experts[fallbackId];
        const fallbackStartTime = Date.now();
        const result = await callExpert(fallbackExpert, finalPrompt, { context: finalContext, skipCache, imagePath });
        const fallbackDurationMs = Date.now() - fallbackStartTime;

        logger.info({ fallbackId }, 'Fallback succeeded');

        // Execute onExpertResult hooks for fallback
        await executeHooks('onExpertResult', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          response: result.response,
          responseLength: result.response.length,
          durationMs: fallbackDurationMs,
          fromCache: result.cached || false,
          usedFallback: true,
          originalExpert: expertId
        });

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
    const exhaustedError = new Error(
      `All experts exhausted for ${expertId}. ` +
      `Tried: ${expertId}, ${fallbacks.join(', ')}. ` +
      `Please try again later.`
    );

    await executeHooks('onError', {
      errorMessage: exhaustedError.message,
      source: `expert:${expertId}`,
      recoverable: false
    });

    throw exhaustedError;
  }
}

/**
 * Extracts provider from model name.
 */
function getProviderFromModel(model: string): string {
  const modelLower = model.toLowerCase();
  if (modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) {
    return 'openai';
  }
  if (modelLower.includes('claude') || modelLower.includes('anthropic')) {
    return 'anthropic';
  }
  if (modelLower.includes('gemini') || modelLower.includes('google')) {
    return 'google';
  }
  return 'unknown';
}

/**
 * 도구 사용 가능한 전문가 호출 (폴백 지원)
 */
export async function callExpertWithToolsAndFallback(
  expertId: string,
  prompt: string,
  context?: string,
  skipCache: boolean = false,
  enableTools: boolean = true,
  imagePath?: string,
  applyPreamble: boolean = false
): Promise<ExpertResponse> {
  const expert = experts[expertId];

  if (!expert) {
    throw new Error(`Unknown expert: ${expertId}`);
  }

  const startTime = Date.now();

  // Execute onExpertCall hooks
  const preHookResult = await executeHooks('onExpertCall', {
    expertId,
    model: expert.model,
    prompt,
    context,
    skipCache
  });

  // Check if hooks blocked the call
  if (preHookResult.decision === 'block') {
    throw new Error(`Expert call blocked by hook: ${preHookResult.reason || 'No reason provided'}`);
  }

  // Apply any injected context from hooks
  const finalContext = preHookResult.injectMessage
    ? (context ? `${context}\n\n${preHookResult.injectMessage}` : preHookResult.injectMessage)
    : context;

  // Worker Preamble 적용 (orchestrate 모드에서만)
  const finalPrompt = (applyPreamble && !hasPreamble(prompt))
    ? wrapWithPreamble(prompt)
    : prompt;

  try {
    const result = await callExpertWithTools(expert, finalPrompt, {
      context: finalContext,
      skipCache,
      enableTools: enableTools && expert.toolChoice !== "none",
      imagePath
    });

    const durationMs = Date.now() - startTime;

    // Execute onExpertResult hooks
    await executeHooks('onExpertResult', {
      expertId,
      model: expert.model,
      response: result.response,
      responseLength: result.response.length,
      durationMs,
      fromCache: result.cached || false,
      usedFallback: false
    });

    return result;
  } catch (error) {
    // Rate Limit이 아닌 에러는 그대로 throw
    if (!(error instanceof RateLimitExceededError)) {
      // Execute onError hook for non-rate-limit errors
      await executeHooks('onError', {
        errorMessage: (error as Error).message,
        source: `expert:${expertId}`,
        recoverable: false
      });
      throw error;
    }

    // Execute onRateLimit hook
    const fallbacks = FALLBACK_CHAIN[expertId] || [];
    await executeHooks('onRateLimit', {
      provider: getProviderFromModel(expert.model),
      model: expert.model,
      expertId,
      fallbackAvailable: fallbacks.length > 0
    });

    logger.warn({ expertId, error: error.message }, 'Primary expert rate limited, trying fallbacks');

    // 폴백 체인 시도
    for (const fallbackId of fallbacks) {
      try {
        logger.info({ from: expertId, to: fallbackId }, 'Attempting fallback');

        const fallbackExpert = experts[fallbackId];
        const fallbackStartTime = Date.now();
        const result = await callExpertWithTools(fallbackExpert, finalPrompt, {
          context: finalContext,
          skipCache,
          enableTools: enableTools && fallbackExpert.toolChoice !== "none",
          imagePath
        });
        const fallbackDurationMs = Date.now() - fallbackStartTime;

        logger.info({ fallbackId }, 'Fallback succeeded');

        // Execute onExpertResult hooks for fallback
        await executeHooks('onExpertResult', {
          expertId: fallbackId,
          model: fallbackExpert.model,
          response: result.response,
          responseLength: result.response.length,
          durationMs: fallbackDurationMs,
          fromCache: result.cached || false,
          usedFallback: true,
          originalExpert: expertId
        });

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
    const exhaustedError = new Error(
      `All experts exhausted for ${expertId}. ` +
      `Tried: ${expertId}, ${fallbacks.join(', ')}. ` +
      `Please try again later.`
    );

    await executeHooks('onError', {
      errorMessage: exhaustedError.message,
      source: `expert:${expertId}`,
      recoverable: false
    });

    throw exhaustedError;
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
