// src/features/command-discovery/index.ts

/**
 * Command Discovery Module
 *
 * Dynamic command loading from multiple directories.
 * Enables project-specific, user-level, and global custom commands.
 */

export {
  CommandDefinition,
  LoadedCommand,
  CommandDiscoveryConfig,
  CommandDiscoveryStats,
  CommandParameter,
  CommandContext,
  DEFAULT_COMMAND_DISCOVERY_CONFIG,
  EXAMPLE_COMMAND
} from './types.js';

export {
  loadCommandDiscoveryConfig,
  saveCommandDiscoveryConfig,
  scanAllDirectories,
  getCachedCommands,
  updateCommandCache,
  getLastScanTime,
  clearCommandCache
} from './storage.js';

export {
  getCommandDiscoveryManager,
  resetCommandDiscoveryManager
} from './manager.js';
