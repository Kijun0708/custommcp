// src/tools/todo-manager.ts

/**
 * TODO Manager MCP Tools
 *
 * MCP tools for tracking and managing tasks.
 * Provides TODO list management with reminders.
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';

// MCP response type
type McpResponse = { content: Array<{ type: 'text'; text: string }> };

/**
 * Creates MCP response
 */
function mcpResponse(text: string): McpResponse {
  return { content: [{ type: 'text', text }] };
}

// ============================================================================
// TODO State
// ============================================================================

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  tags?: string[];
  blockedBy?: string;
  notes?: string;
}

interface TodoState {
  items: Map<string, TodoItem>;
  nextId: number;
  sessionStartedAt: Date;
  reminderCount: number;
  lastReminderAt?: Date;
}

let state: TodoState = {
  items: new Map(),
  nextId: 1,
  sessionStartedAt: new Date(),
  reminderCount: 0
};

function generateId(): string {
  return `todo-${state.nextId++}`;
}

// ============================================================================
// TODO Tools
// ============================================================================

export const todoAddSchema = z.object({
  content: z.string().describe('Task description'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().describe('Task priority'),
  tags: z.array(z.string()).optional().describe('Tags for categorization')
});

export const todoAddTool = {
  name: 'todo_add',
  description: 'Adds a new TODO item to the task list.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      content: { type: 'string', description: 'Task description' },
      priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'], description: 'Task priority' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' }
    },
    required: ['content']
  }
};

export async function handleTodoAdd(args: z.infer<typeof todoAddSchema>): Promise<McpResponse> {
  const id = generateId();
  const now = new Date();

  const item: TodoItem = {
    id,
    content: args.content,
    status: 'pending',
    priority: args.priority || 'normal',
    createdAt: now,
    updatedAt: now,
    tags: args.tags
  };

  state.items.set(id, item);
  logger.info({ id, content: args.content }, 'TODO added');

  const priorityEmoji = { low: '🔵', normal: '🟢', high: '🟡', critical: '🔴' }[item.priority];

  return mcpResponse(`✅ Added TODO: ${priorityEmoji} **${id}**

> ${args.content}

${args.tags ? `Tags: ${args.tags.join(', ')}` : ''}

Use \`todo_list\` to see all tasks.`);
}

export const todoUpdateSchema = z.object({
  id: z.string().describe('TODO ID'),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  notes: z.string().optional().describe('Additional notes'),
  blockedBy: z.string().optional().describe('What is blocking this task')
});

export const todoUpdateTool = {
  name: 'todo_update',
  description: 'Updates an existing TODO item.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'TODO ID' },
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'], description: 'New status' },
      priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'], description: 'New priority' },
      notes: { type: 'string', description: 'Additional notes' },
      blockedBy: { type: 'string', description: 'What is blocking this task' }
    },
    required: ['id']
  }
};

export async function handleTodoUpdate(args: z.infer<typeof todoUpdateSchema>): Promise<McpResponse> {
  const item = state.items.get(args.id);

  if (!item) {
    return mcpResponse(`❌ TODO "${args.id}" not found. Use \`todo_list\` to see all tasks.`);
  }

  const oldStatus = item.status;

  if (args.status) item.status = args.status;
  if (args.priority) item.priority = args.priority;
  if (args.notes) item.notes = args.notes;
  if (args.blockedBy) item.blockedBy = args.blockedBy;

  item.updatedAt = new Date();

  if (args.status === 'completed' && oldStatus !== 'completed') {
    item.completedAt = new Date();
  }

  logger.info({ id: args.id, status: item.status }, 'TODO updated');

  const statusEmoji = { pending: '⏳', in_progress: '🔄', completed: '✅', blocked: '🚫' }[item.status];

  return mcpResponse(`${statusEmoji} Updated **${args.id}**

> ${item.content}

Status: ${item.status}
${item.notes ? `Notes: ${item.notes}` : ''}
${item.blockedBy ? `Blocked by: ${item.blockedBy}` : ''}`);
}

export const todoCompleteSchema = z.object({
  id: z.string().describe('TODO ID to mark as completed')
});

export const todoCompleteTool = {
  name: 'todo_complete',
  description: 'Marks a TODO item as completed',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'TODO ID to mark as completed' }
    },
    required: ['id']
  }
};

export async function handleTodoComplete(args: z.infer<typeof todoCompleteSchema>): Promise<McpResponse> {
  return handleTodoUpdate({ id: args.id, status: 'completed' });
}

export const todoListSchema = z.object({
  status: z.enum(['all', 'pending', 'in_progress', 'completed', 'blocked', 'active']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional()
});

export const todoListTool = {
  name: 'todo_list',
  description: 'Lists all TODO items. Can filter by status or priority.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['all', 'pending', 'in_progress', 'completed', 'blocked', 'active'], description: 'Filter by status' },
      priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'], description: 'Filter by priority' }
    }
  }
};

export async function handleTodoList(args: z.infer<typeof todoListSchema>): Promise<McpResponse> {
  let items = Array.from(state.items.values());

  if (args.status && args.status !== 'all') {
    if (args.status === 'active') {
      items = items.filter(i => i.status === 'pending' || i.status === 'in_progress');
    } else {
      items = items.filter(i => i.status === args.status);
    }
  }

  if (args.priority) {
    items = items.filter(i => i.priority === args.priority);
  }

  if (items.length === 0) {
    return mcpResponse(`📭 No TODO items found.

Use \`todo_add { "content": "Your task" }\` to add a task.`);
  }

  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  const statusOrder = { in_progress: 0, pending: 1, blocked: 2, completed: 3 };

  items.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  let result = `# 📋 TODO List (${items.length})\n\n`;

  const statusEmoji = { pending: '⏳', in_progress: '🔄', completed: '✅', blocked: '🚫' };
  const priorityEmoji = { low: '🔵', normal: '🟢', high: '🟡', critical: '🔴' };

  const byStatus = new Map<string, TodoItem[]>();
  for (const item of items) {
    if (!byStatus.has(item.status)) {
      byStatus.set(item.status, []);
    }
    byStatus.get(item.status)!.push(item);
  }

  for (const [status, statusItems] of byStatus) {
    result += `## ${statusEmoji[status as keyof typeof statusEmoji]} ${status.charAt(0).toUpperCase() + status.slice(1)} (${statusItems.length})\n\n`;

    for (const item of statusItems) {
      result += `- ${priorityEmoji[item.priority]} **${item.id}**: ${item.content}`;
      if (item.tags && item.tags.length > 0) {
        result += ` _[${item.tags.join(', ')}]_`;
      }
      if (item.blockedBy) {
        result += ` (blocked by: ${item.blockedBy})`;
      }
      result += '\n';
    }
    result += '\n';
  }

  const pending = items.filter(i => i.status === 'pending').length;
  const inProgress = items.filter(i => i.status === 'in_progress').length;
  const completed = items.filter(i => i.status === 'completed').length;
  const blocked = items.filter(i => i.status === 'blocked').length;

  result += `---\n**Summary:** ${pending} pending, ${inProgress} in progress, ${completed} completed, ${blocked} blocked`;

  return mcpResponse(result);
}

export const todoRemindSchema = z.object({
  includeCompleted: z.boolean().optional().describe('Include completed items in reminder')
});

export const todoRemindTool = {
  name: 'todo_remind',
  description: 'Gets a reminder of pending/in-progress tasks.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      includeCompleted: { type: 'boolean', description: 'Include completed items in reminder' }
    }
  }
};

export async function handleTodoRemind(args: z.infer<typeof todoRemindSchema>): Promise<McpResponse> {
  state.reminderCount++;
  state.lastReminderAt = new Date();

  const items = Array.from(state.items.values());
  const active = items.filter(i => i.status === 'pending' || i.status === 'in_progress');
  const blocked = items.filter(i => i.status === 'blocked');
  const completed = items.filter(i => i.status === 'completed');

  if (active.length === 0 && blocked.length === 0) {
    if (completed.length > 0 && args.includeCompleted) {
      return mcpResponse(`✅ **All tasks completed!** (${completed.length} total)

Great work! All tasks have been marked as completed.`);
    }
    return mcpResponse(`📭 **No pending tasks**

The TODO list is empty. Add tasks with \`todo_add\`.`);
  }

  let result = `# ⏰ TODO Reminder\n\n`;

  const critical = active.filter(i => i.priority === 'critical');
  const high = active.filter(i => i.priority === 'high');

  if (critical.length > 0) {
    result += `## 🔴 CRITICAL (${critical.length})\n\n`;
    for (const item of critical) {
      const status = item.status === 'in_progress' ? '🔄' : '⏳';
      result += `${status} **${item.id}**: ${item.content}\n`;
    }
    result += '\n';
  }

  if (high.length > 0) {
    result += `## 🟡 High Priority (${high.length})\n\n`;
    for (const item of high) {
      const status = item.status === 'in_progress' ? '🔄' : '⏳';
      result += `${status} **${item.id}**: ${item.content}\n`;
    }
    result += '\n';
  }

  const other = active.filter(i => i.priority !== 'critical' && i.priority !== 'high');
  if (other.length > 0) {
    result += `## Other Tasks (${other.length})\n\n`;
    for (const item of other) {
      const status = item.status === 'in_progress' ? '🔄' : '⏳';
      result += `${status} ${item.content}\n`;
    }
    result += '\n';
  }

  if (blocked.length > 0) {
    result += `## 🚫 Blocked (${blocked.length})\n\n`;
    for (const item of blocked) {
      result += `- ${item.content}`;
      if (item.blockedBy) result += ` (by: ${item.blockedBy})`;
      result += '\n';
    }
    result += '\n';
  }

  result += `---\n`;
  result += `**Active:** ${active.length} | **Blocked:** ${blocked.length} | **Completed:** ${completed.length}\n`;
  result += `_Reminder #${state.reminderCount} this session_`;

  return mcpResponse(result);
}

export const todoClearSchema = z.object({
  status: z.enum(['all', 'completed']).optional().describe('Which items to clear')
});

export const todoClearTool = {
  name: 'todo_clear',
  description: 'Clears TODO items. By default, clears only completed items.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['all', 'completed'], description: 'Which items to clear (default: completed)' }
    }
  }
};

export async function handleTodoClear(args: z.infer<typeof todoClearSchema>): Promise<McpResponse> {
  const clearAll = args.status === 'all';
  let cleared = 0;

  if (clearAll) {
    cleared = state.items.size;
    state.items.clear();
  } else {
    for (const [id, item] of state.items) {
      if (item.status === 'completed') {
        state.items.delete(id);
        cleared++;
      }
    }
  }

  logger.info({ cleared, clearAll }, 'TODOs cleared');

  return mcpResponse(`🧹 Cleared ${cleared} ${clearAll ? 'all' : 'completed'} TODO item(s).

Remaining: ${state.items.size} items`);
}

export function getTodoStats(): {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  reminderCount: number;
} {
  const items = Array.from(state.items.values());

  return {
    total: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    completed: items.filter(i => i.status === 'completed').length,
    blocked: items.filter(i => i.status === 'blocked').length,
    reminderCount: state.reminderCount
  };
}

export function resetTodoState(): void {
  state = {
    items: new Map(),
    nextId: 1,
    sessionStartedAt: new Date(),
    reminderCount: 0
  };
}

export default {
  todoAddTool, todoAddSchema, handleTodoAdd,
  todoUpdateTool, todoUpdateSchema, handleTodoUpdate,
  todoCompleteTool, todoCompleteSchema, handleTodoComplete,
  todoListTool, todoListSchema, handleTodoList,
  todoRemindTool, todoRemindSchema, handleTodoRemind,
  todoClearTool, todoClearSchema, handleTodoClear,
  getTodoStats, resetTodoState
};
