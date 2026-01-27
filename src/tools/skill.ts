// src/tools/skill.ts

/**
 * Skill System MCP Tools
 *
 * MCP tools for managing and executing skills.
 * Provides skill discovery, activation, execution, and monitoring.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';
import {
  skillSystem,
  LoadedSkill,
  SkillExecutionContext
} from '../features/skill-system/index.js';
import { callExpertWithFallback } from '../services/expert-router.js';
import { getHudStateWriter } from '../hud/index.js';

/**
 * Formats skill info for display
 */
function formatSkillInfo(skill: LoadedSkill): string {
  let info = `## ${skill.name}\n\n`;
  info += `**ID:** \`${skill.id}\`\n`;
  info += `**Scope:** ${skill.scope}\n`;
  info += `**Status:** ${skill.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
  info += `**State:** ${skill.state}\n`;

  if (skill.description) {
    info += `\n**Description:**\n${skill.description}\n`;
  }

  if (skill.version) {
    info += `\n**Version:** ${skill.version}\n`;
  }

  if (skill.author) {
    info += `**Author:** ${skill.author}\n`;
  }

  if (skill.expert) {
    info += `**Expert:** \`${skill.expert}\`\n`;
  }

  if (skill.argumentHint) {
    info += `**Arguments:** ${skill.argumentHint}\n`;
  }

  if (skill.tags && skill.tags.length > 0) {
    info += `**Tags:** ${skill.tags.join(', ')}\n`;
  }

  if (skill.filePath) {
    info += `\n**File:** \`${skill.filePath}\`\n`;
  }

  if (skill.tools && skill.tools.length > 0) {
    info += `\n**Available Tools:**\n`;
    skill.tools.forEach(tool => {
      info += `- ${tool}\n`;
    });
  }

  if (skill.requires && skill.requires.length > 0) {
    info += `\n**Requirements:**\n`;
    skill.requires.forEach(req => {
      info += `- ${req}\n`;
    });
  }

  if (skill.mcp) {
    info += `\n**MCP Server:**\n`;
    info += `- Command: \`${skill.mcp.command}\`\n`;
    if (skill.mcp.args) {
      info += `- Args: ${skill.mcp.args.join(' ')}\n`;
    }
    if (skill.mcpProcess) {
      info += `- Status: ${skill.mcpProcess.running ? '🟢 Running' : '🔴 Stopped'}\n`;
      if (skill.mcpProcess.pid) {
        info += `- PID: ${skill.mcpProcess.pid}\n`;
      }
    }
  }

  info += `\n**Usage Count:** ${skill.usageCount}\n`;
  info += `**Loaded At:** ${new Date(skill.loadedAt).toLocaleString()}\n`;

  if (skill.lastUsedAt) {
    info += `**Last Used:** ${new Date(skill.lastUsedAt).toLocaleString()}\n`;
  }

  return info;
}

/**
 * Formats skill list for display
 */
function formatSkillList(skills: LoadedSkill[]): string {
  if (skills.length === 0) {
    return '📭 No skills found.\n\nSkills can be placed in:\n- `.opencode/skills/`\n- `.claude/skills/`\n- `.skills/`\n- `~/.config/opencode/skills/`\n- `~/.claude/skills/`\n- `~/.llm-router/skills/`';
  }

  let result = `# 📚 Skills (${skills.length})\n\n`;

  // Group by scope
  const byScope: Record<string, LoadedSkill[]> = {
    project: [],
    user: [],
    global: [],
    builtin: []
  };

  for (const skill of skills) {
    byScope[skill.scope].push(skill);
  }

  for (const [scope, scopeSkills] of Object.entries(byScope)) {
    if (scopeSkills.length === 0) continue;

    result += `## ${scope.charAt(0).toUpperCase() + scope.slice(1)} Skills\n\n`;
    result += '| Name | ID | Status | MCP | Usage |\n';
    result += '|------|-----|--------|-----|-------|\n';

    for (const skill of scopeSkills) {
      const status = skill.enabled ? '✅' : '❌';
      const mcp = skill.mcp
        ? (skill.mcpProcess?.running ? '🟢' : '🔴')
        : '-';

      result += `| ${skill.name} | \`${skill.id}\` | ${status} | ${mcp} | ${skill.usageCount} |\n`;
    }

    result += '\n';
  }

  return result;
}

/**
 * Registers skill MCP tools
 */
export function registerSkillTools(server: McpServer): void {
  // Initialize skill system
  skillSystem.init();

  // skill_list - List all skills
  server.tool(
    'skill_list',
    'List all available skills',
    {
      scope: z.enum(['all', 'project', 'user', 'global', 'builtin']).default('all')
        .describe('Filter by skill scope'),
      enabled_only: z.boolean().default(false)
        .describe('Show only enabled skills'),
      tag: z.string().optional()
        .describe('Filter by tag')
    },
    async ({ scope, enabled_only, tag }) => {
      try {
        const options: { scope?: string; enabled?: boolean; tag?: string } = {};

        if (scope !== 'all') {
          options.scope = scope;
        }

        if (enabled_only) {
          options.enabled = true;
        }

        if (tag) {
          options.tag = tag;
        }

        const skills = skillSystem.list(options);
        const result = formatSkillList(skills);

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_list failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_get - Get skill details
  server.tool(
    'skill_get',
    'Get detailed information about a specific skill',
    {
      skill_id: z.string().describe('Skill ID or name')
    },
    async ({ skill_id }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        const result = formatSkillInfo(skill);

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_get failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_execute - Execute a skill
  server.tool(
    'skill_execute',
    'Execute a skill with given input',
    {
      skill_id: z.string().describe('Skill ID or name to execute'),
      input: z.string().describe('Input/prompt for the skill'),
      context: z.record(z.unknown()).optional()
        .describe('Additional context variables')
    },
    async ({ skill_id, input, context }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        // HUD에 스킬 사용 기록
        try { getHudStateWriter().recordSkillUsage(skill.name); } catch {}

        // Expert 자동 라우팅: skill에 expert 필드가 있으면 해당 전문가에게 위임
        if (skill.expert && skill.prompt) {
          const startTime = Date.now();
          const expertPrompt = `${skill.prompt}\n\n---\n\n## 사용자 요청\n\n${input}`;

          logger.info({
            skillId: skill.id,
            expert: skill.expert,
            inputLength: input.length
          }, 'Routing skill to expert');

          const expertResult = await callExpertWithFallback(
            skill.expert,
            expertPrompt,
            context ? JSON.stringify(context) : undefined
          );

          const duration = Date.now() - startTime;
          skillSystem.recordUsage(skill.id);

          let response = `✅ **Skill: ${skill.name}** → Expert: \`${expertResult.actualExpert}\`\n\n`;
          response += `**Duration:** ${duration}ms`;
          if (expertResult.fellBack) {
            response += ` (fallback from ${skill.expert})`;
          }
          response += '\n\n';
          response += expertResult.response;

          return {
            content: [{ type: 'text', text: response }]
          };
        }

        // 기본 실행 경로 (expert 미지정 시)
        const execContext: SkillExecutionContext = {
          cwd: process.cwd(),
          env: process.env as Record<string, string>,
          input,
          context
        };

        const result = await skillSystem.execute(skill.id, execContext);

        if (!result.success) {
          return {
            content: [{
              type: 'text',
              text: `❌ Skill execution failed: ${result.error}\n\nDuration: ${result.duration}ms`
            }],
            isError: true
          };
        }

        let response = `✅ **Skill Executed: ${skill.name}**\n\n`;
        response += `**Duration:** ${result.duration}ms\n\n`;

        if (result.output) {
          response += `**Output:**\n\n${result.output}`;
        }

        return {
          content: [{ type: 'text', text: response }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_execute failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_activate - Activate a skill
  server.tool(
    'skill_activate',
    'Activate a skill (enable and optionally start MCP)',
    {
      skill_id: z.string().describe('Skill ID or name to activate')
    },
    async ({ skill_id }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        const success = await skillSystem.activate(skill.id);

        if (success) {
          return {
            content: [{
              type: 'text',
              text: `✅ Skill activated: ${skill.name}\n\n${skill.mcp ? 'MCP server started.' : ''}`
            }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Failed to activate skill: ${skill_id}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_activate failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_deactivate - Deactivate a skill
  server.tool(
    'skill_deactivate',
    'Deactivate a skill (disable and stop MCP)',
    {
      skill_id: z.string().describe('Skill ID or name to deactivate')
    },
    async ({ skill_id }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        const success = skillSystem.deactivate(skill.id);

        if (success) {
          return {
            content: [{
              type: 'text',
              text: `✅ Skill deactivated: ${skill.name}\n\n${skill.mcp ? 'MCP server stopped.' : ''}`
            }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Failed to deactivate skill: ${skill_id}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_deactivate failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_reload - Reload all skills
  server.tool(
    'skill_reload',
    'Reload all skills from disk',
    {},
    async () => {
      try {
        const skills = skillSystem.reload();

        let result = `🔄 Skills reloaded\n\n`;
        result += `**Total:** ${skills.length} skills\n\n`;

        const stats = skillSystem.loaderStats();
        result += `**By Scope:**\n`;
        result += `- Project: ${stats.skillsByScope.project}\n`;
        result += `- User: ${stats.skillsByScope.user}\n`;
        result += `- Global: ${stats.skillsByScope.global}\n`;
        result += `- Builtin: ${stats.skillsByScope.builtin}\n`;

        if (stats.loadErrors > 0) {
          result += `\n⚠️ **Load Errors:** ${stats.loadErrors}`;
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_reload failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_stats - Get skill system statistics
  server.tool(
    'skill_stats',
    'Get skill system statistics',
    {},
    async () => {
      try {
        const stats = skillSystem.managerStats();
        const runningMcp = skillSystem.runningMcp();

        let result = '# 📊 Skill System Statistics\n\n';

        result += '## Execution Stats\n\n';
        result += `- **Total Executions:** ${stats.totalExecutions}\n`;
        result += `- **Successful:** ${stats.successfulExecutions}\n`;
        result += `- **Failed:** ${stats.failedExecutions}\n`;
        result += `- **Success Rate:** ${stats.totalExecutions > 0
          ? ((stats.successfulExecutions / stats.totalExecutions) * 100).toFixed(1)
          : 0}%\n`;
        result += `- **Avg Execution Time:** ${stats.averageExecutionTime.toFixed(0)}ms\n`;

        result += '\n## Skill Stats\n\n';
        result += `- **Active Skills:** ${stats.activeSkills}\n`;
        result += `- **Running MCP Processes:** ${stats.runningMcpProcesses}\n`;

        if (runningMcp.length > 0) {
          result += '\n### Running MCP Servers\n\n';
          result += '| Skill ID | PID | Started |\n';
          result += '|----------|-----|--------|\n';

          for (const mcp of runningMcp) {
            const started = mcp.startedAt
              ? new Date(mcp.startedAt).toLocaleTimeString()
              : 'N/A';
            result += `| ${mcp.skillId} | ${mcp.pid || 'N/A'} | ${started} |\n`;
          }
        }

        result += '\n## Loader Stats\n\n';
        result += `- **Total Loaded:** ${stats.loaderStats.totalSkillsLoaded}\n`;
        result += `- **Load Errors:** ${stats.loaderStats.loadErrors}\n`;

        if (stats.lastExecutionTime) {
          result += `\n**Last Execution:** ${new Date(stats.lastExecutionTime).toLocaleString()}\n`;
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_stats failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_mcp_start - Start MCP server for a skill
  server.tool(
    'skill_mcp_start',
    'Start MCP server for a skill',
    {
      skill_id: z.string().describe('Skill ID with MCP configuration')
    },
    async ({ skill_id }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        if (!skill.mcp) {
          return {
            content: [{ type: 'text', text: `Skill ${skill_id} does not have MCP configuration` }],
            isError: true
          };
        }

        const success = await skillSystem.startMcp(skill);

        if (success) {
          return {
            content: [{
              type: 'text',
              text: `🟢 MCP server started for ${skill.name}\n\nPID: ${skill.mcpProcess?.pid || 'N/A'}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Failed to start MCP server: ${skill.mcpProcess?.lastError || 'Unknown error'}`
            }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_mcp_start failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // skill_mcp_stop - Stop MCP server for a skill
  server.tool(
    'skill_mcp_stop',
    'Stop MCP server for a skill',
    {
      skill_id: z.string().describe('Skill ID with running MCP')
    },
    async ({ skill_id }) => {
      try {
        const skill = skillSystem.find(skill_id);

        if (!skill) {
          return {
            content: [{ type: 'text', text: `Skill not found: ${skill_id}` }],
            isError: true
          };
        }

        const success = skillSystem.stopMcp(skill.id);

        if (success) {
          return {
            content: [{ type: 'text', text: `🔴 MCP server stopped for ${skill.name}` }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `No running MCP server for skill: ${skill_id}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'skill_mcp_stop failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  logger.info('Skill MCP tools registered (9 tools)');
}

export default { registerSkillTools };
