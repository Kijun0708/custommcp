// src/features/mcp-loader/index.ts

/**
 * MCP Loader
 *
 * Claude Code compatible MCP server configuration loader.
 * Supports project, user, and global configuration scopes.
 *
 * Features:
 * - Load from .claude/mcp.json, mcp-servers.json, etc.
 * - Multi-scope configuration with override priority
 * - Server lifecycle management
 * - Auto-start capability
 */

// Export types
export * from './types.js';

// Export loader functions
export {
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
} from './loader.js';

// Import for default export
import loader from './loader.js';

/**
 * MCP loader facade
 */
export const mcpLoader = {
  // Loading
  load: loader.loadAllMcpServers,
  reload: loader.reloadMcpServers,
  get: loader.getMcpServer,
  getAll: loader.getAllMcpServers,
  getByScope: loader.getMcpServersByScope,

  // Server control
  start: loader.startMcpServer,
  stop: loader.stopMcpServer,
  restart: loader.restartMcpServer,
  autoStart: loader.autoStartServers,
  stopAll: loader.stopAllServers,

  // Configuration
  add: loader.addMcpServer,
  remove: loader.removeMcpServer,

  // Stats
  stats: loader.getMcpLoaderStats,
  config: loader.getMcpLoaderConfig,
  updateConfig: loader.updateMcpLoaderConfig,
  running: loader.getRunningServers,

  // Reset
  reset: loader.resetMcpLoaderState
};

export default mcpLoader;
