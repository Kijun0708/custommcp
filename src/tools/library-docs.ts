// src/tools/library-docs.ts

import { z } from 'zod';
import { getDocsByLibraryName, searchLibraries, formatLibrarySearchResults } from '../services/context7-client.js';

export const libraryDocsSchema = z.object({
  library: z.string()
    .min(1)
    .describe("라이브러리/프레임워크 이름 (예: 'react', 'nextjs', 'tailwindcss')"),
  query: z.string()
    .optional()
    .describe("특정 주제 검색 (예: 'hooks', 'routing', 'state management')"),
  topic: z.string()
    .optional()
    .describe("문서 섹션 필터 (예: 'api', 'guide', 'tutorial')"),
  max_tokens: z.number()
    .min(1000)
    .max(20000)
    .default(5000)
    .optional()
    .describe("최대 토큰 수 (기본: 5000)")
});

export type LibraryDocsParams = z.infer<typeof libraryDocsSchema>;

export const libraryDocsTool = {
  name: "get_library_docs",
  description: `Context7을 사용한 라이브러리 문서 조회 도구.

## 기능
- 최신 버전의 공식 문서 조회
- 코드 예제 포함
- 특정 주제/섹션 필터링

## 지원 라이브러리 예시
- Frontend: react, nextjs, vue, svelte, angular
- Styling: tailwindcss, sass, styled-components
- Backend: express, fastify, nestjs
- Database: prisma, drizzle, mongoose
- State: zustand, redux, jotai, recoil
- Utility: lodash, date-fns, zod

## 사용 예시
- library="react", topic="useEffect"
- library="nextjs", topic="app router"
- library="tailwindcss", topic="flexbox"

## 언제 사용?
- 라이브러리 API 사용법 확인
- 최신 버전 문서 필요시
- 특정 기능의 예제 코드 필요시`
};

export const searchLibrariesTool = {
  name: "search_libraries",
  description: `Context7에서 라이브러리 검색.

라이브러리 ID를 찾거나 지원 여부를 확인할 때 사용합니다.`
};

export const searchLibrariesSchema = z.object({
  library_name: z.string()
    .min(1)
    .describe("검색할 라이브러리 이름"),
  query: z.string()
    .optional()
    .describe("추가 검색어")
});

export type SearchLibrariesParams = z.infer<typeof searchLibrariesSchema>;

export async function handleLibraryDocs(params: LibraryDocsParams) {
  try {
    const response = await getDocsByLibraryName(params.library, {
      topic: params.topic || params.query,
      tokens: params.max_tokens || 5000
    });

    if (!response) {
      return {
        content: [
          {
            type: "text" as const,
            text: `## ⚠️ 라이브러리를 찾을 수 없음\n\n**${params.library}** 라이브러리를 찾을 수 없습니다.\n\n💡 라이브러리 이름을 확인하거나 \`search_libraries\` 도구로 검색해보세요.`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `## 📚 ${params.library} 문서\n\n${response}`
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `## ⚠️ 문서 조회 실패\n\n**오류**: ${errorMessage}\n\n💡 잠시 후 다시 시도해주세요.`
        }
      ]
    };
  }
}

export async function handleSearchLibraries(params: SearchLibrariesParams) {
  try {
    const response = await searchLibraries(params.library_name, params.query);
    const formattedResult = formatLibrarySearchResults(response);

    return {
      content: [
        {
          type: "text" as const,
          text: formattedResult
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `## ⚠️ 라이브러리 검색 실패\n\n**오류**: ${errorMessage}`
        }
      ]
    };
  }
}
