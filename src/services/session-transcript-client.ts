// src/services/session-transcript-client.ts

/**
 * Session Transcript Client Service
 *
 * Provides functionality to read and search Claude Code session transcripts.
 * Sessions are stored as JSONL files in ~/.claude/transcripts/
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger.js';

/**
 * Session message
 */
export interface SessionMessage {
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result';
  content: string;
  timestamp?: string;
  toolName?: string;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  id: string;
  path: string;
  project?: string;
  createdAt: Date;
  modifiedAt: Date;
  size: number;
  messageCount: number;
}

/**
 * Session detail
 */
export interface SessionDetail extends SessionMetadata {
  messages: SessionMessage[];
}

/**
 * Search result
 */
export interface SessionSearchResult {
  sessionId: string;
  sessionPath: string;
  matches: {
    lineNumber: number;
    type: string;
    content: string;
    context: string;
  }[];
}

/**
 * Gets the transcripts directory path
 */
function getTranscriptsDir(): string {
  // Try multiple possible locations
  const possiblePaths = [
    join(homedir(), '.claude', 'transcripts'),
    join(homedir(), '.claude', 'projects'),
    join(homedir(), 'AppData', 'Local', 'claude-code', 'transcripts')
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Return default path even if it doesn't exist
  return possiblePaths[0];
}

/**
 * Lists all session files
 */
export function listSessions(options: {
  limit?: number;
  project?: string;
  after?: Date;
  before?: Date;
} = {}): SessionMetadata[] {
  const { limit = 50, project, after, before } = options;
  const transcriptsDir = getTranscriptsDir();

  if (!existsSync(transcriptsDir)) {
    logger.warn({ dir: transcriptsDir }, 'Transcripts directory not found');
    return [];
  }

  const sessions: SessionMetadata[] = [];

  try {
    // Recursively find all .jsonl files
    const findJsonlFiles = (dir: string, depth = 0): string[] => {
      if (depth > 3) return []; // Limit depth

      const files: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          files.push(...findJsonlFiles(fullPath, depth + 1));
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath);
        }
      }

      return files;
    };

    const jsonlFiles = findJsonlFiles(transcriptsDir);

    for (const filePath of jsonlFiles) {
      try {
        const stats = statSync(filePath);
        const id = basename(filePath, '.jsonl');

        // Extract project name from path
        const relativePath = filePath.replace(transcriptsDir, '').replace(/^[/\\]/, '');
        const projectName = relativePath.includes('/') || relativePath.includes('\\')
          ? relativePath.split(/[/\\]/)[0]
          : undefined;

        // Apply filters
        if (project && projectName !== project) continue;
        if (after && stats.mtime < after) continue;
        if (before && stats.mtime > before) continue;

        // Count messages (read first line to check validity)
        let messageCount = 0;
        try {
          const content = readFileSync(filePath, 'utf-8');
          messageCount = content.split('\n').filter(l => l.trim()).length;
        } catch {
          messageCount = 0;
        }

        sessions.push({
          id,
          path: filePath,
          project: projectName,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          size: stats.size,
          messageCount
        });
      } catch (error) {
        logger.debug({ error, path: filePath }, 'Failed to read session file');
      }
    }

    // Sort by modification time (newest first)
    sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    return sessions.slice(0, limit);
  } catch (error) {
    logger.error({ error }, 'Failed to list sessions');
    return [];
  }
}

/**
 * Reads a session's messages
 */
export function readSession(sessionId: string, options: {
  limit?: number;
  offset?: number;
} = {}): SessionDetail | null {
  const { limit = 100, offset = 0 } = options;
  const transcriptsDir = getTranscriptsDir();

  // Try to find the session file
  let sessionPath: string | null = null;

  // First, try direct path if it looks like an ID
  const directPath = join(transcriptsDir, `${sessionId}.jsonl`);
  if (existsSync(directPath)) {
    sessionPath = directPath;
  }

  // If not found, search recursively
  if (!sessionPath) {
    const findSession = (dir: string, depth = 0): string | null => {
      if (depth > 3) return null;

      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          const found = findSession(fullPath, depth + 1);
          if (found) return found;
        } else if (entry.isFile() &&
                   (entry.name === `${sessionId}.jsonl` ||
                    entry.name.includes(sessionId))) {
          return fullPath;
        }
      }

      return null;
    };

    sessionPath = findSession(transcriptsDir);
  }

  if (!sessionPath || !existsSync(sessionPath)) {
    return null;
  }

  try {
    const stats = statSync(sessionPath);
    const content = readFileSync(sessionPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const messages: SessionMessage[] = [];

    for (let i = offset; i < Math.min(lines.length, offset + limit); i++) {
      try {
        const line = lines[i];
        const data = JSON.parse(line);

        // Handle different message formats
        let msg: SessionMessage;

        if (data.type === 'user' || data.role === 'user') {
          msg = {
            type: 'user',
            content: typeof data.content === 'string'
              ? data.content
              : JSON.stringify(data.content),
            timestamp: data.timestamp
          };
        } else if (data.type === 'assistant' || data.role === 'assistant') {
          msg = {
            type: 'assistant',
            content: typeof data.content === 'string'
              ? data.content
              : JSON.stringify(data.content),
            timestamp: data.timestamp
          };
        } else if (data.type === 'tool_use') {
          msg = {
            type: 'tool_use',
            content: JSON.stringify(data.input || data.content || {}),
            toolName: data.name || data.tool_name,
            timestamp: data.timestamp
          };
        } else if (data.type === 'tool_result') {
          msg = {
            type: 'tool_result',
            content: typeof data.content === 'string'
              ? data.content
              : JSON.stringify(data.content),
            toolName: data.tool_name,
            timestamp: data.timestamp
          };
        } else {
          msg = {
            type: 'system',
            content: JSON.stringify(data),
            timestamp: data.timestamp
          };
        }

        messages.push(msg);
      } catch {
        // Skip malformed lines
      }
    }

    const id = basename(sessionPath, '.jsonl');
    const relativePath = sessionPath.replace(transcriptsDir, '').replace(/^[/\\]/, '');
    const projectName = relativePath.includes('/') || relativePath.includes('\\')
      ? relativePath.split(/[/\\]/)[0]
      : undefined;

    return {
      id,
      path: sessionPath,
      project: projectName,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
      size: stats.size,
      messageCount: lines.length,
      messages
    };
  } catch (error) {
    logger.error({ error, sessionId }, 'Failed to read session');
    return null;
  }
}

/**
 * Searches across all sessions
 */
export function searchSessions(query: string, options: {
  limit?: number;
  caseSensitive?: boolean;
  type?: 'user' | 'assistant' | 'all';
} = {}): SessionSearchResult[] {
  const { limit = 50, caseSensitive = false, type = 'all' } = options;
  const transcriptsDir = getTranscriptsDir();

  if (!existsSync(transcriptsDir)) {
    return [];
  }

  const results: SessionSearchResult[] = [];
  const searchQuery = caseSensitive ? query : query.toLowerCase();

  try {
    const sessions = listSessions({ limit: 100 });

    for (const session of sessions) {
      if (results.length >= limit) break;

      try {
        const content = readFileSync(session.path, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());
        const matches: SessionSearchResult['matches'] = [];

        for (let i = 0; i < lines.length; i++) {
          try {
            const line = lines[i];
            const data = JSON.parse(line);

            // Extract searchable content
            let msgContent = '';
            let msgType = 'unknown';

            if (data.type === 'user' || data.role === 'user') {
              msgContent = typeof data.content === 'string'
                ? data.content
                : JSON.stringify(data.content);
              msgType = 'user';
            } else if (data.type === 'assistant' || data.role === 'assistant') {
              msgContent = typeof data.content === 'string'
                ? data.content
                : JSON.stringify(data.content);
              msgType = 'assistant';
            }

            // Filter by type
            if (type !== 'all' && msgType !== type) continue;

            // Check for match
            const searchContent = caseSensitive ? msgContent : msgContent.toLowerCase();
            if (searchContent.includes(searchQuery)) {
              // Extract context around match
              const matchIndex = searchContent.indexOf(searchQuery);
              const start = Math.max(0, matchIndex - 50);
              const end = Math.min(msgContent.length, matchIndex + query.length + 50);
              const context = (start > 0 ? '...' : '') +
                             msgContent.substring(start, end) +
                             (end < msgContent.length ? '...' : '');

              matches.push({
                lineNumber: i + 1,
                type: msgType,
                content: msgContent.substring(0, 200),
                context
              });
            }
          } catch {
            // Skip malformed lines
          }
        }

        if (matches.length > 0) {
          results.push({
            sessionId: session.id,
            sessionPath: session.path,
            matches: matches.slice(0, 10) // Limit matches per session
          });
        }
      } catch {
        // Skip unreadable sessions
      }
    }

    return results.slice(0, limit);
  } catch (error) {
    logger.error({ error, query }, 'Failed to search sessions');
    return [];
  }
}

/**
 * Gets session info/statistics
 */
export function getSessionInfo(sessionId: string): {
  success: boolean;
  info?: {
    id: string;
    path: string;
    project?: string;
    created: Date;
    modified: Date;
    size: number;
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    toolUseCount: number;
    duration?: number;
    firstMessage?: string;
    lastMessage?: string;
  };
  error?: string;
} {
  const session = readSession(sessionId, { limit: 10000 });

  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  let userCount = 0;
  let assistantCount = 0;
  let toolCount = 0;

  for (const msg of session.messages) {
    if (msg.type === 'user') userCount++;
    else if (msg.type === 'assistant') assistantCount++;
    else if (msg.type === 'tool_use') toolCount++;
  }

  // Calculate duration if timestamps available
  let duration: number | undefined;
  const timestamps = session.messages
    .filter(m => m.timestamp)
    .map(m => new Date(m.timestamp!).getTime())
    .filter(t => !isNaN(t));

  if (timestamps.length >= 2) {
    duration = Math.max(...timestamps) - Math.min(...timestamps);
  }

  // Get first and last user messages
  const userMessages = session.messages.filter(m => m.type === 'user');
  const firstMessage = userMessages[0]?.content.substring(0, 200);
  const lastMessage = userMessages[userMessages.length - 1]?.content.substring(0, 200);

  return {
    success: true,
    info: {
      id: session.id,
      path: session.path,
      project: session.project,
      created: session.createdAt,
      modified: session.modifiedAt,
      size: session.size,
      messageCount: session.messageCount,
      userMessageCount: userCount,
      assistantMessageCount: assistantCount,
      toolUseCount: toolCount,
      duration,
      firstMessage,
      lastMessage
    }
  };
}

export default {
  listSessions,
  readSession,
  searchSessions,
  getSessionInfo
};
