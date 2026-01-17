// src/tools/grep-app.ts

/**
 * Grep.app MCP Tool
 *
 * Provides GitHub code search functionality via grep.app API.
 */

import { z } from 'zod';
import { searchGrepApp, getSupportedLanguages } from '../services/grep-app-client.js';

/**
 * Grep App Search Schema
 */
export const grepAppSearchSchema = z.object({
  query: z.string()
    .min(1)
    .describe("검색 쿼리 (코드 패턴, 함수명, 클래스명 등)"),
  language: z.string()
    .optional()
    .describe("프로그래밍 언어 필터 (예: TypeScript, Python, Go)"),
  repository: z.string()
    .optional()
    .describe("특정 레포지토리 필터 (예: facebook/react)"),
  path: z.string()
    .optional()
    .describe("파일 경로 필터 (예: src/, *.config.js)"),
  case_sensitive: z.boolean()
    .optional()
    .default(false)
    .describe("대소문자 구분 (기본: false)"),
  whole_word: z.boolean()
    .optional()
    .default(false)
    .describe("전체 단어 매칭 (기본: false)"),
  regex: z.boolean()
    .optional()
    .default(false)
    .describe("정규식 사용 (기본: false)"),
  max_results: z.number()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe("최대 결과 수 (기본: 25, 최대: 100)")
});

export type GrepAppSearchParams = z.infer<typeof grepAppSearchSchema>;

/**
 * Grep App Languages Schema
 */
export const grepAppLanguagesSchema = z.object({});

export type GrepAppLanguagesParams = z.infer<typeof grepAppLanguagesSchema>;

/**
 * Grep App Search Tool
 */
export const grepAppSearchTool = {
  name: "grep_app",
  description: `GitHub 전체 코드 검색 (grep.app).

## 기능
- 수백만 개의 GitHub 레포지토리에서 코드 검색
- 언어, 레포지토리, 파일 경로 필터링
- 정규식 및 대소문자 구분 검색 지원

## 사용 예시
- 특정 함수 사용법: query="useEffect\\(" language="TypeScript"
- 특정 레포: query="createStore" repository="reduxjs/redux"
- 설정 파일: query="target.*ES2020" path="tsconfig.json"

## 주의사항
- 공개 레포지토리만 검색 가능
- API 속도 제한이 있을 수 있음
- 실시간 검색이 아닐 수 있음 (인덱싱 지연)

## 활용
- 특정 API/라이브러리 사용 패턴 학습
- 오픈소스 코드 참조
- 베스트 프랙티스 발견`
};

/**
 * Grep App Languages Tool
 */
export const grepAppLanguagesTool = {
  name: "grep_app_languages",
  description: `grep.app에서 지원하는 언어 목록 조회.

필터에 사용할 수 있는 프로그래밍 언어 목록을 반환합니다.`
};

/**
 * Handle Grep App Search
 */
export async function handleGrepAppSearch(params: GrepAppSearchParams) {
  try {
    const result = await searchGrepApp({
      query: params.query,
      language: params.language,
      repository: params.repository,
      path: params.path,
      caseSensitive: params.case_sensitive,
      wholeWord: params.whole_word,
      regex: params.regex,
      maxResults: params.max_results
    });

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 검색 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    if (result.results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## GitHub 코드 검색 결과\n\n**쿼리**: \`${params.query}\`\n\n검색 결과가 없습니다.`
        }]
      };
    }

    const lines: string[] = [];
    lines.push('## GitHub 코드 검색 결과');
    lines.push('');
    lines.push(`**쿼리**: \`${params.query}\``);

    if (params.language) {
      lines.push(`**언어**: ${params.language}`);
    }
    if (params.repository) {
      lines.push(`**레포지토리**: ${params.repository}`);
    }

    lines.push(`**결과**: ${result.results.length}개 (전체 약 ${result.totalCount.toLocaleString()}개)`);
    lines.push('');

    // Group by repository
    const byRepo = new Map<string, typeof result.results>();
    for (const r of result.results) {
      const existing = byRepo.get(r.repository) || [];
      existing.push(r);
      byRepo.set(r.repository, existing);
    }

    for (const [repo, items] of byRepo) {
      lines.push(`### 📁 ${repo}`);
      lines.push('');

      for (const item of items.slice(0, 5)) {
        lines.push(`**${item.path}**`);
        lines.push('```');
        // Truncate long content
        const content = item.content.length > 200
          ? item.content.substring(0, 200) + '...'
          : item.content;
        lines.push(content);
        lines.push('```');
        lines.push(`🔗 [GitHub에서 보기](${item.url})`);
        lines.push('');
      }

      if (items.length > 5) {
        lines.push(`_... 외 ${items.length - 5}개 결과_`);
        lines.push('');
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: lines.join('\n')
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 오류\n\n${errorMessage}`
      }]
    };
  }
}

/**
 * Handle Grep App Languages
 */
export async function handleGrepAppLanguages(_params: GrepAppLanguagesParams) {
  const languages = getSupportedLanguages();

  const lines: string[] = [];
  lines.push('## grep.app 지원 언어');
  lines.push('');
  lines.push('다음 언어들을 `language` 파라미터로 필터링할 수 있습니다:');
  lines.push('');

  // Group by category
  const categories: Record<string, string[]> = {
    '프로그래밍': ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala'],
    '스크립팅': ['Shell', 'PowerShell', 'Perl', 'R', 'MATLAB', 'Julia'],
    '웹': ['HTML', 'CSS', 'SCSS', 'LESS', 'Vue', 'Svelte'],
    '데이터/설정': ['JSON', 'YAML', 'TOML', 'XML', 'Markdown', 'SQL', 'GraphQL'],
    '빌드/인프라': ['Dockerfile', 'Makefile']
  };

  for (const [category, langs] of Object.entries(categories)) {
    lines.push(`### ${category}`);
    lines.push(langs.map(l => `\`${l}\``).join(', '));
    lines.push('');
  }

  return {
    content: [{
      type: "text" as const,
      text: lines.join('\n')
    }]
  };
}

export default {
  grepAppSearchTool,
  grepAppSearchSchema,
  handleGrepAppSearch,
  grepAppLanguagesTool,
  grepAppLanguagesSchema,
  handleGrepAppLanguages
};
