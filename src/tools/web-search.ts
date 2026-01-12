// src/tools/web-search.ts

import { z } from 'zod';
import { searchWeb, formatSearchResults } from '../services/exa-client.js';
import { config } from '../config.js';

export const webSearchSchema = z.object({
  query: z.string()
    .min(1)
    .describe("검색 쿼리"),
  num_results: z.number()
    .min(1)
    .max(20)
    .default(5)
    .optional()
    .describe("반환할 결과 수 (기본: 5, 최대: 20)"),
  include_domains: z.array(z.string())
    .optional()
    .describe("포함할 도메인 목록 (예: ['github.com', 'stackoverflow.com'])"),
  exclude_domains: z.array(z.string())
    .optional()
    .describe("제외할 도메인 목록"),
  category: z.enum(['company', 'research_paper', 'news', 'tweet', 'github', 'linkedin', 'personal_site'])
    .optional()
    .describe("검색 카테고리 필터"),
  start_date: z.string()
    .optional()
    .describe("시작 날짜 (ISO 형식: 2024-01-01)"),
  end_date: z.string()
    .optional()
    .describe("종료 날짜 (ISO 형식: 2024-12-31)")
});

export type WebSearchParams = z.infer<typeof webSearchSchema>;

export const webSearchTool = {
  name: "web_search",
  description: `Exa AI를 사용한 웹 검색 도구.

## 기능
- AI 기반 시맨틱 검색으로 관련성 높은 결과 반환
- 도메인 필터링, 날짜 범위 지정 가능
- 카테고리별 검색 (뉴스, GitHub, 논문 등)

## 사용 예시
- query="React 19 새로운 기능"
- query="TypeScript 5.0 release notes", category="news"
- query="Next.js 15 migration guide", include_domains=["nextjs.org", "vercel.com"]

## 언제 사용?
- 최신 정보나 트렌드 조사
- 특정 기술의 최신 문서/블로그 검색
- 라이브러리/프레임워크 업데이트 확인`
};

export async function handleWebSearch(params: WebSearchParams) {
  // API 키 확인
  if (!config.exaApiKey) {
    return {
      content: [
        {
          type: "text" as const,
          text: "## ⚠️ Exa API 키 미설정\n\nEXA_API_KEY 환경변수를 설정해주세요."
        }
      ]
    };
  }

  try {
    const response = await searchWeb(params.query, {
      numResults: params.num_results || 5,
      includeDomains: params.include_domains,
      excludeDomains: params.exclude_domains,
      category: params.category,
      startPublishedDate: params.start_date,
      endPublishedDate: params.end_date,
      includeText: true
    });

    const formattedResult = formatSearchResults(response);

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
          text: `## ⚠️ 웹 검색 실패\n\n**오류**: ${errorMessage}\n\n💡 잠시 후 다시 시도해주세요.`
        }
      ]
    };
  }
}
