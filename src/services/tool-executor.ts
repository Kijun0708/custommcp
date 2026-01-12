// src/services/tool-executor.ts

import { ToolCall, ToolResult } from '../types.js';
import { searchWeb, formatSearchResults } from './exa-client.js';
import { getDocsByLibraryName, searchLibraries, formatLibrarySearchResults } from './context7-client.js';
import { logger } from '../utils/logger.js';

// 전문가에게 제공할 도구 정의
export const expertToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "웹에서 최신 정보를 검색합니다. 2024년 이후 정보, 최신 트렌드, 뉴스가 필요할 때 사용하세요.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "검색 쿼리"
          },
          num_results: {
            type: "number",
            description: "반환할 결과 수 (기본: 5, 최대: 10)"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_library_docs",
      description: "라이브러리/프레임워크의 공식 문서를 조회합니다. API 사용법, 코드 예제가 필요할 때 사용하세요.",
      parameters: {
        type: "object" as const,
        properties: {
          library: {
            type: "string",
            description: "라이브러리 이름 (예: react, nextjs, tailwindcss)"
          },
          topic: {
            type: "string",
            description: "특정 주제 (예: hooks, routing, useState)"
          }
        },
        required: ["library"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_libraries",
      description: "Context7에서 라이브러리를 검색합니다. 라이브러리 ID를 찾거나 지원 여부를 확인할 때 사용합니다.",
      parameters: {
        type: "object" as const,
        properties: {
          library_name: {
            type: "string",
            description: "검색할 라이브러리 이름"
          }
        },
        required: ["library_name"]
      }
    }
  }
];

/**
 * 단일 도구 호출 실행
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const startTime = Date.now();
  const funcName = toolCall.function.name;

  logger.info({ toolName: funcName, toolCallId: toolCall.id }, 'Executing tool call');

  try {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error(`Invalid JSON in tool arguments: ${toolCall.function.arguments}`);
    }

    let result: string;

    switch (funcName) {
      case "web_search": {
        const query = args.query as string;
        const numResults = Math.min((args.num_results as number) || 5, 10);

        const searchResponse = await searchWeb(query, {
          numResults,
          useAutoprompt: true
        });
        result = formatSearchResults(searchResponse);
        break;
      }

      case "get_library_docs": {
        const library = args.library as string;
        const topic = args.topic as string | undefined;

        const docs = await getDocsByLibraryName(library, {
          topic,
          tokens: 5000
        });

        if (!docs) {
          result = `라이브러리 '${library}'를 찾을 수 없습니다. search_libraries로 검색해보세요.`;
        } else {
          result = docs;
        }
        break;
      }

      case "search_libraries": {
        const libraryName = args.library_name as string;
        const searchResponse = await searchLibraries(libraryName);
        result = formatLibrarySearchResults(searchResponse);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${funcName}`);
    }

    const latencyMs = Date.now() - startTime;
    logger.info({ toolName: funcName, latencyMs, resultLength: result.length }, 'Tool call completed');

    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: result
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ toolName: funcName, error: errorMessage }, 'Tool call failed');

    return {
      tool_call_id: toolCall.id,
      role: "tool",
      content: `도구 실행 오류: ${errorMessage}`
    };
  }
}

/**
 * 여러 도구 호출을 병렬로 실행
 */
export async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  logger.info({ count: toolCalls.length }, 'Executing multiple tool calls');

  const results = await Promise.all(
    toolCalls.map(tc => executeToolCall(tc))
  );

  return results;
}

/**
 * 도구 이름 목록 반환
 */
export function getAvailableToolNames(): string[] {
  return expertToolDefinitions.map(t => t.function.name);
}
