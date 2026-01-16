/**
 * 7-Section Delegation Template
 *
 * Based on oh-my-opencode's Sisyphus delegation prompt structure.
 * Ensures consistent, unambiguous task delegation to experts.
 */

import { ToolRestriction } from './tool-restrictions.js';

/**
 * Complete delegation prompt structure with 7 mandatory sections.
 * Every delegation to an expert must include all sections.
 */
export interface DelegationPrompt {
  /** TASK: Atomic, specific goal - one clear action per delegation */
  task: string;

  /** EXPECTED OUTCOME: Concrete deliverables with measurable success criteria */
  expectedOutcome: string;

  /** CONTEXT: File paths, existing patterns, relevant background information */
  context: string;

  /** CONSTRAINTS: Hard limits and requirements that must be respected */
  constraints: string[];

  /** TOOLS: Explicit whitelist/blacklist of allowed tools */
  tools: ToolRestriction;

  /** RESPONSE FORMAT: Expected structure of the response */
  responseFormat: string;

  /** EXIT CONDITIONS: Clear criteria for when the task is complete */
  exitConditions: string[];
}

/**
 * Builds a formatted delegation prompt string from structured params.
 *
 * @example
 * ```typescript
 * const prompt = buildDelegationPrompt({
 *   task: 'Analyze the authentication flow',
 *   expectedOutcome: 'A summary of auth implementation with file locations',
 *   context: 'User reported login issues',
 *   constraints: ['Do not modify any files', 'Focus on JWT handling'],
 *   tools: READ_ONLY_TOOLS,
 *   responseFormat: 'Markdown with code snippets',
 *   exitConditions: ['All auth files identified', 'Flow diagram provided']
 * });
 * ```
 */
export function buildDelegationPrompt(params: DelegationPrompt): string {
  const toolsSection = buildToolsSection(params.tools);

  return `
## TASK
${params.task}

## EXPECTED OUTCOME
${params.expectedOutcome}

## CONTEXT
${params.context}

## CONSTRAINTS
${params.constraints.map(c => `- ${c}`).join('\n')}

## TOOLS
${toolsSection}

## RESPONSE FORMAT
${params.responseFormat}

## EXIT CONDITIONS
${params.exitConditions.map(c => `- ${c}`).join('\n')}
`.trim();
}

/**
 * Builds the TOOLS section with allowed/forbidden lists and rationale.
 */
function buildToolsSection(tools: ToolRestriction): string {
  const allowed = tools.allowed.length > 0
    ? tools.allowed.join(', ')
    : 'None specified';

  const forbidden = tools.forbidden.length > 0
    ? tools.forbidden.join(', ')
    : 'None';

  return `### ALLOWED
${allowed}

### FORBIDDEN
${forbidden}

### RATIONALE
${tools.rationale}`;
}

/**
 * Partial delegation prompt for simpler use cases.
 * Only task and expectedOutcome are required.
 */
export interface SimpleDelegationPrompt {
  task: string;
  expectedOutcome: string;
  context?: string;
  constraints?: string[];
}

/**
 * Builds a simplified delegation prompt without full structure.
 * Use for quick, low-complexity delegations.
 */
export function buildSimpleDelegation(params: SimpleDelegationPrompt): string {
  let prompt = `## TASK\n${params.task}\n\n## EXPECTED OUTCOME\n${params.expectedOutcome}`;

  if (params.context) {
    prompt += `\n\n## CONTEXT\n${params.context}`;
  }

  if (params.constraints && params.constraints.length > 0) {
    prompt += `\n\n## CONSTRAINTS\n${params.constraints.map(c => `- ${c}`).join('\n')}`;
  }

  return prompt;
}

/**
 * Pre-declaration template for sisyphus_task calls.
 * Forces explicit reasoning before delegation.
 */
export interface PreDelegationDeclaration {
  /** Category or Agent to use */
  target: string;
  /** Why this choice fits the task */
  reason: string;
  /** Skills to invoke (if any) */
  skills: string[];
  /** What success looks like */
  expectedOutcome: string;
}

/**
 * Builds a pre-delegation declaration block.
 * MANDATORY before every delegation call.
 */
export function buildPreDelegationDeclaration(decl: PreDelegationDeclaration): string {
  const skillsStr = decl.skills.length > 0
    ? decl.skills.join(', ')
    : 'None';

  return `
I will use delegation with:
- **Category/Agent**: ${decl.target}
- **Reason**: ${decl.reason}
- **Skills**: ${skillsStr}
- **Expected Outcome**: ${decl.expectedOutcome}
`.trim();
}

/**
 * Validates that a delegation prompt has all required fields.
 */
export function validateDelegationPrompt(prompt: Partial<DelegationPrompt>): string[] {
  const errors: string[] = [];

  if (!prompt.task || prompt.task.trim() === '') {
    errors.push('TASK is required and cannot be empty');
  }

  if (!prompt.expectedOutcome || prompt.expectedOutcome.trim() === '') {
    errors.push('EXPECTED OUTCOME is required and cannot be empty');
  }

  if (!prompt.context || prompt.context.trim() === '') {
    errors.push('CONTEXT is required - provide relevant background information');
  }

  if (!prompt.constraints || prompt.constraints.length === 0) {
    errors.push('CONSTRAINTS should include at least one constraint or "None"');
  }

  if (!prompt.tools) {
    errors.push('TOOLS restriction must be specified');
  }

  if (!prompt.responseFormat || prompt.responseFormat.trim() === '') {
    errors.push('RESPONSE FORMAT is required - specify expected output structure');
  }

  if (!prompt.exitConditions || prompt.exitConditions.length === 0) {
    errors.push('EXIT CONDITIONS must include at least one success criterion');
  }

  return errors;
}
