// src/tools/session-transcript.ts

/**
 * Session Transcript MCP Tools
 *
 * Provides tools to list, read, search, and get info about Claude Code sessions.
 */

import { z } from 'zod';
import {
  listSessions,
  readSession,
  searchSessions,
  getSessionInfo
} from '../services/session-transcript-client.js';

/**
 * Session List Schema
 */
export const sessionListSchema = z.object({
  limit: z.number()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("최대 결과 수 (기본: 20, 최대: 100)"),
  project: z.string()
    .optional()
    .describe("프로젝트 이름으로 필터링"),
  after: z.string()
    .optional()
    .describe("이 날짜 이후 세션만 (ISO 형식: 2025-01-01)"),
  before: z.string()
    .optional()
    .describe("이 날짜 이전 세션만 (ISO 형식: 2025-01-31)")
});

export type SessionListParams = z.infer<typeof sessionListSchema>;

/**
 * Session Read Schema
 */
export const sessionReadSchema = z.object({
  session_id: z.string()
    .min(1)
    .describe("세션 ID 또는 파일 이름"),
  limit: z.number()
    .min(1)
    .max(500)
    .optional()
    .default(50)
    .describe("읽을 메시지 수 (기본: 50)"),
  offset: z.number()
    .min(0)
    .optional()
    .default(0)
    .describe("시작 위치 (기본: 0)")
});

export type SessionReadParams = z.infer<typeof sessionReadSchema>;

/**
 * Session Search Schema
 */
export const sessionSearchSchema = z.object({
  query: z.string()
    .min(1)
    .describe("검색어"),
  limit: z.number()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("최대 결과 수 (기본: 20)"),
  case_sensitive: z.boolean()
    .optional()
    .default(false)
    .describe("대소문자 구분 (기본: false)"),
  type: z.enum(['user', 'assistant', 'all'])
    .optional()
    .default('all')
    .describe("메시지 타입 필터 (기본: all)")
});

export type SessionSearchParams = z.infer<typeof sessionSearchSchema>;

/**
 * Session Info Schema
 */
export const sessionInfoSchema = z.object({
  session_id: z.string()
    .min(1)
    .describe("세션 ID 또는 파일 이름")
});

export type SessionInfoParams = z.infer<typeof sessionInfoSchema>;

/**
 * Session List Tool
 */
export const sessionListTool = {
  name: "session_list",
  description: `Claude Code 세션 목록 조회.

## 기능
- ~/.claude/transcripts/ 디렉토리의 세션 파일 목록
- 프로젝트별 필터링
- 날짜 범위 필터링
- 최근 수정순 정렬

## 사용 예시
- 최근 세션: session_list limit=10
- 특정 프로젝트: session_list project="my-project"
- 날짜 범위: session_list after="2025-01-01" before="2025-01-31"

## 결과
- 세션 ID, 프로젝트, 생성/수정 시간, 메시지 수`
};

/**
 * Session Read Tool
 */
export const sessionReadTool = {
  name: "session_read",
  description: `특정 세션의 메시지 읽기.

## 기능
- 세션 ID로 대화 내용 조회
- 페이지네이션 지원 (offset, limit)
- user/assistant/tool 메시지 포함

## 사용 예시
- 전체 읽기: session_read session_id="abc123"
- 페이지네이션: session_read session_id="abc123" offset=50 limit=50

## 결과
- 메시지 타입, 내용, 타임스탬프`
};

/**
 * Session Search Tool
 */
export const sessionSearchTool = {
  name: "session_search",
  description: `모든 세션에서 텍스트 검색.

## 기능
- 전체 세션에서 키워드 검색
- 대소문자 구분 옵션
- 메시지 타입 필터 (user/assistant)

## 사용 예시
- 키워드 검색: session_search query="React hooks"
- 사용자 메시지만: session_search query="error" type="user"

## 결과
- 일치하는 세션 목록
- 각 세션의 매칭 위치와 컨텍스트`
};

/**
 * Session Info Tool
 */
export const sessionInfoTool = {
  name: "session_info",
  description: `세션 메타데이터 및 통계 조회.

## 기능
- 세션 상세 정보
- 메시지 통계 (user/assistant/tool 카운트)
- 세션 지속 시간
- 첫/마지막 메시지 미리보기

## 사용 예시
- session_info session_id="abc123"

## 결과
- 파일 정보, 메시지 통계, 지속 시간`
};

/**
 * Handle Session List
 */
export async function handleSessionList(params: SessionListParams) {
  try {
    const sessions = listSessions({
      limit: params.limit,
      project: params.project,
      after: params.after ? new Date(params.after) : undefined,
      before: params.before ? new Date(params.before) : undefined
    });

    if (sessions.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 세션 목록\n\n세션을 찾을 수 없습니다.\n\n> ~/.claude/transcripts/ 디렉토리를 확인하세요.`
        }]
      };
    }

    const lines: string[] = [];
    lines.push('## 세션 목록');
    lines.push('');
    lines.push(`**총 ${sessions.length}개 세션**`);
    lines.push('');
    lines.push('| ID | 프로젝트 | 수정 시간 | 메시지 | 크기 |');
    lines.push('|----|---------|----------|--------|------|');

    for (const session of sessions) {
      const modified = session.modifiedAt.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const size = session.size > 1024 * 1024
        ? `${(session.size / 1024 / 1024).toFixed(1)}MB`
        : session.size > 1024
          ? `${(session.size / 1024).toFixed(1)}KB`
          : `${session.size}B`;

      const shortId = session.id.length > 12
        ? session.id.substring(0, 12) + '...'
        : session.id;

      lines.push(`| \`${shortId}\` | ${session.project || '-'} | ${modified} | ${session.messageCount} | ${size} |`);
    }

    lines.push('');
    lines.push('> `session_read` 도구로 세션 내용을 확인하세요.');

    return {
      content: [{
        type: "text" as const,
        text: lines.join('\n')
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 오류\n\n${errorMessage}`
      }]
    };
  }
}

/**
 * Handle Session Read
 */
export async function handleSessionRead(params: SessionReadParams) {
  try {
    const session = readSession(params.session_id, {
      limit: params.limit,
      offset: params.offset
    });

    if (!session) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 세션을 찾을 수 없음\n\n**세션 ID**: ${params.session_id}\n\n> \`session_list\` 도구로 사용 가능한 세션을 확인하세요.`
        }]
      };
    }

    const lines: string[] = [];
    lines.push(`## 세션: ${session.id}`);
    lines.push('');
    lines.push(`**프로젝트**: ${session.project || '-'}`);
    lines.push(`**메시지**: ${params.offset + 1} ~ ${params.offset + session.messages.length} / ${session.messageCount}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of session.messages) {
      const icon = msg.type === 'user' ? '👤'
                 : msg.type === 'assistant' ? '🤖'
                 : msg.type === 'tool_use' ? '🔧'
                 : msg.type === 'tool_result' ? '📋'
                 : '📌';

      const label = msg.type === 'user' ? 'User'
                  : msg.type === 'assistant' ? 'Assistant'
                  : msg.type === 'tool_use' ? `Tool: ${msg.toolName || 'unknown'}`
                  : msg.type === 'tool_result' ? `Result: ${msg.toolName || 'unknown'}`
                  : 'System';

      // Truncate long content
      let content = msg.content;
      if (content.length > 500) {
        content = content.substring(0, 500) + '...(truncated)';
      }

      lines.push(`### ${icon} ${label}`);
      if (msg.timestamp) {
        const time = new Date(msg.timestamp).toLocaleString('ko-KR');
        lines.push(`_${time}_`);
      }
      lines.push('');
      lines.push(content);
      lines.push('');
    }

    if (params.offset + session.messages.length < session.messageCount) {
      lines.push('---');
      lines.push(`> 다음 페이지: \`session_read session_id="${params.session_id}" offset=${params.offset + params.limit}\``);
    }

    return {
      content: [{
        type: "text" as const,
        text: lines.join('\n')
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 오류\n\n${errorMessage}`
      }]
    };
  }
}

/**
 * Handle Session Search
 */
export async function handleSessionSearch(params: SessionSearchParams) {
  try {
    const results = searchSessions(params.query, {
      limit: params.limit,
      caseSensitive: params.case_sensitive,
      type: params.type
    });

    if (results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `## 세션 검색 결과\n\n**쿼리**: "${params.query}"\n\n검색 결과가 없습니다.`
        }]
      };
    }

    const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

    const lines: string[] = [];
    lines.push('## 세션 검색 결과');
    lines.push('');
    lines.push(`**쿼리**: "${params.query}"`);
    lines.push(`**결과**: ${results.length}개 세션, ${totalMatches}개 매칭`);
    lines.push('');

    for (const result of results) {
      const shortId = result.sessionId.length > 20
        ? result.sessionId.substring(0, 20) + '...'
        : result.sessionId;

      lines.push(`### 📁 ${shortId}`);
      lines.push('');

      for (const match of result.matches.slice(0, 3)) {
        const icon = match.type === 'user' ? '👤' : '🤖';
        lines.push(`${icon} **줄 ${match.lineNumber}** (${match.type})`);
        lines.push(`> ${match.context}`);
        lines.push('');
      }

      if (result.matches.length > 3) {
        lines.push(`_... 외 ${result.matches.length - 3}개 매칭_`);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('> `session_read`로 전체 세션을 확인하세요.');

    return {
      content: [{
        type: "text" as const,
        text: lines.join('\n')
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 오류\n\n${errorMessage}`
      }]
    };
  }
}

/**
 * Handle Session Info
 */
export async function handleSessionInfo(params: SessionInfoParams) {
  try {
    const result = getSessionInfo(params.session_id);

    if (!result.success || !result.info) {
      return {
        content: [{
          type: "text" as const,
          text: `## ⚠️ 세션을 찾을 수 없음\n\n**세션 ID**: ${params.session_id}\n\n${result.error || ''}`
        }]
      };
    }

    const info = result.info;
    const lines: string[] = [];

    lines.push(`## 세션 정보: ${info.id}`);
    lines.push('');
    lines.push('### 기본 정보');
    lines.push(`- **프로젝트**: ${info.project || '-'}`);
    lines.push(`- **경로**: ${info.path}`);
    lines.push(`- **생성**: ${info.created.toLocaleString('ko-KR')}`);
    lines.push(`- **수정**: ${info.modified.toLocaleString('ko-KR')}`);

    const size = info.size > 1024 * 1024
      ? `${(info.size / 1024 / 1024).toFixed(2)}MB`
      : `${(info.size / 1024).toFixed(2)}KB`;
    lines.push(`- **크기**: ${size}`);
    lines.push('');

    lines.push('### 메시지 통계');
    lines.push(`- **총 메시지**: ${info.messageCount}`);
    lines.push(`- **사용자**: ${info.userMessageCount}`);
    lines.push(`- **어시스턴트**: ${info.assistantMessageCount}`);
    lines.push(`- **도구 호출**: ${info.toolUseCount}`);
    lines.push('');

    if (info.duration) {
      const minutes = Math.floor(info.duration / 60000);
      const hours = Math.floor(minutes / 60);
      const durationStr = hours > 0
        ? `${hours}시간 ${minutes % 60}분`
        : `${minutes}분`;
      lines.push(`### 세션 지속 시간`);
      lines.push(`- **지속 시간**: ${durationStr}`);
      lines.push('');
    }

    if (info.firstMessage) {
      lines.push('### 첫 번째 질문');
      lines.push(`> ${info.firstMessage}${info.firstMessage.length >= 200 ? '...' : ''}`);
      lines.push('');
    }

    if (info.lastMessage && info.lastMessage !== info.firstMessage) {
      lines.push('### 마지막 질문');
      lines.push(`> ${info.lastMessage}${info.lastMessage.length >= 200 ? '...' : ''}`);
    }

    return {
      content: [{
        type: "text" as const,
        text: lines.join('\n')
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text" as const,
        text: `## ⚠️ 오류\n\n${errorMessage}`
      }]
    };
  }
}

export default {
  sessionListTool,
  sessionListSchema,
  handleSessionList,
  sessionReadTool,
  sessionReadSchema,
  handleSessionRead,
  sessionSearchTool,
  sessionSearchSchema,
  handleSessionSearch,
  sessionInfoTool,
  sessionInfoSchema,
  handleSessionInfo
};
