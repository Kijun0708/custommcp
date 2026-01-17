// src/tools/ast-grep.ts

/**
 * AST-Grep MCP Tools
 *
 * Provides AST-based code search and transformation tools.
 * Based on ast-grep CLI for structural pattern matching.
 */

import { z } from 'zod';
import {
  astGrepSearch,
  astGrepReplace,
  checkAstGrepAvailability,
  getSupportedLanguages,
  inferLanguage,
  AstGrepMatch
} from '../services/ast-grep-client.js';

// Supported languages enum for schema
const supportedLanguages = [
  'typescript', 'javascript', 'tsx', 'jsx', 'python', 'rust', 'go',
  'java', 'kotlin', 'c', 'cpp', 'csharp', 'ruby', 'lua', 'swift',
  'html', 'css', 'json', 'yaml', 'bash', 'php', 'scala', 'elixir',
  'haskell', 'dart'
] as const;

/**
 * AST-Grep Search Schema
 */
export const astGrepSearchSchema = z.object({
  pattern: z.string()
    .min(1)
    .describe("AST 패턴 문자열. 메타변수 $VAR, $$$ARGS 등 사용 가능"),
  language: z.enum(supportedLanguages)
    .optional()
    .describe("검색할 언어 (미지정시 파일 확장자로 추론)"),
  path: z.string()
    .optional()
    .describe("검색 경로 (기본: 현재 디렉토리)"),
  include: z.array(z.string())
    .optional()
    .describe("포함할 파일 패턴 (예: ['*.ts', '*.tsx'])"),
  exclude: z.array(z.string())
    .optional()
    .describe("제외할 파일 패턴 (예: ['node_modules/**', 'dist/**'])"),
  max_results: z.number()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe("최대 결과 수 (기본: 20, 최대: 100)")
});

export type AstGrepSearchParams = z.infer<typeof astGrepSearchSchema>;

/**
 * AST-Grep Replace Schema
 */
export const astGrepReplaceSchema = z.object({
  pattern: z.string()
    .min(1)
    .describe("검색할 AST 패턴"),
  replacement: z.string()
    .describe("대체할 코드 (메타변수 참조 가능: $VAR)"),
  language: z.enum(supportedLanguages)
    .optional()
    .describe("대상 언어"),
  path: z.string()
    .optional()
    .describe("대상 경로 (기본: 현재 디렉토리)"),
  include: z.array(z.string())
    .optional()
    .describe("포함할 파일 패턴"),
  exclude: z.array(z.string())
    .optional()
    .describe("제외할 파일 패턴"),
  dry_run: z.boolean()
    .default(true)
    .describe("테스트 실행 여부 (기본: true - 실제 변경 없음)")
});

export type AstGrepReplaceParams = z.infer<typeof astGrepReplaceSchema>;

/**
 * AST-Grep Languages Schema
 */
export const astGrepLanguagesSchema = z.object({});

/**
 * AST-Grep Search Tool Definition
 */
export const astGrepSearchTool = {
  name: "ast_grep_search",
  description: `AST 기반 구조적 코드 검색 도구.

## 기능
- 25+ 언어 지원 (TypeScript, Python, Rust, Go 등)
- 구조적 패턴 매칭 (AST 기반)
- 메타변수를 사용한 유연한 검색
- 텍스트 검색보다 정확한 코드 구조 매칭

## 패턴 문법

### 메타변수
- \`$VAR\` - 단일 노드 매칭 (변수, 표현식 등)
- \`$$$ARGS\` - 0개 이상의 노드 매칭 (함수 인자 등)
- \`$_\` - 와일드카드 (아무 노드 매칭)

### 예시 패턴

**함수 호출 찾기:**
\`\`\`
console.log($MSG)
\`\`\`

**특정 패턴의 함수 정의:**
\`\`\`
function $NAME($$$PARAMS) { $$$BODY }
\`\`\`

**async 함수:**
\`\`\`
async function $NAME($$$PARAMS) { $$$BODY }
\`\`\`

**특정 import:**
\`\`\`
import { $$$IMPORTS } from 'react'
\`\`\`

**try-catch 블록:**
\`\`\`
try { $$$TRY } catch ($ERR) { $$$CATCH }
\`\`\`

## 언제 사용?
- 특정 코드 패턴 검색 (함수 호출, import 문 등)
- 코드 리팩토링 대상 찾기
- 보안 취약점 패턴 탐지
- 코드 스타일 일관성 검사`
};

/**
 * AST-Grep Replace Tool Definition
 */
export const astGrepReplaceTool = {
  name: "ast_grep_replace",
  description: `AST 기반 구조적 코드 변환 도구.

## 기능
- 패턴 매칭 후 자동 코드 변환
- 메타변수를 사용해 매칭된 부분 재사용
- dry_run으로 미리보기 가능

## 사용 예시

**console.log를 logger.debug로 변경:**
- pattern: \`console.log($MSG)\`
- replacement: \`logger.debug($MSG)\`

**함수 이름 변경:**
- pattern: \`oldFunction($$$ARGS)\`
- replacement: \`newFunction($$$ARGS)\`

**import 경로 변경:**
- pattern: \`import { $$$IMPORTS } from 'old-package'\`
- replacement: \`import { $$$IMPORTS } from 'new-package'\`

⚠️ **주의**: dry_run=false로 설정해야 실제 파일이 변경됩니다.`
};

/**
 * AST-Grep Languages Tool Definition
 */
export const astGrepLanguagesTool = {
  name: "ast_grep_languages",
  description: `ast-grep이 지원하는 프로그래밍 언어 목록을 반환합니다.`
};

/**
 * Formats AST-Grep match results
 */
function formatMatches(matches: AstGrepMatch[], totalCount: number, maxResults: number): string {
  if (matches.length === 0) {
    return "검색 결과가 없습니다.";
  }

  const lines: string[] = [];

  // Group by file
  const byFile = new Map<string, AstGrepMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) || [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`### ${file}`);
    lines.push('');

    for (const match of fileMatches) {
      const startLine = match.range.start.line + 1; // 1-indexed
      const endLine = match.range.end.line + 1;
      const location = startLine === endLine
        ? `L${startLine}`
        : `L${startLine}-${endLine}`;

      lines.push(`**${location}**:`);
      lines.push('```');
      lines.push(match.lines || match.text);
      lines.push('```');

      // Show meta variables if present
      if (match.metaVariables && Object.keys(match.metaVariables).length > 0) {
        lines.push('');
        lines.push('**매칭된 변수:**');
        for (const [varName, varInfo] of Object.entries(match.metaVariables)) {
          lines.push(`- \`${varName}\`: \`${varInfo.text}\``);
        }
      }
      lines.push('');
    }
  }

  // Summary
  if (totalCount > maxResults) {
    lines.push(`---`);
    lines.push(`총 ${totalCount}개 매칭 중 ${maxResults}개 표시`);
  } else {
    lines.push(`---`);
    lines.push(`총 ${totalCount}개 매칭`);
  }

  return lines.join('\n');
}

/**
 * Handle AST-Grep Search
 */
export async function handleAstGrepSearch(params: AstGrepSearchParams) {
  try {
    const result = await astGrepSearch({
      pattern: params.pattern,
      language: params.language,
      path: params.path,
      include: params.include,
      exclude: params.exclude || ['node_modules/**', 'dist/**', '.git/**', 'build/**'],
      maxResults: params.max_results || 20
    });

    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## ⚠️ AST-Grep 검색 실패\n\n**오류**: ${result.error}\n\n💡 ast-grep CLI가 설치되어 있는지 확인하세요:\n\`\`\`bash\nnpm install -g @ast-grep/cli\n\`\`\``
          }
        ]
      };
    }

    const formattedResult = formatMatches(
      result.matches,
      result.totalCount,
      params.max_results || 20
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `## AST-Grep 검색 결과\n\n**패턴**: \`${params.pattern}\`\n**언어**: ${params.language || '자동 감지'}\n**실행 시간**: ${result.executionTimeMs}ms\n\n${formattedResult}`
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `## ⚠️ AST-Grep 검색 오류\n\n**오류**: ${errorMessage}`
        }
      ]
    };
  }
}

/**
 * Handle AST-Grep Replace
 */
export async function handleAstGrepReplace(params: AstGrepReplaceParams) {
  try {
    const result = await astGrepReplace({
      pattern: params.pattern,
      replacement: params.replacement,
      language: params.language,
      path: params.path,
      include: params.include,
      exclude: params.exclude || ['node_modules/**', 'dist/**', '.git/**', 'build/**'],
      dryRun: params.dry_run !== false // Default to dry run
    });

    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## ⚠️ AST-Grep 변환 실패\n\n**오류**: ${result.error}\n\n💡 ast-grep CLI가 설치되어 있는지 확인하세요.`
          }
        ]
      };
    }

    const modeText = result.dryRun
      ? "🔍 **미리보기 모드** (dry_run=true)"
      : "✅ **변경 적용됨** (dry_run=false)";

    const filesText = result.modifiedFiles.length > 0
      ? result.modifiedFiles.map(f => `- ${f}`).join('\n')
      : "변경된 파일 없음";

    return {
      content: [
        {
          type: "text" as const,
          text: `## AST-Grep 변환 결과\n\n${modeText}\n\n**패턴**: \`${params.pattern}\`\n**대체**: \`${params.replacement}\`\n**변경 수**: ${result.totalReplacements}개\n**실행 시간**: ${result.executionTimeMs}ms\n\n### 변경 파일\n${filesText}`
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `## ⚠️ AST-Grep 변환 오류\n\n**오류**: ${errorMessage}`
        }
      ]
    };
  }
}

/**
 * Handle AST-Grep Languages
 */
export async function handleAstGrepLanguages() {
  const availability = await checkAstGrepAvailability();
  const languages = getSupportedLanguages();

  const languagesByCategory = {
    'Web': ['typescript', 'javascript', 'tsx', 'jsx', 'html', 'css'],
    'Systems': ['rust', 'go', 'c', 'cpp'],
    'JVM': ['java', 'kotlin', 'scala'],
    'Scripting': ['python', 'ruby', 'lua', 'php', 'bash'],
    'Mobile': ['swift', 'dart'],
    'Functional': ['elixir', 'haskell'],
    'Data': ['json', 'yaml']
  };

  const lines: string[] = [
    `## AST-Grep 지원 언어`,
    '',
    `**CLI 상태**: ${availability.available ? `✅ 설치됨 (${availability.version})` : `❌ 미설치`}`,
    ''
  ];

  if (!availability.available) {
    lines.push('### 설치 방법');
    lines.push('```bash');
    lines.push('npm install -g @ast-grep/cli');
    lines.push('# 또는');
    lines.push('cargo install ast-grep');
    lines.push('```');
    lines.push('');
  }

  lines.push('### 지원 언어 목록');
  lines.push('');

  for (const [category, langs] of Object.entries(languagesByCategory)) {
    lines.push(`**${category}**: ${langs.join(', ')}`);
  }

  lines.push('');
  lines.push(`**총 ${languages.length}개 언어 지원**`);

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join('\n')
      }
    ]
  };
}

export default {
  astGrepSearchTool,
  astGrepSearchSchema,
  handleAstGrepSearch,
  astGrepReplaceTool,
  astGrepReplaceSchema,
  handleAstGrepReplace,
  astGrepLanguagesTool,
  astGrepLanguagesSchema,
  handleAstGrepLanguages
};
