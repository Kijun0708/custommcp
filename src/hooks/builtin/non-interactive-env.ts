// src/hooks/builtin/non-interactive-env.ts

/**
 * Non-Interactive Environment Hook
 *
 * Enforces safety restrictions in non-interactive environments.
 * Prevents dangerous commands that could cause harm without user oversight.
 *
 * Features:
 * - Dangerous command detection
 * - Environment-based restrictions
 * - Configurable command blocklist
 * - Warning generation
 */

import {
  HookDefinition,
  HookResult,
  OnToolCallContext
} from '../types.js';
import { registerHook } from '../manager.js';
import { logger } from '../../utils/logger.js';

/**
 * Dangerous command category
 */
type DangerCategory =
  | 'destructive'      // rm -rf, format, etc.
  | 'network'          // curl to external, wget, etc.
  | 'system'           // shutdown, reboot, etc.
  | 'privilege'        // sudo, su, chmod 777, etc.
  | 'data'             // truncate, drop database, etc.
  | 'credential'       // accessing secrets, keys, etc.
  | 'process';         // kill, pkill, etc.

/**
 * Dangerous pattern
 */
interface DangerousPattern {
  pattern: RegExp;
  category: DangerCategory;
  severity: 'warning' | 'block';
  description: string;
}

/**
 * Non-interactive environment configuration
 */
interface NonInteractiveEnvConfig {
  /** Whether restrictions are enabled */
  enabled: boolean;
  /** Whether running in non-interactive mode */
  isNonInteractive: boolean;
  /** Auto-detect non-interactive environment */
  autoDetect: boolean;
  /** Command patterns to block */
  blockedPatterns: DangerousPattern[];
  /** Tools to monitor */
  monitoredTools: string[];
  /** Allow override with explicit confirmation */
  allowOverride: boolean;
}

/**
 * Non-interactive environment statistics
 */
interface NonInteractiveEnvStats {
  totalChecks: number;
  commandsBlocked: number;
  warningsIssued: number;
  blockedByCategory: Record<string, number>;
  lastBlockedCommand?: string;
  lastBlockTime?: number;
}

// State
let config: NonInteractiveEnvConfig = {
  enabled: true,
  isNonInteractive: false,
  autoDetect: true,
  blockedPatterns: [
    // Destructive commands
    { pattern: /rm\s+(-rf?|--force)\s+[\/~]/, category: 'destructive', severity: 'block', description: 'Recursive delete from root or home' },
    { pattern: /rm\s+(-rf?|--force)\s+\*/, category: 'destructive', severity: 'block', description: 'Recursive delete with wildcard' },
    { pattern: /mkfs/, category: 'destructive', severity: 'block', description: 'Format filesystem' },
    { pattern: /dd\s+if=.*of=\/dev/, category: 'destructive', severity: 'block', description: 'Direct disk write' },
    { pattern: />\s*\/dev\/sd[a-z]/, category: 'destructive', severity: 'block', description: 'Write to disk device' },

    // System commands
    { pattern: /shutdown|reboot|halt|poweroff/, category: 'system', severity: 'block', description: 'System power control' },
    { pattern: /systemctl\s+(stop|disable|mask)\s+\S+/, category: 'system', severity: 'warning', description: 'Service control' },
    { pattern: /init\s+[0-6]/, category: 'system', severity: 'block', description: 'Init runlevel change' },

    // Privilege escalation
    { pattern: /sudo\s+su|sudo\s+-i|sudo\s+bash/, category: 'privilege', severity: 'warning', description: 'Root shell' },
    { pattern: /chmod\s+777/, category: 'privilege', severity: 'warning', description: 'World-writable permissions' },
    { pattern: /chown\s+-R\s+root/, category: 'privilege', severity: 'warning', description: 'Recursive ownership change' },

    // Network dangers
    { pattern: /curl\s+.*\|\s*(bash|sh)/, category: 'network', severity: 'block', description: 'Pipe curl to shell' },
    { pattern: /wget\s+.*&&\s*(bash|sh)/, category: 'network', severity: 'block', description: 'Download and execute' },
    { pattern: /nc\s+-[le]/, category: 'network', severity: 'warning', description: 'Netcat listener' },

    // Data destruction
    { pattern: /DROP\s+(DATABASE|TABLE)/i, category: 'data', severity: 'block', description: 'Database drop' },
    { pattern: /TRUNCATE\s+TABLE/i, category: 'data', severity: 'block', description: 'Table truncation' },
    { pattern: /DELETE\s+FROM\s+\S+\s*;?\s*$/i, category: 'data', severity: 'warning', description: 'Delete without WHERE' },

    // Credential access
    { pattern: /cat\s+.*\/(\.env|\.ssh|credentials|secrets)/, category: 'credential', severity: 'warning', description: 'Reading credentials' },
    { pattern: /echo\s+.*>>\s*~?\/?\.ssh\/authorized_keys/, category: 'credential', severity: 'block', description: 'SSH key injection' },

    // Process control
    { pattern: /kill\s+-9\s+1\b/, category: 'process', severity: 'block', description: 'Kill init process' },
    { pattern: /pkill\s+-9\s+\*/, category: 'process', severity: 'block', description: 'Kill all processes' },
    { pattern: /killall\s+-9/, category: 'process', severity: 'warning', description: 'Kill all by name' }
  ],
  monitoredTools: ['Bash', 'bash', 'shell', 'exec', 'execute', 'run'],
  allowOverride: false
};

let stats: NonInteractiveEnvStats = {
  totalChecks: 0,
  commandsBlocked: 0,
  warningsIssued: 0,
  blockedByCategory: {}
};

/**
 * Detects if running in non-interactive environment
 */
function detectNonInteractive(): boolean {
  // Check common environment indicators
  const indicators = [
    !process.stdin.isTTY,
    process.env.CI === 'true',
    process.env.CONTINUOUS_INTEGRATION === 'true',
    process.env.GITHUB_ACTIONS === 'true',
    process.env.GITLAB_CI === 'true',
    process.env.NON_INTERACTIVE === 'true',
    process.env.DEBIAN_FRONTEND === 'noninteractive'
  ];

  return indicators.some(Boolean);
}

/**
 * Checks command for dangerous patterns
 */
function checkCommand(command: string): DangerousPattern | null {
  for (const pattern of config.blockedPatterns) {
    if (pattern.pattern.test(command)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Generates block message
 */
function generateBlockMessage(pattern: DangerousPattern, command: string): string {
  return `
🚫 **Command Blocked** (Non-Interactive Environment)

**Category:** ${pattern.category}
**Reason:** ${pattern.description}

**Command:**
\`\`\`
${command.substring(0, 200)}${command.length > 200 ? '...' : ''}
\`\`\`

This command has been blocked for safety in non-interactive mode.

**To proceed:**
1. Review the command carefully
2. Run in an interactive environment
3. Or disable this safety check if you understand the risks
`;
}

/**
 * Generates warning message
 */
function generateWarningMessage(pattern: DangerousPattern, command: string): string {
  return `
⚠️ **Potentially Dangerous Command** (Non-Interactive Environment)

**Category:** ${pattern.category}
**Risk:** ${pattern.description}

**Command:**
\`\`\`
${command.substring(0, 200)}${command.length > 200 ? '...' : ''}
\`\`\`

Proceeding with caution. This action is logged.
`;
}

/**
 * Hook: Check commands in non-interactive environment
 */
const checkNonInteractiveCommandHook: HookDefinition<OnToolCallContext> = {
  id: 'builtin:non-interactive-env:check-command',
  name: 'Non-Interactive Env (Check Command)',
  description: 'Checks commands for dangerous patterns in non-interactive environments',
  eventType: 'onToolCall',
  priority: 'critical',
  enabled: true,

  handler: async (context): Promise<HookResult> => {
    if (!config.enabled) return { decision: 'continue' };

    // Check if we should enforce restrictions
    const isNonInteractive = config.autoDetect
      ? detectNonInteractive()
      : config.isNonInteractive;

    if (!isNonInteractive) {
      return { decision: 'continue' };
    }

    // Only check monitored tools
    if (!config.monitoredTools.some(t =>
      context.toolName.toLowerCase().includes(t.toLowerCase())
    )) {
      return { decision: 'continue' };
    }

    stats.totalChecks++;

    // Extract command from tool input
    const input = context.toolInput as Record<string, unknown>;
    const command = (input.command || input.cmd || input.script || '') as string;

    if (!command) {
      return { decision: 'continue' };
    }

    // Check for dangerous patterns
    const danger = checkCommand(command);

    if (!danger) {
      return { decision: 'continue' };
    }

    stats.blockedByCategory[danger.category] =
      (stats.blockedByCategory[danger.category] || 0) + 1;

    if (danger.severity === 'block') {
      stats.commandsBlocked++;
      stats.lastBlockedCommand = command;
      stats.lastBlockTime = Date.now();

      logger.warn({
        command: command.substring(0, 100),
        category: danger.category,
        description: danger.description
      }, 'Dangerous command blocked in non-interactive environment');

      return {
        decision: 'block',
        reason: generateBlockMessage(danger, command),
        metadata: {
          nonInteractiveBlocked: true,
          category: danger.category,
          severity: danger.severity
        }
      };
    } else {
      // Warning only
      stats.warningsIssued++;

      logger.warn({
        command: command.substring(0, 100),
        category: danger.category,
        description: danger.description
      }, 'Potentially dangerous command detected');

      return {
        decision: 'continue',
        injectMessage: generateWarningMessage(danger, command),
        metadata: {
          nonInteractiveWarning: true,
          category: danger.category,
          severity: danger.severity
        }
      };
    }
  }
};

/**
 * All non-interactive environment hooks
 */
export const nonInteractiveEnvHooks = [
  checkNonInteractiveCommandHook
] as HookDefinition[];

/**
 * Registers non-interactive environment hooks
 */
export function registerNonInteractiveEnvHooks(): void {
  for (const hook of nonInteractiveEnvHooks) {
    registerHook(hook);
  }

  // Auto-detect on registration
  if (config.autoDetect) {
    config.isNonInteractive = detectNonInteractive();
    logger.debug({ isNonInteractive: config.isNonInteractive }, 'Non-interactive environment detection');
  }

  logger.debug('Non-interactive environment hooks registered');
}

/**
 * Gets non-interactive environment statistics
 */
export function getNonInteractiveEnvStats(): NonInteractiveEnvStats & {
  config: NonInteractiveEnvConfig;
  detectedAsNonInteractive: boolean;
} {
  return {
    ...stats,
    config,
    detectedAsNonInteractive: config.autoDetect ? detectNonInteractive() : config.isNonInteractive
  };
}

/**
 * Resets non-interactive environment state
 */
export function resetNonInteractiveEnvState(): void {
  stats = {
    totalChecks: 0,
    commandsBlocked: 0,
    warningsIssued: 0,
    blockedByCategory: {}
  };
}

/**
 * Updates non-interactive environment configuration
 */
export function updateNonInteractiveEnvConfig(updates: Partial<NonInteractiveEnvConfig>): void {
  config = { ...config, ...updates };
  logger.info({ config }, 'Non-interactive environment config updated');
}

/**
 * Adds a dangerous pattern
 */
export function addDangerousPattern(pattern: DangerousPattern): void {
  config.blockedPatterns.push(pattern);
  logger.info({ pattern: pattern.description }, 'Dangerous pattern added');
}

/**
 * Sets interactive mode
 */
export function setInteractiveMode(interactive: boolean): void {
  config.isNonInteractive = !interactive;
  config.autoDetect = false;
  logger.info({ interactive }, 'Interactive mode set');
}

export default {
  registerNonInteractiveEnvHooks,
  getNonInteractiveEnvStats,
  resetNonInteractiveEnvState,
  updateNonInteractiveEnvConfig,
  addDangerousPattern,
  setInteractiveMode
};
