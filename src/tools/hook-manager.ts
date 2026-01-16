// src/tools/hook-manager.ts

/**
 * Hook Manager MCP Tool
 *
 * Provides MCP tools for managing the hook system.
 */

import { z } from 'zod';
import {
  getHookManager,
  getRateLimitState,
  getErrorStats,
  registerExternalHook
} from '../hooks/index.js';
import {
  loadHookConfig,
  saveHookConfig
} from '../hooks/config-loader.js';
import {
  HookEventType,
  ExternalHookDefinition,
  HookPriority
} from '../hooks/types.js';
import { logger } from '../utils/logger.js';

/**
 * Input schema for hook_status tool.
 */
export const hookStatusSchema = z.object({
  include_hooks: z.boolean()
    .default(false)
    .optional()
    .describe('Include list of registered hooks'),
  include_stats: z.boolean()
    .default(true)
    .optional()
    .describe('Include hook execution statistics')
});

/**
 * Input schema for hook_toggle tool.
 */
export const hookToggleSchema = z.object({
  hook_id: z.string()
    .describe('Hook ID to enable/disable'),
  enabled: z.boolean()
    .describe('Whether to enable or disable the hook')
});

/**
 * Input schema for hook_system_toggle tool.
 */
export const hookSystemToggleSchema = z.object({
  enabled: z.boolean()
    .describe('Whether to enable or disable the entire hook system')
});

/**
 * Tool definition for hook_status.
 */
export const hookStatusTool = {
  name: 'hook_status',
  description: `Hook 시스템 상태 확인

현재 등록된 훅, 실행 통계, 시스템 상태를 확인합니다.

## 정보
- 등록된 내부/외부 훅 목록
- 훅 실행 통계 (성공/실패/블록)
- Rate limit 상태
- 에러 추적 상태`
};

/**
 * Tool definition for hook_toggle.
 */
export const hookToggleTool = {
  name: 'hook_toggle',
  description: `특정 훅 활성화/비활성화

개별 훅을 켜거나 끕니다.`
};

/**
 * Tool definition for hook_system_toggle.
 */
export const hookSystemToggleTool = {
  name: 'hook_system_toggle',
  description: `전체 Hook 시스템 활성화/비활성화

모든 훅을 일괄적으로 켜거나 끕니다.`
};

/**
 * Handles hook_status tool invocation.
 */
export async function handleHookStatus(
  params: z.infer<typeof hookStatusSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  const systemStats = manager.getSystemStats();
  const config = manager.getConfig();

  let output = `## 🪝 Hook System Status

### 시스템 상태
| 항목 | 값 |
|------|-----|
| 활성화 | ${config.enabled ? '✅ 예' : '❌ 아니오'} |
| 총 훅 수 | ${systemStats.totalHooks} |
| 내부 훅 | ${systemStats.internalHooks} |
| 외부 훅 | ${systemStats.externalHooks} |
| 활성 훅 | ${systemStats.enabledHooks} |
| 총 실행 횟수 | ${systemStats.totalExecutions} |
| 업타임 | ${Math.floor(systemStats.uptimeMs / 1000)}초 |
`;

  // Include hook list if requested
  if (params.include_hooks) {
    const hooks = manager.getRegisteredHooks();

    output += `\n### 등록된 내부 훅 (${hooks.internal.length}개)\n`;
    if (hooks.internal.length === 0) {
      output += '_(없음)_\n';
    } else {
      output += '| ID | 이름 | 이벤트 | 우선순위 | 상태 |\n';
      output += '|----|------|--------|----------|------|\n';
      for (const hook of hooks.internal) {
        output += `| \`${hook.id}\` | ${hook.name} | ${hook.eventType} | ${hook.priority} | ${hook.enabled ? '✅' : '❌'} |\n`;
      }
    }

    output += `\n### 등록된 외부 훅 (${hooks.external.length}개)\n`;
    if (hooks.external.length === 0) {
      output += '_(없음)_\n';
    } else {
      output += '| ID | 이름 | 이벤트 | 명령어 | 상태 |\n';
      output += '|----|------|--------|--------|------|\n';
      for (const hook of hooks.external) {
        const shortCmd = hook.command.length > 30
          ? hook.command.substring(0, 30) + '...'
          : hook.command;
        output += `| \`${hook.id}\` | ${hook.name} | ${hook.eventType} | \`${shortCmd}\` | ${hook.enabled ? '✅' : '❌'} |\n`;
      }
    }
  }

  // Include stats if requested
  if (params.include_stats) {
    const hookStats = manager.getStats();

    if (hookStats.size > 0) {
      output += `\n### 훅 실행 통계\n`;
      output += '| Hook ID | 총 실행 | 성공 | 실패 | 평균 시간 |\n';
      output += '|---------|---------|------|------|----------|\n';

      for (const [hookId, stats] of hookStats) {
        if (stats.totalExecutions > 0) {
          output += `| \`${hookId.substring(0, 30)}\` | ${stats.totalExecutions} | ${stats.successfulExecutions} | ${stats.failedExecutions} | ${stats.averageExecutionTimeMs.toFixed(1)}ms |\n`;
        }
      }
    }

    // Rate limit state
    const rateLimitState = getRateLimitState();
    if (Object.keys(rateLimitState.providerLimits).length > 0 ||
        Object.keys(rateLimitState.modelLimits).length > 0) {
      output += `\n### Rate Limit 상태\n`;
      output += `- 연속 Rate Limit: ${rateLimitState.consecutiveRateLimits}회\n`;

      if (Object.keys(rateLimitState.providerLimits).length > 0) {
        output += `- Provider 제한: ${JSON.stringify(rateLimitState.providerLimits)}\n`;
      }
      if (Object.keys(rateLimitState.modelLimits).length > 0) {
        output += `- Model 제한: ${JSON.stringify(rateLimitState.modelLimits)}\n`;
      }
    }

    // Error state
    const errorStats = getErrorStats();
    if (errorStats.totalErrors > 0) {
      output += `\n### 에러 추적\n`;
      output += `- 총 에러: ${errorStats.totalErrors}\n`;
      output += `- 복구된 에러: ${errorStats.recoveredErrors}\n`;

      if (Object.keys(errorStats.recentErrorsBySource).length > 0) {
        output += `- 최근 5분 에러:\n`;
        for (const [source, count] of Object.entries(errorStats.recentErrorsBySource)) {
          output += `  - ${source}: ${count}건\n`;
        }
      }
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: output
    }]
  };
}

/**
 * Handles hook_toggle tool invocation.
 */
export async function handleHookToggle(
  params: z.infer<typeof hookToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  const success = manager.setHookEnabled(params.hook_id, params.enabled);

  if (!success) {
    return {
      content: [{
        type: 'text' as const,
        text: `## ❌ 훅을 찾을 수 없음

Hook ID \`${params.hook_id}\`가 존재하지 않습니다.

\`hook_status\` 도구로 등록된 훅 목록을 확인하세요.`
      }]
    };
  }

  logger.info({
    hookId: params.hook_id,
    enabled: params.enabled
  }, 'Hook toggled');

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ 훅 ${params.enabled ? '활성화' : '비활성화'}됨

**Hook ID**: \`${params.hook_id}\`
**상태**: ${params.enabled ? '✅ 활성' : '❌ 비활성'}`
    }]
  };
}

/**
 * Handles hook_system_toggle tool invocation.
 */
export async function handleHookSystemToggle(
  params: z.infer<typeof hookSystemToggleSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  manager.setEnabled(params.enabled);

  logger.info({ enabled: params.enabled }, 'Hook system toggled');

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ Hook 시스템 ${params.enabled ? '활성화' : '비활성화'}됨

**상태**: ${params.enabled ? '✅ 모든 훅이 실행됩니다' : '❌ 모든 훅이 비활성화됩니다'}

${!params.enabled ? '⚠️ Hook 시스템이 비활성화되면 로깅, 컨텍스트 주입, 에러 추적 등의 기능이 작동하지 않습니다.' : ''}`
    }]
  };
}

// ============================================================================
// External Hook Management Tools
// ============================================================================

/**
 * Valid event types for external hooks.
 */
const VALID_EVENT_TYPES: HookEventType[] = [
  'onServerStart', 'onServerStop', 'onToolCall', 'onToolResult',
  'onExpertCall', 'onExpertResult', 'onWorkflowStart', 'onWorkflowPhase',
  'onWorkflowEnd', 'onRalphLoopStart', 'onRalphLoopIteration',
  'onRalphLoopEnd', 'onError', 'onRateLimit'
];

/**
 * Input schema for external_hook_add tool.
 */
export const externalHookAddSchema = z.object({
  name: z.string()
    .min(1)
    .max(50)
    .describe('훅 이름 (예: "Slack Notification")'),
  event: z.enum([
    'onServerStart', 'onServerStop', 'onToolCall', 'onToolResult',
    'onExpertCall', 'onExpertResult', 'onWorkflowStart', 'onWorkflowPhase',
    'onWorkflowEnd', 'onRalphLoopStart', 'onRalphLoopIteration',
    'onRalphLoopEnd', 'onError', 'onRateLimit'
  ]).describe('트리거할 이벤트 타입'),
  command: z.string()
    .min(1)
    .max(1000)
    .describe('실행할 셸 명령어 (컨텍스트는 HOOK_CONTEXT 환경변수와 stdin으로 전달)'),
  timeout_ms: z.number()
    .min(1000)
    .max(300000)
    .default(30000)
    .optional()
    .describe('명령어 타임아웃 (기본: 30000ms)'),
  priority: z.enum(['low', 'normal', 'high', 'critical'])
    .default('normal')
    .optional()
    .describe('우선순위 (기본: normal)'),
  pattern: z.string()
    .optional()
    .describe('도구/전문가 이름 패턴 (예: "strategist|researcher", "consult_*")'),
  save_to_config: z.boolean()
    .default(true)
    .optional()
    .describe('설정 파일에 영구 저장 (기본: true)')
}).strict();

/**
 * Input schema for external_hook_remove tool.
 */
export const externalHookRemoveSchema = z.object({
  hook_id: z.string()
    .describe('삭제할 외부 훅 ID'),
  save_to_config: z.boolean()
    .default(true)
    .optional()
    .describe('설정 파일에서도 삭제 (기본: true)')
}).strict();

/**
 * Input schema for external_hook_list tool.
 */
export const externalHookListSchema = z.object({
  event_filter: z.enum([
    'all', 'onServerStart', 'onServerStop', 'onToolCall', 'onToolResult',
    'onExpertCall', 'onExpertResult', 'onWorkflowStart', 'onWorkflowPhase',
    'onWorkflowEnd', 'onRalphLoopStart', 'onRalphLoopIteration',
    'onRalphLoopEnd', 'onError', 'onRateLimit'
  ]).default('all')
    .optional()
    .describe('이벤트 타입으로 필터링 (기본: all)')
}).strict();

/**
 * Tool definition for external_hook_add.
 */
export const externalHookAddTool = {
  name: 'external_hook_add',
  description: `외부 셸 명령 훅 추가

새로운 외부 훅을 등록합니다. 훅이 트리거되면 지정된 셸 명령어가 실행됩니다.

## 컨텍스트 전달 방식
- **환경변수**: \`HOOK_CONTEXT\`에 JSON 컨텍스트
- **stdin**: JSON 컨텍스트가 stdin으로 전달됨

## 종료 코드
- \`0\`: continue (계속 진행)
- \`1\`: continue with reason (stderr 출력)
- \`2\`: block (실행 차단)

## JSON 출력 (선택적)
stdout에 JSON을 출력하면 결과를 세부 제어할 수 있습니다:
\`\`\`json
{
  "decision": "continue|block|modify",
  "reason": "이유",
  "injectMessage": "컨텍스트에 추가할 메시지"
}
\`\`\`

## 사용 예시
- 워크플로우 완료 시 알림: event="onWorkflowEnd", command="notify-send 'Done!'"
- 에러 발생 시 로깅: event="onError", command="echo \\"$HOOK_CONTEXT\\" >> errors.log"
- 특정 전문가 호출 감시: event="onExpertCall", pattern="strategist", command="./monitor.sh"`
};

/**
 * Tool definition for external_hook_remove.
 */
export const externalHookRemoveTool = {
  name: 'external_hook_remove',
  description: `외부 훅 삭제

등록된 외부 훅을 삭제합니다. hook_status로 훅 ID를 확인하세요.`
};

/**
 * Tool definition for external_hook_list.
 */
export const externalHookListTool = {
  name: 'external_hook_list',
  description: `등록된 외부 훅 목록 조회

현재 등록된 모든 외부 셸 명령 훅을 표시합니다.`
};

/**
 * Handles external_hook_add tool invocation.
 */
export async function handleExternalHookAdd(
  params: z.infer<typeof externalHookAddSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();

  // Generate unique ID
  const timestamp = Date.now().toString(36);
  const hookId = `external_${params.event}_${timestamp}_${params.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

  // Create hook definition
  const hookDef: ExternalHookDefinition = {
    id: hookId,
    name: params.name,
    description: `External hook: ${params.command.substring(0, 50)}...`,
    eventType: params.event as HookEventType,
    command: params.command,
    timeoutMs: params.timeout_ms || 30000,
    priority: (params.priority as HookPriority) || 'normal',
    enabled: true,
    toolPattern: params.pattern,
    expertPattern: params.pattern
  };

  // Register the hook
  registerExternalHook(hookDef);

  logger.info({
    hookId,
    event: params.event,
    command: params.command.substring(0, 50)
  }, 'External hook added');

  // Save to config file if requested
  let savedToConfig = false;
  if (params.save_to_config !== false) {
    try {
      const config = loadHookConfig();
      if (!config.externalHooks) {
        config.externalHooks = {};
      }
      if (!config.externalHooks[params.event as HookEventType]) {
        config.externalHooks[params.event as HookEventType] = [];
      }
      config.externalHooks[params.event as HookEventType]!.push({
        name: params.name,
        command: params.command,
        timeoutMs: params.timeout_ms,
        pattern: params.pattern,
        priority: params.priority as HookPriority
      });
      savedToConfig = saveHookConfig(config);
    } catch (error) {
      logger.warn({ error }, 'Failed to save external hook to config');
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ 외부 훅 추가됨

**Hook ID**: \`${hookId}\`
**이름**: ${params.name}
**이벤트**: ${params.event}
**명령어**: \`${params.command.length > 50 ? params.command.substring(0, 50) + '...' : params.command}\`
**타임아웃**: ${params.timeout_ms || 30000}ms
**우선순위**: ${params.priority || 'normal'}
${params.pattern ? `**패턴**: ${params.pattern}` : ''}
**설정 파일 저장**: ${savedToConfig ? '✅ 저장됨' : '❌ 저장 안됨'}

이제 \`${params.event}\` 이벤트 발생 시 명령어가 실행됩니다.`
    }]
  };
}

/**
 * Handles external_hook_remove tool invocation.
 */
export async function handleExternalHookRemove(
  params: z.infer<typeof externalHookRemoveSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();

  // Check if hook exists
  const hooks = manager.getRegisteredHooks();
  const existingHook = hooks.external.find(h => h.id === params.hook_id);

  if (!existingHook) {
    return {
      content: [{
        type: 'text' as const,
        text: `## ❌ 훅을 찾을 수 없음

Hook ID \`${params.hook_id}\`가 존재하지 않습니다.

\`external_hook_list\` 또는 \`hook_status include_hooks=true\`로 등록된 훅을 확인하세요.`
      }]
    };
  }

  // Unregister the hook
  const success = manager.unregisterHook(params.hook_id);

  logger.info({ hookId: params.hook_id }, 'External hook removed');

  // Remove from config file if requested
  let removedFromConfig = false;
  if (params.save_to_config !== false) {
    try {
      const config = loadHookConfig();
      if (config.externalHooks) {
        // Search and remove by name/command matching
        for (const eventType of Object.keys(config.externalHooks) as HookEventType[]) {
          const hooksForEvent = config.externalHooks[eventType];
          if (hooksForEvent) {
            const index = hooksForEvent.findIndex(
              h => h.name === existingHook.name && h.command === existingHook.command
            );
            if (index !== -1) {
              hooksForEvent.splice(index, 1);
              removedFromConfig = true;
              break;
            }
          }
        }
        if (removedFromConfig) {
          saveHookConfig(config);
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to remove external hook from config');
    }
  }

  return {
    content: [{
      type: 'text' as const,
      text: `## ✅ 외부 훅 삭제됨

**Hook ID**: \`${params.hook_id}\`
**이름**: ${existingHook.name}
**설정 파일에서 삭제**: ${removedFromConfig ? '✅ 삭제됨' : '❌ 삭제 안됨'}`
    }]
  };
}

/**
 * Handles external_hook_list tool invocation.
 */
export async function handleExternalHookList(
  params: z.infer<typeof externalHookListSchema>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const manager = getHookManager();
  const hooks = manager.getRegisteredHooks();
  const stats = manager.getStats();

  // Filter by event if specified
  let filteredHooks = hooks.external;
  if (params.event_filter && params.event_filter !== 'all') {
    filteredHooks = hooks.external.filter(h => h.eventType === params.event_filter);
  }

  if (filteredHooks.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: `## 📋 등록된 외부 훅 없음

${params.event_filter && params.event_filter !== 'all'
  ? `이벤트 \`${params.event_filter}\`에 등록된 외부 훅이 없습니다.`
  : '등록된 외부 훅이 없습니다.'}

\`external_hook_add\`로 새 훅을 추가하세요.

### 사용 가능한 이벤트 타입
${VALID_EVENT_TYPES.map(e => `- \`${e}\``).join('\n')}`
      }]
    };
  }

  let output = `## 📋 등록된 외부 훅 (${filteredHooks.length}개)\n\n`;

  for (const hook of filteredHooks) {
    const hookStats = stats.get(hook.id);

    output += `### ${hook.name}\n`;
    output += `| 항목 | 값 |\n`;
    output += `|------|-----|\n`;
    output += `| ID | \`${hook.id}\` |\n`;
    output += `| 이벤트 | ${hook.eventType} |\n`;
    output += `| 명령어 | \`${hook.command.length > 40 ? hook.command.substring(0, 40) + '...' : hook.command}\` |\n`;
    output += `| 타임아웃 | ${hook.timeoutMs || 30000}ms |\n`;
    output += `| 우선순위 | ${hook.priority} |\n`;
    output += `| 상태 | ${hook.enabled ? '✅ 활성' : '❌ 비활성'} |\n`;
    if (hook.toolPattern) {
      output += `| 패턴 | ${hook.toolPattern} |\n`;
    }
    if (hookStats && hookStats.totalExecutions > 0) {
      output += `| 실행 횟수 | ${hookStats.totalExecutions} (성공: ${hookStats.successfulExecutions}, 실패: ${hookStats.failedExecutions}) |\n`;
    }
    output += '\n';
  }

  return {
    content: [{
      type: 'text' as const,
      text: output
    }]
  };
}

export default {
  hookStatusTool,
  hookStatusSchema,
  handleHookStatus,
  hookToggleTool,
  hookToggleSchema,
  handleHookToggle,
  hookSystemToggleTool,
  hookSystemToggleSchema,
  handleHookSystemToggle,
  externalHookAddTool,
  externalHookAddSchema,
  handleExternalHookAdd,
  externalHookRemoveTool,
  externalHookRemoveSchema,
  handleExternalHookRemove,
  externalHookListTool,
  externalHookListSchema,
  handleExternalHookList
};
