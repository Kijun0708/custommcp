// src/tools/git-master.ts

/**
 * Git Master Tool
 *
 * Advanced git operations for sophisticated version control:
 * - Atomic commit planning
 * - History search with filters
 * - Interactive rebase planning
 * - Squash commit helper
 * - Branch management
 */

import { z } from 'zod';
import { spawn, execFileSync } from 'child_process';
import { logger } from '../utils/logger.js';

// ============ Schemas ============

/**
 * Atomic commit schema - helps create well-structured commits
 */
export const gitAtomicCommitSchema = z.object({
  path: z.string()
    .optional()
    .describe("Git 저장소 경로 (기본: 현재 디렉토리)"),
  analyze_only: z.boolean()
    .default(true)
    .optional()
    .describe("true면 분석만, false면 실제 커밋 수행 (기본: true)"),
  group_by: z.enum(['file_type', 'directory', 'semantic'])
    .default('semantic')
    .optional()
    .describe("변경사항 그룹화 기준: file_type(확장자), directory(디렉토리), semantic(의미적 그룹)"),
  include_staged: z.boolean()
    .default(true)
    .optional()
    .describe("스테이징된 변경사항 포함 (기본: true)"),
  include_unstaged: z.boolean()
    .default(true)
    .optional()
    .describe("스테이징되지 않은 변경사항 포함 (기본: true)")
});

/**
 * History search schema
 */
export const gitHistorySearchSchema = z.object({
  path: z.string()
    .optional()
    .describe("Git 저장소 경로 (기본: 현재 디렉토리)"),
  query: z.string()
    .optional()
    .describe("검색할 텍스트 (커밋 메시지, diff 내용)"),
  author: z.string()
    .optional()
    .describe("작성자 필터 (이름 또는 이메일)"),
  since: z.string()
    .optional()
    .describe("시작 날짜 (예: '2024-01-01', '1 week ago')"),
  until: z.string()
    .optional()
    .describe("종료 날짜 (예: '2024-12-31', 'yesterday')"),
  file_path: z.string()
    .optional()
    .describe("특정 파일/경로 히스토리만 검색"),
  branch: z.string()
    .optional()
    .describe("특정 브랜치에서 검색 (기본: 현재 브랜치)"),
  max_count: z.number()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .describe("최대 결과 수 (기본: 20, 최대: 100)"),
  search_in_diff: z.boolean()
    .default(false)
    .optional()
    .describe("diff 내용에서도 검색 (git log -S)")
});

/**
 * Rebase planner schema
 */
export const gitRebasePlannerSchema = z.object({
  path: z.string()
    .optional()
    .describe("Git 저장소 경로 (기본: 현재 디렉토리)"),
  base: z.string()
    .describe("리베이스 기준 브랜치 또는 커밋 (예: 'main', 'HEAD~5')"),
  action: z.enum(['plan', 'preview', 'execute'])
    .default('plan')
    .optional()
    .describe("plan: 리베이스 계획 생성, preview: 충돌 예측, execute: 실제 리베이스 (주의!)"),
  interactive: z.boolean()
    .default(true)
    .optional()
    .describe("인터랙티브 리베이스 계획 생성")
});

/**
 * Squash helper schema
 */
export const gitSquashHelperSchema = z.object({
  path: z.string()
    .optional()
    .describe("Git 저장소 경로 (기본: 현재 디렉토리)"),
  commits: z.number()
    .min(2)
    .max(50)
    .describe("스쿼시할 커밋 수 (최근 N개)"),
  preview_only: z.boolean()
    .default(true)
    .optional()
    .describe("true면 미리보기만, false면 실제 스쿼시 (기본: true)"),
  message: z.string()
    .optional()
    .describe("새 커밋 메시지 (미지정 시 자동 생성)")
});

/**
 * Branch analysis schema
 */
export const gitBranchAnalysisSchema = z.object({
  path: z.string()
    .optional()
    .describe("Git 저장소 경로 (기본: 현재 디렉토리)"),
  compare_with: z.string()
    .optional()
    .describe("비교할 브랜치 (기본: main 또는 master)"),
  include_remote: z.boolean()
    .default(false)
    .optional()
    .describe("원격 브랜치 포함"),
  show_stale: z.boolean()
    .default(false)
    .optional()
    .describe("오래된(병합됨) 브랜치 표시")
});

// ============ Types ============

export type GitAtomicCommitParams = z.infer<typeof gitAtomicCommitSchema>;
export type GitHistorySearchParams = z.infer<typeof gitHistorySearchSchema>;
export type GitRebasePlannerParams = z.infer<typeof gitRebasePlannerSchema>;
export type GitSquashHelperParams = z.infer<typeof gitSquashHelperSchema>;
export type GitBranchAnalysisParams = z.infer<typeof gitBranchAnalysisSchema>;

// ============ Tool Definitions ============

export const gitAtomicCommitTool = {
  name: "git_atomic_commit",
  description: `Atomic 커밋 분석 및 생성 도구.

## 기능
- 변경사항을 논리적 그룹으로 분류
- 의미적 그룹화 (기능, 버그 수정, 리팩토링 등)
- 원자적 커밋 메시지 제안

## 사용 예시
- analyze_only=true로 현재 변경사항 분석
- group_by="semantic"으로 의미적 그룹화
- 각 그룹별 독립적 커밋 가능

## 언제 사용?
- 큰 변경사항을 여러 커밋으로 분리하고 싶을 때
- 깔끔한 커밋 히스토리를 유지하고 싶을 때`
};

export const gitHistorySearchTool = {
  name: "git_history_search",
  description: `Git 히스토리 검색 도구.

## 기능
- 커밋 메시지 검색
- diff 내용 검색 (코드 변경 추적)
- 작성자, 날짜, 파일 필터링

## 사용 예시
- query="버그 수정"으로 관련 커밋 찾기
- search_in_diff=true로 특정 코드 변경 추적
- author="홍길동", since="1 month ago"

## 언제 사용?
- 특정 변경이 언제, 왜 발생했는지 조사
- 코드의 히스토리 추적
- 리그레션 원인 분석`
};

export const gitRebasePlannerTool = {
  name: "git_rebase_planner",
  description: `Git 리베이스 계획 도구.

## 기능
- 리베이스 전 충돌 예측
- 인터랙티브 리베이스 계획 생성
- 커밋 재정렬 제안

## 사용 예시
- base="main", action="preview"로 충돌 예측
- action="plan"으로 리베이스 전략 제안

## 주의
- action="execute"는 실제 리베이스 수행
- 먼저 plan/preview로 확인 권장`
};

export const gitSquashHelperTool = {
  name: "git_squash_helper",
  description: `Git 스쿼시 도우미.

## 기능
- 여러 커밋을 하나로 합치기
- 통합 커밋 메시지 자동 생성
- 미리보기 기능

## 사용 예시
- commits=5로 최근 5개 커밋 스쿼시 준비
- preview_only=true로 결과 미리보기

## 주의
- preview_only=false는 실제 히스토리 변경
- push된 커밋은 force push 필요`
};

export const gitBranchAnalysisTool = {
  name: "git_branch_analysis",
  description: `Git 브랜치 분석 도구.

## 기능
- 현재 브랜치와 대상 브랜치 비교
- ahead/behind 커밋 수 확인
- 병합된/오래된 브랜치 식별

## 사용 예시
- compare_with="main"으로 main 대비 현황
- show_stale=true로 정리 대상 브랜치 확인

## 언제 사용?
- 브랜치 상태 파악
- 정리할 브랜치 식별
- 병합 전 상태 확인`
};

// ============ Helper Functions ============

/**
 * Execute git command and return output
 */
function execGit(args: string[], cwd?: string): string {
  try {
    // Use execFileSync to avoid shell interpretation of special characters (%, $, etc.)
    const result = execFileSync('git', args, {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });
    return result.trim();
  } catch (error: any) {
    if (error.stderr) {
      throw new Error(`Git error: ${error.stderr}`);
    }
    throw error;
  }
}

/**
 * Check if path is a git repository
 */
function isGitRepo(path?: string): boolean {
  try {
    execGit(['rev-parse', '--git-dir'], path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get default branch name
 */
function getDefaultBranch(path?: string): string {
  try {
    return execGit(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], path).replace('origin/', '');
  } catch {
    // Try common defaults
    try {
      execGit(['rev-parse', '--verify', 'main'], path);
      return 'main';
    } catch {
      return 'master';
    }
  }
}

/**
 * Categorize file by type
 */
function categorizeFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs'].includes(ext)) {
    return 'source';
  }
  if (['test.ts', 'spec.ts', 'test.js', 'spec.js'].some(s => filename.includes(s))) {
    return 'test';
  }
  if (['md', 'txt', 'rst'].includes(ext)) {
    return 'docs';
  }
  if (['json', 'yaml', 'yml', 'toml', 'ini'].includes(ext)) {
    return 'config';
  }
  if (['css', 'scss', 'less', 'html'].includes(ext)) {
    return 'style';
  }
  return 'other';
}

/**
 * Analyze git diff and group changes semantically
 */
function analyzeChanges(path?: string, includeStaged: boolean = true, includeUnstaged: boolean = true): {
  staged: string[];
  unstaged: string[];
  groups: Record<string, string[]>;
} {
  const staged: string[] = [];
  const unstaged: string[] = [];

  if (includeStaged) {
    const stagedOutput = execGit(['diff', '--cached', '--name-only'], path);
    if (stagedOutput) {
      staged.push(...stagedOutput.split('\n').filter(Boolean));
    }
  }

  if (includeUnstaged) {
    const unstagedOutput = execGit(['diff', '--name-only'], path);
    if (unstagedOutput) {
      unstaged.push(...unstagedOutput.split('\n').filter(Boolean));
    }
  }

  const allFiles = [...new Set([...staged, ...unstaged])];
  const groups: Record<string, string[]> = {};

  for (const file of allFiles) {
    const category = categorizeFile(file);
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(file);
  }

  return { staged, unstaged, groups };
}

// ============ Handlers ============

export async function handleGitAtomicCommit(params: GitAtomicCommitParams) {
  const cwd = params.path || process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      content: [{
        type: "text" as const,
        text: "## ❌ Git 저장소가 아닙니다\n\n지정된 경로가 Git 저장소가 아닙니다."
      }]
    };
  }

  try {
    const { staged, unstaged, groups } = analyzeChanges(
      cwd,
      params.include_staged ?? true,
      params.include_unstaged ?? true
    );

    if (staged.length === 0 && unstaged.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "## ℹ️ 변경사항 없음\n\n커밋할 변경사항이 없습니다."
        }]
      };
    }

    let result = `## 🔍 Atomic Commit 분석\n\n`;
    result += `### 변경사항 요약\n`;
    result += `- 스테이징됨: ${staged.length}개 파일\n`;
    result += `- 스테이징 안됨: ${unstaged.length}개 파일\n\n`;

    result += `### 제안 커밋 그룹\n\n`;

    const groupDescriptions: Record<string, string> = {
      source: '🔧 소스 코드 변경',
      test: '🧪 테스트 변경',
      docs: '📝 문서 변경',
      config: '⚙️ 설정 파일 변경',
      style: '🎨 스타일 변경',
      other: '📦 기타 변경'
    };

    let groupIndex = 1;
    for (const [category, files] of Object.entries(groups)) {
      if (files.length === 0) continue;

      result += `#### 커밋 ${groupIndex}: ${groupDescriptions[category] || category}\n`;
      result += `\`\`\`bash\n`;
      result += `git add ${files.join(' ')}\n`;
      result += `git commit -m "${groupDescriptions[category]}"\n`;
      result += `\`\`\`\n`;
      result += `파일 목록:\n`;
      files.forEach(f => result += `- \`${f}\`\n`);
      result += `\n`;
      groupIndex++;
    }

    result += `### 권장 순서\n`;
    result += `1. config → 2. source → 3. test → 4. docs → 5. style → 6. other\n`;

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Git atomic commit failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 분석 실패\n\n${error.message}`
      }]
    };
  }
}

export async function handleGitHistorySearch(params: GitHistorySearchParams) {
  const cwd = params.path || process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      content: [{
        type: "text" as const,
        text: "## ❌ Git 저장소가 아닙니다"
      }]
    };
  }

  try {
    const args = ['log', '--pretty=format:%H|%an|%ad|%s', '--date=short'];

    if (params.max_count) {
      args.push(`-n${params.max_count}`);
    }

    if (params.author) {
      args.push(`--author=${params.author}`);
    }

    if (params.since) {
      args.push(`--since=${params.since}`);
    }

    if (params.until) {
      args.push(`--until=${params.until}`);
    }

    if (params.query) {
      if (params.search_in_diff) {
        args.push(`-S${params.query}`);
      } else {
        args.push(`--grep=${params.query}`);
      }
    }

    if (params.branch) {
      args.push(params.branch);
    }

    if (params.file_path) {
      args.push('--', params.file_path);
    }

    const output = execGit(args, cwd);

    if (!output) {
      return {
        content: [{
          type: "text" as const,
          text: "## ℹ️ 검색 결과 없음\n\n조건에 맞는 커밋이 없습니다."
        }]
      };
    }

    const commits = output.split('\n').map(line => {
      const [hash, author, date, ...msgParts] = line.split('|');
      return { hash: hash.substring(0, 7), author, date, message: msgParts.join('|') };
    });

    let result = `## 🔍 Git 히스토리 검색 결과\n\n`;
    result += `**검색 조건:**\n`;
    if (params.query) result += `- 쿼리: \`${params.query}\`${params.search_in_diff ? ' (diff 포함)' : ''}\n`;
    if (params.author) result += `- 작성자: ${params.author}\n`;
    if (params.since) result += `- 시작: ${params.since}\n`;
    if (params.until) result += `- 종료: ${params.until}\n`;
    if (params.file_path) result += `- 파일: ${params.file_path}\n`;
    result += `\n**${commits.length}개 커밋 발견:**\n\n`;

    result += `| Hash | Date | Author | Message |\n`;
    result += `|------|------|--------|----------|\n`;

    for (const commit of commits) {
      result += `| \`${commit.hash}\` | ${commit.date} | ${commit.author} | ${commit.message.substring(0, 50)}${commit.message.length > 50 ? '...' : ''} |\n`;
    }

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Git history search failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 검색 실패\n\n${error.message}`
      }]
    };
  }
}

export async function handleGitRebasePlanner(params: GitRebasePlannerParams) {
  const cwd = params.path || process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      content: [{
        type: "text" as const,
        text: "## ❌ Git 저장소가 아닙니다"
      }]
    };
  }

  try {
    const currentBranch = execGit(['branch', '--show-current'], cwd);

    // Get commits that would be rebased
    const commits = execGit(
      ['log', '--oneline', `${params.base}..HEAD`],
      cwd
    );

    if (!commits) {
      return {
        content: [{
          type: "text" as const,
          text: `## ℹ️ 리베이스 불필요\n\n현재 브랜치(${currentBranch})가 이미 ${params.base}에 기반합니다.`
        }]
      };
    }

    const commitList = commits.split('\n').filter(Boolean);

    let result = `## 📋 리베이스 계획\n\n`;
    result += `**현재 브랜치:** ${currentBranch}\n`;
    result += `**대상 브랜치:** ${params.base}\n`;
    result += `**리베이스할 커밋:** ${commitList.length}개\n\n`;

    if (params.action === 'preview') {
      // Try to detect potential conflicts
      const changedFiles = execGit(['diff', '--name-only', `${params.base}...HEAD`], cwd);
      const baseChangedFiles = execGit(['diff', '--name-only', `HEAD...${params.base}`], cwd);

      const ourFiles = new Set(changedFiles.split('\n').filter(Boolean));
      const theirFiles = new Set(baseChangedFiles.split('\n').filter(Boolean));
      const potentialConflicts = [...ourFiles].filter(f => theirFiles.has(f));

      result += `### 충돌 예측\n\n`;
      if (potentialConflicts.length > 0) {
        result += `⚠️ **${potentialConflicts.length}개 파일에서 충돌 가능성:**\n`;
        potentialConflicts.forEach(f => result += `- \`${f}\`\n`);
      } else {
        result += `✅ 충돌 예상 없음\n`;
      }
      result += `\n`;
    }

    if (params.interactive) {
      result += `### 인터랙티브 리베이스 계획\n\n`;
      result += `\`\`\`\n`;
      commitList.forEach((commit, i) => {
        const [hash, ...msgParts] = commit.split(' ');
        const msg = msgParts.join(' ');
        result += `pick ${hash} ${msg}\n`;
      });
      result += `\`\`\`\n\n`;

      result += `### 제안 액션\n`;
      result += `- \`pick\`: 커밋 유지\n`;
      result += `- \`reword\`: 메시지 수정\n`;
      result += `- \`edit\`: 커밋 수정\n`;
      result += `- \`squash\`: 이전 커밋과 합치기\n`;
      result += `- \`fixup\`: 합치되 메시지 버리기\n`;
      result += `- \`drop\`: 커밋 제거\n\n`;
    }

    result += `### 실행 명령\n`;
    result += `\`\`\`bash\n`;
    if (params.interactive) {
      result += `git rebase -i ${params.base}\n`;
    } else {
      result += `git rebase ${params.base}\n`;
    }
    result += `\`\`\`\n`;

    if (params.action === 'execute') {
      result += `\n⚠️ **주의:** \`action="execute"\`가 지정되었지만, 안전을 위해 실제 리베이스는 수행하지 않습니다.\n`;
      result += `위 명령어를 직접 실행해주세요.\n`;
    }

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Git rebase planner failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 리베이스 계획 실패\n\n${error.message}`
      }]
    };
  }
}

export async function handleGitSquashHelper(params: GitSquashHelperParams) {
  const cwd = params.path || process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      content: [{
        type: "text" as const,
        text: "## ❌ Git 저장소가 아닙니다"
      }]
    };
  }

  try {
    const commits = execGit(
      ['log', `--oneline`, `-n${params.commits}`],
      cwd
    );

    const commitList = commits.split('\n').filter(Boolean);

    if (commitList.length < params.commits) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 커밋 부족\n\n요청: ${params.commits}개, 실제: ${commitList.length}개`
        }]
      };
    }

    // Get detailed commit messages
    const fullMessages = execGit(
      ['log', `--format=%B---COMMIT_SEPARATOR---`, `-n${params.commits}`],
      cwd
    );
    const messages = fullMessages.split('---COMMIT_SEPARATOR---').filter(Boolean).map(m => m.trim());

    let result = `## 🔀 스쿼시 미리보기\n\n`;
    result += `**스쿼시할 커밋:** ${params.commits}개\n\n`;

    result += `### 대상 커밋\n\n`;
    commitList.forEach((commit, i) => {
      result += `${i + 1}. \`${commit}\`\n`;
    });

    // Generate combined commit message
    const combinedMessage = params.message ||
      `Squash ${params.commits} commits:\n\n${messages.map((m, i) => `- ${m}`).join('\n')}`;

    result += `\n### 생성될 커밋 메시지\n\n`;
    result += `\`\`\`\n${combinedMessage}\n\`\`\`\n\n`;

    result += `### 실행 명령\n`;
    result += `\`\`\`bash\n`;
    result += `git reset --soft HEAD~${params.commits}\n`;
    result += `git commit -m "${combinedMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"\n`;
    result += `\`\`\`\n\n`;

    result += `### 또는 인터랙티브 리베이스 사용\n`;
    result += `\`\`\`bash\n`;
    result += `git rebase -i HEAD~${params.commits}\n`;
    result += `# 첫 번째 커밋 외 모두 squash 또는 fixup으로 변경\n`;
    result += `\`\`\`\n`;

    if (!params.preview_only) {
      result += `\n⚠️ **주의:** 안전을 위해 실제 스쿼시는 수행하지 않습니다.\n`;
      result += `위 명령어를 직접 실행해주세요.\n`;
    }

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Git squash helper failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 스쿼시 준비 실패\n\n${error.message}`
      }]
    };
  }
}

export async function handleGitBranchAnalysis(params: GitBranchAnalysisParams) {
  const cwd = params.path || process.cwd();

  if (!isGitRepo(cwd)) {
    return {
      content: [{
        type: "text" as const,
        text: "## ❌ Git 저장소가 아닙니다"
      }]
    };
  }

  try {
    const currentBranch = execGit(['branch', '--show-current'], cwd);
    const compareBranch = params.compare_with || getDefaultBranch(cwd);

    // Get all branches
    const branchArgs = params.include_remote ? ['-a'] : [];
    const branches = execGit(['branch', ...branchArgs, '--format=%(refname:short)|%(upstream:short)|%(committerdate:relative)'], cwd);

    const branchList = branches.split('\n').filter(Boolean).map(line => {
      const [name, upstream, date] = line.split('|');
      return { name, upstream, date };
    });

    let result = `## 🌿 브랜치 분석\n\n`;
    result += `**현재 브랜치:** ${currentBranch}\n`;
    result += `**비교 브랜치:** ${compareBranch}\n\n`;

    // Ahead/behind for current branch
    try {
      const aheadBehind = execGit(['rev-list', '--left-right', '--count', `${compareBranch}...${currentBranch}`], cwd);
      const [behind, ahead] = aheadBehind.split('\t').map(Number);

      result += `### 현재 브랜치 상태\n`;
      result += `- **Ahead:** ${ahead} commits (${compareBranch} 대비)\n`;
      result += `- **Behind:** ${behind} commits (${compareBranch} 대비)\n\n`;
    } catch {
      result += `### 현재 브랜치 상태\n`;
      result += `⚠️ ${compareBranch}와 비교할 수 없습니다.\n\n`;
    }

    // List local branches
    result += `### 로컬 브랜치 목록\n\n`;
    result += `| Branch | Upstream | Last Activity |\n`;
    result += `|--------|----------|---------------|\n`;

    for (const branch of branchList.filter(b => !b.name.startsWith('origin/'))) {
      const isCurrent = branch.name === currentBranch;
      result += `| ${isCurrent ? '**' : ''}${branch.name}${isCurrent ? '** (current)' : ''} | ${branch.upstream || '-'} | ${branch.date || '-'} |\n`;
    }

    // Show stale branches
    if (params.show_stale) {
      result += `\n### 병합된 브랜치 (정리 대상)\n\n`;
      try {
        const merged = execGit(['branch', '--merged', compareBranch], cwd);
        const mergedList = merged.split('\n')
          .map(b => b.trim().replace('* ', ''))
          .filter(b => b && b !== compareBranch && b !== 'main' && b !== 'master');

        if (mergedList.length > 0) {
          result += `\`\`\`bash\n`;
          result += `# 다음 브랜치들은 ${compareBranch}에 병합됨:\n`;
          mergedList.forEach(b => result += `git branch -d ${b}\n`);
          result += `\`\`\`\n`;
        } else {
          result += `✅ 정리할 병합된 브랜치 없음\n`;
        }
      } catch {
        result += `병합된 브랜치를 확인할 수 없습니다.\n`;
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: result
      }]
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Git branch analysis failed');
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ 브랜치 분석 실패\n\n${error.message}`
      }]
    };
  }
}

export default {
  gitAtomicCommitTool,
  gitAtomicCommitSchema,
  handleGitAtomicCommit,
  gitHistorySearchTool,
  gitHistorySearchSchema,
  handleGitHistorySearch,
  gitRebasePlannerTool,
  gitRebasePlannerSchema,
  handleGitRebasePlanner,
  gitSquashHelperTool,
  gitSquashHelperSchema,
  handleGitSquashHelper,
  gitBranchAnalysisTool,
  gitBranchAnalysisSchema,
  handleGitBranchAnalysis
};
