// src/tools/directory-injector.ts

/**
 * Directory Injector MCP Tool
 *
 * Provides management interface for directory context injection
 * (AGENTS.md, README.md, .claude/rules/).
 */

import { z } from 'zod';
import {
  getDirectoryInjectorStats,
  resetDirectoryInjectorState,
  clearDirectoryInjectorCache,
  updateDirectoryInjectorConfig
} from '../hooks/builtin/index.js';

/**
 * Directory Injector Schema
 */
export const directoryInjectorSchema = z.object({
  action: z.enum(['status', 'reset', 'clear_cache', 'config'])
    .describe("실행할 액션: status(상태 조회), reset(통계 초기화), clear_cache(캐시 삭제), config(설정 변경)"),
  enable_agents: z.boolean()
    .optional()
    .describe("AGENTS.md 주입 활성화 (config 액션용)"),
  enable_readme: z.boolean()
    .optional()
    .describe("README.md 주입 활성화 (config 액션용)"),
  enable_rules: z.boolean()
    .optional()
    .describe(".claude/rules/ 주입 활성화 (config 액션용)"),
  max_content_length: z.number()
    .min(1000)
    .max(50000)
    .optional()
    .describe("파일당 최대 콘텐츠 길이 (config 액션용)"),
  cache_ttl_minutes: z.number()
    .min(1)
    .max(60)
    .optional()
    .describe("캐시 TTL (분, config 액션용)")
});

export type DirectoryInjectorParams = z.infer<typeof directoryInjectorSchema>;

/**
 * Directory Injector Tool
 */
export const directoryInjectorTool = {
  name: "directory_injector",
  description: `디렉토리 컨텍스트 인젝터 관리.

## 기능
- AGENTS.md: 에이전트 지침 자동 주입
- README.md: 프로젝트 문서 자동 주입
- .claude/rules/: 커스텀 규칙 자동 주입

## 동작 방식
- Expert 호출 시 현재 디렉토리부터 상위로 스캔
- 발견된 파일 내용을 컨텍스트에 자동 추가
- 캐시로 성능 최적화

## 사용 예시
- 상태 조회: directory_injector action=status
- 캐시 삭제: directory_injector action=clear_cache
- README 비활성화: directory_injector action=config enable_readme=false`
};

/**
 * Handle Directory Injector
 */
export async function handleDirectoryInjector(params: DirectoryInjectorParams) {
  switch (params.action) {
    case 'status': {
      const stats = getDirectoryInjectorStats();

      const cacheHitRate = (stats.cacheHitRate * 100).toFixed(1);

      const lines = [
        `## 📂 디렉토리 인젝터 상태`,
        '',
        `**총 주입 횟수**: ${stats.totalInjections}회`,
        '',
        '### 유형별 주입 통계',
        `- 📋 AGENTS.md: ${stats.injectionsByType.agents}회`,
        `- 📖 README.md: ${stats.injectionsByType.readme}회`,
        `- 📏 Rules: ${stats.injectionsByType.rules}회`,
        '',
        '### 캐시 상태',
        `- 캐시 항목: ${stats.cacheSize}개`,
        `- 캐시 히트: ${stats.cacheHits}회`,
        `- 캐시 미스: ${stats.cacheMisses}회`,
        `- 히트율: ${cacheHitRate}%`
      ];

      const filesFound = Object.entries(stats.filesFound);
      if (filesFound.length > 0) {
        lines.push('');
        lines.push('### 발견된 파일');
        for (const [type, path] of filesFound) {
          const emoji = type === 'agents' ? '📋' : type === 'readme' ? '📖' : '📏';
          lines.push(`- ${emoji} ${type}: \`${path}\``);
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
      resetDirectoryInjectorState();
      return {
        content: [{
          type: "text" as const,
          text: "## 디렉토리 인젝터 초기화\n\n모든 주입 통계가 초기화되었습니다."
        }]
      };
    }

    case 'clear_cache': {
      clearDirectoryInjectorCache();
      return {
        content: [{
          type: "text" as const,
          text: "## 디렉토리 인젝터 캐시 삭제\n\n모든 캐시된 파일 내용이 삭제되었습니다. 다음 주입 시 파일을 다시 읽습니다."
        }]
      };
    }

    case 'config': {
      const updates: Record<string, unknown> = {};

      if (params.enable_agents !== undefined) {
        updates.enableAgents = params.enable_agents;
      }
      if (params.enable_readme !== undefined) {
        updates.enableReadme = params.enable_readme;
      }
      if (params.enable_rules !== undefined) {
        updates.enableRules = params.enable_rules;
      }
      if (params.max_content_length !== undefined) {
        updates.maxContentLength = params.max_content_length;
      }
      if (params.cache_ttl_minutes !== undefined) {
        updates.cacheTtlMs = params.cache_ttl_minutes * 60 * 1000;
      }

      if (Object.keys(updates).length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `## 디렉토리 인젝터 설정

변경할 설정을 지정하세요:
- enable_agents: AGENTS.md 주입 여부
- enable_readme: README.md 주입 여부
- enable_rules: .claude/rules/ 주입 여부
- max_content_length: 파일당 최대 길이 (1000-50000)
- cache_ttl_minutes: 캐시 유효 시간 (분)`
          }]
        };
      }

      updateDirectoryInjectorConfig(updates as any);

      return {
        content: [{
          type: "text" as const,
          text: `## 디렉토리 인젝터 설정 업데이트\n\n변경된 설정:\n${Object.entries(updates).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
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
  directoryInjectorTool,
  directoryInjectorSchema,
  handleDirectoryInjector
};
