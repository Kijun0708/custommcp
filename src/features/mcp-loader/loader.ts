// src/features/mcp-loader/loader.ts

/**
 * MCP Loader
 *
 * Loads MCP server configurations from Claude Code compatible config files.
 * Supports project, user, and global configuration scopes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../../utils/logger.js';
import {
  McpServerConfig,
  McpConfigFile,
  LoadedMcpServer,
  McpLoaderConfig,
  McpLoaderStats
} from './types.js';

// Default configuration
const defaultConfig: McpLoaderConfig = {
  enabled: true,
  configFileNames: [
    'mcp.json',
    'mcp-servers.json',
    'claude_desktop_config.json',
    '.mcp.json'
  ],
  projectPaths: [
    '.claude',
    '.opencode',
    '.config'
  ],
  userPaths: [
    path.join(os.homedir(), '.claude'),
    path.join(os.homedir(), '.config', 'claude'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Claude'),
    path.join(os.homedir(), 'Library', 'Application Support', 'Claude'),
    path.join(os.homedir(), '.config', 'opencode'),
    path.join(os.homedir(), '.llm-router')
  ],
  globalPaths: [
    '/etc/claude',
    '/etc/opencode',
    '/etc/llm-router'
  ],
  autoStart: false,
  mergeConfigs: true,
  cacheConfigs: true,
  cacheTtlMs: 300000 // 5 minutes
};

// State
let config: McpLoaderConfig = { ...defaultConfig };
let stats: McpLoaderStats = {
  totalServersLoaded: 0,
  serversByScope: { project: 0, user: 0, global: 0 },
  runningServers: 0,
  configFilesFound: 0,
  loadErrors: 0
};

const loadedServers: Map<string, LoadedMcpServer> = new Map();
const serverProcesses: Map<string, ChildProcess> = new Map();
let lastCacheTime = 0;

/**
 * Loads a config file
 */
function loadConfigFile(filePath: string): McpConfigFile | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    logger.warn({ filePath, error: error.message }, 'Failed to load MCP config file');
    stats.loadErrors++;
    return null;
  }
}

/**
 * Finds config files in a directory
 */
function findConfigFiles(dirPath: string): string[] {
  const files: string[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      return files;
    }

    // Check for config files in directory
    for (const fileName of config.configFileNames) {
      const filePath = path.join(dirPath, fileName);
      if (fs.existsSync(filePath)) {
        files.push(filePath);
      }
    }

    // Also check for files directly named with config names
    const dirFiles = fs.readdirSync(dirPath);
    for (const file of dirFiles) {
      if (config.configFileNames.includes(file)) {
        const filePath = path.join(dirPath, file);
        if (!files.includes(filePath) && fs.statSync(filePath).isFile()) {
          files.push(filePath);
        }
      }
    }
  } catch (error: any) {
    logger.debug({ dirPath, error: error.message }, 'Directory scan skipped');
  }

  return files;
}

/**
 * Loads servers from a config file
 */
function loadServersFromFile(
  filePath: string,
  scope: 'project' | 'user' | 'global'
): LoadedMcpServer[] {
  const servers: LoadedMcpServer[] = [];

  const configFile = loadConfigFile(filePath);
  if (!configFile || !configFile.mcpServers) {
    return servers;
  }

  for (const [name, serverConfig] of Object.entries(configFile.mcpServers)) {
    const server: LoadedMcpServer = {
      name,
      config: serverConfig,
      sourceFile: filePath,
      scope,
      running: false
    };

    servers.push(server);

    logger.debug({
      serverName: name,
      command: serverConfig.command,
      scope
    }, 'MCP server loaded from config');
  }

  return servers;
}

/**
 * Loads all MCP servers from configured paths
 */
export function loadAllMcpServers(basePath?: string): LoadedMcpServer[] {
  if (!config.enabled) {
    return [];
  }

  // Check cache
  const now = Date.now();
  if (config.cacheConfigs && loadedServers.size > 0 && (now - lastCacheTime) < config.cacheTtlMs) {
    return Array.from(loadedServers.values());
  }

  const allServers: LoadedMcpServer[] = [];
  let configFilesCount = 0;

  // Load project configs
  for (const configPath of config.projectPaths) {
    const fullPath = basePath
      ? path.join(basePath, configPath)
      : path.join(process.cwd(), configPath);

    const configFiles = findConfigFiles(fullPath);
    configFilesCount += configFiles.length;

    for (const file of configFiles) {
      const servers = loadServersFromFile(file, 'project');
      allServers.push(...servers);
    }
  }

  // Load user configs
  for (const configPath of config.userPaths) {
    const configFiles = findConfigFiles(configPath);
    configFilesCount += configFiles.length;

    for (const file of configFiles) {
      const servers = loadServersFromFile(file, 'user');
      allServers.push(...servers);
    }
  }

  // Load global configs (on supported platforms)
  if (process.platform !== 'win32') {
    for (const configPath of config.globalPaths) {
      const configFiles = findConfigFiles(configPath);
      configFilesCount += configFiles.length;

      for (const file of configFiles) {
        const servers = loadServersFromFile(file, 'global');
        allServers.push(...servers);
      }
    }
  }

  // Handle merging or override
  loadedServers.clear();

  if (config.mergeConfigs) {
    // Project overrides user, user overrides global
    for (const server of allServers) {
      const existing = loadedServers.get(server.name);
      if (!existing || getScopePriority(server.scope) > getScopePriority(existing.scope)) {
        loadedServers.set(server.name, server);
      }
    }
  } else {
    // Just add all
    for (const server of allServers) {
      loadedServers.set(server.name, server);
    }
  }

  lastCacheTime = now;

  // Update stats
  stats.totalServersLoaded = loadedServers.size;
  stats.configFilesFound = configFilesCount;
  stats.serversByScope = { project: 0, user: 0, global: 0 };

  for (const server of loadedServers.values()) {
    stats.serversByScope[server.scope]++;
  }

  stats.lastLoadTime = now;

  logger.info({
    total: loadedServers.size,
    configFiles: configFilesCount,
    byScope: stats.serversByScope
  }, 'MCP servers loaded');

  return Array.from(loadedServers.values());
}

/**
 * Gets scope priority for override logic
 */
function getScopePriority(scope: string): number {
  switch (scope) {
    case 'project': return 3;
    case 'user': return 2;
    case 'global': return 1;
    default: return 0;
  }
}

/**
 * Gets a loaded server by name
 */
export function getMcpServer(name: string): LoadedMcpServer | undefined {
  return loadedServers.get(name);
}

/**
 * Gets all loaded servers
 */
export function getAllMcpServers(): LoadedMcpServer[] {
  return Array.from(loadedServers.values());
}

/**
 * Gets servers by scope
 */
export function getMcpServersByScope(scope: 'project' | 'user' | 'global'): LoadedMcpServer[] {
  return Array.from(loadedServers.values()).filter(s => s.scope === scope);
}

/**
 * Starts an MCP server
 */
export async function startMcpServer(name: string): Promise<boolean> {
  const server = loadedServers.get(name);
  if (!server) {
    logger.warn({ name }, 'MCP server not found');
    return false;
  }

  if (server.config.disabled) {
    logger.info({ name }, 'MCP server is disabled');
    return false;
  }

  // Check if already running
  if (serverProcesses.has(name)) {
    const proc = serverProcesses.get(name);
    if (proc && !proc.killed) {
      logger.debug({ name }, 'MCP server already running');
      return true;
    }
  }

  const { command, args, env, cwd } = server.config;
  const workDir = cwd || process.cwd();

  try {
    const proc = spawn(command, args || [], {
      cwd: workDir,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.on('error', (err) => {
      logger.error({ name, error: err.message }, 'MCP server process error');
      server.lastError = err.message;
      server.running = false;
    });

    proc.on('exit', (code) => {
      logger.info({ name, code }, 'MCP server process exited');
      serverProcesses.delete(name);
      server.running = false;
      server.pid = undefined;
      stats.runningServers--;
    });

    serverProcesses.set(name, proc);

    server.pid = proc.pid;
    server.running = true;
    server.startedAt = Date.now();
    server.lastError = undefined;
    stats.runningServers++;

    logger.info({
      name,
      pid: proc.pid,
      command
    }, 'MCP server started');

    return true;
  } catch (error: any) {
    logger.error({ name, error: error.message }, 'Failed to start MCP server');
    server.lastError = error.message;
    return false;
  }
}

/**
 * Stops an MCP server
 */
export function stopMcpServer(name: string): boolean {
  const proc = serverProcesses.get(name);
  if (!proc) {
    return false;
  }

  try {
    proc.kill('SIGTERM');
    serverProcesses.delete(name);

    const server = loadedServers.get(name);
    if (server) {
      server.running = false;
      server.pid = undefined;
    }

    stats.runningServers--;

    logger.info({ name }, 'MCP server stopped');
    return true;
  } catch (error: any) {
    logger.error({ name, error: error.message }, 'Failed to stop MCP server');
    return false;
  }
}

/**
 * Restarts an MCP server
 */
export async function restartMcpServer(name: string): Promise<boolean> {
  stopMcpServer(name);
  await new Promise(resolve => setTimeout(resolve, 500));
  return startMcpServer(name);
}

/**
 * Auto-starts enabled servers
 */
export async function autoStartServers(): Promise<number> {
  if (!config.autoStart) {
    return 0;
  }

  let started = 0;

  for (const server of loadedServers.values()) {
    if (!server.config.disabled && !server.running) {
      const success = await startMcpServer(server.name);
      if (success) {
        started++;
      }
    }
  }

  logger.info({ started }, 'Auto-started MCP servers');
  return started;
}

/**
 * Stops all running servers
 */
export function stopAllServers(): number {
  let stopped = 0;

  for (const name of serverProcesses.keys()) {
    if (stopMcpServer(name)) {
      stopped++;
    }
  }

  logger.info({ stopped }, 'Stopped all MCP servers');
  return stopped;
}

/**
 * Reloads all MCP servers
 */
export function reloadMcpServers(): LoadedMcpServer[] {
  // Stop all first
  stopAllServers();

  // Clear cache
  lastCacheTime = 0;
  loadedServers.clear();

  // Reload
  const servers = loadAllMcpServers();

  // Auto-start if configured
  if (config.autoStart) {
    autoStartServers();
  }

  return servers;
}

/**
 * Gets loader statistics
 */
export function getMcpLoaderStats(): McpLoaderStats {
  return { ...stats };
}

/**
 * Gets loader configuration
 */
export function getMcpLoaderConfig(): McpLoaderConfig {
  return { ...config };
}

/**
 * Updates loader configuration
 */
export function updateMcpLoaderConfig(updates: Partial<McpLoaderConfig>): void {
  config = { ...config, ...updates };
  lastCacheTime = 0;
  logger.info({ config }, 'MCP loader config updated');
}

/**
 * Resets loader state
 */
export function resetMcpLoaderState(): void {
  stopAllServers();
  loadedServers.clear();
  lastCacheTime = 0;
  stats = {
    totalServersLoaded: 0,
    serversByScope: { project: 0, user: 0, global: 0 },
    runningServers: 0,
    configFilesFound: 0,
    loadErrors: 0
  };
}

/**
 * Gets running servers info
 */
export function getRunningServers(): Array<{
  name: string;
  pid?: number;
  startedAt?: number;
}> {
  const result: Array<{
    name: string;
    pid?: number;
    startedAt?: number;
  }> = [];

  for (const [name, proc] of serverProcesses) {
    if (!proc.killed) {
      const server = loadedServers.get(name);
      result.push({
        name,
        pid: proc.pid,
        startedAt: server?.startedAt
      });
    }
  }

  return result;
}

/**
 * Adds a server configuration programmatically
 */
export function addMcpServer(
  name: string,
  serverConfig: McpServerConfig,
  scope: 'project' | 'user' | 'global' = 'project'
): void {
  const server: LoadedMcpServer = {
    name,
    config: serverConfig,
    sourceFile: 'runtime',
    scope,
    running: false
  };

  loadedServers.set(name, server);
  stats.totalServersLoaded = loadedServers.size;
  stats.serversByScope[scope]++;

  logger.info({ name, scope }, 'MCP server added');
}

/**
 * Removes a server configuration
 */
export function removeMcpServer(name: string): boolean {
  const server = loadedServers.get(name);
  if (!server) {
    return false;
  }

  // Stop if running
  if (server.running) {
    stopMcpServer(name);
  }

  loadedServers.delete(name);
  stats.totalServersLoaded = loadedServers.size;
  stats.serversByScope[server.scope]--;

  logger.info({ name }, 'MCP server removed');
  return true;
}

export default {
  loadAllMcpServers,
  getMcpServer,
  getAllMcpServers,
  getMcpServersByScope,
  startMcpServer,
  stopMcpServer,
  restartMcpServer,
  autoStartServers,
  stopAllServers,
  reloadMcpServers,
  getMcpLoaderStats,
  getMcpLoaderConfig,
  updateMcpLoaderConfig,
  resetMcpLoaderState,
  getRunningServers,
  addMcpServer,
  removeMcpServer
};
