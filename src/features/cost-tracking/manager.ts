// src/features/cost-tracking/manager.ts

/**
 * Cost Tracking Manager
 *
 * API 호출 비용 추적 및 통계를 관리하는 싱글톤
 */

import { logger } from '../../utils/logger.js';
import {
  CostTrackingConfig,
  ApiCallRecord,
  TokenUsage,
  CostStats,
  DailySummary,
  CostAlert,
  ModelPricing,
  Provider,
  ProviderStats,
  ExpertStats,
  ModelStats,
  PROVIDER_INFO
} from './types.js';
import {
  loadCostConfig,
  saveCostConfig,
  loadRecords,
  saveRecords,
  appendRecord,
  cleanupOldRecords,
  loadDailySummaries,
  saveDailySummaries,
  generateRecordId,
  getTodayString,
  getMonthStartString
} from './storage.js';

/**
 * Cost Tracking Manager
 */
class CostTrackingManager {
  private config: CostTrackingConfig;
  private records: ApiCallRecord[];
  private dailySummaries: DailySummary[];
  private sessionStats: {
    totalCost: number;
    totalCalls: number;
    startTime: string;
  };

  constructor() {
    this.config = loadCostConfig();
    this.records = loadRecords();
    this.dailySummaries = loadDailySummaries();
    this.sessionStats = {
      totalCost: 0,
      totalCalls: 0,
      startTime: new Date().toISOString()
    };

    // 오래된 기록 정리
    this.records = cleanupOldRecords(this.records, this.config.retentionDays);
    saveRecords(this.records);

    logger.info({
      enabled: this.config.enabled,
      recordsCount: this.records.length,
      pricingCount: this.config.pricing.length
    }, 'CostTrackingManager initialized');
  }

  /**
   * API 호출 기록 추가
   */
  trackApiCall(params: {
    expertId: string;
    modelId: string;
    provider: Provider;
    usage: TokenUsage;
    cached: boolean;
    durationMs: number;
    success: boolean;
    error?: string;
  }): ApiCallRecord {
    if (!this.config.enabled) {
      // 비활성화되어도 기본 기록 반환
      return this.createRecord(params, { inputCost: 0, outputCost: 0, totalCost: 0 });
    }

    // 비용 계산
    const cost = this.calculateCost(params.modelId, params.usage, params.cached);

    // 기록 생성
    const record = this.createRecord(params, cost);

    // 저장
    this.records = appendRecord(this.records, record);
    saveRecords(this.records);

    // 세션 통계 업데이트
    this.sessionStats.totalCost += cost.totalCost;
    this.sessionStats.totalCalls++;

    // 일별 요약 업데이트
    this.updateDailySummary(record);

    // 예산 확인
    this.checkBudget();

    logger.debug({
      expertId: params.expertId,
      modelId: params.modelId,
      cost: cost.totalCost,
      tokens: params.usage.totalTokens
    }, 'Tracked API call');

    return record;
  }

  /**
   * 기록 생성
   */
  private createRecord(
    params: {
      expertId: string;
      modelId: string;
      provider: Provider;
      usage: TokenUsage;
      cached: boolean;
      durationMs: number;
      success: boolean;
      error?: string;
    },
    cost: { inputCost: number; outputCost: number; totalCost: number }
  ): ApiCallRecord {
    return {
      id: generateRecordId(),
      timestamp: new Date().toISOString(),
      expertId: params.expertId,
      modelId: params.modelId,
      provider: params.provider,
      usage: params.usage,
      cost: {
        ...cost,
        currency: 'USD'
      },
      cached: params.cached,
      durationMs: params.durationMs,
      success: params.success,
      error: params.error
    };
  }

  /**
   * 비용 계산
   */
  calculateCost(
    modelId: string,
    usage: TokenUsage,
    cached: boolean = false
  ): { inputCost: number; outputCost: number; totalCost: number } {
    const pricing = this.getModelPricing(modelId);

    if (!pricing) {
      logger.warn({ modelId }, 'No pricing found for model, using zero cost');
      return { inputCost: 0, outputCost: 0, totalCost: 0 };
    }

    // 캐시된 입력 가격 사용
    const inputPrice = cached && pricing.cachedInputPricePerMillion
      ? pricing.cachedInputPricePerMillion
      : pricing.inputPricePerMillion;

    const inputCost = (usage.inputTokens / 1_000_000) * inputPrice;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;
    const totalCost = inputCost + outputCost;

    return {
      inputCost: Math.round(inputCost * 1_000_000) / 1_000_000,
      outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000
    };
  }

  /**
   * 모델 가격 정보 조회
   */
  getModelPricing(modelId: string): ModelPricing | null {
    // 정확한 일치
    let pricing = this.config.pricing.find(p => p.modelId === modelId);
    if (pricing) return pricing;

    // 부분 일치 (모델 ID에 버전이 포함된 경우)
    pricing = this.config.pricing.find(p =>
      modelId.includes(p.modelId) || p.modelId.includes(modelId)
    );

    return pricing || null;
  }

  /**
   * 일별 요약 업데이트
   */
  private updateDailySummary(record: ApiCallRecord): void {
    const today = getTodayString();
    let summary = this.dailySummaries.find(s => s.date === today);

    if (!summary) {
      summary = {
        date: today,
        totalCost: 0,
        totalCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        byProvider: { openai: 0, anthropic: 0, google: 0 }
      };
      this.dailySummaries.push(summary);
    }

    summary.totalCost += record.cost.totalCost;
    summary.totalCalls++;
    summary.inputTokens += record.usage.inputTokens;
    summary.outputTokens += record.usage.outputTokens;
    summary.byProvider[record.provider] += record.cost.totalCost;

    saveDailySummaries(this.dailySummaries);
  }

  /**
   * 예산 확인 및 알림
   */
  private checkBudget(): CostAlert | null {
    if (!this.config.budget.enabled) {
      return null;
    }

    const todayCost = this.getTodayCost();
    const monthCost = this.getMonthCost();

    // 일일 한도 확인
    if (this.config.budget.dailyLimit) {
      const percentage = todayCost / this.config.budget.dailyLimit;

      if (percentage >= 1) {
        const alert: CostAlert = {
          type: 'limit_reached',
          message: `일일 예산 한도($${this.config.budget.dailyLimit})에 도달했습니다.`,
          currentCost: todayCost,
          limit: this.config.budget.dailyLimit,
          percentage,
          timestamp: new Date().toISOString()
        };
        logger.warn(alert, 'Daily budget limit reached');
        return alert;
      }

      if (percentage >= this.config.budget.alertThreshold) {
        const alert: CostAlert = {
          type: 'threshold',
          message: `일일 예산의 ${Math.round(percentage * 100)}%를 사용했습니다.`,
          currentCost: todayCost,
          limit: this.config.budget.dailyLimit,
          percentage,
          timestamp: new Date().toISOString()
        };
        logger.info(alert, 'Daily budget threshold reached');
        return alert;
      }
    }

    // 월간 한도 확인
    if (this.config.budget.monthlyLimit) {
      const percentage = monthCost / this.config.budget.monthlyLimit;

      if (percentage >= 1) {
        const alert: CostAlert = {
          type: 'limit_reached',
          message: `월간 예산 한도($${this.config.budget.monthlyLimit})에 도달했습니다.`,
          currentCost: monthCost,
          limit: this.config.budget.monthlyLimit,
          percentage,
          timestamp: new Date().toISOString()
        };
        logger.warn(alert, 'Monthly budget limit reached');
        return alert;
      }
    }

    return null;
  }

  /**
   * 오늘 비용 조회
   */
  getTodayCost(): number {
    const today = getTodayString();
    const summary = this.dailySummaries.find(s => s.date === today);
    return summary?.totalCost || 0;
  }

  /**
   * 이번 달 비용 조회
   */
  getMonthCost(): number {
    const monthStart = getMonthStartString();
    return this.dailySummaries
      .filter(s => s.date >= monthStart)
      .reduce((sum, s) => sum + s.totalCost, 0);
  }

  /**
   * 전체 통계 조회
   */
  getStats(startDate?: string, endDate?: string): CostStats {
    let filteredRecords = this.records;

    // 날짜 필터
    if (startDate) {
      filteredRecords = filteredRecords.filter(r =>
        r.timestamp >= startDate
      );
    }
    if (endDate) {
      filteredRecords = filteredRecords.filter(r =>
        r.timestamp <= endDate
      );
    }

    const stats: CostStats = {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: filteredRecords.length,
      successfulCalls: 0,
      failedCalls: 0,
      cachedCalls: 0,
      averageCostPerCall: 0,
      byProvider: {
        openai: { totalCost: 0, totalCalls: 0, inputTokens: 0, outputTokens: 0 },
        anthropic: { totalCost: 0, totalCalls: 0, inputTokens: 0, outputTokens: 0 },
        google: { totalCost: 0, totalCalls: 0, inputTokens: 0, outputTokens: 0 }
      },
      byExpert: {},
      byModel: {}
    };

    for (const record of filteredRecords) {
      // 전체 통계
      stats.totalCost += record.cost.totalCost;
      stats.totalInputTokens += record.usage.inputTokens;
      stats.totalOutputTokens += record.usage.outputTokens;

      if (record.success) stats.successfulCalls++;
      else stats.failedCalls++;

      if (record.cached) stats.cachedCalls++;

      // 프로바이더별
      const providerStats = stats.byProvider[record.provider];
      providerStats.totalCost += record.cost.totalCost;
      providerStats.totalCalls++;
      providerStats.inputTokens += record.usage.inputTokens;
      providerStats.outputTokens += record.usage.outputTokens;

      // Expert별
      if (!stats.byExpert[record.expertId]) {
        stats.byExpert[record.expertId] = {
          totalCost: 0,
          totalCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          primaryModel: record.modelId
        };
      }
      const expertStats = stats.byExpert[record.expertId];
      expertStats.totalCost += record.cost.totalCost;
      expertStats.totalCalls++;
      expertStats.inputTokens += record.usage.inputTokens;
      expertStats.outputTokens += record.usage.outputTokens;

      // 모델별
      if (!stats.byModel[record.modelId]) {
        stats.byModel[record.modelId] = {
          totalCost: 0,
          totalCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          averageInputTokens: 0,
          averageOutputTokens: 0
        };
      }
      const modelStats = stats.byModel[record.modelId];
      modelStats.totalCost += record.cost.totalCost;
      modelStats.totalCalls++;
      modelStats.inputTokens += record.usage.inputTokens;
      modelStats.outputTokens += record.usage.outputTokens;
    }

    // 평균 계산
    if (stats.totalCalls > 0) {
      stats.averageCostPerCall = stats.totalCost / stats.totalCalls;
    }

    for (const modelId of Object.keys(stats.byModel)) {
      const modelStats = stats.byModel[modelId];
      if (modelStats.totalCalls > 0) {
        modelStats.averageInputTokens = Math.round(modelStats.inputTokens / modelStats.totalCalls);
        modelStats.averageOutputTokens = Math.round(modelStats.outputTokens / modelStats.totalCalls);
      }
    }

    return stats;
  }

  /**
   * 세션 통계 조회
   */
  getSessionStats(): typeof this.sessionStats {
    return { ...this.sessionStats };
  }

  /**
   * 일별 요약 조회
   */
  getDailySummaries(days: number = 7): DailySummary[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffString = cutoff.toISOString().split('T')[0];

    return this.dailySummaries
      .filter(s => s.date >= cutoffString)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * 최근 기록 조회
   */
  getRecentRecords(limit: number = 10): ApiCallRecord[] {
    return this.records
      .slice(-limit)
      .reverse();
  }

  /**
   * 통계 초기화
   */
  resetStats(scope: 'session' | 'today' | 'all'): void {
    switch (scope) {
      case 'session':
        this.sessionStats = {
          totalCost: 0,
          totalCalls: 0,
          startTime: new Date().toISOString()
        };
        break;

      case 'today':
        const today = getTodayString();
        this.records = this.records.filter(r =>
          !r.timestamp.startsWith(today)
        );
        this.dailySummaries = this.dailySummaries.filter(s => s.date !== today);
        saveRecords(this.records);
        saveDailySummaries(this.dailySummaries);
        break;

      case 'all':
        this.records = [];
        this.dailySummaries = [];
        this.sessionStats = {
          totalCost: 0,
          totalCalls: 0,
          startTime: new Date().toISOString()
        };
        saveRecords(this.records);
        saveDailySummaries(this.dailySummaries);
        break;
    }

    logger.info({ scope }, 'Cost stats reset');
  }

  /**
   * 예산 설정 업데이트
   */
  updateBudget(budget: Partial<typeof this.config.budget>): void {
    this.config.budget = { ...this.config.budget, ...budget };
    saveCostConfig(this.config);
    logger.info({ budget: this.config.budget }, 'Budget updated');
  }

  /**
   * 시스템 활성화/비활성화
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    saveCostConfig(this.config);
    logger.info({ enabled }, 'Cost tracking toggled');
  }

  /**
   * 시스템 상태 확인
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 예산 상태 조회
   */
  getBudgetStatus(): {
    enabled: boolean;
    daily: { limit?: number; used: number; remaining?: number; percentage: number };
    monthly: { limit?: number; used: number; remaining?: number; percentage: number };
  } {
    const todayCost = this.getTodayCost();
    const monthCost = this.getMonthCost();

    return {
      enabled: this.config.budget.enabled,
      daily: {
        limit: this.config.budget.dailyLimit,
        used: todayCost,
        remaining: this.config.budget.dailyLimit
          ? Math.max(0, this.config.budget.dailyLimit - todayCost)
          : undefined,
        percentage: this.config.budget.dailyLimit
          ? todayCost / this.config.budget.dailyLimit
          : 0
      },
      monthly: {
        limit: this.config.budget.monthlyLimit,
        used: monthCost,
        remaining: this.config.budget.monthlyLimit
          ? Math.max(0, this.config.budget.monthlyLimit - monthCost)
          : undefined,
        percentage: this.config.budget.monthlyLimit
          ? monthCost / this.config.budget.monthlyLimit
          : 0
      }
    };
  }

  /**
   * 가격 정보 조회
   */
  getPricingInfo(): ModelPricing[] {
    return this.config.pricing;
  }

  /**
   * 통화 변환 (USD to KRW)
   */
  convertToKRW(usd: number): number {
    return Math.round(usd * this.config.exchangeRate);
  }

  /**
   * 설정 리로드
   */
  reload(): void {
    this.config = loadCostConfig();
    this.records = loadRecords();
    this.dailySummaries = loadDailySummaries();
    logger.info('Cost tracking config reloaded');
  }
}

// 싱글톤 인스턴스
let managerInstance: CostTrackingManager | null = null;

/**
 * CostTrackingManager 인스턴스 반환
 */
export function getCostTracker(): CostTrackingManager {
  if (!managerInstance) {
    managerInstance = new CostTrackingManager();
  }
  return managerInstance;
}

/**
 * 인스턴스 리셋 (테스트용)
 */
export function resetCostTracker(): void {
  managerInstance = null;
}
