// src/features/claude-code-command-loader/loader.ts

/**
 * Claude Code Command Loader
 *
 * Loads slash commands from markdown files with recursive namespace support.
 * Directory structure becomes command namespace.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, extname, resolve, relative, dirname } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import {
  LoadedCommand,
  CommandMetadata,
  CommandLoaderConfig,
  CommandLoadResult,
  CommandLoadError,
  DEFAULT_COMMAND_LOADER_CONFIG
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
function parseFrontmatter(content: string): { metadata: CommandMetadata; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      metadata: { name: '' },
      body: content.trim()
    };
  }

  const [, frontmatterStr, body] = match;
  const metadata: CommandMetadata = { name: '' };

  // Simple YAML parser
  const lines = frontmatterStr.split('\n');
  let currentKey: string | null = null;
  let currentArray: string[] = [];
  let inArray = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey && inArray) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    if (inArray && currentKey) {
      (metadata as any)[currentKey] = currentArray;
      currentArray = [];
      inArray = false;
    }

    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      currentKey = key;

      if (value === '' || value === '|' || value === '>') {
        inArray = true;
        currentArray = [];
      } else {
        let parsedValue: any = value;

        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (/^-?\d+(\.\d+)?$/.test(value)) parsedValue = parseFloat(value);
        else if ((value.startsWith('"') && value.endsWith('"')) ||
                 (value.startsWith("'") && value.endsWith("'"))) {
          parsedValue = value.slice(1, -1);
        }
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

  if (inArray && currentKey) {
    (metadata as any)[currentKey] = currentArray;
  }

  return {
    metadata,
    body: body.trim()
  };
}

/**
 * Generates command ID from file path relative to base directory
 *
 * Examples:
 * - commands/commit.md → commit
 * - commands/git/commit.md → git:commit
 * - commands/git/branch/create.md → git:branch:create
 */
function generateCommandId(
  filePath: string,
  basePath: string,
  separator: string = ':'
): { id: string; namespace: string | undefined; name: string } {
  const relativePath = relative(basePath, filePath);
  const parts = relativePath.split(/[/\\]/);

  // Remove file extension from last part
  const lastPart = parts[parts.length - 1];
  parts[parts.length - 1] = basename(lastPart, extname(lastPart));

  const name = parts[parts.length - 1];
  const namespace = parts.length > 1 ? parts.slice(0, -1).join(separator) : undefined;
  const id = parts.join(separator);

  return { id: id.toLowerCase(), namespace, name };
}

/**
 * Recursively finds all markdown files in a directory
 */
function findMarkdownFiles(
  dirPath: string,
  extensions: string[],
  files: string[] = []
): string[] {
  if (!existsSync(dirPath)) {
    return files;
  }

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);

      try {
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          // Recursively search subdirectories
          findMarkdownFiles(fullPath, extensions, files);
        } else if (stats.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Loads a single command from a markdown file
 */
function loadCommandFile(
  filePath: string,
  basePath: string,
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project',
  separator: string
): LoadedCommand | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const stats = statSync(filePath);
    const { metadata, body } = parseFrontmatter(content);

    const { id, namespace, name } = generateCommandId(filePath, basePath, separator);

    // Use filename as name if not in frontmatter
    if (!metadata.name) {
      metadata.name = name;
    }

    const command: LoadedCommand = {
      id,
      name: metadata.name,
      namespace,
      slashCommand: `/${id}`,
      sourcePath: filePath,
      sourceType,
      metadata,
      prompt: body,
      rawContent: content,
      lastModified: stats.mtime,
      contentHash: computeHash(content)
    };

    return command;
  } catch (error) {
    logger.warn({ error, filePath }, 'Failed to load command file');
    return null;
  }
}

/**
 * Loads all commands from a directory (recursively)
 */
function loadCommandsFromDirectory(
  dirPath: string,
  sourceType: 'user' | 'project' | 'opencode-global' | 'opencode-project',
  config: CommandLoaderConfig
): { commands: LoadedCommand[]; errors: CommandLoadError[] } {
  const resolvedPath = resolvePath(dirPath);
  const commands: LoadedCommand[] = [];
  const errors: CommandLoadError[] = [];

  if (!existsSync(resolvedPath)) {
    logger.debug({ path: resolvedPath }, 'Command directory does not exist');
    return { commands, errors };
  }

  const files = findMarkdownFiles(resolvedPath, config.fileExtensions);

  for (const filePath of files) {
    const command = loadCommandFile(
      filePath,
      resolvedPath,
      sourceType,
      config.namespaceSeparator
    );

    if (command) {
      commands.push(command);
      logger.debug({
        commandId: command.id,
        name: command.name,
        namespace: command.namespace,
        path: filePath
      }, 'Loaded command');
    } else {
      errors.push({
        filePath,
        message: 'Failed to parse command file',
        type: 'parse'
      });
    }
  }

  return { commands, errors };
}

/**
 * Loads all commands from configured directories
 */
export function loadAllCommands(
  config: CommandLoaderConfig = DEFAULT_COMMAND_LOADER_CONFIG,
  cwd: string = process.cwd()
): CommandLoadResult {
  const allCommands: LoadedCommand[] = [];
  const allErrors: CommandLoadError[] = [];
  const sourcesChecked: string[] = [];

  // Define sources with priority (lower = higher priority)
  // Order: project > user > opencode-project > opencode-global
  const sources = [
    {
      path: config.opencodeGlobalDir || '',
      type: 'opencode-global' as const,
      priority: 4
    },
    {
      path: config.opencodeProjectDir ? join(cwd, config.opencodeProjectDir) : '',
      type: 'opencode-project' as const,
      priority: 3
    },
    {
      path: config.userCommandsDir,
      type: 'user' as const,
      priority: 2
    },
    {
      path: join(cwd, config.projectCommandsDir),
      type: 'project' as const,
      priority: 1
    }
  ].filter(s => s.path);

  // Load from each source (lowest priority first, so higher priority overwrites)
  for (const source of sources.sort((a, b) => b.priority - a.priority)) {
    const resolvedPath = resolvePath(source.path);
    sourcesChecked.push(resolvedPath);

    const { commands, errors } = loadCommandsFromDirectory(
      source.path,
      source.type,
      config
    );

    allCommands.push(...commands);
    allErrors.push(...errors);
  }

  // Merge by ID if configured (project overrides user, etc.)
  let finalCommands = allCommands;
  if (config.mergeById) {
    const commandMap = new Map<string, LoadedCommand>();

    // Commands are loaded in priority order, so later entries override
    for (const command of allCommands) {
      commandMap.set(command.id, command);
    }

    finalCommands = Array.from(commandMap.values());
  }

  logger.info({
    totalCommands: finalCommands.length,
    sourcesChecked: sourcesChecked.length,
    errors: allErrors.length
  }, 'Commands loaded');

  return {
    commands: finalCommands,
    errors: allErrors,
    sourcesChecked,
    loadedAt: new Date()
  };
}

/**
 * Loads a specific command by ID
 */
export function loadCommandById(
  id: string,
  config: CommandLoaderConfig = DEFAULT_COMMAND_LOADER_CONFIG,
  cwd: string = process.cwd()
): LoadedCommand | null {
  const result = loadAllCommands(config, cwd);
  return result.commands.find(c => c.id.toLowerCase() === id.toLowerCase()) || null;
}

/**
 * Gets commands by namespace
 */
export function getCommandsByNamespace(
  commands: LoadedCommand[],
  namespace: string
): LoadedCommand[] {
  return commands.filter(c =>
    c.namespace === namespace ||
    (c.namespace && c.namespace.startsWith(namespace + ':'))
  );
}

/**
 * Gets all namespaces from commands
 */
export function getNamespaces(commands: LoadedCommand[]): string[] {
  const namespaces = new Set<string>();

  for (const command of commands) {
    if (command.namespace) {
      // Add the namespace and all parent namespaces
      const parts = command.namespace.split(':');
      for (let i = 1; i <= parts.length; i++) {
        namespaces.add(parts.slice(0, i).join(':'));
      }
    }
  }

  return Array.from(namespaces).sort();
}

/**
 * Validates command metadata
 */
export function validateCommand(command: LoadedCommand): string[] {
  const errors: string[] = [];

  if (!command.name || command.name.trim() === '') {
    errors.push('Command name is required');
  }

  if (!command.prompt || command.prompt.trim() === '') {
    errors.push('Command prompt (markdown body) is required');
  }

  if (command.metadata.aliases && !Array.isArray(command.metadata.aliases)) {
    errors.push('aliases must be an array');
  }

  if (command.metadata.permissions && !Array.isArray(command.metadata.permissions)) {
    errors.push('permissions must be an array');
  }

  return errors;
}

/**
 * Generates help text for a command
 */
export function generateCommandHelp(command: LoadedCommand): string {
  const lines: string[] = [
    `**${command.slashCommand}**`,
    ''
  ];

  if (command.metadata.description) {
    lines.push(command.metadata.description);
    lines.push('');
  }

  if (command.metadata.help) {
    lines.push(`_${command.metadata.help}_`);
    lines.push('');
  }

  if (command.metadata.aliases && command.metadata.aliases.length > 0) {
    lines.push(`**Aliases:** ${command.metadata.aliases.map(a => `/${a}`).join(', ')}`);
  }

  if (command.metadata.examples && command.metadata.examples.length > 0) {
    lines.push('');
    lines.push('**Examples:**');
    for (const example of command.metadata.examples) {
      lines.push(`- \`${example}\``);
    }
  }

  return lines.join('\n');
}
