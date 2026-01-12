// src/services/cliproxy-client.ts

import { Expert, ExpertResponse, ToolDefinition, ToolCall, ChatMessage } from '../types.js';
import { config } from '../config.js';
import { logger, createExpertLogger } from '../utils/logger.js';
import { getCached, setCache } from '../utils/cache.js';
import { isRateLimitError, parseRetryAfter, markRateLimited, isCurrentlyLimited } from '../utils/rate-limit.js';
import { withRetry } from '../utils/retry.js';

interface ChatRequest {
  model: string;
  messages: Array<{ role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  temperature: number;
  max_tokens: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "required" | "none";
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
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

export interface CallExpertOptions {
  context?: string;
  skipCache?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "required" | "none";
  messages?: ChatMessage[];  // 기존 대화 이력 (Tool Loop용)
}

export async function callExpert(
  expert: Expert,
  prompt: string,
  options: CallExpertOptions = {}
): Promise<ExpertResponse> {
  const { context, skipCache = false, tools, toolChoice, messages } = options;
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

  // 3. 메시지 구성
  let requestMessages: ChatRequest['messages'];

  if (messages && messages.length > 0) {
    // Tool Loop 계속: 기존 대화 이력 사용
    requestMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
      tool_call_id: m.tool_call_id
    }));
  } else {
    // 새 대화: 시스템 프롬프트 + 사용자 메시지
    const fullPrompt = context
      ? `${prompt}\n\n[컨텍스트]\n${context}`
      : prompt;

    requestMessages = [
      { role: "system", content: expert.systemPrompt },
      { role: "user", content: fullPrompt }
    ];
  }

  const request: ChatRequest = {
    model: expert.model,
    messages: requestMessages,
    temperature: expert.temperature,
    max_tokens: expert.maxTokens
  };

  // tools 추가
  if (tools && tools.length > 0) {
    request.tools = tools;
    request.tool_choice = toolChoice || "auto";
  }

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

  const choice = response.choices[0];
  const content = choice.message.content;
  const toolCalls = choice.message.tool_calls;
  // tool_calls가 있으면 "tool_calls", 없으면 "stop"
  const finishReason = (toolCalls && toolCalls.length > 0) ? "tool_calls" : "stop";
  const latencyMs = Date.now() - startTime;

  // 5. 캐시 저장 (도구 호출이 없는 경우만)
  if (!toolCalls && content) {
    setCache(expert.id, prompt, content, context);
  }

  expertLogger.info({
    latencyMs,
    finishReason,
    hasToolCalls: !!toolCalls
  }, 'Expert call completed');

  return {
    response: content || "",
    actualExpert: expert.id,
    fellBack: false,
    cached: false,
    latencyMs,
    toolCalls,
    finishReason
  };
}
