// src/hud/types.ts

/**
 * HUD (Heads-Up Display) Types
 *
 * 실시간 상태 표시를 위한 타입 정의.
 * Claude Code의 statusline과 연동하여 사용.
 */

import type { Provider } from '../features/cost-tracking/types.js';

/**
 * HUD 표시 프리셋
 */
export type HudPreset = 'minimal' | 'standard' | 'full';

/**
 * 프로바이더별 활성 호출 수
 */
export interface ProviderActivity {
  openai: number;
  anthropic: number;
  google: number;
}

/**
 * 백그라운드 태스크 요약
 */
export interface BackgroundTaskSummary {
  running: number;
  completed: number;
  failed: number;
}

/**
 * HUD 상태 데이터 (JSON 파일로 저장)
 */
export interface HudState {
  /** 마지막 업데이트 시각 */
  updatedAt: string;
  /** 서버 시작 시각 */
  serverStartedAt: string;
  /** 서버 가동 시간 (ms) */
  uptimeMs: number;

  /** 세션 비용 (USD) */
  sessionCost: number;
  /** 오늘 비용 (USD) */
  todayCost: number;
  /** 총 API 호출 수 */
  totalCalls: number;

  /** 프로바이더별 호출 수 */
  providerCalls: ProviderActivity;

  /** 컨텍스트 윈도우 사용률 (0-100) */
  contextUsagePercent: number;

  /** 백그라운드 태스크 */
  backgroundTasks: BackgroundTaskSummary;

  /** 마지막 사용 전문가 */
  lastExpert: string | null;
  /** 마지막 사용 모델 */
  lastModel: string | null;

  /** 활성 워크플로우 여부 */
  activeWorkflow: boolean;
  /** 활성 Ralph Loop 여부 */
  activeRalphLoop: boolean;
  /** 활성 Boulder 여부 */
  activeBoulder: boolean;

  /** 마지막 활성 스킬 */
  lastSkill: string | null;

  /** Rate limit 상태 (제한된 모델 목록) */
  rateLimitedModels: string[];

  /** 캐시 히트율 (0-100) */
  cacheHitRate: number;

  /** 에러 수 (세션) */
  sessionErrors: number;
}

/**
 * HUD 설정
 */
export interface HudConfig {
  /** HUD 활성화 여부 */
  enabled: boolean;
  /** 상태 파일 경로 */
  stateFilePath: string;
  /** 기본 프리셋 */
  defaultPreset: HudPreset;
  /** 상태 갱신 간격 (ms) */
  updateIntervalMs: number;
}

/**
 * 기본 HUD 설정
 */
export const DEFAULT_HUD_CONFIG: HudConfig = {
  enabled: true,
  stateFilePath: getDefaultStateFilePath(),
  defaultPreset: 'standard',
  updateIntervalMs: 1000
};

/**
 * 기본 상태 파일 경로
 */
function getDefaultStateFilePath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return `${home}/.custommcp/hud-state.json`.replace(/\\/g, '/');
}

/**
 * 빈 HUD 상태
 */
export function createEmptyHudState(): HudState {
  const now = new Date().toISOString();
  return {
    updatedAt: now,
    serverStartedAt: now,
    uptimeMs: 0,
    sessionCost: 0,
    todayCost: 0,
    totalCalls: 0,
    providerCalls: { openai: 0, anthropic: 0, google: 0 },
    contextUsagePercent: 0,
    backgroundTasks: { running: 0, completed: 0, failed: 0 },
    lastExpert: null,
    lastModel: null,
    activeWorkflow: false,
    activeRalphLoop: false,
    activeBoulder: false,
    lastSkill: null,
    rateLimitedModels: [],
    cacheHitRate: 0,
    sessionErrors: 0
  };
}
