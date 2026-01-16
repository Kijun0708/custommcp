// src/tools/cost-tracking.ts

/**
 * Cost Tracking MCP Tools
 *
 * API 비용 추적 및 통계 관리 도구
 */

import { z } from 'zod';
import {
  getCostTracker,
  PROVIDER_INFO,
  Provider
} from '../features/cost-tracking/index.js';

// ============================================================================
// Tool Schemas
// ============================================================================

export const costStatusSchema = z.object({
  include_budget: z.boolean()
    .default(true)
    .optional()
    .describe('예산 상태 포함'),
  include_session: z.boolean()
    .default(true)
    .optional()
    .describe('세션 통계 포함'),
  currency: z.enum(['USD', 'KRW'])
    .default('USD')
    .optional()
    .describe('표시 통화')
}).strict();

export const costHistorySchema = z.object({
  days: z.number()
    .min(1)
    .max(90)
    .default(7)
    .optional()
    .describe('조회할 일수'),
  include_records: z.boolean()
    .default(false)
    .optional()
    .describe('상세 기록 포함'),
  limit: z.number()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .describe('상세 기록 수 제한')
}).strict();

export const costStatsSchema = z.object({
  group_by: z.enum(['provider', 'expert', 'model'])
    .default('provider')
    .optional()
    .describe('그룹화 기준'),
  start_date: z.string()
    .optional()
    .describe('시작 날짜 (YYYY-MM-DD)'),
  end_date: z.string()
    .optional()
    .describe('종료 날짜 (YYYY-MM-DD)')
}).strict();

export const costResetSchema = z.object({
  scope: z.enum(['session', 'today', 'all'])
    .describe('초기화 범위: session(세션), today(오늘), all(전체)'),
  confirm: z.boolean()
    .default(false)
    .describe('초기화 확인')
}).strict();

export const costBudgetSchema = z.object({
  enabled: z.boolean()
    .optional()
    .describe('예산 관리 활성화'),
  daily_limit: z.number()
    .min(0)
    .optional()
    .describe('일일 한도 (USD)'),
  monthly_limit: z.number()
    .min(0)
    .optional()
    .describe('월간 한도 (USD)'),
  alert_threshold: z.number()
    .min(0)
    .max(1)
    .optional()
    .describe('알림 임계값 (0-1)')
}).strict();

export const costSystemToggleSchema = z.object({
  enabled: z.boolean()
    .describe('시스템 활성화 여부')
}).strict();

// ============================================================================
// Tool Definitions
// ============================================================================

export const costStatusTool = {
  name: 'cost_status',

  title: '비용 현황',

  description: `현재 API 비용 현황을 조회합니다.

## 반환 정보
- 오늘/이번 달 비용
- 예산 사용률
- 세션 통계
- 프로바이더별 비용`,

  inputSchema: costStatusSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const costHistoryTool = {
  name: 'cost_history',

  title: '비용 히스토리',

  description: `일별 비용 히스토리를 조회합니다.

최대 90일까지 조회 가능합니다.`,

  inputSchema: costHistorySchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const costStatsTool = {
  name: 'cost_stats',

  title: '비용 통계',

  description: `상세 비용 통계를 조회합니다.

프로바이더, Expert, 모델별로 그룹화할 수 있습니다.`,

  inputSchema: costStatsSchema,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const costResetTool = {
  name: 'cost_reset',

  title: '비용 초기화',

  description: `비용 통계를 초기화합니다.

## 범위
- **session**: 현재 세션 통계만 초기화
- **today**: 오늘 기록 삭제
- **all**: 모든 기록 삭제`,

  inputSchema: costResetSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const costBudgetTool = {
  name: 'cost_budget',

  title: '예산 설정',

  description: `예산 한도를 설정합니다.

임계값(alert_threshold)에 도달하면 경고가 표시됩니다.`,

  inputSchema: costBudgetSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

export const costSystemToggleTool = {
  name: 'cost_system_toggle',

  title: '비용 추적 토글',

  description: `비용 추적 시스템을 활성화/비활성화합니다.`,

  inputSchema: costSystemToggleSchema,

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }
};

// ============================================================================
// Tool Handlers
// ============================================================================

function formatCost(usd: number, currency: 'USD' | 'KRW', tracker: ReturnType<typeof getCostTracker>): string {
  if (currency === 'KRW') {
    const krw = tracker.convertToKRW(usd);
    return `₩${krw.toLocaleString()}`;
  }
  return `$${usd.toFixed(4)}`;
}

export async function handleCostStatus(
  params: z.infer<typeof costStatusSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tracker = getCostTracker();
  const isEnabled = tracker.isEnabled();
  const currency = params.currency || 'USD';

  let response = `## 💰 API 비용 현황\n\n`;
  response += `**시스템 상태**: ${isEnabled ? '✅ 활성' : '❌ 비활성'}\n\n`;

  // 오늘/이번 달 비용
  const todayCost = tracker.getTodayCost();
  const monthCost = tracker.getMonthCost();

  response += `### 비용 요약\n`;
  response += `| 기간 | 비용 |\n`;
  response += `|------|------|\n`;
  response += `| 오늘 | ${formatCost(todayCost, currency, tracker)} |\n`;
  response += `| 이번 달 | ${formatCost(monthCost, currency, tracker)} |\n\n`;

  // 예산 상태
  if (params.include_budget) {
    const budgetStatus = tracker.getBudgetStatus();

    response += `### 예산 상태\n`;
    response += `**예산 관리**: ${budgetStatus.enabled ? '✅ 활성' : '❌ 비활성'}\n\n`;

    if (budgetStatus.enabled) {
      response += `| 기간 | 한도 | 사용 | 남은 금액 | 사용률 |\n`;
      response += `|------|------|------|----------|--------|\n`;

      if (budgetStatus.daily.limit) {
        const pct = Math.round(budgetStatus.daily.percentage * 100);
        const bar = getProgressBar(budgetStatus.daily.percentage);
        response += `| 일일 | ${formatCost(budgetStatus.daily.limit, currency, tracker)} | ${formatCost(budgetStatus.daily.used, currency, tracker)} | ${formatCost(budgetStatus.daily.remaining!, currency, tracker)} | ${bar} ${pct}% |\n`;
      }

      if (budgetStatus.monthly.limit) {
        const pct = Math.round(budgetStatus.monthly.percentage * 100);
        const bar = getProgressBar(budgetStatus.monthly.percentage);
        response += `| 월간 | ${formatCost(budgetStatus.monthly.limit, currency, tracker)} | ${formatCost(budgetStatus.monthly.used, currency, tracker)} | ${formatCost(budgetStatus.monthly.remaining!, currency, tracker)} | ${bar} ${pct}% |\n`;
      }
      response += '\n';
    }
  }

  // 세션 통계
  if (params.include_session) {
    const session = tracker.getSessionStats();
    const duration = Math.round((Date.now() - new Date(session.startTime).getTime()) / 60000);

    response += `### 세션 통계\n`;
    response += `| 항목 | 값 |\n`;
    response += `|------|-----|\n`;
    response += `| 세션 시작 | ${new Date(session.startTime).toLocaleTimeString('ko-KR')} |\n`;
    response += `| 경과 시간 | ${duration}분 |\n`;
    response += `| 총 호출 | ${session.totalCalls}회 |\n`;
    response += `| 총 비용 | ${formatCost(session.totalCost, currency, tracker)} |\n`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleCostHistory(
  params: z.infer<typeof costHistorySchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tracker = getCostTracker();
  const summaries = tracker.getDailySummaries(params.days);

  let response = `## 📅 비용 히스토리 (최근 ${params.days}일)\n\n`;

  if (summaries.length === 0) {
    response += `기록된 비용이 없습니다.\n`;
    return { content: [{ type: 'text', text: response }] };
  }

  // 일별 요약
  response += `### 일별 요약\n`;
  response += `| 날짜 | 비용 | 호출 수 | 입력 토큰 | 출력 토큰 |\n`;
  response += `|------|------|---------|----------|----------|\n`;

  let totalCost = 0;
  let totalCalls = 0;

  for (const summary of summaries) {
    response += `| ${summary.date} | $${summary.totalCost.toFixed(4)} | ${summary.totalCalls} | ${summary.inputTokens.toLocaleString()} | ${summary.outputTokens.toLocaleString()} |\n`;
    totalCost += summary.totalCost;
    totalCalls += summary.totalCalls;
  }

  response += `| **합계** | **$${totalCost.toFixed(4)}** | **${totalCalls}** | | |\n\n`;

  // 상세 기록
  if (params.include_records) {
    const records = tracker.getRecentRecords(params.limit);

    if (records.length > 0) {
      response += `### 최근 기록 (${records.length}건)\n`;
      response += `| 시간 | Expert | 모델 | 비용 | 토큰 |\n`;
      response += `|------|--------|------|------|------|\n`;

      for (const record of records) {
        const time = new Date(record.timestamp).toLocaleTimeString('ko-KR');
        const providerInfo = PROVIDER_INFO[record.provider];
        response += `| ${time} | ${record.expertId} | ${providerInfo.emoji} ${record.modelId.substring(0, 15)} | $${record.cost.totalCost.toFixed(4)} | ${record.usage.totalTokens.toLocaleString()} |\n`;
      }
      response += '\n';
    }
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleCostStats(
  params: z.infer<typeof costStatsSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tracker = getCostTracker();
  const stats = tracker.getStats(params.start_date, params.end_date);

  let response = `## 📊 비용 통계\n\n`;

  // 전체 요약
  response += `### 전체 요약\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;
  response += `| 총 비용 | $${stats.totalCost.toFixed(4)} |\n`;
  response += `| 총 호출 | ${stats.totalCalls}회 |\n`;
  response += `| 성공 | ${stats.successfulCalls}회 |\n`;
  response += `| 실패 | ${stats.failedCalls}회 |\n`;
  response += `| 캐시 | ${stats.cachedCalls}회 |\n`;
  response += `| 평균 비용/호출 | $${stats.averageCostPerCall.toFixed(6)} |\n`;
  response += `| 총 입력 토큰 | ${stats.totalInputTokens.toLocaleString()} |\n`;
  response += `| 총 출력 토큰 | ${stats.totalOutputTokens.toLocaleString()} |\n\n`;

  // 그룹별 통계
  switch (params.group_by) {
    case 'provider':
      response += `### 프로바이더별\n`;
      response += `| 프로바이더 | 비용 | 호출 | 입력 토큰 | 출력 토큰 |\n`;
      response += `|------------|------|------|----------|----------|\n`;

      for (const [provider, pStats] of Object.entries(stats.byProvider)) {
        if (pStats.totalCalls > 0) {
          const info = PROVIDER_INFO[provider as Provider];
          response += `| ${info.emoji} ${info.name} | $${pStats.totalCost.toFixed(4)} | ${pStats.totalCalls} | ${pStats.inputTokens.toLocaleString()} | ${pStats.outputTokens.toLocaleString()} |\n`;
        }
      }
      break;

    case 'expert':
      response += `### Expert별\n`;
      response += `| Expert | 비용 | 호출 | 입력 토큰 | 출력 토큰 |\n`;
      response += `|--------|------|------|----------|----------|\n`;

      for (const [expertId, eStats] of Object.entries(stats.byExpert)) {
        response += `| ${expertId} | $${eStats.totalCost.toFixed(4)} | ${eStats.totalCalls} | ${eStats.inputTokens.toLocaleString()} | ${eStats.outputTokens.toLocaleString()} |\n`;
      }
      break;

    case 'model':
      response += `### 모델별\n`;
      response += `| 모델 | 비용 | 호출 | 평균 입력 | 평균 출력 |\n`;
      response += `|------|------|------|----------|----------|\n`;

      for (const [modelId, mStats] of Object.entries(stats.byModel)) {
        const shortModel = modelId.length > 20 ? modelId.substring(0, 20) + '...' : modelId;
        response += `| ${shortModel} | $${mStats.totalCost.toFixed(4)} | ${mStats.totalCalls} | ${mStats.averageInputTokens.toLocaleString()} | ${mStats.averageOutputTokens.toLocaleString()} |\n`;
      }
      break;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleCostReset(
  params: z.infer<typeof costResetSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!params.confirm) {
    const scopeDesc = {
      session: '현재 세션 통계',
      today: '오늘의 모든 기록',
      all: '모든 비용 기록'
    };

    return {
      content: [{
        type: 'text',
        text: `## ⚠️ 확인 필요\n\n` +
              `**${scopeDesc[params.scope]}**을(를) 초기화하려면 \`confirm=true\`를 설정하세요.\n\n` +
              `이 작업은 되돌릴 수 없습니다.`
      }]
    };
  }

  const tracker = getCostTracker();
  tracker.resetStats(params.scope);

  const scopeDesc = {
    session: '세션 통계가',
    today: '오늘의 기록이',
    all: '모든 비용 기록이'
  };

  return {
    content: [{
      type: 'text',
      text: `## ✅ 초기화 완료\n\n${scopeDesc[params.scope]} 초기화되었습니다.`
    }]
  };
}

export async function handleCostBudget(
  params: z.infer<typeof costBudgetSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tracker = getCostTracker();

  const updates: Record<string, unknown> = {};
  if (params.enabled !== undefined) updates.enabled = params.enabled;
  if (params.daily_limit !== undefined) updates.dailyLimit = params.daily_limit;
  if (params.monthly_limit !== undefined) updates.monthlyLimit = params.monthly_limit;
  if (params.alert_threshold !== undefined) updates.alertThreshold = params.alert_threshold;

  if (Object.keys(updates).length === 0) {
    // 현재 설정 표시
    const budgetStatus = tracker.getBudgetStatus();

    let response = `## 💵 현재 예산 설정\n\n`;
    response += `| 항목 | 값 |\n`;
    response += `|------|-----|\n`;
    response += `| 예산 관리 | ${budgetStatus.enabled ? '✅ 활성' : '❌ 비활성'} |\n`;
    response += `| 일일 한도 | ${budgetStatus.daily.limit ? '$' + budgetStatus.daily.limit : '없음'} |\n`;
    response += `| 월간 한도 | ${budgetStatus.monthly.limit ? '$' + budgetStatus.monthly.limit : '없음'} |\n`;

    return { content: [{ type: 'text', text: response }] };
  }

  tracker.updateBudget(updates as any);

  let response = `## ✅ 예산 설정 업데이트됨\n\n`;
  response += `| 항목 | 값 |\n`;
  response += `|------|-----|\n`;

  if (params.enabled !== undefined) {
    response += `| 예산 관리 | ${params.enabled ? '✅ 활성' : '❌ 비활성'} |\n`;
  }
  if (params.daily_limit !== undefined) {
    response += `| 일일 한도 | $${params.daily_limit} |\n`;
  }
  if (params.monthly_limit !== undefined) {
    response += `| 월간 한도 | $${params.monthly_limit} |\n`;
  }
  if (params.alert_threshold !== undefined) {
    response += `| 알림 임계값 | ${Math.round(params.alert_threshold * 100)}% |\n`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

export async function handleCostSystemToggle(
  params: z.infer<typeof costSystemToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tracker = getCostTracker();
  tracker.setEnabled(params.enabled);

  const action = params.enabled ? '활성화' : '비활성화';

  let response = `## ✅ 비용 추적 시스템 ${action}됨\n\n`;

  if (params.enabled) {
    response += `API 호출 비용이 추적됩니다.`;
  } else {
    response += `비용 추적이 중지되었습니다. 기존 기록은 유지됩니다.`;
  }

  return {
    content: [{ type: 'text', text: response }]
  };
}

// Helper: 진행률 바
function getProgressBar(percentage: number): string {
  const filled = Math.round(percentage * 10);
  const empty = 10 - filled;
  return '█'.repeat(Math.min(filled, 10)) + '░'.repeat(Math.max(empty, 0));
}
