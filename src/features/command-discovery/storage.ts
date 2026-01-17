// src/features/command-discovery/storage.ts

/**
 * Command Discovery Storage
 *
 * Handles loading and caching of command definitions from files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger.js';
import {
  CommandDefinition,
  LoadedCommand,
  CommandDiscoveryConfig,
  DEFAULT_COMMAND_DISCOVERY_CONFIG
} from './types.js';

// Config storage location
const CONFIG_DIR = path.join(os.homedir(), '.llm-router');
const CONFIG_FILE = path.join(CONFIG_DIR, 'command-discovery.json');

// Cache for loaded commands
let commandCache: Map<string, LoadedCommand> = new Map();
let lastScanTime: number = 0;

/**
 * Ensures config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads command discovery configuration
 */
export function loadCommandDiscoveryConfig(): CommandDiscoveryConfig {
  ensureConfigDir();

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const saved = JSON.parse(data);
      return { ...DEFAULT_COMMAND_DISCOVERY_CONFIG, ...saved };
    }
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to load command discovery config');
  }

  return { ...DEFAULT_COMMAND_DISCOVERY_CONFIG };
}

/**
 * Saves command discovery configuration
 */
export function saveCommandDiscoveryConfig(config: CommandDiscoveryConfig): void {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to save command discovery config');
  }
}

/**
 * Resolves ~ in path to home directory
 */
function resolvePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

/**
 * Gets source type from directory path
 */
function getSourceType(dirPath: string, config: CommandDiscoveryConfig): 'project' | 'claude' | 'global' {
  const resolved = resolvePath(dirPath);

  if (config.globalDirs.some(d => resolved.startsWith(resolvePath(d)))) {
    return 'global';
  }
  if (config.userDirs.some(d => resolved.startsWith(resolvePath(d)))) {
    return 'claude';
  }
  return 'project';
}

/**
 * Parses command from file content
 */
function parseCommandFile(filePath: string, content: string): CommandDefinition | null {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === '.json') {
      return JSON.parse(content);
    }

    if (ext === '.yaml' || ext === '.yml') {
      // Simple YAML parser for basic structures
      // For full YAML support, would need js-yaml package
      return parseSimpleYaml(content);
    }

    if (ext === '.md') {
      // Parse markdown command format
      return parseMarkdownCommand(content);
    }
  } catch (error: any) {
    logger.warn({ error: error.message, file: filePath }, 'Failed to parse command file');
  }

  return null;
}

/**
 * Simple YAML parser for basic command definitions
 */
function parseSimpleYaml(content: string): CommandDefinition | null {
  const result: Record<string, any> = {};
  const lines = content.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || !trimmed) continue;

    // Array item
    if (trimmed.startsWith('- ')) {
      if (inArray) {
        currentArray.push(trimmed.slice(2).trim().replace(/^['"]|['"]$/g, ''));
      }
      continue;
    }

    // Key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      // Save previous array if any
      if (inArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
      }

      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();

      if (!value) {
        // Start of array or object
        inArray = true;
        currentKey = key;
      } else {
        // Simple value
        // Remove quotes
        value = value.replace(/^['"]|['"]$/g, '');

        // Parse booleans
        if (value === 'true') result[key] = true;
        else if (value === 'false') result[key] = false;
        else if (!isNaN(Number(value))) result[key] = Number(value);
        else result[key] = value;
      }
    }
  }

  // Save final array if any
  if (inArray && currentKey) {
    result[currentKey] = currentArray;
  }

  if (!result.name || !result.prompt) {
    return null;
  }

  return result as CommandDefinition;
}

/**
 * Parses markdown command format
 *
 * Expected format:
 * ---
 * name: command-name
 * description: What the command does
 * aliases: [alias1, alias2]
 * ---
 *
 * Prompt content here...
 */
function parseMarkdownCommand(content: string): CommandDefinition | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    // No frontmatter, treat entire content as prompt
    // Use filename as name (handled by caller)
    return null;
  }

  const [, frontmatter, prompt] = frontmatterMatch;
  const metadata = parseSimpleYaml(frontmatter);

  if (!metadata) return null;

  return {
    ...metadata,
    prompt: prompt.trim()
  } as CommandDefinition;
}

/**
 * Validates a command definition
 */
function validateCommand(cmd: CommandDefinition, sourcePath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!cmd.name) {
    errors.push('Missing required field: name');
  } else if (!/^[a-z][a-z0-9-]*$/.test(cmd.name)) {
    errors.push('Invalid name format: must be lowercase alphanumeric with dashes');
  }

  if (!cmd.prompt) {
    errors.push('Missing required field: prompt');
  }

  if (cmd.aliases) {
    if (!Array.isArray(cmd.aliases)) {
      errors.push('aliases must be an array');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Scans a directory for command files
 */
function scanDirectory(dirPath: string, config: CommandDiscoveryConfig): LoadedCommand[] {
  const commands: LoadedCommand[] = [];
  const resolved = resolvePath(dirPath);

  if (!fs.existsSync(resolved)) {
    return commands;
  }

  try {
    const files = fs.readdirSync(resolved);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!config.extensions.includes(ext)) continue;

      const filePath = path.join(resolved, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let definition = parseCommandFile(filePath, content);

        // For files without proper structure, use filename as name
        if (!definition && ext === '.md') {
          const name = path.basename(file, ext);
          definition = {
            name,
            description: `Command from ${file}`,
            prompt: content
          };
        }

        if (definition) {
          const validation = validateCommand(definition, filePath);

          commands.push({
            definition,
            sourcePath: filePath,
            sourceType: getSourceType(dirPath, config),
            loadedAt: Date.now(),
            valid: validation.valid,
            errors: validation.errors.length > 0 ? validation.errors : undefined
          });
        }
      } catch (error: any) {
        logger.warn({ error: error.message, file: filePath }, 'Failed to load command file');
      }
    }
  } catch (error: any) {
    logger.warn({ error: error.message, dir: resolved }, 'Failed to scan command directory');
  }

  return commands;
}

/**
 * Scans all configured directories for commands
 */
export function scanAllDirectories(config: CommandDiscoveryConfig, cwd?: string): LoadedCommand[] {
  const allCommands: LoadedCommand[] = [];

  // Project directories (relative to cwd)
  const workingDir = cwd || process.cwd();
  for (const dir of config.projectDirs) {
    const fullPath = path.join(workingDir, dir);
    allCommands.push(...scanDirectory(fullPath, config));
  }

  // User directories
  for (const dir of config.userDirs) {
    allCommands.push(...scanDirectory(dir, config));
  }

  // Global directories
  for (const dir of config.globalDirs) {
    allCommands.push(...scanDirectory(dir, config));
  }

  lastScanTime = Date.now();

  return allCommands;
}

/**
 * Gets cached commands
 */
export function getCachedCommands(): Map<string, LoadedCommand> {
  return commandCache;
}

/**
 * Updates command cache
 */
export function updateCommandCache(commands: LoadedCommand[]): void {
  commandCache.clear();

  for (const cmd of commands) {
    if (cmd.valid) {
      // Use name as key, later commands override earlier ones
      commandCache.set(cmd.definition.name, cmd);

      // Also cache by aliases
      if (cmd.definition.aliases) {
        for (const alias of cmd.definition.aliases) {
          if (!commandCache.has(alias)) {
            commandCache.set(alias, cmd);
          }
        }
      }
    }
  }
}

/**
 * Gets last scan time
 */
export function getLastScanTime(): number {
  return lastScanTime;
}

/**
 * Clears command cache
 */
export function clearCommandCache(): void {
  commandCache.clear();
  lastScanTime = 0;
}
