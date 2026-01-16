// src/workflow/phases/phase-2c-recovery.ts

/**
 * Phase 2C: Recovery
 *
 * Handles failures from the implementation phase using a 3-strike protocol:
 *
 * Strike 1: Retry with the same expert (different approach)
 * Strike 2: Switch to a fallback expert
 * Strike 3: Escalate to user with detailed failure report
 *
 * Based on oh-my-opencode's failure recovery pattern.
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  RecoveryAction,
  RecoveryStrategy
} from '../types.js';
import { experts, FALLBACK_CHAIN } from '../../experts/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Error patterns and their suggested recovery actions.
 */
const ERROR_RECOVERY_MAP: Array<{
  pattern: RegExp;
  action: RecoveryAction;
  reason: string;
}> = [
  {
    pattern: /rate\s*limit|too\s*many\s*requests|429/i,
    action: 'switch_expert',
    reason: 'Rate limit exceeded, switching to fallback expert'
  },
  {
    pattern: /timeout|timed?\s*out/i,
    action: 'retry_same_expert',
    reason: 'Request timed out, retrying with simplified request'
  },
  {
    pattern: /unclear|ambiguous|not\s*sure|need\s*more\s*info/i,
    action: 'request_clarification',
    reason: 'Request needs clarification from user'
  },
  {
    pattern: /cannot|unable|impossible|not\s*possible/i,
    action: 'switch_expert',
    reason: 'Expert cannot handle request, trying alternative'
  },
  {
    pattern: /error|failed|exception/i,
    action: 'retry_same_expert',
    reason: 'Execution error, retrying'
  }
];

/**
 * Analyzes the failure and determines recovery strategy.
 */
function analyzeFailure(context: WorkflowContext): RecoveryStrategy {
  const { lastError, implementationAttempts, lastExpertUsed, maxAttempts } = context;
  const error = lastError || '';

  // Check if we've exhausted attempts
  if (implementationAttempts >= maxAttempts) {
    return {
      action: 'escalate_to_user',
      reason: `Maximum attempts (${maxAttempts}) reached. Escalating to user.`
    };
  }

  // First attempt failure - try same expert with different approach
  if (implementationAttempts === 1) {
    // Check for specific error patterns
    for (const { pattern, action, reason } of ERROR_RECOVERY_MAP) {
      if (pattern.test(error)) {
        if (action === 'switch_expert' && lastExpertUsed) {
          const fallbacks = FALLBACK_CHAIN[lastExpertUsed] || [];
          if (fallbacks.length > 0) {
            return {
              action: 'switch_expert',
              reason,
              newExpert: fallbacks[0]
            };
          }
        }
        return { action, reason };
      }
    }

    // Default: retry with same expert
    return {
      action: 'retry_same_expert',
      reason: 'First attempt failed, retrying with adjusted approach'
    };
  }

  // Second attempt failure - switch expert
  if (implementationAttempts === 2 && lastExpertUsed) {
    const fallbacks = FALLBACK_CHAIN[lastExpertUsed] || [];
    if (fallbacks.length > 0) {
      return {
        action: 'switch_expert',
        reason: 'Second attempt failed, switching to fallback expert',
        newExpert: fallbacks[0]
      };
    }
  }

  // Third attempt or no fallbacks - escalate
  return {
    action: 'escalate_to_user',
    reason: 'Multiple attempts failed, user intervention required'
  };
}

/**
 * Simplifies the original request for retry.
 */
function simplifyRequest(originalRequest: string): string {
  // Remove excessive details, focus on core ask
  const simplified = originalRequest
    .split(/[.!?]/)  // Split into sentences
    .slice(0, 2)      // Take first 2 sentences
    .join('. ')
    .trim();

  return simplified.length > 0 ? simplified : originalRequest.substring(0, 200);
}

/**
 * Builds escalation report for user.
 */
function buildEscalationReport(context: WorkflowContext): string {
  const {
    originalRequest,
    intent,
    complexity,
    implementationAttempts,
    lastError,
    recoveryActions,
    phaseHistory
  } = context;

  let report = `## ⚠️ Escalation Required

### Original Request
${originalRequest}

### Classification
- **Intent**: ${intent}
- **Complexity**: ${complexity}

### Attempts Made: ${implementationAttempts}

### Failure History
`;

  // Add recovery actions taken
  if (recoveryActions && recoveryActions.length > 0) {
    report += `\n**Recovery Actions Taken**:\n`;
    recoveryActions.forEach((action, i) => {
      report += `${i + 1}. ${action}\n`;
    });
  }

  // Add phase history
  if (phaseHistory && phaseHistory.length > 0) {
    report += `\n**Phase History**:\n`;
    for (const entry of phaseHistory) {
      const duration = entry.endTime - entry.startTime;
      const status = entry.success ? '✓' : '✗';
      report += `- ${status} ${entry.phaseId} (${duration}ms)`;
      if (entry.error) {
        report += ` - ${entry.error.substring(0, 100)}`;
      }
      report += '\n';
    }
  }

  // Add last error
  if (lastError) {
    report += `\n### Last Error\n\`\`\`\n${lastError}\n\`\`\`\n`;
  }

  report += `
### Recommended Actions
1. Provide more specific requirements
2. Break down the task into smaller steps
3. Manually review the identified files
4. Try a different approach

### Identified Files
${context.relevantFiles?.map(f => `- ${f}`).join('\n') || 'None identified'}
`;

  return report;
}

/**
 * Phase 2C handler: Recovery
 */
export const phase2cRecovery: PhaseHandler = {
  phaseId: 'recovery',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    logger.info({
      attempts: context.implementationAttempts,
      lastError: context.lastError,
      lastExpert: context.lastExpertUsed
    }, 'Entering recovery phase');

    // Initialize recovery actions tracking
    if (!context.recoveryActions) {
      context.recoveryActions = [];
    }

    // Analyze failure and determine strategy
    const strategy = analyzeFailure(context);
    context.recoveryActions.push(`${strategy.action}: ${strategy.reason}`);

    logger.info({ strategy }, 'Recovery strategy determined');

    switch (strategy.action) {
      case 'retry_same_expert':
        return {
          phaseId: 'recovery',
          success: true,
          output: buildRecoveryOutput(strategy, context),
          nextPhase: 'implementation',
          metadata: { strategy: strategy.action }
        };

      case 'switch_expert':
        if (strategy.newExpert) {
          // Track the switch for next implementation attempt
          context.lastExpertUsed = undefined;  // Reset so implementation picks new expert
        }
        return {
          phaseId: 'recovery',
          success: true,
          output: buildRecoveryOutput(strategy, context),
          nextPhase: 'implementation',
          metadata: {
            strategy: strategy.action,
            newExpert: strategy.newExpert
          }
        };

      case 'simplify_request':
        context.originalRequest = simplifyRequest(context.originalRequest);
        return {
          phaseId: 'recovery',
          success: true,
          output: buildRecoveryOutput(strategy, context),
          nextPhase: 'implementation',
          metadata: { strategy: strategy.action }
        };

      case 'request_clarification':
      case 'escalate_to_user':
        context.escalationRequired = true;
        return {
          phaseId: 'recovery',
          success: false,  // Recovery couldn't resolve automatically
          output: buildEscalationReport(context),
          nextPhase: 'completion',
          metadata: {
            strategy: strategy.action,
            escalated: true
          }
        };

      default:
        return {
          phaseId: 'recovery',
          success: false,
          output: 'Unknown recovery strategy',
          nextPhase: 'completion'
        };
    }
  }
};

/**
 * Builds recovery output summary.
 */
function buildRecoveryOutput(strategy: RecoveryStrategy, context: WorkflowContext): string {
  return `## Phase 2C: Recovery

**Strategy**: ${strategy.action.replace(/_/g, ' ')}
**Reason**: ${strategy.reason}
${strategy.newExpert ? `**New Expert**: ${strategy.newExpert}` : ''}

**Attempt**: ${context.implementationAttempts} / ${context.maxAttempts}

**Recovery Actions So Far**:
${context.recoveryActions?.map((a, i) => `${i + 1}. ${a}`).join('\n') || 'None'}

**Next Phase**: ${strategy.action === 'escalate_to_user' ? 'Completion (with escalation)' : 'Implementation (retry)'}`;
}

export default phase2cRecovery;
