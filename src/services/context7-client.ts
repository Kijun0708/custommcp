// src/services/context7-client.ts

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface Library {
  id: string;
  title: string;
  description?: string;
  trustScore?: number;
  totalTokens?: number;
  totalSnippets?: number;
}

interface LibrarySearchResponse {
  results: Library[];
}

interface GetDocsOptions {
  topic?: string;
  tokens?: number;
}

/**
 * 라이브러리 검색
 */
export async function searchLibraries(
  libraryName: string,
  query?: string
): Promise<LibrarySearchResponse> {
  const searchQuery = query ? `${libraryName} ${query}` : libraryName;
  const url = `https://context7.com/api/v2/search?query=${encodeURIComponent(searchQuery)}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.context7ApiKey) {
    headers['Authorization'] = `Bearer ${config.context7ApiKey}`;
  }

  logger.debug({ libraryName, query }, 'Context7 library search');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Context7 API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as LibrarySearchResponse;
    logger.info({ libraryCount: data.results?.length || 0 }, 'Context7 library search completed');
    return data;
  } catch (error) {
    logger.error({ error, libraryName }, 'Context7 library search failed');
    throw error;
  }
}

/**
 * 라이브러리 ID 확인 (resolve) - 가장 신뢰도 높은 라이브러리 반환
 */
export async function resolveLibraryId(libraryName: string): Promise<string | null> {
  try {
    const result = await searchLibraries(libraryName);
    if (result.results && result.results.length > 0) {
      // 가장 신뢰도 높은 라이브러리 반환
      const sorted = result.results.sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0));
      return sorted[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 라이브러리 문서 가져오기
 */
export async function getLibraryDocs(
  libraryId: string,
  options: GetDocsOptions = {}
): Promise<string> {
  const { topic, tokens = 5000 } = options;

  let url = `https://context7.com/api/v1${libraryId}?tokens=${tokens}`;
  if (topic) {
    url += `&topic=${encodeURIComponent(topic)}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.context7ApiKey) {
    headers['Authorization'] = `Bearer ${config.context7ApiKey}`;
  }

  logger.debug({ libraryId, options }, 'Context7 get docs');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Context7 API error (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    logger.info({ length: text.length }, 'Context7 get docs completed');
    return text;
  } catch (error) {
    logger.error({ error, libraryId }, 'Context7 get docs failed');
    throw error;
  }
}

/**
 * 라이브러리 이름으로 문서 가져오기 (편의 함수)
 */
export async function getDocsByLibraryName(
  libraryName: string,
  options: GetDocsOptions = {}
): Promise<string | null> {
  const libraryId = await resolveLibraryId(libraryName);

  if (!libraryId) {
    logger.warn({ libraryName }, 'Library not found');
    return null;
  }

  return getLibraryDocs(libraryId, options);
}

/**
 * 검색 결과를 마크다운 형식으로 변환
 */
export function formatLibrarySearchResults(response: LibrarySearchResponse): string {
  if (!response.results || !response.results.length) {
    return '검색 결과가 없습니다.';
  }

  let output = `## 📚 라이브러리 검색 결과 (${response.results.length}건)\n\n`;

  for (const lib of response.results.slice(0, 10)) {  // 상위 10개만 표시
    output += `### ${lib.title}\n`;
    output += `- **ID**: \`${lib.id}\`\n`;
    if (lib.description) output += `- **설명**: ${lib.description}\n`;
    if (lib.trustScore) output += `- **신뢰도**: ${lib.trustScore}\n`;
    if (lib.totalSnippets) output += `- **코드 조각**: ${lib.totalSnippets}개\n`;
    output += '\n';
  }

  return output;
}
