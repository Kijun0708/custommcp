// src/features/skill-system/index.ts

/**
 * Skill System
 *
 * Dynamic skill loading and management system.
 * Supports project, user, and global skill scopes with
 * YAML, JSON, and Markdown skill definitions.
 *
 * Features:
 * - Multi-scope skill loading
 * - MCP server integration
 * - Skill execution and context substitution
 * - Skill activation/deactivation
 * - Statistics and monitoring
 */

// Export types
export * from './types.js';

// Export loader functions
export {
  loadAllSkills,
  getSkill,
  getAllSkills,
  getSkillsByScope,
  getSkillsByTag,
  enableSkill,
  disableSkill,
  recordSkillUsage,
  reloadSkills,
  getLoaderStats,
  getLoaderConfig,
  updateLoaderConfig,
  resetLoaderState
} from './loader.js';

// Export manager functions
export {
  initializeSkillManager,
  startMcpProcess,
  stopMcpProcess,
  executeSkill,
  activateSkill,
  deactivateSkill,
  findSkill,
  listSkills,
  getSkillManagerStats,
  updateSkillManagerConfig,
  resetSkillManagerState,
  reloadAllSkills,
  getRunningMcpProcesses,
  shutdownSkillManager
} from './manager.js';

// Import for default export
import loader from './loader.js';
import manager from './manager.js';

/**
 * Skill system facade
 */
export const skillSystem = {
  // Loader
  load: loader.loadAllSkills,
  get: loader.getSkill,
  getAll: loader.getAllSkills,
  getByScope: loader.getSkillsByScope,
  getByTag: loader.getSkillsByTag,
  enable: loader.enableSkill,
  disable: loader.disableSkill,
  reload: loader.reloadSkills,
  loaderStats: loader.getLoaderStats,
  loaderConfig: loader.getLoaderConfig,
  updateLoaderConfig: loader.updateLoaderConfig,

  // Manager
  init: manager.initializeSkillManager,
  execute: manager.executeSkill,
  activate: manager.activateSkill,
  deactivate: manager.deactivateSkill,
  find: manager.findSkill,
  list: manager.listSkills,
  startMcp: manager.startMcpProcess,
  stopMcp: manager.stopMcpProcess,
  managerStats: manager.getSkillManagerStats,
  updateManagerConfig: manager.updateSkillManagerConfig,
  shutdown: manager.shutdownSkillManager,
  runningMcp: manager.getRunningMcpProcesses,

  // Combined reset
  reset: () => {
    loader.resetLoaderState();
    manager.resetSkillManagerState();
  }
};

export default skillSystem;
