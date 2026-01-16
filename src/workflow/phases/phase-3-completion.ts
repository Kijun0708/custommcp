// src/workflow/phases/phase-3-completion.ts

/**
 * Phase 3: Completion
 *
 * Final phase that:
 * - Summarizes the workflow execution
 * - Verifies the outcome meets requirements
 * - Provides final output to the user
 * - Records metrics for future optimization
 */

import {
  PhaseHandler,
  PhaseResult,
  WorkflowContext,
  WorkflowResult,
  PhaseId
} from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Calculates workflow metrics from context.
 */
function calculateMetrics(context: WorkflowContext): {
  totalTimeMs: number;
  phaseBreakdown: Record<PhaseId, number>;
  successRate: number;
} {
  const totalTimeMs = Date.now() - context.startTime;

  const phaseBreakdown: Record<string, number> = {};
  let successCount = 0;

  for (const entry of context.phaseHistory) {
    const duration = entry.endTime - entry.startTime;
    phaseBreakdown[entry.phaseId] = (phaseBreakdown[entry.phaseId] || 0) + duration;
    if (entry.success) successCount++;
  }

  const successRate = context.phaseHistory.length > 0
    ? successCount / context.phaseHistory.length
    : 0;

  return {
    totalTimeMs,
    phaseBreakdown: phaseBreakdown as Record<PhaseId, number>,
    successRate
  };
}

/**
 * Builds the final summary based on workflow outcome.
 */
function buildFinalSummary(context: WorkflowContext, success: boolean): string {
  const {
    originalRequest,
    intent,
    complexity,
    implementationAttempts,
    escalationRequired,
    relevantFiles,
    phaseHistory
  } = context;

  const metrics = calculateMetrics(context);
  const phasesExecuted = [...new Set(phaseHistory.map(p => p.phaseId))];

  let summary = `## Workflow ${success ? 'Completed' : 'Ended'} ${success ? '✓' : '⚠️'}

### Request
${originalRequest.substring(0, 300)}${originalRequest.length > 300 ? '...' : ''}

### Classification
- **Intent**: ${intent || 'Not classified'}
- **Complexity**: ${complexity || 'Not assessed'}

### Execution Summary
- **Total Time**: ${(metrics.totalTimeMs / 1000).toFixed(2)}s
- **Phases Executed**: ${phasesExecuted.join(' → ')}
- **Implementation Attempts**: ${implementationAttempts}
- **Escalated**: ${escalationRequired ? 'Yes' : 'No'}

### Phase Timing
`;

  for (const phase of phasesExecuted) {
    const timeMs = metrics.phaseBreakdown[phase] || 0;
    summary += `- ${phase}: ${timeMs}ms\n`;
  }

  if (relevantFiles && relevantFiles.length > 0) {
    summary += `\n### Files Involved\n`;
    for (const file of relevantFiles.slice(0, 10)) {
      summary += `- \`${file}\`\n`;
    }
    if (relevantFiles.length > 10) {
      summary += `... and ${relevantFiles.length - 10} more\n`;
    }
  }

  return summary;
}

/**
 * Determines overall workflow success.
 */
function determineSuccess(context: WorkflowContext): boolean {
  // Check if escalation was required
  if (context.escalationRequired) {
    return false;
  }

  // Check if we exceeded max attempts
  if (context.implementationAttempts >= context.maxAttempts) {
    return false;
  }

  // Check phase history for failures in critical phases
  const criticalPhases: PhaseId[] = ['implementation'];
  const criticalFailures = context.phaseHistory.filter(
    p => criticalPhases.includes(p.phaseId) && !p.success
  );

  // If the last implementation attempt succeeded, we're good
  const lastImplementation = [...context.phaseHistory]
    .reverse()
    .find(p => p.phaseId === 'implementation');

  if (lastImplementation && lastImplementation.success) {
    return true;
  }

  // For non-implementation tasks (conceptual, research), check if we got output
  if (context.intent === 'conceptual' || context.intent === 'research') {
    return context.phaseHistory.some(p =>
      (p.phaseId === 'assessment' || p.phaseId === 'exploration') && p.success
    );
  }

  return criticalFailures.length === 0;
}

/**
 * Phase 3 handler: Completion
 */
export const phase3Completion: PhaseHandler = {
  phaseId: 'completion',

  async execute(context: WorkflowContext): Promise<PhaseResult> {
    logger.info({
      attempts: context.implementationAttempts,
      escalated: context.escalationRequired,
      phaseCount: context.phaseHistory.length
    }, 'Entering completion phase');

    const success = determineSuccess(context);
    const summary = buildFinalSummary(context, success);

    // Log completion metrics
    const metrics = calculateMetrics(context);
    logger.info({
      success,
      totalTimeMs: metrics.totalTimeMs,
      successRate: metrics.successRate,
      intent: context.intent,
      complexity: context.complexity,
      attempts: context.implementationAttempts
    }, 'Workflow completed');

    return {
      phaseId: 'completion',
      success,
      output: summary,
      nextPhase: undefined,  // End of workflow
      metadata: {
        totalTimeMs: metrics.totalTimeMs,
        phaseBreakdown: metrics.phaseBreakdown,
        successRate: metrics.successRate
      }
    };
  }
};

/**
 * Converts workflow context to final result.
 */
export function contextToResult(
  context: WorkflowContext,
  finalOutput: string,
  success: boolean
): WorkflowResult {
  const metrics = calculateMetrics(context);
  const phasesExecuted = [...new Set(context.phaseHistory.map(p => p.phaseId))];

  return {
    success,
    output: finalOutput,
    intent: context.intent,
    complexity: context.complexity,
    phasesExecuted,
    totalTimeMs: metrics.totalTimeMs,
    attemptsMade: context.implementationAttempts,
    escalated: context.escalationRequired || false,
    metadata: {
      relevantFiles: context.relevantFiles,
      recoveryActions: context.recoveryActions,
      phaseBreakdown: metrics.phaseBreakdown
    }
  };
}

export default phase3Completion;
