/**
 * Expert Metadata Types and Registry
 *
 * Defines metadata structure for all experts, enabling:
 * - Automatic routing based on triggers
 * - Usage guidance (when to use, when to avoid)
 * - Cost and latency expectations
 * - Tool restriction configuration
 */

/**
 * Trigger definition for automatic expert selection.
 */
export interface ExpertTrigger {
  /** Domain or category this trigger applies to */
  domain: string;
  /** Description of when this trigger activates */
  trigger: string;
}

/**
 * Complete metadata for an expert prompt.
 */
export interface ExpertPromptMetadata {
  /** Unique identifier for the expert */
  id: string;

  /** Human-readable name */
  name: string;

  /** Brief description of the expert's role */
  description: string;

  /** Category for grouping (advisor, research, exploration, specialist) */
  category: 'advisor' | 'research' | 'exploration' | 'specialist';

  /** Relative cost indicator */
  cost: 'low' | 'medium' | 'high';

  /** Expected response time range */
  typicalLatency: string;

  /** Scenarios where this expert should be used */
  useWhen: string[];

  /** Scenarios where this expert should NOT be used */
  avoidWhen: string[];

  /** Automatic trigger conditions */
  triggers: ExpertTrigger[];

  /** Expected response format description */
  responseFormat: string;

  /** Tool restriction profile */
  toolRestriction: 'read-only' | 'research' | 'exploration' | 'documentation' | 'full';
}

/**
 * Registry of all expert metadata, imported from individual prompt files.
 */
export interface ExpertRegistry {
  [expertId: string]: ExpertPromptMetadata;
}

/**
 * Finds the best expert for a given query based on triggers.
 *
 * @param query - The user's request
 * @param registry - Expert metadata registry
 * @returns Array of matching experts sorted by relevance
 */
export function findMatchingExperts(
  query: string,
  registry: ExpertRegistry
): ExpertPromptMetadata[] {
  const queryLower = query.toLowerCase();
  const matches: Array<{ expert: ExpertPromptMetadata; score: number }> = [];

  for (const expert of Object.values(registry)) {
    let score = 0;

    // Check triggers
    for (const trigger of expert.triggers) {
      if (queryLower.includes(trigger.domain.toLowerCase())) {
        score += 2;
      }
      const triggerWords = trigger.trigger.toLowerCase().split(/\s+/);
      for (const word of triggerWords) {
        if (word.length > 3 && queryLower.includes(word)) {
          score += 1;
        }
      }
    }

    // Check useWhen scenarios
    for (const scenario of expert.useWhen) {
      const scenarioWords = scenario.toLowerCase().split(/\s+/);
      for (const word of scenarioWords) {
        if (word.length > 4 && queryLower.includes(word)) {
          score += 0.5;
        }
      }
    }

    // Penalize if matches avoidWhen
    for (const scenario of expert.avoidWhen) {
      const scenarioWords = scenario.toLowerCase().split(/\s+/);
      for (const word of scenarioWords) {
        if (word.length > 4 && queryLower.includes(word)) {
          score -= 1;
        }
      }
    }

    if (score > 0) {
      matches.push({ expert, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .map(m => m.expert);
}

/**
 * Gets usage guidance for an expert.
 *
 * @param metadata - Expert metadata
 * @returns Formatted usage guidance string
 */
export function getUsageGuidance(metadata: ExpertPromptMetadata): string {
  const useWhen = metadata.useWhen.map(s => `  - ${s}`).join('\n');
  const avoidWhen = metadata.avoidWhen.map(s => `  - ${s}`).join('\n');

  return `
## ${metadata.name} (${metadata.id})

${metadata.description}

**Category**: ${metadata.category}
**Cost**: ${metadata.cost}
**Typical Latency**: ${metadata.typicalLatency}
**Tool Access**: ${metadata.toolRestriction}

### When to Use
${useWhen}

### When to Avoid
${avoidWhen}

### Response Format
${metadata.responseFormat}
`.trim();
}

/**
 * Validates expert metadata completeness.
 */
export function validateMetadata(metadata: Partial<ExpertPromptMetadata>): string[] {
  const errors: string[] = [];

  if (!metadata.id) errors.push('id is required');
  if (!metadata.name) errors.push('name is required');
  if (!metadata.description) errors.push('description is required');
  if (!metadata.category) errors.push('category is required');
  if (!metadata.cost) errors.push('cost is required');
  if (!metadata.useWhen || metadata.useWhen.length === 0) {
    errors.push('useWhen must have at least one scenario');
  }
  if (!metadata.avoidWhen || metadata.avoidWhen.length === 0) {
    errors.push('avoidWhen must have at least one scenario');
  }
  if (!metadata.triggers || metadata.triggers.length === 0) {
    errors.push('triggers must have at least one trigger');
  }

  return errors;
}

/**
 * Creates a summary table of all experts.
 */
export function createExpertSummaryTable(registry: ExpertRegistry): string {
  const rows = Object.values(registry).map(e =>
    `| ${e.id} | ${e.name} | ${e.category} | ${e.cost} | ${e.typicalLatency} |`
  );

  return `
| ID | Name | Category | Cost | Latency |
|----|------|----------|------|---------|
${rows.join('\n')}
`.trim();
}
