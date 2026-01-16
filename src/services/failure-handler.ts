// src/services/failure-handler.ts

/**
 * Failure Handler Service
 *
 * Implements the 3-strike escalation protocol for handling expert call failures.
 * Based on oh-my-opencode's recovery pattern.
 *
 * Strike Protocol:
 * 1. First failure: Retry with same expert, potentially modified approach
 * 2. Second failure: Switch to fallback expert
 * 3. Third failure: Escalate to user with detailed report
 */

import { FALLBACK_CHAIN, experts } from '../experts/index.js';
import { logger } from '../utils/logger.js';
import { isRateLimitError } from '../utils/rate-limit.js';

/**
 * Failure types that can be identified.
 */
export type FailureType =
  | 'rate_limit'
  | 'timeout'
  | 'auth_error'
  | 'model_error'
  | 'content_filter'
  | 'invalid_response'
  | 'network_error'
  | 'unknown';

/**
 * Recovery action recommendations.
 */
export type RecoveryAction =
  | 'retry'
  | 'retry_modified'
  | 'switch_expert'
  | 'escalate'
  | 'abort';

/**
 * Failure analysis result.
 */
export interface FailureAnalysis {
  type: FailureType;
  message: string;
  recoverable: boolean;
  suggestedAction: RecoveryAction;
  retryDelayMs?: number;
  alternateExpert?: string;
}

/**
 * Escalation report structure.
 */
export interface EscalationReport {
  originalRequest: string;
  expertsTried: string[];
  failureHistory: FailureRecord[];
  recommendations: string[];
  canContinue: boolean;
}

/**
 * Record of a single failure.
 */
export interface FailureRecord {
  expertId: string;
  attemptNumber: number;
  timestamp: Date;
  failureType: FailureType;
  errorMessage: string;
  actionTaken: RecoveryAction;
}

/**
 * Failure context for tracking across attempts.
 */
export interface FailureContext {
  originalRequest: string;
  currentExpert: string;
  attemptCount: number;
  maxAttempts: number;
  failureHistory: FailureRecord[];
  lastError?: Error;
}

/**
 * Error patterns for classification.
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  type: FailureType;
  recoverable: boolean;
  action: RecoveryAction;
}> = [
  {
    pattern: /rate\s*limit|429|too\s*many\s*requests|quota/i,
    type: 'rate_limit',
    recoverable: true,
    action: 'switch_expert'
  },
  {
    pattern: /timeout|timed?\s*out|deadline|ETIMEDOUT/i,
    type: 'timeout',
    recoverable: true,
    action: 'retry'
  },
  {
    pattern: /401|403|unauthorized|forbidden|auth|permission/i,
    type: 'auth_error',
    recoverable: false,
    action: 'escalate'
  },
  {
    pattern: /model.*not\s*found|invalid\s*model|unsupported\s*model/i,
    type: 'model_error',
    recoverable: true,
    action: 'switch_expert'
  },
  {
    pattern: /content\s*filter|safety|blocked|harmful/i,
    type: 'content_filter',
    recoverable: true,
    action: 'retry_modified'
  },
  {
    pattern: /invalid.*response|parse\s*error|malformed|JSON/i,
    type: 'invalid_response',
    recoverable: true,
    action: 'retry'
  },
  {
    pattern: /network|ECONNREFUSED|ENOTFOUND|socket|connection/i,
    type: 'network_error',
    recoverable: true,
    action: 'retry'
  }
];

/**
 * Analyzes a failure and provides recommendations.
 */
export function analyzeFailure(
  error: Error | string,
  context: FailureContext
): FailureAnalysis {
  const errorMessage = typeof error === 'string' ? error : error.message;

  // Find matching pattern
  for (const { pattern, type, recoverable, action } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return buildAnalysis(type, errorMessage, recoverable, action, context);
    }
  }

  // Default to unknown
  return buildAnalysis('unknown', errorMessage, true, 'retry', context);
}

/**
 * Builds a failure analysis result.
 */
function buildAnalysis(
  type: FailureType,
  message: string,
  recoverable: boolean,
  defaultAction: RecoveryAction,
  context: FailureContext
): FailureAnalysis {
  // Adjust action based on attempt count
  let suggestedAction = defaultAction;

  if (context.attemptCount >= context.maxAttempts) {
    suggestedAction = 'escalate';
    recoverable = false;
  } else if (context.attemptCount >= 2 && suggestedAction !== 'escalate') {
    // After 2 attempts, prefer switching expert
    suggestedAction = 'switch_expert';
  }

  // Find alternate expert if needed
  let alternateExpert: string | undefined;
  if (suggestedAction === 'switch_expert') {
    const fallbacks = FALLBACK_CHAIN[context.currentExpert] || [];
    const triedExperts = context.failureHistory.map(f => f.expertId);
    alternateExpert = fallbacks.find(e => !triedExperts.includes(e));

    if (!alternateExpert) {
      // No more fallbacks available
      suggestedAction = 'escalate';
      recoverable = false;
    }
  }

  // Calculate retry delay
  let retryDelayMs: number | undefined;
  if (suggestedAction === 'retry' || suggestedAction === 'retry_modified') {
    retryDelayMs = calculateRetryDelay(type, context.attemptCount);
  }

  return {
    type,
    message,
    recoverable,
    suggestedAction,
    retryDelayMs,
    alternateExpert
  };
}

/**
 * Calculates retry delay with exponential backoff.
 */
function calculateRetryDelay(type: FailureType, attemptNumber: number): number {
  const baseDelay = type === 'rate_limit' ? 5000 : 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);

  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Records a failure in the context.
 */
export function recordFailure(
  context: FailureContext,
  analysis: FailureAnalysis
): void {
  const record: FailureRecord = {
    expertId: context.currentExpert,
    attemptNumber: context.attemptCount,
    timestamp: new Date(),
    failureType: analysis.type,
    errorMessage: analysis.message,
    actionTaken: analysis.suggestedAction
  };

  context.failureHistory.push(record);

  logger.warn({
    expertId: context.currentExpert,
    attempt: context.attemptCount,
    failureType: analysis.type,
    action: analysis.suggestedAction
  }, 'Failure recorded');
}

/**
 * Generates an escalation report for user intervention.
 */
export function generateEscalationReport(context: FailureContext): EscalationReport {
  const expertsTried = [...new Set(context.failureHistory.map(f => f.expertId))];

  const recommendations: string[] = [];

  // Analyze failure patterns
  const failureTypes = context.failureHistory.map(f => f.failureType);

  if (failureTypes.includes('rate_limit')) {
    recommendations.push('Wait a few minutes before retrying - rate limits may have been hit');
  }

  if (failureTypes.includes('auth_error')) {
    recommendations.push('Check authentication status with auth_status tool');
  }

  if (failureTypes.includes('content_filter')) {
    recommendations.push('Rephrase the request to avoid triggering content filters');
  }

  if (failureTypes.includes('timeout')) {
    recommendations.push('Try breaking down the request into smaller parts');
  }

  // General recommendations
  recommendations.push('Try using a different expert directly');
  recommendations.push('Simplify the request');
  recommendations.push('Provide more specific context');

  return {
    originalRequest: context.originalRequest,
    expertsTried,
    failureHistory: context.failureHistory,
    recommendations,
    canContinue: false
  };
}

/**
 * Formats escalation report as markdown.
 */
export function formatEscalationReport(report: EscalationReport): string {
  let output = `## ⚠️ Escalation Required

### Original Request
${report.originalRequest.substring(0, 500)}${report.originalRequest.length > 500 ? '...' : ''}

### Experts Tried
${report.expertsTried.map(e => `- ${e}`).join('\n')}

### Failure History
`;

  for (const failure of report.failureHistory) {
    output += `
**Attempt ${failure.attemptNumber}** (${failure.expertId})
- Type: ${failure.failureType}
- Error: ${failure.errorMessage.substring(0, 200)}
- Action: ${failure.actionTaken}
- Time: ${failure.timestamp.toISOString()}
`;
  }

  output += `
### Recommendations
${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### What You Can Do
- Use \`consult_expert\` to try a specific expert directly
- Use \`llm_router_health\` to check system status
- Check \`auth_status\` if authentication issues were detected
`;

  return output;
}

/**
 * Creates a new failure context.
 */
export function createFailureContext(
  originalRequest: string,
  initialExpert: string,
  maxAttempts: number = 3
): FailureContext {
  return {
    originalRequest,
    currentExpert: initialExpert,
    attemptCount: 0,
    maxAttempts,
    failureHistory: []
  };
}

/**
 * Updates context for a new attempt.
 */
export function prepareNextAttempt(
  context: FailureContext,
  analysis: FailureAnalysis
): void {
  context.attemptCount++;

  if (analysis.alternateExpert) {
    context.currentExpert = analysis.alternateExpert;
  }
}

/**
 * Checks if context indicates escalation is needed.
 */
export function shouldEscalate(context: FailureContext): boolean {
  return context.attemptCount >= context.maxAttempts;
}

/**
 * Gets the next expert to try based on context.
 */
export function getNextExpert(context: FailureContext): string | null {
  const fallbacks = FALLBACK_CHAIN[context.currentExpert] || [];
  const triedExperts = context.failureHistory.map(f => f.expertId);

  return fallbacks.find(e => !triedExperts.includes(e)) || null;
}

export default {
  analyzeFailure,
  recordFailure,
  generateEscalationReport,
  formatEscalationReport,
  createFailureContext,
  prepareNextAttempt,
  shouldEscalate,
  getNextExpert
};
