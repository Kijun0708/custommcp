// src/tools/lsp.ts

/**
 * LSP MCP Tools
 *
 * Provides Language Server Protocol based code intelligence tools.
 * Offers definition finding, references search, hover info, and symbol search.
 */

import { z } from 'zod';
import {
  findDefinition,
  findReferences,
  getHoverInfo,
  findWorkspaceSymbols,
  checkLanguageServerAvailability,
  Location
} from '../services/lsp-client.js';
import { resolve, dirname } from 'path';

/**
 * LSP Get Definition Schema
 */
export const lspGetDefinitionSchema = z.object({
  file_path: z.string()
    .describe("파일의 절대 경로 또는 상대 경로"),
  line: z.number()
    .min(0)
    .describe("줄 번호 (0-indexed)"),
  character: z.number()
    .min(0)
    .describe("열 번호 (0-indexed)")
});

export type LspGetDefinitionParams = z.infer<typeof lspGetDefinitionSchema>;

/**
 * LSP Get References Schema
 */
export const lspGetReferencesSchema = z.object({
  file_path: z.string()
    .describe("파일의 절대 경로 또는 상대 경로"),
  line: z.number()
    .min(0)
    .describe("줄 번호 (0-indexed)"),
  character: z.number()
    .min(0)
    .describe("열 번호 (0-indexed)"),
  search_path: z.string()
    .optional()
    .describe("검색 범위 경로 (기본: 파일이 위치한 디렉토리)")
});

export type LspGetReferencesParams = z.infer<typeof lspGetReferencesSchema>;

/**
 * LSP Get Hover Schema
 */
export const lspGetHoverSchema = z.object({
  file_path: z.string()
    .describe("파일의 절대 경로 또는 상대 경로"),
  line: z.number()
    .min(0)
    .describe("줄 번호 (0-indexed)"),
  character: z.number()
    .min(0)
    .describe("열 번호 (0-indexed)")
});

export type LspGetHoverParams = z.infer<typeof lspGetHoverSchema>;

/**
 * LSP Workspace Symbols Schema
 */
export const lspWorkspaceSymbolsSchema = z.object({
  query: z.string()
    .optional()
    .describe("심볼 검색 쿼리 (빈 문자열이면 모든 심볼)"),
  path: z.string()
    .optional()
    .describe("검색 경로 (기본: 현재 디렉토리)")
});

export type LspWorkspaceSymbolsParams = z.infer<typeof lspWorkspaceSymbolsSchema>;

/**
 * LSP Check Server Schema
 */
export const lspCheckServerSchema = z.object({
  language: z.enum(['typescript', 'javascript', 'python', 'rust', 'go'])
    .describe("확인할 언어")
});

export type LspCheckServerParams = z.infer<typeof lspCheckServerSchema>;

/**
 * LSP Get Definition Tool
 */
export const lspGetDefinitionTool = {
  name: "lsp_get_definition",
  description: `심볼 정의 위치 찾기.

## 기능
- 변수, 함수, 클래스, 인터페이스 등의 정의 위치 반환
- TypeScript/JavaScript 파일 지원
- 패턴 매칭 기반 (전체 LSP 서버 없이도 동작)

## 사용 예시
파일의 특정 위치에 있는 심볼의 정의를 찾습니다:
- file_path="src/index.ts", line=10, character=5

## 결과
- 정의가 발견되면 파일 경로와 위치 반환
- 여러 정의가 있을 수 있음 (오버로드 등)`
};

/**
 * LSP Get References Tool
 */
export const lspGetReferencesTool = {
  name: "lsp_get_references",
  description: `심볼 참조 위치 찾기.

## 기능
- 변수, 함수, 클래스 등이 사용된 모든 위치 반환
- 프로젝트 전체 검색 가능
- grep 기반 빠른 검색

## 사용 예시
- file_path="src/utils.ts", line=20, character=10
- search_path="src/" (특정 디렉토리만 검색)

## 결과
- 모든 참조 위치 목록 (파일명, 줄 번호)`
};

/**
 * LSP Get Hover Tool
 */
export const lspGetHoverTool = {
  name: "lsp_get_hover",
  description: `심볼 타입/정보 조회.

## 기능
- 변수의 타입 정보
- 함수의 시그니처
- 클래스/인터페이스 정보

## 사용 예시
- file_path="src/types.ts", line=15, character=8

## 결과
- 타입 정보를 마크다운 코드 블록으로 반환`
};

/**
 * LSP Workspace Symbols Tool
 */
export const lspWorkspaceSymbolsTool = {
  name: "lsp_workspace_symbols",
  description: `워크스페이스 심볼 검색.

## 기능
- 프로젝트 전체에서 심볼(함수, 클래스, 변수 등) 검색
- 이름 기반 필터링
- 심볼 종류(Function, Class, Interface 등) 표시

## 사용 예시
- query="handle" (handle로 시작하는 심볼)
- query="" (모든 심볼)

## 결과
- 심볼 이름, 종류, 위치 목록`
};

/**
 * LSP Check Server Tool
 */
export const lspCheckServerTool = {
  name: "lsp_check_server",
  description: `언어 서버 가용성 확인.

특정 언어에 대한 LSP 서버가 설치되어 있는지 확인합니다.

## 지원 언어
- typescript/javascript: typescript-language-server
- python: pylsp, pyright
- rust: rust-analyzer
- go: gopls`
};

/**
 * Formats location to readable string
 */
function formatLocation(loc: Location): string {
  const filePath = loc.uri.replace('file://', '');
  const line = loc.range.start.line + 1; // 1-indexed for display
  const col = loc.range.start.character + 1;
  return `${filePath}:${line}:${col}`;
}

/**
 * Handle LSP Get Definition
 */
export async function handleLspGetDefinition(params: LspGetDefinitionParams) {
  try {
    const filePath = resolve(params.file_path);
    const result = await findDefinition(filePath, {
      line: params.line,
      character: params.character
    });

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 정의 찾기 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    if (result.locations.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 정의 찾기 결과\n\n정의를 찾을 수 없습니다.\n\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}`
        }]
      };
    }

    const locationsList = result.locations
      .map((loc, i) => `${i + 1}. \`${formatLocation(loc)}\``)
      .join('\n');

    return {
      content: [{
        type: "text" as const,
        text: `## 정의 찾기 결과\n\n**검색 위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}\n**발견된 정의**: ${result.locations.length}개\n\n${locationsList}`
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
 * Handle LSP Get References
 */
export async function handleLspGetReferences(params: LspGetReferencesParams) {
  try {
    const filePath = resolve(params.file_path);
    const searchPath = params.search_path ? resolve(params.search_path) : dirname(filePath);

    const result = await findReferences(filePath, {
      line: params.line,
      character: params.character
    }, searchPath);

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 참조 찾기 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    if (result.locations.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 참조 찾기 결과\n\n참조를 찾을 수 없습니다.\n\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}`
        }]
      };
    }

    // Group by file
    const byFile = new Map<string, typeof result.locations>();
    for (const loc of result.locations) {
      const file = loc.uri.replace('file://', '');
      const existing = byFile.get(file) || [];
      existing.push(loc);
      byFile.set(file, existing);
    }

    const lines: string[] = [];
    for (const [file, locs] of byFile) {
      lines.push(`### ${file}`);
      for (const loc of locs) {
        const line = loc.range.start.line + 1;
        lines.push(`- 줄 ${line}`);
      }
      lines.push('');
    }

    return {
      content: [{
        type: "text" as const,
        text: `## 참조 찾기 결과\n\n**검색 위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}\n**발견된 참조**: ${result.locations.length}개\n**검색 범위**: ${searchPath}\n\n${lines.join('\n')}`
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
 * Handle LSP Get Hover
 */
export async function handleLspGetHover(params: LspGetHoverParams) {
  try {
    const filePath = resolve(params.file_path);
    const result = await getHoverInfo(filePath, {
      line: params.line,
      character: params.character
    });

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 타입 정보 조회 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    if (!result.hover) {
      return {
        content: [{
          type: "text" as const,
          text: `## 타입 정보 조회 결과\n\n타입 정보를 찾을 수 없습니다.\n\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}`
        }]
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: `## 타입 정보\n\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}\n\n${result.hover.contents}`
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
 * Handle LSP Workspace Symbols
 */
export async function handleLspWorkspaceSymbols(params: LspWorkspaceSymbolsParams) {
  try {
    const searchPath = params.path ? resolve(params.path) : process.cwd();
    const result = await findWorkspaceSymbols(params.query || '', searchPath);

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 심볼 검색 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    if (result.symbols.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 심볼 검색 결과\n\n심볼을 찾을 수 없습니다.\n\n**쿼리**: ${params.query || '(전체)'}\n**경로**: ${searchPath}`
        }]
      };
    }

    // Group by kind
    const byKind = new Map<string, typeof result.symbols>();
    for (const sym of result.symbols) {
      const existing = byKind.get(sym.kind) || [];
      existing.push(sym);
      byKind.set(sym.kind, existing);
    }

    const lines: string[] = [];
    for (const [kind, symbols] of byKind) {
      lines.push(`### ${kind} (${symbols.length})`);
      for (const sym of symbols.slice(0, 20)) { // Limit per category
        const loc = formatLocation(sym.location);
        lines.push(`- \`${sym.name}\` - ${loc}`);
      }
      if (symbols.length > 20) {
        lines.push(`- ... 외 ${symbols.length - 20}개`);
      }
      lines.push('');
    }

    return {
      content: [{
        type: "text" as const,
        text: `## 심볼 검색 결과\n\n**쿼리**: ${params.query || '(전체)'}\n**경로**: ${searchPath}\n**발견된 심볼**: ${result.symbols.length}개\n\n${lines.join('\n')}`
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
 * Handle LSP Check Server
 */
export async function handleLspCheckServer(params: LspCheckServerParams) {
  try {
    const result = await checkLanguageServerAvailability(params.language);

    if (result.available) {
      return {
        content: [{
          type: "text" as const,
          text: `## 언어 서버 상태\n\n**언어**: ${params.language}\n**상태**: ✅ 설치됨\n**서버**: ${result.serverName}`
        }]
      };
    } else {
      const installInstructions: Record<string, string> = {
        typescript: 'npm install -g typescript-language-server typescript',
        javascript: 'npm install -g typescript-language-server typescript',
        python: 'pip install python-lsp-server',
        rust: 'rustup component add rust-analyzer',
        go: 'go install golang.org/x/tools/gopls@latest'
      };

      return {
        content: [{
          type: "text" as const,
          text: `## 언어 서버 상태\n\n**언어**: ${params.language}\n**상태**: ❌ 미설치\n\n### 설치 방법\n\`\`\`bash\n${installInstructions[params.language] || '해당 언어 서버 설치 필요'}\n\`\`\``
        }]
      };
    }
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

export default {
  lspGetDefinitionTool,
  lspGetDefinitionSchema,
  handleLspGetDefinition,
  lspGetReferencesTool,
  lspGetReferencesSchema,
  handleLspGetReferences,
  lspGetHoverTool,
  lspGetHoverSchema,
  handleLspGetHover,
  lspWorkspaceSymbolsTool,
  lspWorkspaceSymbolsSchema,
  handleLspWorkspaceSymbols,
  lspCheckServerTool,
  lspCheckServerSchema,
  handleLspCheckServer
};
