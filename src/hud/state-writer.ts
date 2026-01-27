// src/hud/state-writer.ts

/**
 * HUD State Writer
 *
 * MCP 서버 내부 상태를 JSON 파일로 기록하여
 * Claude Code statusline에서 읽을 수 있도록 함.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import {
  HudState,
  HudConfig,
  DEFAULT_HUD_CONFIG,
  createEmptyHudState,
  type ProviderActivity,
  type BackgroundTaskSummary
} from './types.js';

/**
 * HUD State Writer 싱글톤
 */
class HudStateWriter {
  private state: HudState;
  private config: HudConfig;
  private writeTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor() {
    this.config = { ...DEFAULT_HUD_CONFIG };
    this.state = createEmptyHudState();
  }

  /**
   * HUD 시스템 초기화
   */
  initialize(config?: Partial<HudConfig>): void {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    if (!this.config.enabled) {
      return;
    }

    this.state = createEmptyHudState();
    this.ensureDirectory();
    this.writeState();

    // 주기적 갱신 타이머
    if (this.config.updateIntervalMs > 0) {
      this.writeTimer = setInterval(() => {
        if (this.dirty) {
          this.writeState();
          this.dirty = false;
        }
      }, this.config.updateIntervalMs);

      // 프로세스 종료 시 정리
      if (this.writeTimer.unref) {
        this.writeTimer.unref();
      }
    }

    logger.info({ stateFile: this.config.stateFilePath }, 'HUD state writer initialized');
  }

  /**
   * 상태 디렉토리 확인 및 생성
   */
  private ensureDirectory(): void {
    const dir = path.dirname(this.config.stateFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 상태를 파일로 기록
   */
  private writeState(): void {
    if (!this.config.enabled) return;

    try {
      this.state.updatedAt = new Date().toISOString();
      this.state.uptimeMs = Date.now() - new Date(this.state.serverStartedAt).getTime();
      fs.writeFileSync(
        this.config.stateFilePath,
        JSON.stringify(this.state, null, 2),
        'utf-8'
      );
    } catch (error: any) {
      logger.debug({ error: error.message }, 'Failed to write HUD state');
    }
  }

  /**
   * 즉시 상태 기록 (이벤트 기반)
   */
  flush(): void {
    this.writeState();
    this.dirty = false;
  }

  // ── 업데이트 메서드들 ──

  /**
   * Expert 호출 기록
   */
  recordExpertCall(expertId: string, model: string, provider: keyof ProviderActivity): void {
    this.state.lastExpert = expertId;
    this.state.lastModel = model;
    this.state.totalCalls++;
    this.state.providerCalls[provider]++;
    this.dirty = true;
  }

  /**
   * 비용 업데이트
   */
  updateCost(sessionCost: number, todayCost: number): void {
    this.state.sessionCost = sessionCost;
    this.state.todayCost = todayCost;
    this.dirty = true;
  }

  /**
   * 컨텍스트 사용률 업데이트
   */
  updateContextUsage(percent: number): void {
    this.state.contextUsagePercent = Math.round(percent);
    this.dirty = true;
  }

  /**
   * 백그라운드 태스크 상태 업데이트
   */
  updateBackgroundTasks(summary: BackgroundTaskSummary): void {
    this.state.backgroundTasks = summary;
    this.dirty = true;
  }

  /**
   * 워크플로우 상태 업데이트
   */
  updateWorkflowState(active: boolean): void {
    this.state.activeWorkflow = active;
    this.dirty = true;
  }

  /**
   * Ralph Loop 상태 업데이트
   */
  updateRalphLoopState(active: boolean): void {
    this.state.activeRalphLoop = active;
    this.dirty = true;
  }

  /**
   * Boulder 상태 업데이트
   */
  updateBoulderState(active: boolean): void {
    this.state.activeBoulder = active;
    this.dirty = true;
  }

  /**
   * 스킬 사용 기록
   */
  recordSkillUsage(skillName: string): void {
    this.state.lastSkill = skillName;
    this.dirty = true;
  }

  /**
   * Rate limit 상태 업데이트
   */
  updateRateLimitedModels(models: string[]): void {
    this.state.rateLimitedModels = models;
    this.dirty = true;
  }

  /**
   * 캐시 히트율 업데이트
   */
  updateCacheHitRate(rate: number): void {
    this.state.cacheHitRate = Math.round(rate);
    this.dirty = true;
  }

  /**
   * 에러 카운트 증가
   */
  incrementErrors(): void {
    this.state.sessionErrors++;
    this.dirty = true;
  }

  /**
   * 현재 상태 반환
   */
  getState(): HudState {
    return { ...this.state };
  }

  /**
   * 정리
   */
  shutdown(): void {
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }
    this.flush();
  }
}

// 싱글톤 인스턴스
let instance: HudStateWriter | null = null;

/**
 * HUD State Writer 인스턴스 반환
 */
export function getHudStateWriter(): HudStateWriter {
  if (!instance) {
    instance = new HudStateWriter();
  }
  return instance;
}

/**
 * HUD 시스템 초기화
 */
export function initializeHud(config?: Partial<HudConfig>): void {
  getHudStateWriter().initialize(config);
}

/**
 * HUD 시스템 종료
 */
export function shutdownHud(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}
