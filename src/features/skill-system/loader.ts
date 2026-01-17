// src/features/skill-system/loader.ts

/**
 * Skill Loader
 *
 * Dynamically loads skills from various directories.
 * Supports project, user, and global skill scopes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { logger } from '../../utils/logger.js';
import {
  SkillDefinition,
  LoadedSkill,
  SkillScope,
  SkillLoaderConfig,
  SkillLoaderStats,
  SkillFileFormat
} from './types.js';

// Default configuration
const defaultConfig: SkillLoaderConfig = {
  enabled: true,
  projectPaths: [
    '.opencode/skills',
    '.claude/skills',
    '.skills'
  ],
  userPaths: [
    path.join(os.homedir(), '.config', 'opencode', 'skills'),
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.llm-router', 'skills')
  ],
  globalPaths: [
    '/etc/opencode/skills',
    '/etc/llm-router/skills'
  ],
  extensions: ['.yaml', '.yml', '.json', '.md'],
  autoLoad: true,
  autoEnable: true,
  watchChanges: false,
  cacheSkills: true,
  cacheTtlMs: 300000 // 5 minutes
};

// State
let config: SkillLoaderConfig = { ...defaultConfig };
let stats: SkillLoaderStats = {
  totalSkillsLoaded: 0,
  skillsByScope: { project: 0, user: 0, global: 0, builtin: 0 },
  skillsByState: { loaded: 0, active: 0, disabled: 0, error: 0 },
  totalExecutions: 0,
  loadErrors: 0
};

const loadedSkills: Map<string, LoadedSkill> = new Map();
let lastCacheTime = 0;

/**
 * Generates skill ID from file path
 */
function generateSkillId(filePath: string, scope: SkillScope): string {
  const basename = path.basename(filePath, path.extname(filePath));
  return `${scope}:${basename}`;
}

/**
 * Parses skill file content
 */
function parseSkillFile(content: string, extension: string): SkillFileFormat | null {
  try {
    if (extension === '.json') {
      return JSON.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      return yaml.load(content) as SkillFileFormat;
    } else if (extension === '.md') {
      return parseMarkdownSkill(content);
    }
  } catch (error: any) {
    logger.warn({ error: error.message, extension }, 'Failed to parse skill file');
  }
  return null;
}

/**
 * Parses markdown skill format
 */
function parseMarkdownSkill(content: string): SkillFileFormat | null {
  // Extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    // Try to extract basic info from markdown
    const nameMatch = content.match(/^#\s+(.+)$/m);
    const descMatch = content.match(/^>\s*(.+)$/m);

    return {
      skill: {
        name: nameMatch ? nameMatch[1] : 'Unnamed Skill',
        description: descMatch ? descMatch[1] : undefined
      },
      prompt: content
    };
  }

  try {
    const frontmatter = yaml.load(frontmatterMatch[1]) as any;
    const prompt = content.slice(frontmatterMatch[0].length).trim();

    return {
      skill: {
        id: frontmatter.id,
        name: frontmatter.name || frontmatter.title || 'Unnamed Skill',
        description: frontmatter.description,
        version: frontmatter.version,
        author: frontmatter.author,
        tags: frontmatter.tags
      },
      config: frontmatter.config,
      mcp: frontmatter.mcp,
      prompt,
      tools: frontmatter.tools,
      requires: frontmatter.requires
    };
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to parse markdown frontmatter');
    return null;
  }
}

/**
 * Converts file format to skill definition
 */
function toSkillDefinition(
  format: SkillFileFormat,
  filePath: string,
  scope: SkillScope
): SkillDefinition {
  const id = format.skill.id || generateSkillId(filePath, scope);

  return {
    id,
    name: format.skill.name,
    description: format.skill.description || '',
    scope,
    filePath,
    version: format.skill.version,
    author: format.skill.author,
    tags: format.skill.tags,
    enabled: config.autoEnable,
    config: format.config,
    mcp: format.mcp,
    prompt: format.prompt,
    tools: format.tools,
    requires: format.requires
  };
}

/**
 * Loads a single skill file
 */
function loadSkillFile(filePath: string, scope: SkillScope): LoadedSkill | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const extension = path.extname(filePath).toLowerCase();
    const format = parseSkillFile(content, extension);

    if (!format) {
      stats.loadErrors++;
      return null;
    }

    const definition = toSkillDefinition(format, filePath, scope);

    const loadedSkill: LoadedSkill = {
      ...definition,
      loadedAt: Date.now(),
      usageCount: 0,
      state: 'loaded'
    };

    logger.debug({
      skillId: loadedSkill.id,
      name: loadedSkill.name,
      scope
    }, 'Skill loaded');

    return loadedSkill;
  } catch (error: any) {
    logger.warn({ error: error.message, filePath }, 'Failed to load skill');
    stats.loadErrors++;
    return null;
  }
}

/**
 * Scans directory for skill files
 */
function scanDirectory(dirPath: string, scope: SkillScope): LoadedSkill[] {
  const skills: LoadedSkill[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      return skills;
    }

    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();

      if (!config.extensions.includes(ext)) {
        continue;
      }

      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (!stat.isFile()) {
        continue;
      }

      const skill = loadSkillFile(filePath, scope);
      if (skill) {
        skills.push(skill);
      }
    }
  } catch (error: any) {
    logger.debug({ dirPath, error: error.message }, 'Directory scan skipped');
  }

  return skills;
}

/**
 * Loads all skills from configured paths
 */
export function loadAllSkills(basePath?: string): LoadedSkill[] {
  if (!config.enabled) {
    return [];
  }

  // Check cache
  const now = Date.now();
  if (config.cacheSkills && loadedSkills.size > 0 && (now - lastCacheTime) < config.cacheTtlMs) {
    return Array.from(loadedSkills.values());
  }

  const allSkills: LoadedSkill[] = [];

  // Load project skills
  for (const skillPath of config.projectPaths) {
    const fullPath = basePath
      ? path.join(basePath, skillPath)
      : path.join(process.cwd(), skillPath);

    const skills = scanDirectory(fullPath, 'project');
    allSkills.push(...skills);
  }

  // Load user skills
  for (const skillPath of config.userPaths) {
    const skills = scanDirectory(skillPath, 'user');
    allSkills.push(...skills);
  }

  // Load global skills (on supported platforms)
  if (process.platform !== 'win32') {
    for (const skillPath of config.globalPaths) {
      const skills = scanDirectory(skillPath, 'global');
      allSkills.push(...skills);
    }
  }

  // Update cache
  loadedSkills.clear();
  for (const skill of allSkills) {
    loadedSkills.set(skill.id, skill);
  }
  lastCacheTime = now;

  // Update stats
  stats.totalSkillsLoaded = allSkills.length;
  stats.skillsByScope = { project: 0, user: 0, global: 0, builtin: 0 };
  stats.skillsByState = { loaded: 0, active: 0, disabled: 0, error: 0 };

  for (const skill of allSkills) {
    stats.skillsByScope[skill.scope]++;
    stats.skillsByState[skill.state]++;
  }

  stats.lastLoadTime = now;

  logger.info({
    total: allSkills.length,
    byScope: stats.skillsByScope
  }, 'Skills loaded');

  return allSkills;
}

/**
 * Gets a loaded skill by ID
 */
export function getSkill(skillId: string): LoadedSkill | undefined {
  return loadedSkills.get(skillId);
}

/**
 * Gets all loaded skills
 */
export function getAllSkills(): LoadedSkill[] {
  return Array.from(loadedSkills.values());
}

/**
 * Gets skills by scope
 */
export function getSkillsByScope(scope: SkillScope): LoadedSkill[] {
  return Array.from(loadedSkills.values()).filter(s => s.scope === scope);
}

/**
 * Gets skills by tag
 */
export function getSkillsByTag(tag: string): LoadedSkill[] {
  return Array.from(loadedSkills.values()).filter(
    s => s.tags?.includes(tag)
  );
}

/**
 * Enables a skill
 */
export function enableSkill(skillId: string): boolean {
  const skill = loadedSkills.get(skillId);
  if (skill) {
    skill.enabled = true;
    skill.state = 'loaded';
    stats.skillsByState.disabled--;
    stats.skillsByState.loaded++;
    return true;
  }
  return false;
}

/**
 * Disables a skill
 */
export function disableSkill(skillId: string): boolean {
  const skill = loadedSkills.get(skillId);
  if (skill) {
    skill.enabled = false;
    skill.state = 'disabled';
    stats.skillsByState.loaded--;
    stats.skillsByState.disabled++;
    return true;
  }
  return false;
}

/**
 * Records skill usage
 */
export function recordSkillUsage(skillId: string): void {
  const skill = loadedSkills.get(skillId);
  if (skill) {
    skill.usageCount++;
    skill.lastUsedAt = Date.now();
    stats.totalExecutions++;
  }
}

/**
 * Reloads all skills
 */
export function reloadSkills(): LoadedSkill[] {
  lastCacheTime = 0;
  loadedSkills.clear();
  return loadAllSkills();
}

/**
 * Gets loader statistics
 */
export function getLoaderStats(): SkillLoaderStats {
  return { ...stats };
}

/**
 * Gets loader configuration
 */
export function getLoaderConfig(): SkillLoaderConfig {
  return { ...config };
}

/**
 * Updates loader configuration
 */
export function updateLoaderConfig(updates: Partial<SkillLoaderConfig>): void {
  config = { ...config, ...updates };
  // Clear cache on config change
  lastCacheTime = 0;
  logger.info({ config }, 'Skill loader config updated');
}

/**
 * Resets loader state
 */
export function resetLoaderState(): void {
  loadedSkills.clear();
  lastCacheTime = 0;
  stats = {
    totalSkillsLoaded: 0,
    skillsByScope: { project: 0, user: 0, global: 0, builtin: 0 },
    skillsByState: { loaded: 0, active: 0, disabled: 0, error: 0 },
    totalExecutions: 0,
    loadErrors: 0
  };
}

export default {
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
};
