// src/hooks/builtin/comment-checker.ts

/**
 * Comment Checker Hook
 *
 * Detects and warns about unnecessary AI-generated comments in code.
 * Helps maintain clean, self-documenting code.
 *
 * Features:
 * - Detects verbose/redundant comments
 * - Identifies AI-generated comment patterns
 * - Warns about commented-out code
 * - Suggests comment improvements
 */

import {
  HookDefinition,
  HookResult,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Comment issue types
 */
type CommentIssueType =
  | 'redundant'        // Comments that state the obvious
  | 'verbose'          // Overly detailed comments
  | 'ai_generated'     // Typical AI-generated patterns
  | 'commented_code'   // Commented-out code
  | 'outdated_marker'  // TODO/FIXME without context
  | 'excessive';       // Too many comments

/**
 * Detected comment issue
 */
interface CommentIssue {
  /** Issue type */
  type: CommentIssueType;
  /** Line number (approximate) */
  lineNumber?: number;
  /** The problematic comment */
  comment: string;
  /** Severity (1-3) */
  severity: number;
  /** Suggestion */
  suggestion: string;
}

/**
 * Configuration
 */
interface CommentCheckerConfig {
  /** Enable comment checking */
  enabled: boolean;
  /** Minimum severity to report (1-3) */
  minSeverity: number;
  /** Check for redundant comments */
  checkRedundant: boolean;
  /** Check for verbose comments */
  checkVerbose: boolean;
  /** Check for AI-generated patterns */
  checkAiPatterns: boolean;
  /** Check for commented-out code */
  checkCommentedCode: boolean;
  /** Maximum comment ratio (comments/code) */
  maxCommentRatio: number;
}

const DEFAULT_CONFIG: CommentCheckerConfig = {
  enabled: true,
  minSeverity: 2,
  checkRedundant: true,
  checkVerbose: true,
  checkAiPatterns: true,
  checkCommentedCode: true,
  maxCommentRatio: 0.3
};

let config: CommentCheckerConfig = { ...DEFAULT_CONFIG };

/**
 * Patterns for detecting issues
 */
const REDUNDANT_PATTERNS: RegExp[] = [
  // Obvious comments
  /\/\/\s*(?:increment|add|subtract|multiply|divide)\s+(?:the\s+)?(?:counter|value|number)/i,
  /\/\/\s*(?:get|set|return)\s+(?:the\s+)?(?:value|result|data)/i,
  /\/\/\s*(?:loop|iterate)\s+(?:through|over)/i,
  /\/\/\s*(?:check|verify)\s+if/i,
  /\/\/\s*(?:create|initialize|declare)\s+(?:a\s+)?(?:new\s+)?(?:variable|constant|array|object)/i,
  /\/\/\s*(?:import|require|include)\s+(?:the\s+)?/i,
  /\/\/\s*(?:export|expose)\s+(?:the\s+)?/i,

  // Korean redundant patterns
  /\/\/\s*(?:증가|감소|더하기|빼기)/,
  /\/\/\s*(?:값을?\s*)?(?:가져오기|설정|반환)/,
  /\/\/\s*(?:반복|순회)/,
  /\/\/\s*(?:확인|검사|체크)/,
  /\/\/\s*(?:변수|상수|배열|객체)\s*(?:선언|생성|초기화)/
];

const VERBOSE_PATTERNS: RegExp[] = [
  // Overly detailed
  /\/\/\s*.{100,}/,  // Very long single-line comments
  /\/\*\*[\s\S]{500,}?\*\//,  // Very long JSDoc
  /\/\/\s*This (?:function|method|class) (?:is used to|will|does)/i,
  /\/\/\s*The following (?:code|block|section)/i,

  // Unnecessary explanation of syntax
  /\/\/\s*(?:Using|Use)\s+(?:async|await|Promise|callback)/i,
  /\/\/\s*(?:Arrow|Lambda)\s+function/i
];

const AI_GENERATED_PATTERNS: RegExp[] = [
  // Common AI patterns
  /\/\/\s*(?:Note|NOTE):/i,
  /\/\/\s*(?:Important|IMPORTANT):/i,
  /\/\/\s*This is (?:a |an )?(?:simple|basic|example)/i,
  /\/\/\s*(?:We|I) (?:can |could |will |would )?(?:use|implement|create)/i,
  /\/\/\s*(?:First|Second|Third|Next|Then|Finally|Lastly),?\s+(?:we|I)/i,
  /\/\/\s*(?:Let's|Let us)/i,
  /\/\/\s*(?:As you can see|As shown|As mentioned)/i,
  /\/\/\s*(?:Make sure|Ensure|Remember|Don't forget)/i,
  /\/\/\s*(?:For (?:example|instance|demonstration))/i,

  // Excessive documentation
  /\/\*\*\s*\n\s*\*\s*@(?:param|returns|throws)\s+\{[^}]+\}\s+\w+\s+-?\s*(?:The|A|An)\s+/i,
  /\/\/\s*@(?:ts-ignore|ts-nocheck|ts-expect-error)\s*-?\s*(?:This|We|The)/i,

  // Korean AI patterns
  /\/\/\s*(?:참고|주의|중요):/,
  /\/\/\s*(?:먼저|다음으로|그 다음|마지막으로)/,
  /\/\/\s*(?:예를 들어|예시로|예를 들면)/
];

const COMMENTED_CODE_PATTERNS: RegExp[] = [
  // Likely commented-out code
  /\/\/\s*(?:const|let|var|function|class|import|export|return|if|else|for|while)\s+/,
  /\/\/\s*\w+\s*[=:]\s*(?:function|async|\(|{|\[|'|"|`|\d)/,
  /\/\/\s*(?:await|yield)\s+/,
  /\/\/\s*\w+\.\w+\(/,  // Method calls
  /\/\/\s*<\/?[A-Z]\w*/,  // JSX components

  // Korean
  /\/\/\s*(?:const|let|var)\s+\w+\s*=/
];

/**
 * State
 */
interface CommentCheckerState {
  /** Total files checked */
  filesChecked: number;
  /** Total issues found */
  totalIssues: number;
  /** Issues by type */
  issuesByType: Record<CommentIssueType, number>;
  /** Recent issues */
  recentIssues: Array<{
    filePath: string;
    issues: CommentIssue[];
    timestamp: number;
  }>;
}

let state: CommentCheckerState = {
  filesChecked: 0,
  totalIssues: 0,
  issuesByType: {
    redundant: 0,
    verbose: 0,
    ai_generated: 0,
    commented_code: 0,
    outdated_marker: 0,
    excessive: 0
  },
  recentIssues: []
};

/**
 * Analyzes code for comment issues
 */
function analyzeComments(code: string): CommentIssue[] {
  const issues: CommentIssue[] = [];
  const lines = code.split('\n');

  let commentCount = 0;
  let codeCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Count comments vs code
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      commentCount++;
    } else {
      codeCount++;
    }

    // Check for redundant comments
    if (config.checkRedundant) {
      for (const pattern of REDUNDANT_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            type: 'redundant',
            lineNumber: i + 1,
            comment: trimmed.substring(0, 80),
            severity: 2,
            suggestion: '자명한 코드에는 주석이 필요하지 않습니다. 삭제를 고려하세요.'
          });
          break;
        }
      }
    }

    // Check for verbose comments
    if (config.checkVerbose) {
      for (const pattern of VERBOSE_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            type: 'verbose',
            lineNumber: i + 1,
            comment: trimmed.substring(0, 80) + (trimmed.length > 80 ? '...' : ''),
            severity: 1,
            suggestion: '주석을 간결하게 줄이세요. 핵심만 남기세요.'
          });
          break;
        }
      }
    }

    // Check for AI-generated patterns
    if (config.checkAiPatterns) {
      for (const pattern of AI_GENERATED_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            type: 'ai_generated',
            lineNumber: i + 1,
            comment: trimmed.substring(0, 80),
            severity: 2,
            suggestion: 'AI 생성 스타일의 주석입니다. 실제 필요한 정보만 남기세요.'
          });
          break;
        }
      }
    }

    // Check for commented-out code
    if (config.checkCommentedCode) {
      for (const pattern of COMMENTED_CODE_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            type: 'commented_code',
            lineNumber: i + 1,
            comment: trimmed.substring(0, 80),
            severity: 3,
            suggestion: '주석 처리된 코드입니다. 불필요하면 삭제하세요.'
          });
          break;
        }
      }
    }

    // Check for outdated markers
    if (/\/\/\s*(?:TODO|FIXME|XXX|HACK)\s*$/i.test(trimmed)) {
      issues.push({
        type: 'outdated_marker',
        lineNumber: i + 1,
        comment: trimmed,
        severity: 2,
        suggestion: 'TODO/FIXME 마커에 구체적인 설명을 추가하세요.'
      });
    }
  }

  // Check comment ratio
  if (codeCount > 0) {
    const ratio = commentCount / codeCount;
    if (ratio > config.maxCommentRatio && commentCount > 10) {
      issues.push({
        type: 'excessive',
        comment: `주석 비율: ${(ratio * 100).toFixed(1)}%`,
        severity: 1,
        suggestion: `코드 대비 주석이 너무 많습니다 (${commentCount}/${codeCount}). 자명한 주석을 제거하세요.`
      });
    }
  }

  // Deduplicate similar issues
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.type}:${issue.comment.substring(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Updates configuration
 */
export function updateCommentCheckerConfig(newConfig: Partial<CommentCheckerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Gets comment checker statistics
 */
export function getCommentCheckerStats(): {
  filesChecked: number;
  totalIssues: number;
  issuesByType: Record<CommentIssueType, number>;
  recentIssues: CommentCheckerState['recentIssues'];
} {
  return {
    filesChecked: state.filesChecked,
    totalIssues: state.totalIssues,
    issuesByType: { ...state.issuesByType },
    recentIssues: [...state.recentIssues]
  };
}

/**
 * Resets comment checker state
 */
export function resetCommentCheckerState(): void {
  state = {
    filesChecked: 0,
    totalIssues: 0,
    issuesByType: {
      redundant: 0,
      verbose: 0,
      ai_generated: 0,
      commented_code: 0,
      outdated_marker: 0,
      excessive: 0
    },
    recentIssues: []
  };
}

/**
 * Hook: Check comments in edit/write results
 */
const commentCheckerHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_comment_checker',
  name: 'Comment Checker',
  description: 'Detects unnecessary or AI-generated comments in code',
  eventType: 'onToolResult',
  priority: 'low',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) {
      return { decision: 'continue' };
    }

    // Only check edit/write tools
    const editTools = ['Edit', 'Write'];
    if (!editTools.includes(context.toolName)) {
      return { decision: 'continue' };
    }

    // Only check successful edits
    if (!context.success) {
      return { decision: 'continue' };
    }

    // Get the new content
    const args = context.toolInput || {};
    const newString = args.new_string as string | undefined;
    const content = args.content as string | undefined;
    const filePath = args.file_path as string | '';

    // Skip non-code files
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cs'];
    const hasCodeExtension = codeExtensions.some(ext => filePath.endsWith(ext));
    if (!hasCodeExtension) {
      return { decision: 'continue' };
    }

    const codeToCheck = newString || content;
    if (!codeToCheck || codeToCheck.length < 50) {
      return { decision: 'continue' };
    }

    state.filesChecked++;

    // Analyze comments
    const issues = analyzeComments(codeToCheck);

    // Filter by severity
    const significantIssues = issues.filter(i => i.severity >= config.minSeverity);

    if (significantIssues.length === 0) {
      return { decision: 'continue' };
    }

    // Update state
    state.totalIssues += significantIssues.length;
    for (const issue of significantIssues) {
      state.issuesByType[issue.type]++;
    }

    // Store recent issues
    state.recentIssues.push({
      filePath,
      issues: significantIssues,
      timestamp: Date.now()
    });
    if (state.recentIssues.length > 10) {
      state.recentIssues = state.recentIssues.slice(-10);
    }

    logger.debug({
      filePath,
      issueCount: significantIssues.length
    }, '[Comment Checker] Issues detected');

    // Build message (only for high severity or multiple issues)
    if (significantIssues.length >= 2 || significantIssues.some(i => i.severity >= 3)) {
      const lines: string[] = [
        `📝 **주석 품질 검사** (${significantIssues.length}개 발견)`,
        ''
      ];

      // Group by type
      const byType = new Map<CommentIssueType, CommentIssue[]>();
      for (const issue of significantIssues.slice(0, 5)) {
        const existing = byType.get(issue.type) || [];
        existing.push(issue);
        byType.set(issue.type, existing);
      }

      for (const [type, typeIssues] of byType) {
        const typeLabel = {
          redundant: '🔄 불필요한 주석',
          verbose: '📜 장황한 주석',
          ai_generated: '🤖 AI 스타일 주석',
          commented_code: '💾 주석 처리된 코드',
          outdated_marker: '📌 불완전한 마커',
          excessive: '📊 과도한 주석'
        }[type];

        lines.push(`**${typeLabel}**`);
        for (const issue of typeIssues.slice(0, 2)) {
          const lineInfo = issue.lineNumber ? ` (L${issue.lineNumber})` : '';
          lines.push(`- \`${issue.comment.substring(0, 50)}...\`${lineInfo}`);
          lines.push(`  → ${issue.suggestion}`);
        }
        lines.push('');
      }

      if (significantIssues.length > 5) {
        lines.push(`_...외 ${significantIssues.length - 5}개 이슈_`);
      }

      return {
        decision: 'continue',
        injectMessage: lines.join('\n'),
        metadata: {
          issueCount: significantIssues.length,
          issues: significantIssues
        }
      };
    }

    return { decision: 'continue' };
  }
};

/**
 * Registers the comment checker hook
 */
export function registerCommentCheckerHooks(): void {
  registerHook(commentCheckerHook);

  logger.debug('Comment Checker hooks registered');
}

export default {
  registerCommentCheckerHooks,
  updateCommentCheckerConfig,
  getCommentCheckerStats,
  resetCommentCheckerState
};
