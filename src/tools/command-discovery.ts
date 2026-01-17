// src/tools/command-discovery.ts

/**
 * Command Discovery Tool
 *
 * MCP tool interface for the command discovery system.
 * Enables listing, searching, and executing custom commands.
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import {
  getCommandDiscoveryManager,
  LoadedCommand,
  CommandDiscoveryStats
} from '../features/command-discovery/index.js';

// ============ Schemas ============

/**
 * List commands schema
 */
export const commandListSchema = z.object({
  source: z.enum(['all', 'project', 'claude', 'global'])
    .default('all')
    .optional()
    .describe("소스 필터: all(전체), project(프로젝트), claude(.claude), global(전역)"),
  tag: z.string()
    .optional()
    .describe("태그로 필터링"),
  include_invalid: z.boolean()
    .default(false)
    .optional()
    .describe("유효하지 않은 명령어도 포함")
});

/**
 * Get command schema
 */
export const commandGetSchema = z.object({
  name: z.string()
    .min(1)
    .describe("명령어 이름 또는 별칭")
});

/**
 * Execute command schema
 */
export const commandExecuteSchema = z.object({
  name: z.string()
    .min(1)
    .describe("실행할 명령어 이름 또는 별칭"),
  params: z.record(z.any())
    .optional()
    .describe("명령어 파라미터 (키-값 쌍)")
});

/**
 * Rescan commands schema
 */
export const commandRescanSchema = z.object({
  cwd: z.string()
    .optional()
    .describe("스캔 기준 디렉토리 (기본: 현재 작업 디렉토리)")
});

/**
 * Command config schema
 */
export const commandConfigSchema = z.object({
  enabled: z.boolean()
    .optional()
    .describe("명령어 디스커버리 활성화/비활성화"),
  add_dir: z.string()
    .optional()
    .describe("스캔할 디렉토리 추가"),
  add_dir_type: z.enum(['project', 'user', 'global'])
    .optional()
    .describe("추가할 디렉토리 타입"),
  remove_dir: z.string()
    .optional()
    .describe("디렉토리 제거")
});

// ============ Types ============

export type CommandListParams = z.infer<typeof commandListSchema>;
export type CommandGetParams = z.infer<typeof commandGetSchema>;
export type CommandExecuteParams = z.infer<typeof commandExecuteSchema>;
export type CommandRescanParams = z.infer<typeof commandRescanSchema>;
export type CommandConfigParams = z.infer<typeof commandConfigSchema>;

// ============ Tool Definitions ============

export const commandListTool = {
  name: "command_list",
  description: `등록된 커스텀 명령어 목록 조회.

## 기능
- 프로젝트, 사용자, 전역 명령어 조회
- 태그별 필터링
- 소스별 필터링

## 사용 예시
- source="project"로 프로젝트 명령어만 조회
- tag="git"로 Git 관련 명령어 조회

## 명령어 위치
- 프로젝트: .opencode/command/, .claude/commands/
- 사용자: ~/.opencode/commands/, ~/.claude/commands/
- 전역: ~/.config/opencode/command/`
};

export const commandGetTool = {
  name: "command_get",
  description: `특정 명령어의 상세 정보 조회.

## 기능
- 명령어 정의 조회
- 파라미터 정보 확인
- 프롬프트 템플릿 확인

## 사용 예시
- name="review-pr"로 PR 리뷰 명령어 조회
- 별칭으로도 조회 가능`
};

export const commandExecuteTool = {
  name: "command_execute",
  description: `커스텀 명령어 실행.

## 기능
- 명령어 프롬프트 생성
- 파라미터 치환

## 사용 예시
- name="review-pr", params={pr_url: "https://..."}

## 반환값
파라미터가 적용된 프롬프트 텍스트`
};

export const commandRescanTool = {
  name: "command_rescan",
  description: `명령어 디렉토리 재스캔.

## 기능
- 모든 설정된 디렉토리 재스캔
- 캐시 갱신

## 사용 예시
- 새 명령어 파일 추가 후 호출
- cwd 지정으로 특정 디렉토리 기준 스캔`
};

export const commandConfigTool = {
  name: "command_config",
  description: `명령어 디스커버리 설정 관리.

## 기능
- 디스커버리 활성화/비활성화
- 스캔 디렉토리 추가/제거
- 현재 설정 및 통계 조회

## 사용 예시
- enabled=false로 비활성화
- add_dir="./my-commands", add_dir_type="project"로 디렉토리 추가`
};

// ============ Handlers ============

/**
 * Formats command for display
 */
function formatCommand(cmd: LoadedCommand): string {
  let result = `### ${cmd.definition.name}\n`;
  result += `- **설명**: ${cmd.definition.description || '(없음)'}\n`;
  result += `- **소스**: ${cmd.sourceType} (${cmd.sourcePath})\n`;

  if (cmd.definition.aliases?.length) {
    result += `- **별칭**: ${cmd.definition.aliases.join(', ')}\n`;
  }

  if (cmd.definition.tags?.length) {
    result += `- **태그**: ${cmd.definition.tags.join(', ')}\n`;
  }

  if (cmd.definition.parameters?.length) {
    result += `- **파라미터**:\n`;
    for (const param of cmd.definition.parameters) {
      const req = param.required ? '(필수)' : '(선택)';
      result += `  - \`${param.name}\` ${req}: ${param.description}\n`;
    }
  }

  return result;
}

export async function handleCommandList(params: CommandListParams) {
  const manager = getCommandDiscoveryManager();

  // Initialize if not already
  manager.initialize();

  let commands = manager.getAllCommands();

  // Filter by source
  if (params.source && params.source !== 'all') {
    commands = commands.filter(c => c.sourceType === params.source);
  }

  // Filter by tag
  if (params.tag) {
    const tagFilter = params.tag;
    commands = commands.filter(c => c.definition.tags?.includes(tagFilter));
  }

  if (commands.length === 0) {
    return {
      content: [{
        type: "text" as const,
        text: `## ℹ️ 명령어 없음\n\n등록된 명령어가 없습니다.\n\n명령어 디렉토리:\n- .opencode/command/\n- .claude/commands/\n- ~/.config/opencode/command/`
      }]
    };
  }

  let result = `## 📋 등록된 명령어 (${commands.length}개)\n\n`;

  for (const cmd of commands) {
    result += formatCommand(cmd);
    result += '\n';
  }

  const stats = manager.getStats();
  result += `---\n`;
  result += `**소스별**: 프로젝트 ${stats.commandsBySource.project || 0}, `;
  result += `Claude ${stats.commandsBySource.claude || 0}, `;
  result += `전역 ${stats.commandsBySource.global || 0}\n`;

  if (stats.lastScanAt) {
    result += `**마지막 스캔**: ${new Date(stats.lastScanAt).toLocaleString()}\n`;
  }

  return {
    content: [{
      type: "text" as const,
      text: result
    }]
  };
}

export async function handleCommandGet(params: CommandGetParams) {
  const manager = getCommandDiscoveryManager();
  manager.initialize();

  const cmd = manager.getCommand(params.name);

  if (!cmd) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 명령어 없음\n\n'${params.name}' 명령어를 찾을 수 없습니다.`
      }]
    };
  }

  let result = `## 📄 명령어: ${cmd.definition.name}\n\n`;
  result += formatCommand(cmd);

  result += `\n### 프롬프트 템플릿\n`;
  result += `\`\`\`\n${cmd.definition.prompt}\n\`\`\`\n`;

  if (cmd.definition.context) {
    result += `\n### 컨텍스트 요구사항\n`;
    if (cmd.definition.context.files) {
      result += `- **파일**: ${cmd.definition.context.files.join(', ')}\n`;
    }
    if (cmd.definition.context.env) {
      result += `- **환경변수**: ${cmd.definition.context.env.join(', ')}\n`;
    }
    if (cmd.definition.context.git) {
      result += `- **Git 정보**: 포함\n`;
    }
    if (cmd.definition.context.tree) {
      result += `- **디렉토리 구조**: 포함\n`;
    }
  }

  return {
    content: [{
      type: "text" as const,
      text: result
    }]
  };
}

export async function handleCommandExecute(params: CommandExecuteParams) {
  const manager = getCommandDiscoveryManager();
  manager.initialize();

  const prompt = manager.executeCommand(params.name, params.params);

  if (!prompt) {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 명령어 없음\n\n'${params.name}' 명령어를 찾을 수 없습니다.`
      }]
    };
  }

  const cmd = manager.getCommand(params.name);

  let result = `## 🚀 명령어 실행: ${params.name}\n\n`;

  if (params.params && Object.keys(params.params).length > 0) {
    result += `### 적용된 파라미터\n`;
    for (const [key, value] of Object.entries(params.params)) {
      result += `- \`${key}\`: ${value}\n`;
    }
    result += `\n`;
  }

  result += `### 생성된 프롬프트\n`;
  result += `\`\`\`\n${prompt}\n\`\`\`\n`;

  // Check for unreplaced placeholders
  const unreplaced = prompt.match(/\{\{[\w]+\}\}|\$\{[\w]+\}/g);
  if (unreplaced) {
    result += `\n⚠️ **경고**: 치환되지 않은 플레이스홀더: ${[...new Set(unreplaced)].join(', ')}\n`;
  }

  return {
    content: [{
      type: "text" as const,
      text: result
    }]
  };
}

export async function handleCommandRescan(params: CommandRescanParams) {
  const manager = getCommandDiscoveryManager();

  manager.rescan(params.cwd);

  const stats = manager.getStats();

  let result = `## 🔄 명령어 재스캔 완료\n\n`;
  result += `- **발견된 명령어**: ${stats.totalCommands}개\n`;
  result += `- **프로젝트**: ${stats.commandsBySource.project || 0}개\n`;
  result += `- **Claude**: ${stats.commandsBySource.claude || 0}개\n`;
  result += `- **전역**: ${stats.commandsBySource.global || 0}개\n`;

  if (stats.invalidCommands.length > 0) {
    result += `\n### ⚠️ 유효하지 않은 명령어\n`;
    for (const inv of stats.invalidCommands) {
      result += `- ${inv}\n`;
    }
  }

  if (stats.errors.length > 0) {
    result += `\n### ❌ 에러\n`;
    for (const err of stats.errors) {
      result += `- ${err}\n`;
    }
  }

  return {
    content: [{
      type: "text" as const,
      text: result
    }]
  };
}

export async function handleCommandConfig(params: CommandConfigParams) {
  const manager = getCommandDiscoveryManager();

  // Apply configuration changes
  if (params.enabled !== undefined) {
    manager.updateConfig({ enabled: params.enabled });
  }

  if (params.add_dir && params.add_dir_type) {
    manager.addDirectory(params.add_dir, params.add_dir_type === 'user' ? 'user' : params.add_dir_type);
  }

  if (params.remove_dir) {
    manager.removeDirectory(params.remove_dir);
  }

  // Get current state
  const config = manager.getConfig();
  const stats = manager.getStats();

  let result = `## ⚙️ 명령어 디스커버리 설정\n\n`;
  result += `### 상태\n`;
  result += `- **활성화**: ${config.enabled ? '✅ 예' : '❌ 아니오'}\n`;
  result += `- **파일 확장자**: ${config.extensions.join(', ')}\n`;
  result += `- **스캔 간격**: ${config.scanIntervalMs / 1000}초\n`;

  result += `\n### 스캔 디렉토리\n`;
  result += `**프로젝트:**\n`;
  for (const dir of config.projectDirs) {
    result += `- ${dir}\n`;
  }

  result += `\n**사용자:**\n`;
  for (const dir of config.userDirs) {
    result += `- ${dir}\n`;
  }

  result += `\n**전역:**\n`;
  for (const dir of config.globalDirs) {
    result += `- ${dir}\n`;
  }

  result += `\n### 통계\n`;
  result += `- **총 명령어**: ${stats.totalCommands}개\n`;
  result += `- **마지막 스캔**: ${stats.lastScanAt ? new Date(stats.lastScanAt).toLocaleString() : '없음'}\n`;

  return {
    content: [{
      type: "text" as const,
      text: result
    }]
  };
}

export default {
  commandListTool, commandListSchema, handleCommandList,
  commandGetTool, commandGetSchema, handleCommandGet,
  commandExecuteTool, commandExecuteSchema, handleCommandExecute,
  commandRescanTool, commandRescanSchema, handleCommandRescan,
  commandConfigTool, commandConfigSchema, handleCommandConfig
};
