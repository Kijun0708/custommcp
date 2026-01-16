// src/services/delegation-builder.ts

/**
 * Delegation Builder Service
 *
 * Provides a fluent API for constructing 7-section delegation prompts.
 * Based on oh-my-opencode's structured task delegation pattern.
 *
 * @example
 * ```typescript
 * const prompt = new DelegationBuilder()
 *   .task("Implement user authentication")
 *   .expectedOutcome("Working login/logout with JWT tokens")
 *   .context("React frontend with Express backend")
 *   .addConstraint("Use existing User model")
 *   .addConstraint("Follow REST conventions")
 *   .tools(READ_ONLY_TOOLS)
 *   .responseFormat("## Implementation\n...")
 *   .addExitCondition("Tests pass")
 *   .build();
 * ```
 */

import { DelegationPrompt, buildDelegationPrompt } from '../prompts/base/delegation-template.js';
import { ToolRestriction, READ_ONLY_TOOLS, FULL_TOOLS, EXPLORATION_TOOLS } from '../prompts/base/tool-restrictions.js';
import { IntentType, ComplexityLevel } from '../workflow/types.js';

/**
 * Preset configurations for common delegation scenarios.
 */
export interface DelegationPreset {
  name: string;
  tools: ToolRestriction;
  defaultConstraints: string[];
  responseFormat: string;
  exitConditions: string[];
}

/**
 * Built-in presets for different task types.
 */
export const DELEGATION_PRESETS: Record<string, DelegationPreset> = {
  research: {
    name: 'Research Task',
    tools: READ_ONLY_TOOLS,
    defaultConstraints: [
      'Do not modify any files',
      'Verify information accuracy',
      'Include source references'
    ],
    responseFormat: `## Findings
Key discoveries and insights

## Evidence
Code references with file paths and line numbers

## Recommendations
Suggested next steps based on findings`,
    exitConditions: [
      'Question fully answered',
      'All relevant sources checked',
      'Evidence provided for claims'
    ]
  },

  implementation: {
    name: 'Implementation Task',
    tools: FULL_TOOLS,
    defaultConstraints: [
      'Follow existing code patterns',
      'Write testable code',
      'Handle edge cases appropriately'
    ],
    responseFormat: `## Approach
Brief description of implementation strategy

## Changes
List of files modified with descriptions

## Code
Implementation details

## Testing
How to verify the changes work`,
    exitConditions: [
      'Code compiles without errors',
      'Feature works as requested',
      'No regressions introduced'
    ]
  },

  review: {
    name: 'Code Review Task',
    tools: READ_ONLY_TOOLS,
    defaultConstraints: [
      'Be objective and constructive',
      'Prioritize by severity',
      'Suggest specific improvements'
    ],
    responseFormat: `## Summary
Overall assessment

## Critical Issues
Must fix - security, correctness, data loss risks

## High Priority
Should fix - performance, maintainability

## Medium Priority
Consider fixing - code quality, conventions

## Low Priority
Nice to have - style, minor improvements`,
    exitConditions: [
      'All code reviewed',
      'Issues categorized by severity',
      'Actionable recommendations provided'
    ]
  },

  debugging: {
    name: 'Debugging Task',
    tools: FULL_TOOLS,
    defaultConstraints: [
      'Preserve existing functionality',
      'Add regression prevention',
      'Document root cause'
    ],
    responseFormat: `## Root Cause
What caused the issue

## Analysis
How the problem was identified

## Fix
The solution implemented

## Prevention
How to prevent similar issues`,
    exitConditions: [
      'Bug is fixed',
      'Root cause identified',
      'No new issues introduced'
    ]
  },

  exploration: {
    name: 'Exploration Task',
    tools: EXPLORATION_TOOLS,
    defaultConstraints: [
      'Search thoroughly',
      'Report all findings',
      'Organize results clearly'
    ],
    responseFormat: `## Search Results
Files and patterns found

## Structure
How the code is organized

## Key Components
Main files and their purposes`,
    exitConditions: [
      'Search completed',
      'Results organized',
      'Key findings highlighted'
    ]
  }
};

/**
 * Fluent builder for delegation prompts.
 */
export class DelegationBuilder {
  private _task: string = '';
  private _expectedOutcome: string = '';
  private _context: string = '';
  private _constraints: string[] = [];
  private _tools: ToolRestriction = READ_ONLY_TOOLS;
  private _responseFormat: string = '';
  private _exitConditions: string[] = [];

  /**
   * Sets the main task description.
   */
  task(description: string): this {
    this._task = description;
    return this;
  }

  /**
   * Sets the expected outcome.
   */
  expectedOutcome(outcome: string): this {
    this._expectedOutcome = outcome;
    return this;
  }

  /**
   * Sets the context information.
   */
  context(ctx: string): this {
    this._context = ctx;
    return this;
  }

  /**
   * Adds context from multiple sources.
   */
  addContext(label: string, content: string): this {
    if (this._context) {
      this._context += '\n\n';
    }
    this._context += `**${label}**:\n${content}`;
    return this;
  }

  /**
   * Adds a constraint.
   */
  addConstraint(constraint: string): this {
    this._constraints.push(constraint);
    return this;
  }

  /**
   * Adds multiple constraints.
   */
  constraints(constraints: string[]): this {
    this._constraints.push(...constraints);
    return this;
  }

  /**
   * Sets tool restrictions.
   */
  tools(toolRestriction: ToolRestriction): this {
    this._tools = toolRestriction;
    return this;
  }

  /**
   * Sets the expected response format.
   */
  responseFormat(format: string): this {
    this._responseFormat = format;
    return this;
  }

  /**
   * Adds an exit condition.
   */
  addExitCondition(condition: string): this {
    this._exitConditions.push(condition);
    return this;
  }

  /**
   * Adds multiple exit conditions.
   */
  exitConditions(conditions: string[]): this {
    this._exitConditions.push(...conditions);
    return this;
  }

  /**
   * Applies a preset configuration.
   */
  applyPreset(presetName: string): this {
    const preset = DELEGATION_PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }

    this._tools = preset.tools;
    this._constraints = [...preset.defaultConstraints];
    this._responseFormat = preset.responseFormat;
    this._exitConditions = [...preset.exitConditions];

    return this;
  }

  /**
   * Applies preset based on intent type.
   */
  forIntent(intent: IntentType): this {
    const intentToPreset: Record<IntentType, string> = {
      conceptual: 'research',
      implementation: 'implementation',
      debugging: 'debugging',
      refactoring: 'implementation',
      research: 'research',
      review: 'review',
      documentation: 'research'
    };

    return this.applyPreset(intentToPreset[intent]);
  }

  /**
   * Adjusts settings based on complexity.
   */
  forComplexity(complexity: ComplexityLevel): this {
    if (complexity === 'complex' || complexity === 'epic') {
      this.addConstraint('Break down into smaller steps if needed');
      this.addConstraint('Document decisions and trade-offs');
      this.addExitCondition('Approach validated before full implementation');
    }

    if (complexity === 'trivial' || complexity === 'simple') {
      this.addConstraint('Keep solution simple and focused');
    }

    return this;
  }

  /**
   * Builds the delegation prompt object.
   */
  buildPromptObject(): DelegationPrompt {
    if (!this._task) {
      throw new Error('Task is required');
    }

    return {
      task: this._task,
      expectedOutcome: this._expectedOutcome || 'Complete the task successfully',
      context: this._context || 'No additional context provided',
      constraints: this._constraints.length > 0
        ? this._constraints
        : ['Follow best practices'],
      tools: this._tools,
      responseFormat: this._responseFormat || 'Provide a clear, structured response',
      exitConditions: this._exitConditions.length > 0
        ? this._exitConditions
        : ['Task completed']
    };
  }

  /**
   * Builds the final prompt string.
   */
  build(): string {
    const promptObj = this.buildPromptObject();
    return buildDelegationPrompt(promptObj);
  }

  /**
   * Resets the builder to initial state.
   */
  reset(): this {
    this._task = '';
    this._expectedOutcome = '';
    this._context = '';
    this._constraints = [];
    this._tools = READ_ONLY_TOOLS;
    this._responseFormat = '';
    this._exitConditions = [];
    return this;
  }

  /**
   * Creates a copy of this builder.
   */
  clone(): DelegationBuilder {
    const copy = new DelegationBuilder();
    copy._task = this._task;
    copy._expectedOutcome = this._expectedOutcome;
    copy._context = this._context;
    copy._constraints = [...this._constraints];
    copy._tools = this._tools;
    copy._responseFormat = this._responseFormat;
    copy._exitConditions = [...this._exitConditions];
    return copy;
  }
}

/**
 * Creates a new delegation builder.
 */
export function createDelegationBuilder(): DelegationBuilder {
  return new DelegationBuilder();
}

/**
 * Quick helper to build a simple delegation prompt.
 */
export function quickDelegation(
  task: string,
  intent: IntentType,
  context?: string
): string {
  const builder = new DelegationBuilder()
    .task(task)
    .forIntent(intent);

  if (context) {
    builder.context(context);
  }

  return builder.build();
}

export default DelegationBuilder;
