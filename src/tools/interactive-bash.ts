// src/tools/interactive-bash.ts

/**
 * Interactive Bash Tool
 *
 * Provides interactive terminal session management using tmux.
 * Enables real-time command execution and session persistence.
 *
 * Features:
 * - Session creation and management
 * - Command execution with output capture
 * - Session persistence across calls
 * - Window/pane management
 */

import { z } from 'zod';
import { execFileSync, spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger.js';

// ============ Schemas ============

/**
 * Create session schema
 */
export const interactiveBashCreateSchema = z.object({
  session_name: z.string()
    .optional()
    .describe("세션 이름 (기본: omo-{timestamp})"),
  working_dir: z.string()
    .optional()
    .describe("작업 디렉토리 (기본: 현재 디렉토리)"),
  shell: z.string()
    .optional()
    .describe("사용할 셸 (기본: bash 또는 시스템 기본)")
});

/**
 * Send command schema
 */
export const interactiveBashSendSchema = z.object({
  session_name: z.string()
    .describe("대상 세션 이름"),
  command: z.string()
    .describe("실행할 명령어"),
  wait_for_output: z.boolean()
    .default(true)
    .optional()
    .describe("출력 대기 여부 (기본: true)"),
  timeout_ms: z.number()
    .default(30000)
    .optional()
    .describe("타임아웃 밀리초 (기본: 30000)")
});

/**
 * Read output schema
 */
export const interactiveBashReadSchema = z.object({
  session_name: z.string()
    .describe("대상 세션 이름"),
  lines: z.number()
    .default(100)
    .optional()
    .describe("읽을 라인 수 (기본: 100)")
});

/**
 * List sessions schema
 */
export const interactiveBashListSchema = z.object({
  filter: z.string()
    .optional()
    .describe("세션 이름 필터 (정규식)")
});

/**
 * Kill session schema
 */
export const interactiveBashKillSchema = z.object({
  session_name: z.string()
    .describe("종료할 세션 이름")
});

// ============ Types ============

interface TmuxSession {
  name: string;
  windows: number;
  created: Date;
  attached: boolean;
}

interface CommandResult {
  output: string;
  exitCode?: number;
  timedOut: boolean;
}

// ============ State ============

const managedSessions: Map<string, {
  name: string;
  createdAt: Date;
  lastCommand?: string;
  lastOutput?: string;
}> = new Map();

// ============ Utility Functions ============

/**
 * Checks if tmux is available
 */
function isTmuxAvailable(): boolean {
  try {
    execFileSync('tmux', ['-V'], { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a unique session name
 */
function generateSessionName(): string {
  return `omo-${Date.now()}`;
}

/**
 * Executes tmux command
 */
function execTmux(args: string[]): string {
  try {
    return execFileSync('tmux', args, {
      encoding: 'utf-8',
      timeout: 10000
    }).trim();
  } catch (error: any) {
    if (error.stderr) {
      throw new Error(`Tmux error: ${error.stderr}`);
    }
    throw error;
  }
}

/**
 * Lists all tmux sessions
 */
function listTmuxSessions(): TmuxSession[] {
  try {
    const output = execTmux(['list-sessions', '-F', '#{session_name}|#{session_windows}|#{session_created}|#{session_attached}']);

    return output.split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [name, windows, created, attached] = line.split('|');
        return {
          name,
          windows: parseInt(windows, 10),
          created: new Date(parseInt(created, 10) * 1000),
          attached: attached === '1'
        };
      });
  } catch {
    return [];
  }
}

/**
 * Checks if session exists
 */
function sessionExists(name: string): boolean {
  try {
    execTmux(['has-session', '-t', name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a new tmux session
 */
function createSession(name: string, workingDir?: string, shell?: string): boolean {
  const args = ['new-session', '-d', '-s', name];

  if (workingDir) {
    args.push('-c', workingDir);
  }

  try {
    execTmux(args);

    managedSessions.set(name, {
      name,
      createdAt: new Date()
    });

    return true;
  } catch (error: any) {
    logger.error({ error: error.message, session: name }, 'Failed to create tmux session');
    return false;
  }
}

/**
 * Sends command to session and captures output
 */
async function sendCommand(
  sessionName: string,
  command: string,
  waitForOutput: boolean = true,
  timeoutMs: number = 30000
): Promise<CommandResult> {
  if (!sessionExists(sessionName)) {
    throw new Error(`Session '${sessionName}' does not exist`);
  }

  // Clear the pane first
  try {
    execTmux(['send-keys', '-t', sessionName, 'clear', 'Enter']);
    await sleep(100);
  } catch {
    // Ignore clear errors
  }

  // Send the command
  execTmux(['send-keys', '-t', sessionName, command, 'Enter']);

  // Update managed session
  const managed = managedSessions.get(sessionName);
  if (managed) {
    managed.lastCommand = command;
  }

  if (!waitForOutput) {
    return {
      output: 'Command sent (not waiting for output)',
      timedOut: false
    };
  }

  // Wait and capture output
  const startTime = Date.now();
  let output = '';
  let lastOutput = '';
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(500);

    try {
      output = execTmux(['capture-pane', '-t', sessionName, '-p', '-S', '-100']);
    } catch {
      continue;
    }

    // Check if output is stable (command completed)
    if (output === lastOutput) {
      stableCount++;
      if (stableCount >= 3) {
        break;
      }
    } else {
      stableCount = 0;
      lastOutput = output;
    }
  }

  const timedOut = Date.now() - startTime >= timeoutMs;

  // Update managed session
  if (managed) {
    managed.lastOutput = output;
  }

  return {
    output: cleanOutput(output, command),
    timedOut
  };
}

/**
 * Cleans captured output
 */
function cleanOutput(output: string, command: string): string {
  const lines = output.split('\n');

  // Find command line and remove everything before it
  const cmdIndex = lines.findIndex(line => line.includes(command));
  if (cmdIndex > -1) {
    return lines.slice(cmdIndex + 1).join('\n').trim();
  }

  return output.trim();
}

/**
 * Reads current pane content
 */
function readPaneContent(sessionName: string, lines: number = 100): string {
  if (!sessionExists(sessionName)) {
    throw new Error(`Session '${sessionName}' does not exist`);
  }

  return execTmux(['capture-pane', '-t', sessionName, '-p', '-S', `-${lines}`]);
}

/**
 * Kills a session
 */
function killSession(sessionName: string): boolean {
  try {
    execTmux(['kill-session', '-t', sessionName]);
    managedSessions.delete(sessionName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Tool Handlers ============

/**
 * Creates interactive bash session
 */
export async function handleInteractiveBashCreate(
  params: z.infer<typeof interactiveBashCreateSchema>
): Promise<string> {
  if (!isTmuxAvailable()) {
    return `## ❌ Tmux Not Available

Interactive bash requires tmux to be installed.

**Installation:**
- macOS: \`brew install tmux\`
- Ubuntu/Debian: \`sudo apt install tmux\`
- Windows: Use WSL with tmux installed`;
  }

  const sessionName = params.session_name || generateSessionName();

  if (sessionExists(sessionName)) {
    return `## ⚠️ Session Already Exists

Session \`${sessionName}\` already exists.

Use \`interactive_bash_send\` to send commands to this session.`;
  }

  const success = createSession(
    sessionName,
    params.working_dir,
    params.shell
  );

  if (!success) {
    return `## ❌ Session Creation Failed

Failed to create session \`${sessionName}\`.`;
  }

  return `## ✅ Interactive Session Created

| 항목 | 값 |
|------|-----|
| Session Name | \`${sessionName}\` |
| Working Dir | ${params.working_dir || 'Current directory'} |
| Shell | ${params.shell || 'Default'} |

**Usage:**
\`\`\`
// Send command
interactive_bash_send({ session_name: "${sessionName}", command: "ls -la" })

// Read output
interactive_bash_read({ session_name: "${sessionName}" })

// Kill session
interactive_bash_kill({ session_name: "${sessionName}" })
\`\`\``;
}

/**
 * Sends command to interactive session
 */
export async function handleInteractiveBashSend(
  params: z.infer<typeof interactiveBashSendSchema>
): Promise<string> {
  if (!isTmuxAvailable()) {
    return '## ❌ Tmux Not Available\n\nInteractive bash requires tmux.';
  }

  try {
    const result = await sendCommand(
      params.session_name,
      params.command,
      params.wait_for_output ?? true,
      params.timeout_ms ?? 30000
    );

    let output = `## 🖥️ Command Executed

**Session:** \`${params.session_name}\`
**Command:** \`${params.command}\`
**Status:** ${result.timedOut ? '⏱️ Timed out' : '✅ Completed'}

### Output
\`\`\`
${result.output || '(no output)'}
\`\`\``;

    if (result.timedOut) {
      output += '\n\n_⚠️ Command may still be running. Use `interactive_bash_read` to check._';
    }

    return output;
  } catch (error: any) {
    return `## ❌ Command Failed

**Error:** ${error.message}`;
  }
}

/**
 * Reads output from interactive session
 */
export async function handleInteractiveBashRead(
  params: z.infer<typeof interactiveBashReadSchema>
): Promise<string> {
  if (!isTmuxAvailable()) {
    return '## ❌ Tmux Not Available\n\nInteractive bash requires tmux.';
  }

  try {
    const content = readPaneContent(params.session_name, params.lines ?? 100);

    return `## 📄 Session Output

**Session:** \`${params.session_name}\`
**Lines:** ${params.lines ?? 100}

\`\`\`
${content || '(empty)'}
\`\`\``;
  } catch (error: any) {
    return `## ❌ Read Failed

**Error:** ${error.message}`;
  }
}

/**
 * Lists interactive sessions
 */
export async function handleInteractiveBashList(
  params: z.infer<typeof interactiveBashListSchema>
): Promise<string> {
  if (!isTmuxAvailable()) {
    return '## ❌ Tmux Not Available\n\nInteractive bash requires tmux.';
  }

  let sessions = listTmuxSessions();

  if (params.filter) {
    const regex = new RegExp(params.filter, 'i');
    sessions = sessions.filter(s => regex.test(s.name));
  }

  if (sessions.length === 0) {
    return `## 📋 No Sessions Found

${params.filter ? `No sessions matching \`${params.filter}\`` : 'No active tmux sessions'}

Create a new session with \`interactive_bash_create\``;
  }

  let output = `## 📋 Active Sessions (${sessions.length})

| Session | Windows | Created | Status |
|---------|---------|---------|--------|
`;

  for (const session of sessions) {
    const managed = managedSessions.has(session.name) ? '🔵' : '';
    const status = session.attached ? 'Attached' : 'Detached';
    output += `| \`${session.name}\` ${managed} | ${session.windows} | ${session.created.toLocaleTimeString()} | ${status} |\n`;
  }

  output += '\n🔵 = Managed by this tool';

  return output;
}

/**
 * Kills interactive session
 */
export async function handleInteractiveBashKill(
  params: z.infer<typeof interactiveBashKillSchema>
): Promise<string> {
  if (!isTmuxAvailable()) {
    return '## ❌ Tmux Not Available\n\nInteractive bash requires tmux.';
  }

  const success = killSession(params.session_name);

  if (!success) {
    return `## ❌ Kill Failed

Session \`${params.session_name}\` could not be killed or does not exist.`;
  }

  return `## ✅ Session Killed

Session \`${params.session_name}\` has been terminated.`;
}

// ============ Exports ============

export const interactiveBashTools = {
  interactive_bash_create: {
    schema: interactiveBashCreateSchema,
    handler: handleInteractiveBashCreate,
    description: '대화형 bash 세션 생성 (tmux 기반)'
  },
  interactive_bash_send: {
    schema: interactiveBashSendSchema,
    handler: handleInteractiveBashSend,
    description: '대화형 세션에 명령어 전송'
  },
  interactive_bash_read: {
    schema: interactiveBashReadSchema,
    handler: handleInteractiveBashRead,
    description: '대화형 세션 출력 읽기'
  },
  interactive_bash_list: {
    schema: interactiveBashListSchema,
    handler: handleInteractiveBashList,
    description: '활성 대화형 세션 목록'
  },
  interactive_bash_kill: {
    schema: interactiveBashKillSchema,
    handler: handleInteractiveBashKill,
    description: '대화형 세션 종료'
  }
};

/**
 * Registers interactive bash tools with McpServer
 */
export function registerInteractiveBashTools(server: any): void {
  // interactive_bash_create
  server.tool(
    'interactive_bash_create',
    '대화형 bash 세션 생성 (tmux 기반)',
    interactiveBashCreateSchema.shape,
    async (args: unknown) => {
      const params = interactiveBashCreateSchema.parse(args);
      const result = await handleInteractiveBashCreate(params);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // interactive_bash_send
  server.tool(
    'interactive_bash_send',
    '대화형 세션에 명령어 전송',
    interactiveBashSendSchema.shape,
    async (args: unknown) => {
      const params = interactiveBashSendSchema.parse(args);
      const result = await handleInteractiveBashSend(params);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // interactive_bash_read
  server.tool(
    'interactive_bash_read',
    '대화형 세션 출력 읽기',
    interactiveBashReadSchema.shape,
    async (args: unknown) => {
      const params = interactiveBashReadSchema.parse(args);
      const result = await handleInteractiveBashRead(params);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // interactive_bash_list
  server.tool(
    'interactive_bash_list',
    '활성 대화형 세션 목록',
    interactiveBashListSchema.shape,
    async (args: unknown) => {
      const params = interactiveBashListSchema.parse(args);
      const result = await handleInteractiveBashList(params);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  // interactive_bash_kill
  server.tool(
    'interactive_bash_kill',
    '대화형 세션 종료',
    interactiveBashKillSchema.shape,
    async (args: unknown) => {
      const params = interactiveBashKillSchema.parse(args);
      const result = await handleInteractiveBashKill(params);
      return { content: [{ type: 'text', text: result }] };
    }
  );

  logger.info('Interactive bash tools registered (5 tools)');
}

export default interactiveBashTools;
