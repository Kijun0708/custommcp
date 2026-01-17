// src/tools/mcp-manager.ts

/**
 * MCP Manager Tools
 *
 * MCP tools for managing MCP server configurations.
 * Provides discovery, loading, and lifecycle management.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../utils/logger.js';
import {
  mcpLoader,
  LoadedMcpServer
} from '../features/mcp-loader/index.js';

/**
 * Formats server info for display
 */
function formatServerInfo(server: LoadedMcpServer): string {
  let info = `## ${server.name}\n\n`;
  info += `**Scope:** ${server.scope}\n`;
  info += `**Status:** ${server.running ? '🟢 Running' : '🔴 Stopped'}\n`;
  info += `**Command:** \`${server.config.command}\`\n`;

  if (server.config.args && server.config.args.length > 0) {
    info += `**Args:** ${server.config.args.join(' ')}\n`;
  }

  if (server.config.cwd) {
    info += `**Working Dir:** \`${server.config.cwd}\`\n`;
  }

  if (server.config.env && Object.keys(server.config.env).length > 0) {
    info += `\n**Environment:**\n`;
    for (const [key, value] of Object.entries(server.config.env)) {
      const displayValue = key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('password')
        ? '***' : value;
      info += `- ${key}: ${displayValue}\n`;
    }
  }

  if (server.config.disabled) {
    info += `\n⚠️ **Disabled**\n`;
  }

  info += `\n**Source:** \`${server.sourceFile}\`\n`;

  if (server.pid) {
    info += `**PID:** ${server.pid}\n`;
  }

  if (server.startedAt) {
    info += `**Started:** ${new Date(server.startedAt).toLocaleString()}\n`;
  }

  if (server.lastError) {
    info += `\n❌ **Last Error:** ${server.lastError}\n`;
  }

  if (server.tools && server.tools.length > 0) {
    info += `\n**Exposed Tools:**\n`;
    server.tools.forEach(tool => {
      info += `- ${tool}\n`;
    });
  }

  return info;
}

/**
 * Formats server list for display
 */
function formatServerList(servers: LoadedMcpServer[]): string {
  if (servers.length === 0) {
    return '📭 No MCP servers found.\n\nMCP configs can be placed in:\n- `.claude/mcp.json`\n- `.claude/mcp-servers.json`\n- `~/.claude/mcp.json`\n- `~/.config/claude/mcp.json`';
  }

  let result = `# 🔌 MCP Servers (${servers.length})\n\n`;

  // Group by scope
  const byScope: Record<string, LoadedMcpServer[]> = {
    project: [],
    user: [],
    global: []
  };

  for (const server of servers) {
    byScope[server.scope].push(server);
  }

  for (const [scope, scopeServers] of Object.entries(byScope)) {
    if (scopeServers.length === 0) continue;

    result += `## ${scope.charAt(0).toUpperCase() + scope.slice(1)} Servers\n\n`;
    result += '| Name | Command | Status | Disabled |\n';
    result += '|------|---------|--------|----------|\n';

    for (const server of scopeServers) {
      const status = server.running ? '🟢' : '🔴';
      const disabled = server.config.disabled ? '⚠️' : '-';
      const cmd = server.config.command.length > 30
        ? server.config.command.substring(0, 27) + '...'
        : server.config.command;

      result += `| ${server.name} | \`${cmd}\` | ${status} | ${disabled} |\n`;
    }

    result += '\n';
  }

  return result;
}

/**
 * Registers MCP manager tools
 */
export function registerMcpManagerTools(server: McpServer): void {
  // Initialize MCP loader
  mcpLoader.load();

  // mcp_servers_list - List all MCP servers
  server.tool(
    'mcp_servers_list',
    'List all configured MCP servers',
    {
      scope: z.enum(['all', 'project', 'user', 'global']).default('all')
        .describe('Filter by server scope'),
      running_only: z.boolean().default(false)
        .describe('Show only running servers')
    },
    async ({ scope, running_only }) => {
      try {
        let servers = scope === 'all'
          ? mcpLoader.getAll()
          : mcpLoader.getByScope(scope as 'project' | 'user' | 'global');

        if (running_only) {
          servers = servers.filter(s => s.running);
        }

        const result = formatServerList(servers);

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_list failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_get - Get server details
  server.tool(
    'mcp_servers_get',
    'Get detailed information about an MCP server',
    {
      name: z.string().describe('Server name')
    },
    async ({ name }) => {
      try {
        const mcpServer = mcpLoader.get(name);

        if (!mcpServer) {
          return {
            content: [{ type: 'text', text: `Server not found: ${name}` }],
            isError: true
          };
        }

        const result = formatServerInfo(mcpServer);

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_get failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_start - Start a server
  server.tool(
    'mcp_servers_start',
    'Start an MCP server',
    {
      name: z.string().describe('Server name to start')
    },
    async ({ name }) => {
      try {
        const mcpServer = mcpLoader.get(name);

        if (!mcpServer) {
          return {
            content: [{ type: 'text', text: `Server not found: ${name}` }],
            isError: true
          };
        }

        if (mcpServer.config.disabled) {
          return {
            content: [{ type: 'text', text: `Server is disabled: ${name}` }],
            isError: true
          };
        }

        const success = await mcpLoader.start(name);

        if (success) {
          const updated = mcpLoader.get(name);
          return {
            content: [{
              type: 'text',
              text: `🟢 MCP server started: ${name}\n\nPID: ${updated?.pid || 'N/A'}`
            }]
          };
        } else {
          const updated = mcpLoader.get(name);
          return {
            content: [{
              type: 'text',
              text: `Failed to start server: ${updated?.lastError || 'Unknown error'}`
            }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_start failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_stop - Stop a server
  server.tool(
    'mcp_servers_stop',
    'Stop a running MCP server',
    {
      name: z.string().describe('Server name to stop')
    },
    async ({ name }) => {
      try {
        const success = mcpLoader.stop(name);

        if (success) {
          return {
            content: [{ type: 'text', text: `🔴 MCP server stopped: ${name}` }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Server not running or not found: ${name}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_stop failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_restart - Restart a server
  server.tool(
    'mcp_servers_restart',
    'Restart an MCP server',
    {
      name: z.string().describe('Server name to restart')
    },
    async ({ name }) => {
      try {
        const success = await mcpLoader.restart(name);

        if (success) {
          const updated = mcpLoader.get(name);
          return {
            content: [{
              type: 'text',
              text: `🔄 MCP server restarted: ${name}\n\nPID: ${updated?.pid || 'N/A'}`
            }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Failed to restart server: ${name}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_restart failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_reload - Reload all server configs
  server.tool(
    'mcp_servers_reload',
    'Reload all MCP server configurations from disk',
    {},
    async () => {
      try {
        const servers = mcpLoader.reload();

        let result = `🔄 MCP server configs reloaded\n\n`;
        result += `**Total:** ${servers.length} servers\n\n`;

        const stats = mcpLoader.stats();
        result += `**By Scope:**\n`;
        result += `- Project: ${stats.serversByScope.project}\n`;
        result += `- User: ${stats.serversByScope.user}\n`;
        result += `- Global: ${stats.serversByScope.global}\n`;

        result += `\n**Config Files Found:** ${stats.configFilesFound}`;

        if (stats.loadErrors > 0) {
          result += `\n⚠️ **Load Errors:** ${stats.loadErrors}`;
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_reload failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_stats - Get MCP loader statistics
  server.tool(
    'mcp_servers_stats',
    'Get MCP server loader statistics',
    {},
    async () => {
      try {
        const stats = mcpLoader.stats();
        const running = mcpLoader.running();

        let result = '# 📊 MCP Servers Statistics\n\n';

        result += '## Server Stats\n\n';
        result += `- **Total Loaded:** ${stats.totalServersLoaded}\n`;
        result += `- **Running:** ${stats.runningServers}\n`;
        result += `- **Config Files Found:** ${stats.configFilesFound}\n`;
        result += `- **Load Errors:** ${stats.loadErrors}\n`;

        result += '\n## By Scope\n\n';
        result += `- **Project:** ${stats.serversByScope.project}\n`;
        result += `- **User:** ${stats.serversByScope.user}\n`;
        result += `- **Global:** ${stats.serversByScope.global}\n`;

        if (running.length > 0) {
          result += '\n## Running Servers\n\n';
          result += '| Name | PID | Started |\n';
          result += '|------|-----|--------|\n';

          for (const srv of running) {
            const started = srv.startedAt
              ? new Date(srv.startedAt).toLocaleTimeString()
              : 'N/A';
            result += `| ${srv.name} | ${srv.pid || 'N/A'} | ${started} |\n`;
          }
        }

        if (stats.lastLoadTime) {
          result += `\n**Last Load:** ${new Date(stats.lastLoadTime).toLocaleString()}\n`;
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_stats failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_add - Add a server configuration
  server.tool(
    'mcp_servers_add',
    'Add an MCP server configuration at runtime',
    {
      name: z.string().describe('Server name'),
      command: z.string().describe('Server command'),
      args: z.array(z.string()).optional().describe('Command arguments'),
      env: z.record(z.string()).optional().describe('Environment variables'),
      cwd: z.string().optional().describe('Working directory'),
      scope: z.enum(['project', 'user', 'global']).default('project')
        .describe('Server scope'),
      auto_start: z.boolean().default(false).describe('Start server after adding')
    },
    async ({ name, command, args, env, cwd, scope, auto_start }) => {
      try {
        // Check if exists
        if (mcpLoader.get(name)) {
          return {
            content: [{ type: 'text', text: `Server already exists: ${name}` }],
            isError: true
          };
        }

        mcpLoader.add(name, {
          command,
          args,
          env,
          cwd
        }, scope as 'project' | 'user' | 'global');

        let result = `✅ MCP server added: ${name}\n\n`;
        result += `**Command:** \`${command}\`\n`;
        result += `**Scope:** ${scope}\n`;

        if (auto_start) {
          const success = await mcpLoader.start(name);
          if (success) {
            const srv = mcpLoader.get(name);
            result += `\n🟢 Server started (PID: ${srv?.pid || 'N/A'})`;
          } else {
            result += `\n⚠️ Failed to auto-start server`;
          }
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_add failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  // mcp_servers_remove - Remove a server configuration
  server.tool(
    'mcp_servers_remove',
    'Remove an MCP server configuration',
    {
      name: z.string().describe('Server name to remove')
    },
    async ({ name }) => {
      try {
        const success = mcpLoader.remove(name);

        if (success) {
          return {
            content: [{ type: 'text', text: `✅ MCP server removed: ${name}` }]
          };
        } else {
          return {
            content: [{ type: 'text', text: `Server not found: ${name}` }],
            isError: true
          };
        }
      } catch (error: any) {
        logger.error({ error: error.message }, 'mcp_servers_remove failed');
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    }
  );

  logger.info('MCP Manager tools registered (9 tools)');
}

export default { registerMcpManagerTools };
