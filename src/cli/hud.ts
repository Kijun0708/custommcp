#!/usr/bin/env node

// src/cli/hud.ts

/**
 * HUD CLI - Claude Code Statusline 출력
 *
 * HUD 상태 파일을 읽어 포맷된 텍스트를 stdout으로 출력.
 * Claude Code의 statusline 설정에서 이 스크립트를 실행.
 *
 * Usage:
 *   node dist/cli/hud.js [--preset minimal|standard|full]
 */

import * as fs from 'fs';
import type { HudState, HudPreset } from '../hud/types.js';

const PROVIDER_ICONS: Record<string, string> = {
  openai: 'GPT',
  anthropic: 'Claude',
  google: 'Gemini'
};

/**
 * 상태 파일 경로 결정
 */
function getStateFilePath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return `${home}/.custommcp/hud-state.json`.replace(/\\/g, '/');
}

/**
 * 상태 파일 읽기
 */
function readState(): HudState | null {
  const filePath = getStateFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as HudState;
  } catch {
    return null;
  }
}

/**
 * 비용 포맷 ($0.42)
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00';
  return `$${cost.toFixed(2)}`;
}

/**
 * 가동 시간 포맷 (1h23m)
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * 상태가 최신인지 확인 (30초 이내)
 */
function isStale(state: HudState): boolean {
  const updated = new Date(state.updatedAt).getTime();
  return Date.now() - updated > 30000;
}

/**
 * 프로바이더 활성 상태 텍스트
 */
function renderProviderCalls(state: HudState): string {
  const parts: string[] = [];
  const { openai, anthropic, google } = state.providerCalls;
  if (openai > 0) parts.push(`GPT:${openai}`);
  if (anthropic > 0) parts.push(`Claude:${anthropic}`);
  if (google > 0) parts.push(`Gemini:${google}`);
  return parts.length > 0 ? parts.join(' ') : 'idle';
}

/**
 * Minimal 프리셋: 비용 + 호출수만
 */
function renderMinimal(state: HudState): string {
  if (isStale(state)) return '⏸ MCP offline';
  return `💰${formatCost(state.sessionCost)} | 📞${state.totalCalls}`;
}

/**
 * Standard 프리셋: 프로바이더 + 비용 + 컨텍스트 + 백그라운드
 */
function renderStandard(state: HudState): string {
  if (isStale(state)) return '⏸ MCP offline';

  const parts: string[] = [];

  // 프로바이더 호출 현황
  parts.push(`🤖 ${renderProviderCalls(state)}`);

  // 비용
  parts.push(`💰 ${formatCost(state.sessionCost)}`);

  // 컨텍스트 사용률
  const ctxIcon = state.contextUsagePercent >= 80 ? '🔴' : state.contextUsagePercent >= 60 ? '🟡' : '📊';
  parts.push(`${ctxIcon} ctx:${state.contextUsagePercent}%`);

  // 백그라운드 태스크
  if (state.backgroundTasks.running > 0) {
    parts.push(`⏳ bg:${state.backgroundTasks.running}`);
  }

  // 활성 상태 표시
  const modes: string[] = [];
  if (state.activeWorkflow) modes.push('🔄WF');
  if (state.activeRalphLoop) modes.push('🔁RL');
  if (state.activeBoulder) modes.push('🪨BD');
  if (modes.length > 0) parts.push(modes.join(''));

  // Rate limit 경고
  if (state.rateLimitedModels.length > 0) {
    parts.push(`⚠️ RL:${state.rateLimitedModels.length}`);
  }

  return parts.join(' | ');
}

/**
 * Full 프리셋: 모든 정보 표시
 */
function renderFull(state: HudState): string {
  if (isStale(state)) return '⏸ MCP offline';

  const parts: string[] = [];

  // 프로바이더 호출 현황
  parts.push(`🤖 ${renderProviderCalls(state)}`);

  // 비용
  parts.push(`💰 ${formatCost(state.sessionCost)}(today:${formatCost(state.todayCost)})`);

  // 컨텍스트 사용률
  const ctxIcon = state.contextUsagePercent >= 80 ? '🔴' : state.contextUsagePercent >= 60 ? '🟡' : '📊';
  parts.push(`${ctxIcon} ctx:${state.contextUsagePercent}%`);

  // 캐시 히트율
  parts.push(`💾 cache:${state.cacheHitRate}%`);

  // 백그라운드 태스크
  const bg = state.backgroundTasks;
  if (bg.running > 0 || bg.completed > 0) {
    parts.push(`⏳ bg:${bg.running}/${bg.completed + bg.failed}`);
  }

  // 마지막 전문가
  if (state.lastExpert) {
    parts.push(`👤 ${state.lastExpert}`);
  }

  // 마지막 스킬
  if (state.lastSkill) {
    parts.push(`🎯 ${state.lastSkill}`);
  }

  // 활성 상태 표시
  const modes: string[] = [];
  if (state.activeWorkflow) modes.push('🔄Workflow');
  if (state.activeRalphLoop) modes.push('🔁Ralph');
  if (state.activeBoulder) modes.push('🪨Boulder');
  if (modes.length > 0) parts.push(modes.join(' '));

  // Rate limit 경고
  if (state.rateLimitedModels.length > 0) {
    parts.push(`⚠️ RL:${state.rateLimitedModels.join(',')}`);
  }

  // 에러 수
  if (state.sessionErrors > 0) {
    parts.push(`❌ err:${state.sessionErrors}`);
  }

  // 가동 시간
  parts.push(`⏱️ ${formatUptime(state.uptimeMs)}`);

  return parts.join(' | ');
}

/**
 * 렌더링 함수 선택
 */
function render(state: HudState, preset: HudPreset): string {
  switch (preset) {
    case 'minimal': return renderMinimal(state);
    case 'standard': return renderStandard(state);
    case 'full': return renderFull(state);
    default: return renderStandard(state);
  }
}

// ── Main ──

function main(): void {
  // 인자 파싱
  const args = process.argv.slice(2);
  let preset: HudPreset = 'standard';

  const presetIdx = args.indexOf('--preset');
  if (presetIdx !== -1 && args[presetIdx + 1]) {
    const val = args[presetIdx + 1] as HudPreset;
    if (['minimal', 'standard', 'full'].includes(val)) {
      preset = val;
    }
  }

  const state = readState();
  if (!state) {
    process.stdout.write('⏸ MCP not running');
    return;
  }

  process.stdout.write(render(state, preset));
}

main();
