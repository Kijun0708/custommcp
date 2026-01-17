// src/hooks/builtin/edit-error-recovery.ts

/**
 * Edit Error Recovery Hook
 *
 * Handles file editing errors with intelligent recovery strategies.
 * Provides retry logic, alternative approaches, and helpful diagnostics.
 *
 * Features:
 * - Edit conflict detection
 * - Automatic retry with different strategies
 * - Alternative edit suggestions
 * - Diagnostic information for debugging
 */

import {
  HookDefinition,
  HookResult,
  OnToolResultContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Edit error types
 */
type EditErrorType =
  | 'string_not_found'
  | 'multiple_matches'
  | 'file_not_found'
  | 'permission_denied'
  | 'encoding_error'
  | 'conflict'
  | 'syntax_error'
  | 'unknown';

/**
 * Recovery suggestion
 */
interface RecoverySuggestion {
  /** Suggestion title */
  title: string;
  /** Detailed description */
  description: string;
  /** Action type */
  action: 'retry' | 'alternative' | 'manual' | 'abort';
  /** Priority (higher = better) */
  priority: number;
}

/**
 * Configuration
 */
interface EditRecoveryConfig {
  /** Enable automatic suggestions */
  enableSuggestions: boolean;
  /** Track edit history for better recovery */
  trackHistory: boolean;
  /** Maximum history entries */
  maxHistoryEntries: number;
  /** Enable fuzzy matching suggestions */
  enableFuzzyMatch: boolean;
}

const DEFAULT_CONFIG: EditRecoveryConfig = {
  enableSuggestions: true,
  trackHistory: true,
  maxHistoryEntries: 20,
  enableFuzzyMatch: true
};

let config: EditRecoveryConfig = { ...DEFAULT_CONFIG };

/**
 * Edit history entry
 */
interface EditHistoryEntry {
  /** File path */
  filePath: string;
  /** Edit type (edit, write, etc.) */
  editType: string;
  /** Success status */
  success: boolean;
  /** Error type if failed */
  errorType?: EditErrorType;
  /** Timestamp */
  timestamp: number;
  /** Old string (for edits) */
  oldString?: string;
  /** New string (for edits) */
  newString?: string;
}

/**
 * State
 */
interface EditRecoveryState {
  /** Edit history */
  history: EditHistoryEntry[];
  /** Error counts by type */
  errorCounts: Record<EditErrorType, number>;
  /** Total edits attempted */
  totalEdits: number;
  /** Successful edits */
  successfulEdits: number;
  /** Last edit timestamp */
  lastEditAt?: number;
}

let state: EditRecoveryState = {
  history: [],
  errorCounts: {
    string_not_found: 0,
    multiple_matches: 0,
    file_not_found: 0,
    permission_denied: 0,
    encoding_error: 0,
    conflict: 0,
    syntax_error: 0,
    unknown: 0
  },
  totalEdits: 0,
  successfulEdits: 0
};

/**
 * Error patterns for classification
 */
const EDIT_ERROR_PATTERNS: Record<EditErrorType, RegExp[]> = {
  string_not_found: [
    /not found/i,
    /no match/i,
    /couldn't find/i,
    /does not exist/i,
    /old_string.*not/i,
    /찾을 수 없/i,
    /일치하는.*없/i
  ],
  multiple_matches: [
    /multiple/i,
    /ambiguous/i,
    /more than one/i,
    /여러.*일치/i,
    /중복/i
  ],
  file_not_found: [
    /file.*not found/i,
    /ENOENT/i,
    /no such file/i,
    /파일.*없/i,
    /존재하지 않/i
  ],
  permission_denied: [
    /permission/i,
    /EACCES/i,
    /access denied/i,
    /권한/i,
    /거부/i
  ],
  encoding_error: [
    /encoding/i,
    /decode/i,
    /utf-?8/i,
    /인코딩/i,
    /charset/i
  ],
  conflict: [
    /conflict/i,
    /modified/i,
    /changed/i,
    /충돌/i,
    /변경됨/i
  ],
  syntax_error: [
    /syntax/i,
    /parse error/i,
    /invalid/i,
    /구문/i,
    /파싱/i
  ],
  unknown: []
};

/**
 * Classifies an edit error
 */
function classifyEditError(error: string): EditErrorType {
  for (const [type, patterns] of Object.entries(EDIT_ERROR_PATTERNS)) {
    if (type === 'unknown') continue;
    for (const pattern of patterns) {
      if (pattern.test(error)) {
        return type as EditErrorType;
      }
    }
  }
  return 'unknown';
}

/**
 * Generates recovery suggestions based on error type
 */
function generateSuggestions(
  errorType: EditErrorType,
  toolName: string,
  args: Record<string, unknown>
): RecoverySuggestion[] {
  const suggestions: RecoverySuggestion[] = [];

  switch (errorType) {
    case 'string_not_found':
      suggestions.push({
        title: '파일 내용 먼저 확인',
        description: 'Read 도구로 파일을 읽어 현재 내용을 확인하세요. 줄 번호와 함께 정확한 문자열을 찾을 수 있습니다.',
        action: 'alternative',
        priority: 10
      });
      suggestions.push({
        title: '더 넓은 컨텍스트 사용',
        description: 'old_string에 더 많은 주변 코드를 포함하여 유니크하게 만드세요.',
        action: 'retry',
        priority: 8
      });
      suggestions.push({
        title: '공백/탭 확인',
        description: '들여쓰기가 탭인지 스페이스인지 확인하세요. 파일의 실제 들여쓰기와 일치해야 합니다.',
        action: 'retry',
        priority: 7
      });
      if (config.enableFuzzyMatch) {
        suggestions.push({
          title: 'Grep으로 유사 패턴 검색',
          description: 'Grep 도구로 비슷한 패턴을 검색하여 정확한 문자열을 찾으세요.',
          action: 'alternative',
          priority: 6
        });
      }
      break;

    case 'multiple_matches':
      suggestions.push({
        title: '더 많은 컨텍스트 추가',
        description: 'old_string에 더 많은 주변 코드를 포함하여 유니크하게 만드세요.',
        action: 'retry',
        priority: 10
      });
      suggestions.push({
        title: '줄 번호 활용',
        description: '특정 줄 번호의 코드만 읽어서 정확한 위치를 파악하세요.',
        action: 'alternative',
        priority: 8
      });
      suggestions.push({
        title: 'replace_all 사용',
        description: '모든 일치 항목을 변경하려면 replace_all: true를 사용하세요.',
        action: 'retry',
        priority: 5
      });
      break;

    case 'file_not_found':
      suggestions.push({
        title: '경로 확인',
        description: 'Glob 도구로 파일 경로를 확인하세요. 대소문자와 확장자를 정확히 입력했는지 확인하세요.',
        action: 'alternative',
        priority: 10
      });
      suggestions.push({
        title: '디렉토리 존재 확인',
        description: '부모 디렉토리가 존재하는지 확인하세요.',
        action: 'alternative',
        priority: 8
      });
      suggestions.push({
        title: '새 파일 생성',
        description: '파일이 없다면 Write 도구로 새 파일을 생성하세요.',
        action: 'alternative',
        priority: 6
      });
      break;

    case 'permission_denied':
      suggestions.push({
        title: '파일 권한 확인',
        description: '파일이 읽기 전용이거나 다른 프로세스가 사용 중일 수 있습니다.',
        action: 'manual',
        priority: 10
      });
      suggestions.push({
        title: '다른 위치에 저장',
        description: '쓰기 권한이 있는 다른 디렉토리에 파일을 저장하세요.',
        action: 'alternative',
        priority: 7
      });
      break;

    case 'encoding_error':
      suggestions.push({
        title: '인코딩 확인',
        description: '파일이 UTF-8이 아닐 수 있습니다. 파일 인코딩을 확인하세요.',
        action: 'manual',
        priority: 10
      });
      suggestions.push({
        title: '바이너리 파일 확인',
        description: '바이너리 파일을 텍스트로 편집하려고 하면 이 오류가 발생할 수 있습니다.',
        action: 'manual',
        priority: 8
      });
      break;

    case 'conflict':
      suggestions.push({
        title: '최신 내용 다시 읽기',
        description: '파일이 변경되었습니다. Read 도구로 최신 내용을 확인하세요.',
        action: 'alternative',
        priority: 10
      });
      suggestions.push({
        title: '변경 사항 병합',
        description: '다른 변경 사항과 충돌이 있는지 확인하고 수동으로 병합하세요.',
        action: 'manual',
        priority: 8
      });
      break;

    case 'syntax_error':
      suggestions.push({
        title: '이스케이프 문자 확인',
        description: '특수 문자(따옴표, 백슬래시 등)가 올바르게 이스케이프되었는지 확인하세요.',
        action: 'retry',
        priority: 10
      });
      suggestions.push({
        title: '줄바꿈 문자 확인',
        description: 'Windows(CRLF)와 Unix(LF) 줄바꿈 차이로 인한 문제일 수 있습니다.',
        action: 'retry',
        priority: 8
      });
      break;

    default:
      suggestions.push({
        title: '오류 로그 확인',
        description: '자세한 오류 메시지를 확인하고 문제를 파악하세요.',
        action: 'manual',
        priority: 5
      });
  }

  // Sort by priority
  return suggestions.sort((a, b) => b.priority - a.priority);
}

/**
 * Records an edit attempt
 */
function recordEdit(entry: Omit<EditHistoryEntry, 'timestamp'>): void {
  state.totalEdits++;
  state.lastEditAt = Date.now();

  if (entry.success) {
    state.successfulEdits++;
  } else if (entry.errorType) {
    state.errorCounts[entry.errorType]++;
  }

  if (config.trackHistory) {
    state.history.push({
      ...entry,
      timestamp: Date.now()
    });

    // Limit history size
    if (state.history.length > config.maxHistoryEntries) {
      state.history = state.history.slice(-config.maxHistoryEntries);
    }
  }
}

/**
 * Updates configuration
 */
export function updateEditRecoveryConfig(newConfig: Partial<EditRecoveryConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Gets edit recovery statistics
 */
export function getEditRecoveryStats(): {
  totalEdits: number;
  successfulEdits: number;
  successRate: number;
  errorCounts: Record<EditErrorType, number>;
  recentErrors: EditHistoryEntry[];
} {
  return {
    totalEdits: state.totalEdits,
    successfulEdits: state.successfulEdits,
    successRate: state.totalEdits > 0
      ? state.successfulEdits / state.totalEdits
      : 1,
    errorCounts: { ...state.errorCounts },
    recentErrors: state.history.filter(e => !e.success).slice(-10)
  };
}

/**
 * Resets edit recovery state
 */
export function resetEditRecoveryState(): void {
  state = {
    history: [],
    errorCounts: {
      string_not_found: 0,
      multiple_matches: 0,
      file_not_found: 0,
      permission_denied: 0,
      encoding_error: 0,
      conflict: 0,
      syntax_error: 0,
      unknown: 0
    },
    totalEdits: 0,
    successfulEdits: 0
  };
}

/**
 * Hook: Handle edit tool errors
 */
const editErrorRecoveryHook: HookDefinition<OnToolResultContext> = {
  id: 'builtin_edit_error_recovery',
  name: 'Edit Error Recovery',
  description: 'Provides intelligent recovery suggestions for edit errors',
  eventType: 'onToolResult',
  priority: 'normal',
  enabled: true,
  handler: async (context): Promise<HookResult> => {
    // Only handle edit-related tools
    const editTools = ['Edit', 'Write', 'NotebookEdit'];
    if (!editTools.includes(context.toolName)) {
      return { decision: 'continue' };
    }

    const args = context.toolInput || {};

    // Handle successful edits
    if (context.success) {
      recordEdit({
        filePath: (args.file_path as string) || (args.notebook_path as string) || 'unknown',
        editType: context.toolName,
        success: true,
        oldString: args.old_string as string | undefined,
        newString: args.new_string as string | undefined
      });
      return { decision: 'continue' };
    }

    // Handle failed edits
    const errorStr = typeof context.toolResult === 'string'
      ? context.toolResult
      : JSON.stringify(context.toolResult);

    const errorType = classifyEditError(errorStr);

    recordEdit({
      filePath: (args.file_path as string) || (args.notebook_path as string) || 'unknown',
      editType: context.toolName,
      success: false,
      errorType,
      oldString: args.old_string as string | undefined,
      newString: args.new_string as string | undefined
    });

    // Generate suggestions if enabled
    if (!config.enableSuggestions) {
      return { decision: 'continue' };
    }

    const suggestions = generateSuggestions(errorType, context.toolName, args);

    // Build recovery message
    const lines: string[] = [
      `🔧 **편집 오류 복구 도우미**`,
      '',
      `**오류 유형**: ${errorType}`,
      `**파일**: ${(args.file_path as string) || (args.notebook_path as string) || 'unknown'}`,
      '',
      '### 권장 해결 방법'
    ];

    for (let i = 0; i < Math.min(3, suggestions.length); i++) {
      const s = suggestions[i];
      const actionEmoji = s.action === 'retry' ? '🔄' :
                          s.action === 'alternative' ? '💡' :
                          s.action === 'manual' ? '🛠️' : '⛔';
      lines.push(`${i + 1}. ${actionEmoji} **${s.title}**`);
      lines.push(`   ${s.description}`);
    }

    // Add stats if there are repeated errors
    const sameErrorCount = state.errorCounts[errorType];
    if (sameErrorCount > 2) {
      lines.push('');
      lines.push(`⚠️ 이 유형의 오류가 ${sameErrorCount}회 발생했습니다. 근본적인 문제를 확인하세요.`);
    }

    logger.info({
      errorType,
      tool: context.toolName,
      filePath: args.file_path || args.notebook_path
    }, '[Edit Recovery] Edit error detected');

    return {
      decision: 'continue',
      injectMessage: lines.join('\n'),
      metadata: {
        errorType,
        suggestions: suggestions.slice(0, 3),
        sameErrorCount
      }
    };
  }
};

/**
 * Registers the edit error recovery hook
 */
export function registerEditErrorRecoveryHooks(): void {
  registerHook(editErrorRecoveryHook);

  logger.debug('Edit Error Recovery hooks registered');
}

export default {
  registerEditErrorRecoveryHooks,
  updateEditRecoveryConfig,
  getEditRecoveryStats,
  resetEditRecoveryState
};
