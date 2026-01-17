// src/tools/magic-keywords.ts

/**
 * Magic Keywords MCP Tool
 *
 * Provides management interface for magic keywords system.
 */

import { z } from 'zod';
import {
  getMagicKeywordsStats,
  resetMagicKeywordsState,
  updateMagicKeywordsConfig,
  clearActiveKeywords,
  MagicKeywordType
} from '../hooks/builtin/magic-keywords.js';

/**
 * Magic Keywords Schema
 */
export const magicKeywordsSchema = z.object({
  action: z.enum(['status', 'reset', 'clear', 'config', 'list'])
    .describe("실행할 액션: status(상태 조회), reset(통계 초기화), clear(활성 키워드 초기화), config(설정 변경), list(키워드 목록)"),
  enabled: z.boolean()
    .optional()
    .describe("매직 키워드 활성화 여부 (config 액션용)"),
  inject_context: z.boolean()
    .optional()
    .describe("컨텍스트 주입 여부 (config 액션용)"),
  show_activation: z.boolean()
    .optional()
    .describe("활성화 메시지 표시 여부 (config 액션용)"),
  enable_keyword: z.string()
    .optional()
    .describe("특정 키워드 활성화 (config 액션용)"),
  disable_keyword: z.string()
    .optional()
    .describe("특정 키워드 비활성화 (config 액션용)")
});

export type MagicKeywordsParams = z.infer<typeof magicKeywordsSchema>;

/**
 * Magic Keywords Tool
 */
export const magicKeywordsTool = {
  name: "magic_keywords",
  description: `매직 키워드 시스템 관리.

## 지원 키워드
- **ultrawork/ulw**: 최대 성능 오케스트레이션
- **search/find**: 멀티 에이전트 병렬 검색
- **analyze/investigate**: 심층 분석 모드
- **deepdive**: 철저한 연구 모드
- **quickfix**: 빠른 버그 수정
- **refactor**: 코드 리팩토링
- **review**: 코드 리뷰
- **document**: 문서화 모드

## 동작 방식
- 도구/Expert 호출 시 키워드 자동 감지
- 해당 모드에 맞는 컨텍스트 자동 주입
- 추천 Expert/Workflow 제안

## 사용 예시
- 상태 조회: magic_keywords action=status
- 키워드 목록: magic_keywords action=list
- 활성화 끄기: magic_keywords action=config enabled=false`
};

/**
 * Handle Magic Keywords
 */
export async function handleMagicKeywords(params: MagicKeywordsParams) {
  switch (params.action) {
    case 'status': {
      const stats = getMagicKeywordsStats();

      const lines = [
        `## ✨ 매직 키워드 상태`,
        '',
        `**총 활성화 횟수**: ${stats.totalActivations}회`,
        ''
      ];

      // Active keywords
      if (stats.activeKeywords.length > 0) {
        lines.push('### 현재 활성 키워드');
        lines.push(stats.activeKeywords.map(k => `- 🔮 **${k}**`).join('\n'));
        lines.push('');
      }

      // Last activation
      if (stats.lastActivation) {
        const time = new Date(stats.lastActivation.timestamp).toLocaleTimeString();
        lines.push(`**마지막 활성화**: ${stats.lastActivation.type} (${time}, ${stats.lastActivation.source})`);
        lines.push('');
      }

      // Activation stats
      const activeTypes = Object.entries(stats.activationsByType)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      if (activeTypes.length > 0) {
        lines.push('### 키워드별 활성화 통계');
        for (const [type, count] of activeTypes) {
          const emoji = getKeywordEmoji(type as MagicKeywordType);
          lines.push(`- ${emoji} ${type}: ${count}회`);
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: lines.join('\n')
        }]
      };
    }

    case 'list': {
      const stats = getMagicKeywordsStats();

      const lines = [
        `## 📚 매직 키워드 목록`,
        '',
        '| 키워드 | 설명 | 트리거 | 상태 |',
        '|--------|------|--------|------|'
      ];

      for (const keyword of stats.availableKeywords) {
        const emoji = getKeywordEmoji(keyword.type);
        const triggers = getKeywordTriggers(keyword.type);
        const status = keyword.enabled ? '✅' : '❌';
        lines.push(`| ${emoji} **${keyword.type}** | ${keyword.description} | ${triggers} | ${status} |`);
      }

      lines.push('');
      lines.push('### 사용법');
      lines.push('프롬프트에 키워드를 포함하면 자동으로 해당 모드가 활성화됩니다.');
      lines.push('');
      lines.push('예시:');
      lines.push('- "ultrawork로 전체 기능 구현해줘"');
      lines.push('- "이 버그 quickfix 해줘"');
      lines.push('- "코드 deepdive 분석해줘"');

      return {
        content: [{
          type: "text" as const,
          text: lines.join('\n')
        }]
      };
    }

    case 'reset': {
      resetMagicKeywordsState();
      return {
        content: [{
          type: "text" as const,
          text: "## 매직 키워드 상태 초기화\n\n모든 통계 및 활성 키워드가 초기화되었습니다."
        }]
      };
    }

    case 'clear': {
      clearActiveKeywords();
      return {
        content: [{
          type: "text" as const,
          text: "## 활성 키워드 초기화\n\n현재 세션의 활성 키워드가 초기화되었습니다. 새 작업을 시작할 때 유용합니다."
        }]
      };
    }

    case 'config': {
      const updates: Record<string, unknown> = {};

      if (params.enabled !== undefined) {
        updates.enabled = params.enabled;
      }
      if (params.inject_context !== undefined) {
        updates.injectContext = params.inject_context;
      }
      if (params.show_activation !== undefined) {
        updates.showActivation = params.show_activation;
      }

      // Handle enable/disable specific keywords
      if (params.enable_keyword || params.disable_keyword) {
        const stats = getMagicKeywordsStats();
        const currentEnabled = stats.availableKeywords
          .filter(k => k.enabled)
          .map(k => k.type);

        if (params.enable_keyword && !currentEnabled.includes(params.enable_keyword as MagicKeywordType)) {
          currentEnabled.push(params.enable_keyword as MagicKeywordType);
        }
        if (params.disable_keyword) {
          const index = currentEnabled.indexOf(params.disable_keyword as MagicKeywordType);
          if (index > -1) {
            currentEnabled.splice(index, 1);
          }
        }

        updates.enabledKeywords = currentEnabled;
      }

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `## 매직 키워드 설정

변경할 설정을 지정하세요:
- enabled: 전체 활성화 여부
- inject_context: 컨텍스트 주입 여부
- show_activation: 활성화 메시지 표시
- enable_keyword: 특정 키워드 활성화 (예: ultrawork)
- disable_keyword: 특정 키워드 비활성화`
          }]
        };
      }

      updateMagicKeywordsConfig(updates as any);

      return {
        content: [{
          type: "text" as const,
          text: `## 매직 키워드 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n')}`
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
 * Gets emoji for keyword type
 */
function getKeywordEmoji(type: MagicKeywordType): string {
  const emojis: Record<MagicKeywordType, string> = {
    ultrawork: '🚀',
    search: '🔍',
    analyze: '🔬',
    deepdive: '🏊',
    quickfix: '⚡',
    refactor: '🔧',
    review: '👀',
    document: '📝'
  };
  return emojis[type] || '✨';
}

/**
 * Gets trigger examples for keyword
 */
function getKeywordTriggers(type: MagicKeywordType): string {
  const triggers: Record<MagicKeywordType, string> = {
    ultrawork: 'ultrawork, ulw',
    search: 'search, find, 찾아',
    analyze: 'analyze, 분석',
    deepdive: 'deepdive, 철저히',
    quickfix: 'quickfix, 빨리',
    refactor: 'refactor, 리팩토링',
    review: 'review, 리뷰',
    document: 'document, 문서화'
  };
  return triggers[type] || type;
}

export default {
  magicKeywordsTool,
  magicKeywordsSchema,
  handleMagicKeywords
};
