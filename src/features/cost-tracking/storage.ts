// src/features/cost-tracking/storage.ts

/**
 * Cost Tracking Storage
 *
 * 비용 기록 및 설정을 파일 시스템에 영속화
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';
import {
  CostTrackingConfig,
  ApiCallRecord,
  DailySummary,
  DEFAULT_MODEL_PRICING,
  DEFAULT_BUDGET_CONFIG
} from './types.js';

const CONFIG_DIR = '.llm-router';
const CONFIG_FILE = 'cost-config.json';
const RECORDS_FILE = 'cost-records.json';
const DAILY_FILE = 'cost-daily.json';
const CONFIG_VERSION = '1.0.0';

/**
 * 파일 경로 반환
 */
function getConfigPath(): string {
  return path.join(process.cwd(), CONFIG_DIR, CONFIG_FILE);
}

function getRecordsPath(): string {
  return path.join(process.cwd(), CONFIG_DIR, RECORDS_FILE);
}

function getDailyPath(): string {
  return path.join(process.cwd(), CONFIG_DIR, DAILY_FILE);
}

/**
 * 설정 디렉토리 확인 및 생성
 */
function ensureConfigDir(): void {
  const dirPath = path.join(process.cwd(), CONFIG_DIR);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info({ dirPath }, 'Created config directory');
  }
}

/**
 * 고유 ID 생성
 */
export function generateRecordId(): string {
  return `cost_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 비용 설정 로드
 */
export function loadCostConfig(): CostTrackingConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as CostTrackingConfig;
      logger.debug({ pricingCount: config.pricing.length }, 'Loaded cost config');
      return config;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load cost config, using defaults');
  }

  // 기본 설정 반환
  return {
    version: CONFIG_VERSION,
    enabled: true,
    currency: 'USD',
    exchangeRate: 1450,  // USD to KRW
    budget: DEFAULT_BUDGET_CONFIG,
    pricing: DEFAULT_MODEL_PRICING,
    retentionDays: 30
  };
}

/**
 * 비용 설정 저장
 */
export function saveCostConfig(config: CostTrackingConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();

  try {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');
    logger.info({ configPath }, 'Saved cost config');
  } catch (error) {
    logger.error({ error, configPath }, 'Failed to save cost config');
    throw new Error(`Failed to save cost config: ${error}`);
  }
}

/**
 * API 호출 기록 로드
 */
export function loadRecords(): ApiCallRecord[] {
  const recordsPath = getRecordsPath();

  try {
    if (fs.existsSync(recordsPath)) {
      const content = fs.readFileSync(recordsPath, 'utf-8');
      const records = JSON.parse(content) as ApiCallRecord[];
      logger.debug({ count: records.length }, 'Loaded cost records');
      return records;
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load cost records');
  }

  return [];
}

/**
 * API 호출 기록 저장
 */
export function saveRecords(records: ApiCallRecord[]): void {
  ensureConfigDir();
  const recordsPath = getRecordsPath();

  try {
    const content = JSON.stringify(records, null, 2);
    fs.writeFileSync(recordsPath, content, 'utf-8');
    logger.debug({ count: records.length }, 'Saved cost records');
  } catch (error) {
    logger.error({ error, recordsPath }, 'Failed to save cost records');
  }
}

/**
 * 기록 추가
 */
export function appendRecord(records: ApiCallRecord[], record: ApiCallRecord): ApiCallRecord[] {
  return [...records, record];
}

/**
 * 오래된 기록 정리
 */
export function cleanupOldRecords(records: ApiCallRecord[], retentionDays: number): ApiCallRecord[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTime = cutoffDate.getTime();

  const filtered = records.filter(record => {
    const recordTime = new Date(record.timestamp).getTime();
    return recordTime >= cutoffTime;
  });

  if (filtered.length < records.length) {
    logger.info({
      removed: records.length - filtered.length,
      remaining: filtered.length
    }, 'Cleaned up old cost records');
  }

  return filtered;
}

/**
 * 일별 요약 로드
 */
export function loadDailySummaries(): DailySummary[] {
  const dailyPath = getDailyPath();

  try {
    if (fs.existsSync(dailyPath)) {
      const content = fs.readFileSync(dailyPath, 'utf-8');
      return JSON.parse(content) as DailySummary[];
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load daily summaries');
  }

  return [];
}

/**
 * 일별 요약 저장
 */
export function saveDailySummaries(summaries: DailySummary[]): void {
  ensureConfigDir();
  const dailyPath = getDailyPath();

  try {
    const content = JSON.stringify(summaries, null, 2);
    fs.writeFileSync(dailyPath, content, 'utf-8');
    logger.debug({ count: summaries.length }, 'Saved daily summaries');
  } catch (error) {
    logger.error({ error }, 'Failed to save daily summaries');
  }
}

/**
 * 오늘 날짜 문자열 반환
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 이번 달 시작 날짜 반환
 */
export function getMonthStartString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
