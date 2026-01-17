// src/tools/stability-management.ts

/**
 * Stability Management MCP Tools
 *
 * Provides tools for monitoring and managing session stability,
 * edit error recovery, and code quality checks.
 */

import { z } from 'zod';
import {
  getSessionRecoveryStats,
  resetSessionRecoveryState,
  updateSessionRecoveryConfig,
  getEditRecoveryStats,
  resetEditRecoveryState,
  updateEditRecoveryConfig,
  getCommentCheckerStats,
  resetCommentCheckerState,
  updateCommentCheckerConfig
} from '../hooks/builtin/index.js';

/**
 * Session Recovery Schema
 */
export const sessionRecoverySchema = z.object({
  action: z.enum(['status', 'reset', 'config'])
    .describe("실행할 액션: status(상태 조회), reset(초기화), config(설정 변경)"),
  auto_retry: z.boolean()
    .optional()
    .describe("자동 재시도 활성화 여부 (config 액션용)"),
  circuit_breaker_threshold: z.number()
    .min(1)
    .max(20)
    .optional()
    .describe("서킷 브레이커 임계값 (config 액션용)")
});

export type SessionRecoveryParams = z.infer<typeof sessionRecoverySchema>;

/**
 * Edit Recovery Schema
 */
export const editRecoverySchema = z.object({
  action: z.enum(['status', 'reset', 'config'])
    .describe("실행할 액션: status(상태 조회), reset(초기화), config(설정 변경)"),
  enable_suggestions: z.boolean()
    .optional()
    .describe("복구 제안 활성화 여부 (config 액션용)"),
  enable_fuzzy_match: z.boolean()
    .optional()
    .describe("퍼지 매칭 제안 활성화 여부 (config 액션용)")
});

export type EditRecoveryParams = z.infer<typeof editRecoverySchema>;

/**
 * Comment Checker Schema
 */
export const commentCheckerSchema = z.object({
  action: z.enum(['status', 'reset', 'config'])
    .describe("실행할 액션: status(상태 조회), reset(초기화), config(설정 변경)"),
  enabled: z.boolean()
    .optional()
    .describe("주석 검사 활성화 여부 (config 액션용)"),
  min_severity: z.number()
    .min(1)
    .max(3)
    .optional()
    .describe("최소 보고 심각도 1-3 (config 액션용)"),
  check_ai_patterns: z.boolean()
    .optional()
    .describe("AI 생성 패턴 검사 여부 (config 액션용)")
});

export type CommentCheckerParams = z.infer<typeof commentCheckerSchema>;

/**
 * Session Recovery Tool
 */
export const sessionRecoveryTool = {
  name: "session_recovery",
  description: `세션 복구 시스템 관리.

## 기능
- API 오류 자동 감지 및 분류
- 자동 재시도 및 지수 백오프
- 서킷 브레이커로 연속 오류 방지
- 복구 통계 추적

## 사용 예시
- 상태 조회: session_recovery action=status
- 초기화: session_recovery action=reset
- 설정 변경: session_recovery action=config auto_retry=true`
};

/**
 * Edit Recovery Tool
 */
export const editRecoveryTool = {
  name: "edit_recovery",
  description: `편집 오류 복구 시스템 관리.

## 기능
- 편집 오류 유형 분류 (문자열 미발견, 중복 일치 등)
- 지능형 복구 제안 제공
- 편집 히스토리 추적
- 성공률 통계

## 사용 예시
- 상태 조회: edit_recovery action=status
- 초기화: edit_recovery action=reset`
};

/**
 * Comment Checker Tool
 */
export const commentCheckerTool = {
  name: "comment_checker",
  description: `코드 주석 품질 검사기 관리.

## 기능
- 불필요한 주석 감지 (자명한 코드 설명)
- AI 생성 스타일 주석 탐지
- 주석 처리된 코드 발견
- 과도한 주석 비율 경고

## 사용 예시
- 상태 조회: comment_checker action=status
- 초기화: comment_checker action=reset
- AI 패턴 검사 끄기: comment_checker action=config check_ai_patterns=false`
};

/**
 * Handle Session Recovery
 */
export async function handleSessionRecovery(params: SessionRecoveryParams) {
  switch (params.action) {
    case 'status': {
      const stats = getSessionRecoveryStats();

      const statusEmoji = stats.circuitBreakerActive ? '🔴' :
                          stats.consecutiveErrors > 0 ? '🟡' : '🟢';

      const lines = [
        `## 세션 복구 상태 ${statusEmoji}`,
        '',
        `**연속 오류**: ${stats.consecutiveErrors}회`,
        `**서킷 브레이커**: ${stats.circuitBreakerActive ? '⛔ 활성' : '✅ 비활성'}`,
        `**복구 시도**: ${stats.recoveryAttempts}회`,
        `**성공 복구**: ${stats.successfulRecoveries}회`,
        `**복구율**: ${(stats.recoveryRate * 100).toFixed(1)}%`,
        '',
        '### 최근 오류 히스토리'
      ];

      if (stats.errorHistory.length === 0) {
        lines.push('_오류 없음_');
      } else {
        const recent = stats.errorHistory.slice(-5);
        for (const err of recent) {
          const recovered = err.recovered ? '✅' : '❌';
          const time = new Date(err.timestamp).toLocaleTimeString();
          lines.push(`- ${recovered} [${err.type}] ${time}`);
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: lines.join('\n')
        }]
      };
    }

    case 'reset': {
      resetSessionRecoveryState();
      return {
        content: [{
          type: "text" as const,
          text: "## 세션 복구 상태 초기화\n\n모든 오류 히스토리와 통계가 초기화되었습니다."
        }]
      };
    }

    case 'config': {
      const updates: Record<string, unknown> = {};

      if (params.auto_retry !== undefined) {
        updates.autoRetry = params.auto_retry;
      }
      if (params.circuit_breaker_threshold !== undefined) {
        updates.circuitBreakerThreshold = params.circuit_breaker_threshold;
      }

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "## 세션 복구 설정\n\n변경할 설정을 지정하세요:\n- auto_retry: 자동 재시도 여부\n- circuit_breaker_threshold: 서킷 브레이커 임계값"
          }]
        };
      }

      updateSessionRecoveryConfig(updates as any);

      return {
        content: [{
          type: "text" as const,
          text: `## 세션 복구 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
        }]
      };
    }

    default:
      return {
        content: [{
          type: "text" as const,
          text: "## 오류\n\n알 수 없는 액션입니다."
        }]
      };
  }
}

/**
 * Handle Edit Recovery
 */
export async function handleEditRecovery(params: EditRecoveryParams) {
  switch (params.action) {
    case 'status': {
      const stats = getEditRecoveryStats();

      const successRate = (stats.successRate * 100).toFixed(1);
      const statusEmoji = stats.successRate >= 0.9 ? '🟢' :
                          stats.successRate >= 0.7 ? '🟡' : '🔴';

      const lines = [
        `## 편집 복구 상태 ${statusEmoji}`,
        '',
        `**총 편집 시도**: ${stats.totalEdits}회`,
        `**성공**: ${stats.successfulEdits}회`,
        `**성공률**: ${successRate}%`,
        '',
        '### 오류 유형별 통계'
      ];

      const errorTypes = Object.entries(stats.errorCounts)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      if (errorTypes.length === 0) {
        lines.push('_오류 없음_');
      } else {
        for (const [type, count] of errorTypes) {
          const typeLabel = {
            string_not_found: '문자열 미발견',
            multiple_matches: '중복 일치',
            file_not_found: '파일 미발견',
            permission_denied: '권한 거부',
            encoding_error: '인코딩 오류',
            conflict: '충돌',
            syntax_error: '구문 오류',
            unknown: '알 수 없음'
          }[type] || type;
          lines.push(`- ${typeLabel}: ${count}회`);
        }
      }

      if (stats.recentErrors.length > 0) {
        lines.push('');
        lines.push('### 최근 실패한 편집');
        for (const err of stats.recentErrors.slice(-3)) {
          lines.push(`- \`${err.filePath}\` (${err.errorType})`);
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: lines.join('\n')
        }]
      };
    }

    case 'reset': {
      resetEditRecoveryState();
      return {
        content: [{
          type: "text" as const,
          text: "## 편집 복구 상태 초기화\n\n모든 편집 히스토리와 통계가 초기화되었습니다."
        }]
      };
    }

    case 'config': {
      const updates: Record<string, unknown> = {};

      if (params.enable_suggestions !== undefined) {
        updates.enableSuggestions = params.enable_suggestions;
      }
      if (params.enable_fuzzy_match !== undefined) {
        updates.enableFuzzyMatch = params.enable_fuzzy_match;
      }

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "## 편집 복구 설정\n\n변경할 설정을 지정하세요:\n- enable_suggestions: 복구 제안 활성화\n- enable_fuzzy_match: 퍼지 매칭 제안 활성화"
          }]
        };
      }

      updateEditRecoveryConfig(updates as any);

      return {
        content: [{
          type: "text" as const,
          text: `## 편집 복구 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
        }]
      };
    }

    default:
      return {
        content: [{
          type: "text" as const,
          text: "## 오류\n\n알 수 없는 액션입니다."
        }]
      };
  }
}

/**
 * Handle Comment Checker
 */
export async function handleCommentChecker(params: CommentCheckerParams) {
  switch (params.action) {
    case 'status': {
      const stats = getCommentCheckerStats();

      const statusEmoji = stats.totalIssues === 0 ? '🟢' :
                          stats.totalIssues < 10 ? '🟡' : '🔴';

      const lines = [
        `## 주석 품질 검사 상태 ${statusEmoji}`,
        '',
        `**검사된 파일**: ${stats.filesChecked}개`,
        `**발견된 이슈**: ${stats.totalIssues}개`,
        '',
        '### 이슈 유형별 통계'
      ];

      const issueTypes = Object.entries(stats.issuesByType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      if (issueTypes.length === 0) {
        lines.push('_이슈 없음_');
      } else {
        for (const [type, count] of issueTypes) {
          const typeLabel = {
            redundant: '🔄 불필요한 주석',
            verbose: '📜 장황한 주석',
            ai_generated: '🤖 AI 스타일 주석',
            commented_code: '💾 주석 처리된 코드',
            outdated_marker: '📌 불완전한 마커',
            excessive: '📊 과도한 주석'
          }[type] || type;
          lines.push(`- ${typeLabel}: ${count}개`);
        }
      }

      if (stats.recentIssues.length > 0) {
        lines.push('');
        lines.push('### 최근 이슈 발생 파일');
        for (const recent of stats.recentIssues.slice(-3)) {
          lines.push(`- \`${recent.filePath}\` (${recent.issues.length}개 이슈)`);
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: lines.join('\n')
        }]
      };
    }

    case 'reset': {
      resetCommentCheckerState();
      return {
        content: [{
          type: "text" as const,
          text: "## 주석 검사 상태 초기화\n\n모든 검사 통계가 초기화되었습니다."
        }]
      };
    }

    case 'config': {
      const updates: Record<string, unknown> = {};

      if (params.enabled !== undefined) {
        updates.enabled = params.enabled;
      }
      if (params.min_severity !== undefined) {
        updates.minSeverity = params.min_severity;
      }
      if (params.check_ai_patterns !== undefined) {
        updates.checkAiPatterns = params.check_ai_patterns;
      }

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "## 주석 검사 설정\n\n변경할 설정을 지정하세요:\n- enabled: 주석 검사 활성화\n- min_severity: 최소 보고 심각도 (1-3)\n- check_ai_patterns: AI 패턴 검사 여부"
          }]
        };
      }

      updateCommentCheckerConfig(updates as any);

      return {
        content: [{
          type: "text" as const,
          text: `## 주석 검사 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
        }]
      };
    }

    default:
      return {
        content: [{
          type: "text" as const,
          text: "## 오류\n\n알 수 없는 액션입니다."
        }]
      };
  }
}

export default {
  sessionRecoveryTool,
  sessionRecoverySchema,
  handleSessionRecovery,
  editRecoveryTool,
  editRecoverySchema,
  handleEditRecovery,
  commentCheckerTool,
  commentCheckerSchema,
  handleCommentChecker
};
