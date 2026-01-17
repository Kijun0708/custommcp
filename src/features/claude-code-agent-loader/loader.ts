// src/features/claude-code-agent-loader/loader.ts

/**
 * Claude Code Agent Loader
 *
 * Loads agents from markdown files in Claude Code agent directories.
 * Supports user (~/.claude/agents/) and project (.claude/agents/) directories.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, resolve } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import {
  LoadedAgent,
  AgentMetadata,
  AgentLoaderConfig,
  AgentLoadResult,
  AgentLoadError,
  DEFAULT_AGENT_LOADER_CONFIG
} from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolves ~ in paths to home directory
 */
function resolvePath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return resolve(path);
}

/**
 * Computes content hash for change detection
 */
function computeHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Parses YAML-like frontmatter from markdown
 */
function parseFrontmatter(content: string): { metadata: AgentMetadata; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, use entire content as body
    return {
      metadata: { name: '' },
      body: content.trim()
    };
  }

  const [, frontmatterStr, body] = match;
  const metadata: AgentMetadata = { name: '' };

  // Simple YAML parser for common cases
  const lines = frontmatterStr.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for array item
    if (trimmed.startsWith('- ') && currentKey && inArray) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Save previous array if we were in one
    if (inArray && currentKey) {
      (metadata as any)[currentKey] = currentArray;
      currentArray = [];
      inArray = false;
    }

    // Check for key-value pair
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;

      if (value === '' || value === '|' || value === '>') {
        // Start of array or multiline
        inArray = true;
        currentArray = [];
      } else {
        // Simple value
        let parsedValue: any = value;

        // Try to parse as boolean
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        // Try to parse as number
        else if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = parseFloat(value);
        // Remove quotes if present
        else if ((value.startsWith('"') && value.endsWith('"')) ||
                 (value.startsWith("'") && value.endsWith("'"))) {
          parsedValue = value.slice(1, -1);
        }
        // Parse inline array
        else if (value.startsWith('[') && value.endsWith(']')) {
          try {
            parsedValue = JSON.parse(value);
          } catch {
            parsedValue = value.slice(1, -1).split(',').map(s => s.trim());
          }
        }

        (metadata as any)[key] = parsedValue;
        inArray = false;
      }
    }
  }

  // Save last array if we were in one
  if (inArray && currentKey) {
    (metadata as any)[currentKey] = currentArray;
  }

  return {
    metadata,
    body: body.trim()
  };
}

/**
 * Generates agent ID from file path
 */
function generateAgentId(filePath: string, sourceType: string): string {
  const name = basename(filePath, extname(filePath));
  return `${sourceType}:${name}`.toLowerCase().replace(/[^a-z0-9:_-]/g, '_');
}

/**
 * Loads a single agent from a markdown file
 */
function loadAgentFile(
  filePath: string,
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project'
): LoadedAgent | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);
    const { metadata, body } = parseFrontmatter(content);

    // Use filename as name if not in frontmatter
    if (!metadata.name) {
      metadata.name = basename(filePath, extname(filePath));
    }

    const agent: LoadedAgent = {
      id: generateAgentId(filePath, sourceType),
      name: metadata.name,
      sourcePath: filePath,
      sourceType,
      metadata,
      prompt: body,
      rawContent: content,
      lastModified: stats.mtime,
      contentHash: computeHash(content)
    };

    return agent;
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to load agent file');
    return null;
  }
}

/**
 * Loads all agents from a directory
 */
function loadAgentsFromDirectory(
  dirPath: string,
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project',
  extensions: string[]
): { agents: LoadedAgent[]; errors: AgentLoadError[] } {
  const resolvedPath = resolvePath(dirPath);
  const agents: LoadedAgent[] = [];
  const errors: AgentLoadError[] = [];

  if (!existsSync(resolvedPath)) {
    logger.debug({ path: resolvedPath }, 'Agent directory does not exist');
    return { agents, errors };
  }

  try {
    const files = readdirSync(resolvedPath);

    for (const file of files) {
      const filePath = join(resolvedPath, file);
      const ext = extname(file).toLowerCase();

      // Skip non-matching extensions
      if (!extensions.includes(ext)) continue;

      // Skip directories
      try {
        if (statSync(filePath).isDirectory()) continue;
      } catch {
        continue;
      }

      const agent = loadAgentFile(filePath, sourceType);

      if (agent) {
        agents.push(agent);
        logger.debug({
          agentId: agent.id,
          name: agent.name,
          path: filePath
        }, 'Loaded agent');
      } else {
        errors.push({
          filePath,
          message: 'Failed to parse agent file',
          type: 'parse'
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push({
      filePath: resolvedPath,
      message: `Failed to read directory: ${message}`,
      type: 'read'
    });
  }

  return { agents, errors };
}

/**
 * Loads all agents from configured directories
 */
export function loadAllAgents(
  config: AgentLoaderConfig = DEFAULT_AGENT_LOADER_CONFIG,
  cwd: string = process.cwd()
): AgentLoadResult {
  const allAgents: LoadedAgent[] = [];
  const allErrors: AgentLoadError[] = [];
  const sourcesChecked: string[] = [];

  // Define sources with priority (lower = higher priority)
  const sources = [
    {
      path: join(cwd, config.projectAgentsDir),
      type: 'project' as const,
      priority: 1
    },
    {
      path: config.userAgentsDir,
      type: 'user' as const,
      priority: 2
    },
    {
      path: config.opencodeProjectDir ? join(cwd, config.opencodeProjectDir) : '',
      type: 'opencode-project' as const,
      priority: 3
    },
    {
      path: config.opencodeGlobalDir || '',
      type: 'opencode-global' as const,
      priority: 4
    }
  ].filter(s => s.path);

  // Load from each source
  for (const source of sources) {
    const resolvedPath = resolvePath(source.path);
    sourcesChecked.push(resolvedPath);

    const { agents, errors } = loadAgentsFromDirectory(
      source.path,
      source.type,
      config.fileExtensions
    );

    allAgents.push(...agents);
    allErrors.push(...errors);
  }

  // Merge by name if configured (project overrides user, etc.)
  let finalAgents = allAgents;
  if (config.mergeByName) {
    const agentMap = new Map<string, LoadedAgent>();

    // Sort by priority (higher priority = lower number)
    const sortedAgents = [...allAgents].sort((a, b) => {
      const priorityOrder = { project: 1, user: 2, 'opencode-project': 3, 'opencode-global': 4 };
      return (priorityOrder[a.sourceType] || 5) - (priorityOrder[b.sourceType] || 5);
    });

    // Later entries override earlier ones for same name
    for (const agent of sortedAgents.reverse()) {
      const key = agent.name.toLowerCase();
      if (!agentMap.has(key)) {
        agentMap.set(key, agent);
      }
    }

    finalAgents = Array.from(agentMap.values());
  }

  logger.info({
    totalAgents: finalAgents.length,
    sourcesChecked: sourcesChecked.length,
    errors: allErrors.length
  }, 'Agents loaded');

  return {
    agents: finalAgents,
    errors: allErrors,
    sourcesChecked,
    loadedAt: new Date()
  };
}

/**
 * Loads a specific agent by name
 */
export function loadAgentByName(
  name: string,
  config: AgentLoaderConfig = DEFAULT_AGENT_LOADER_CONFIG,
  cwd: string = process.cwd()
): LoadedAgent | null {
  const result = loadAllAgents(config, cwd);
  return result.agents.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Gets agent prompt with metadata injected
 */
export function getAgentPromptWithMetadata(agent: LoadedAgent): string {
  const metaLines: string[] = [];

  if (agent.metadata.description) {
    metaLines.push(`**Description**: ${agent.metadata.description}`);
  }
  if (agent.metadata.tools && agent.metadata.tools.length > 0) {
    metaLines.push(`**Available Tools**: ${agent.metadata.tools.join(', ')}`);
  }
  if (agent.metadata.model) {
    metaLines.push(`**Model**: ${agent.metadata.model}`);
  }

  const metaSection = metaLines.length > 0
    ? `## Agent: ${agent.name}\n\n${metaLines.join('\n')}\n\n---\n\n`
    : `## Agent: ${agent.name}\n\n`;

  return metaSection + agent.prompt;
}

/**
 * Validates agent metadata
 */
export function validateAgent(agent: LoadedAgent): string[] {
  const errors: string[] = [];

  if (!agent.name || agent.name.trim() === '') {
    errors.push('Agent name is required');
  }

  if (!agent.prompt || agent.prompt.trim() === '') {
    errors.push('Agent prompt (markdown body) is required');
  }

  if (agent.metadata.tools && !Array.isArray(agent.metadata.tools)) {
    errors.push('tools must be an array');
  }

  if (agent.metadata.priority !== undefined &&
      (typeof agent.metadata.priority !== 'number' || agent.metadata.priority < 0)) {
    errors.push('priority must be a non-negative number');
  }

  return errors;
}
