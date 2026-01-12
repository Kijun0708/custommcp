// src/services/exa-client.ts

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface ExaSearchResult {
  title: string;
  url: string;
  text?: string;
  publishedDate?: string;
  author?: string;
  score?: number;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
  autopromptString?: string;
}

interface ExaSearchOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  useAutoprompt?: boolean;
  type?: 'keyword' | 'neural' | 'auto';
  category?: string;
  includeText?: boolean;
}

/**
 * Exa AI 검색 수행
 */
export async function searchWeb(
  query: string,
  options: ExaSearchOptions = {}
): Promise<ExaSearchResponse> {
  const apiKey = config.exaApiKey;

  if (!apiKey) {
    throw new Error('EXA_API_KEY is not configured');
  }

  const {
    numResults = 10,
    includeDomains,
    excludeDomains,
    startPublishedDate,
    endPublishedDate,
    useAutoprompt = true,
    type = 'auto',
    category,
    includeText = true
  } = options;

  const requestBody: Record<string, unknown> = {
    query,
    numResults,
    useAutoprompt,
    type,
    contents: includeText ? { text: { maxCharacters: 2000 } } : undefined
  };

  if (includeDomains?.length) requestBody.includeDomains = includeDomains;
  if (excludeDomains?.length) requestBody.excludeDomains = excludeDomains;
  if (startPublishedDate) requestBody.startPublishedDate = startPublishedDate;
  if (endPublishedDate) requestBody.endPublishedDate = endPublishedDate;
  if (category) requestBody.category = category;

  logger.debug({ query, options }, 'Exa search request');

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Exa API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as ExaSearchResponse;

    logger.info({ resultCount: data.results.length }, 'Exa search completed');

    return data;
  } catch (error) {
    logger.error({ error, query }, 'Exa search failed');
    throw error;
  }
}

/**
 * 검색 결과를 마크다운 형식으로 변환
 */
export function formatSearchResults(response: ExaSearchResponse): string {
  if (!response.results.length) {
    return '검색 결과가 없습니다.';
  }

  let output = `## 검색 결과 (${response.results.length}건)\n\n`;

  for (const result of response.results) {
    output += `### [${result.title}](${result.url})\n`;

    if (result.publishedDate) {
      output += `📅 ${result.publishedDate}\n`;
    }
    if (result.author) {
      output += `✍️ ${result.author}\n`;
    }
    if (result.text) {
      output += `\n${result.text.slice(0, 500)}${result.text.length > 500 ? '...' : ''}\n`;
    }
    output += '\n---\n\n';
  }

  return output;
}
