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
  prepareRename,
  performRename,
  Location
} from '../services/lsp-client.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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
 * LSP Prepare Rename Schema
 */
export const lspPrepareRenameSchema = z.object({
  file_path: z.string()
    .describe("파일의 절대 경로 또는 상대 경로"),
  line: z.number()
    .min(0)
    .describe("줄 번호 (0-indexed)"),
  character: z.number()
    .min(0)
    .describe("열 번호 (0-indexed)")
});

export type LspPrepareRenameParams = z.infer<typeof lspPrepareRenameSchema>;

/**
 * LSP Rename Schema
 */
export const lspRenameSchema = z.object({
  file_path: z.string()
    .describe("파일의 절대 경로 또는 상대 경로"),
  line: z.number()
    .min(0)
    .describe("줄 번호 (0-indexed)"),
  character: z.number()
    .min(0)
    .describe("열 번호 (0-indexed)"),
  new_name: z.string()
    .min(1)
    .describe("새 심볼 이름"),
  search_path: z.string()
    .optional()
    .describe("검색 범위 경로 (기본: 파일이 위치한 디렉토리)"),
  dry_run: z.boolean()
    .optional()
    .default(true)
    .describe("테스트 모드 (기본: true - 실제 변경 없음)")
});

export type LspRenameParams = z.infer<typeof lspRenameSchema>;

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
 * LSP Prepare Rename Tool
 */
export const lspPrepareRenameTool = {
  name: "lsp_prepare_rename",
  description: `심볼 리네이밍 가능 여부 확인.

## 기능
- 지정된 위치의 심볼이 리네이밍 가능한지 검증
- 심볼 범위와 현재 이름 반환
- 키워드, 빈 위치 등 리네이밍 불가능한 경우 에러 반환

## 사용 예시
- file_path="src/utils.ts", line=10, character=6
- 리네이밍 전 유효성 검사에 사용

## 결과
- 성공: 심볼 범위와 placeholder (현재 이름) 반환
- 실패: 에러 메시지 반환`
};

/**
 * LSP Rename Tool
 */
export const lspRenameTool = {
  name: "lsp_rename",
  description: `워크스페이스 전체 심볼 리네이밍.

## 기능
- 변수, 함수, 클래스 등의 이름을 전체 프로젝트에서 변경
- dry_run 모드로 변경 사항 미리보기 가능
- 실제 파일 수정 지원

## 사용 예시
- 미리보기: file_path="src/utils.ts", line=10, character=6, new_name="newFunctionName", dry_run=true
- 실제 적용: dry_run=false 로 설정

## 주의사항
- 기본값은 dry_run=true (안전 모드)
- 실제 변경 전 반드시 미리보기 확인 권장
- 변경 후 git diff로 결과 확인 권장`
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

/**
 * Handle LSP Prepare Rename
 */
export async function handleLspPrepareRename(params: LspPrepareRenameParams) {
  try {
    const filePath = resolve(params.file_path);
    const result = await prepareRename(filePath, {
      line: params.line,
      character: params.character
    });

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 리네이밍 불가\n\n**오류**: ${result.error}\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}`
        }]
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: `## ✅ 리네이밍 가능\n\n**현재 이름**: \`${result.placeholder}\`\n**위치**: ${params.file_path}:${params.line + 1}:${params.character + 1}\n**범위**: 줄 ${result.range!.start.line + 1}, 열 ${result.range!.start.character + 1} ~ ${result.range!.end.character + 1}\n\n\`lsp_rename\` 도구로 새 이름을 지정하여 리네이밍을 실행하세요.`
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
 * Handle LSP Rename
 */
export async function handleLspRename(params: LspRenameParams) {
  try {
    const filePath = resolve(params.file_path);
    const searchPath = params.search_path ? resolve(params.search_path) : dirname(filePath);
    const dryRun = params.dry_run !== false; // Default to true

    const result = await performRename(filePath, {
      line: params.line,
      character: params.character
    }, params.new_name, searchPath);

    if (!result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 리네이밍 실패\n\n**오류**: ${result.error}`
        }]
      };
    }

    const fileCount = Object.keys(result.changes).length;
    const editCount = Object.values(result.changes).reduce((sum, edits) => sum + edits.length, 0);

    if (editCount === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 리네이밍 결과\n\n변경할 항목이 없습니다.`
        }]
      };
    }

    // Build preview
    const lines: string[] = [];
    lines.push(`## ${dryRun ? '🔍 리네이밍 미리보기' : '✅ 리네이밍 완료'}`);
    lines.push('');
    lines.push(`**새 이름**: \`${params.new_name}\``);
    lines.push(`**변경 파일**: ${fileCount}개`);
    lines.push(`**변경 위치**: ${editCount}개`);
    lines.push(`**검색 범위**: ${searchPath}`);
    lines.push('');

    // Group changes by file
    for (const [uri, edits] of Object.entries(result.changes)) {
      const file = uri.replace('file://', '');
      lines.push(`### ${file}`);

      // Sort edits by line
      const sortedEdits = edits.sort((a, b) => a.range.start.line - b.range.start.line);

      for (const edit of sortedEdits.slice(0, 10)) { // Limit preview
        lines.push(`- 줄 ${edit.range.start.line + 1}, 열 ${edit.range.start.character + 1}`);
      }

      if (sortedEdits.length > 10) {
        lines.push(`- ... 외 ${sortedEdits.length - 10}개 위치`);
      }
      lines.push('');
    }

    // Apply changes if not dry run
    if (!dryRun) {
      const modifiedFiles: string[] = [];

      for (const [uri, edits] of Object.entries(result.changes)) {
        const file = uri.replace('file://', '');

        if (!existsSync(file)) {
          continue;
        }

        let content = readFileSync(file, 'utf-8');
        const fileLines = content.split('\n');

        // Sort edits in reverse order (bottom to top, right to left) to avoid offset issues
        const sortedEdits = edits.sort((a, b) => {
          if (a.range.start.line !== b.range.start.line) {
            return b.range.start.line - a.range.start.line;
          }
          return b.range.start.character - a.range.start.character;
        });

        for (const edit of sortedEdits) {
          const lineIndex = edit.range.start.line;
          if (lineIndex >= 0 && lineIndex < fileLines.length) {
            const line = fileLines[lineIndex];
            const before = line.substring(0, edit.range.start.character);
            const after = line.substring(edit.range.end.character);
            fileLines[lineIndex] = before + edit.newText + after;
          }
        }

        content = fileLines.join('\n');
        writeFileSync(file, content, 'utf-8');
        modifiedFiles.push(file);
      }

      lines.push('---');
      lines.push(`**실제 수정된 파일**: ${modifiedFiles.length}개`);
      lines.push('');
      lines.push('> 💡 `git diff`로 변경 사항을 확인하세요.');
    } else {
      lines.push('---');
      lines.push('> 💡 실제 변경을 적용하려면 `dry_run=false`로 설정하세요.');
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
  handleLspCheckServer,
  lspPrepareRenameTool,
  lspPrepareRenameSchema,
  handleLspPrepareRename,
  lspRenameTool,
  lspRenameSchema,
  handleLspRename
};
