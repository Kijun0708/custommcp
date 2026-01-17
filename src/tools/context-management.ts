// src/tools/context-management.ts

/**
 * Context Management MCP Tools
 *
 * Provides tools for monitoring and managing context window usage,
 * truncation settings, and incomplete task tracking.
 */

import { z } from 'zod';
import {
  getContextUsageStats,
  resetContextState,
  updateContextMonitorConfig,
  getTruncatorStats,
  updateTruncatorConfig,
  getEnforcerStats,
  resetEnforcerState,
  clearIncompleteItems,
  markItemComplete
} from '../hooks/builtin/index.js';

/**
 * Context Status Schema
 */
export const contextStatusSchema = z.object({
  reset: z.boolean()
    .default(false)
    .optional()
    .describe("컨텍스트 상태 초기화 여부")
});

export type ContextStatusParams = z.infer<typeof contextStatusSchema>;

/**
 * Context Config Schema
 */
export const contextConfigSchema = z.object({
  warning_threshold: z.number()
    .min(0.1)
    .max(0.95)
    .optional()
    .describe("경고 임계값 (0.1-0.95, 기본: 0.7)"),
  critical_threshold: z.number()
    .min(0.5)
    .max(0.99)
    .optional()
    .describe("위험 임계값 (0.5-0.99, 기본: 0.9)"),
  inject_warnings: z.boolean()
    .optional()
    .describe("경고 메시지 주입 여부")
});

export type ContextConfigParams = z.infer<typeof contextConfigSchema>;

/**
 * Truncator Config Schema
 */
export const truncatorConfigSchema = z.object({
  max_output_length: z.number()
    .min(1000)
    .max(200000)
    .optional()
    .describe("최대 출력 길이 (기본: 50000)"),
  response_reserve: z.number()
    .min(0.1)
    .max(0.5)
    .optional()
    .describe("응답 예약 비율 (기본: 0.3)")
});

export type TruncatorConfigParams = z.infer<typeof truncatorConfigSchema>;

/**
 * Enforcer Action Schema
 */
export const enforcerActionSchema = z.object({
  action: z.enum(['status', 'clear', 'reset', 'complete'])
    .describe("실행할 액션: status(상태), clear(항목 삭제), reset(초기화), complete(항목 완료)"),
  item_index: z.number()
    .min(0)
    .optional()
    .describe("완료할 항목 인덱스 (complete 액션용)")
});

export type EnforcerActionParams = z.infer<typeof enforcerActionSchema>;

/**
 * Context Status Tool
 */
export const contextStatusTool = {
  name: "context_status",
  description: `컨텍스트 윈도우 사용량 상태 조회.

## 기능
- 현재 토큰 사용량 확인
- 사용률 (%) 및 경고 레벨
- Expert/Tool별 토큰 분포
- 세션 지속 시간

## 사용 예시
- 상태 조회: context_status
- 상태 초기화: context_status, reset=true`
};

/**
 * Context Config Tool
 */
export const contextConfigTool = {
  name: "context_config",
  description: `컨텍스트 모니터 설정 변경.

## 설정 항목
- warning_threshold: 경고 임계값 (기본 70%)
- critical_threshold: 위험 임계값 (기본 90%)
- inject_warnings: 경고 메시지 자동 주입 여부`
};

/**
 * Truncator Config Tool
 */
export const truncatorConfigTool = {
  name: "truncator_config",
  description: `도구 출력 자르기 설정 변경.

## 설정 항목
- max_output_length: 최대 출력 길이
- response_reserve: 응답용 예약 비율

출력이 길면 자동으로 잘라서 컨텍스트를 보호합니다.`
};

/**
 * Enforcer Action Tool
 */
export const enforcerActionTool = {
  name: "todo_enforcer",
  description: `미완료 작업 관리 도구.

## 액션
- status: 감지된 미완료 항목 목록 조회
- clear: 모든 미완료 항목 삭제
- reset: 전체 상태 초기화
- complete: 특정 항목 완료 처리 (item_index 필요)

미완료 작업을 추적하여 작업 완결성을 보장합니다.`
};

/**
 * Handle Context Status
 */
export async function handleContextStatus(params: ContextStatusParams) {
  if (params.reset) {
    resetContextState();
    return {
      content: [{
        type: "text" as const,
        text: "## 컨텍스트 상태 초기화 완료\n\n토큰 카운터가 0으로 리셋되었습니다."
      }]
    };
  }

  const stats = getContextUsageStats();

  const warningEmoji = stats.warningLevel === 'critical' ? '🔴' :
                       stats.warningLevel === 'warning' ? '🟡' : '🟢';

  const lines = [
    `## 컨텍스트 윈도우 상태 ${warningEmoji}`,
    '',
    `**모델**: ${stats.model}`,
    `**사용량**: ${stats.totalTokens.toLocaleString()} / ${stats.limit.toLocaleString()} 토큰`,
    `**사용률**: ${(stats.usagePercentage * 100).toFixed(1)}%`,
    `**경고 레벨**: ${stats.warningLevel}`,
    '',
    '### 토큰 분포',
    `- Expert 응답: ${stats.expertTokens.toLocaleString()} 토큰`,
    `- Tool 결과: ${stats.toolTokens.toLocaleString()} 토큰`,
    '',
    `**상호작용 수**: ${stats.interactionCount}회`,
    `**세션 시간**: ${Math.floor(stats.sessionDurationMs / 60000)}분 ${Math.floor((stats.sessionDurationMs % 60000) / 1000)}초`
  ];

  if (stats.warningLevel !== 'none') {
    lines.push('');
    lines.push('⚠️ 컨텍스트 사용량이 높습니다. 작업을 마무리하거나 새 세션을 시작하세요.');
  }

  return {
    content: [{
      type: "text" as const,
      text: lines.join('\n')
    }]
  };
}

/**
 * Handle Context Config
 */
export async function handleContextConfig(params: ContextConfigParams) {
  const updates: Record<string, unknown> = {};

  if (params.warning_threshold !== undefined) {
    updates.warningThreshold = params.warning_threshold;
  }
  if (params.critical_threshold !== undefined) {
    updates.criticalThreshold = params.critical_threshold;
  }
  if (params.inject_warnings !== undefined) {
    updates.injectWarnings = params.inject_warnings;
  }

  if (Object.keys(updates).length === 0) {
    // No updates, show current config
    const stats = getContextUsageStats();
    return {
      content: [{
        type: "text" as const,
        text: `## 컨텍스트 모니터 설정\n\n현재 설정을 확인하려면 context_status를 사용하세요.\n설정 변경: warning_threshold, critical_threshold, inject_warnings 파라미터 사용`
      }]
    };
  }

  updateContextMonitorConfig(updates as any);

  return {
    content: [{
      type: "text" as const,
      text: `## 컨텍스트 모니터 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    }]
  };
}

/**
 * Handle Truncator Config
 */
export async function handleTruncatorConfig(params: TruncatorConfigParams) {
  const updates: Record<string, unknown> = {};

  if (params.max_output_length !== undefined) {
    updates.maxOutputLength = params.max_output_length;
  }
  if (params.response_reserve !== undefined) {
    updates.responseReserve = params.response_reserve;
  }

  if (Object.keys(updates).length === 0) {
    const stats = getTruncatorStats();
    return {
      content: [{
        type: "text" as const,
        text: `## 출력 자르기 설정\n\n**현재 최대 출력**: ${stats.currentMaxOutput.toLocaleString()} 문자\n**설정된 최대값**: ${stats.config.maxOutputLength.toLocaleString()} 문자\n**응답 예약**: ${(stats.config.responseReserve * 100)}%`
      }]
    };
  }

  updateTruncatorConfig(updates as any);

  return {
    content: [{
      type: "text" as const,
      text: `## 출력 자르기 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    }]
  };
}

/**
 * Handle Enforcer Action
 */
export async function handleEnforcerAction(params: EnforcerActionParams) {
  switch (params.action) {
    case 'status': {
      const stats = getEnforcerStats();

      if (stats.incompleteCount === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `## 미완료 작업 상태\n\n✅ 감지된 미완료 항목이 없습니다.\n\n**분석된 응답**: ${stats.responsesAnalyzed}개\n**발송된 알림**: ${stats.reminderCount}회`
          }]
        };
      }

      const itemsList = stats.items.map((item, i) =>
        `${i + 1}. \`${item.pattern}\`\n   - 컨텍스트: "${item.context.substring(0, 60)}..."\n   - 신뢰도: ${(item.confidence * 100).toFixed(0)}%\n   - 소스: ${item.source}`
      ).join('\n');

      return {
        content: [{
          type: "text" as const,
          text: `## 미완료 작업 상태\n\n**감지된 항목**: ${stats.incompleteCount}개\n**분석된 응답**: ${stats.responsesAnalyzed}개\n\n### 항목 목록\n${itemsList}\n\n_완료하려면 \`todo_enforcer action=complete item_index=N\` 사용_`
        }]
      };
    }

    case 'clear': {
      clearIncompleteItems();
      return {
        content: [{
          type: "text" as const,
          text: "## 미완료 항목 삭제\n\n모든 미완료 항목이 삭제되었습니다."
        }]
      };
    }

    case 'reset': {
      resetEnforcerState();
      return {
        content: [{
          type: "text" as const,
          text: "## Enforcer 상태 초기화\n\n미완료 작업 추적 상태가 초기화되었습니다."
        }]
      };
    }

    case 'complete': {
      if (params.item_index === undefined) {
        return {
          content: [{
            type: "text" as const,
            text: "## 오류\n\n`complete` 액션에는 `item_index` 파라미터가 필요합니다."
          }]
        };
      }

      const success = markItemComplete(params.item_index);
      if (success) {
        return {
          content: [{
            type: "text" as const,
            text: `## 항목 완료 처리\n\n항목 #${params.item_index + 1}이 완료로 표시되었습니다.`
          }]
        };
      } else {
        return {
          content: [{
            type: "text" as const,
            text: `## 오류\n\n항목 인덱스 ${params.item_index}를 찾을 수 없습니다.`
          }]
        };
      }
    }

    default:
      return {
        content: [{
          type: "text" as const,
          text: "## 오류\n\n알 수 없는 액션입니다. status, clear, reset, complete 중 선택하세요."
        }]
      };
  }
}

export default {
  contextStatusTool,
  contextStatusSchema,
  handleContextStatus,
  contextConfigTool,
  contextConfigSchema,
  handleContextConfig,
  truncatorConfigTool,
  truncatorConfigSchema,
  handleTruncatorConfig,
  enforcerActionTool,
  enforcerActionSchema,
  handleEnforcerAction
};
