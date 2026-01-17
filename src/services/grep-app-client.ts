// src/services/grep-app-client.ts

/**
 * Grep.app Client Service
 *
 * Provides GitHub code search functionality via grep.app API.
 * Allows searching across millions of GitHub repositories.
 */

import { logger } from '../utils/logger.js';

/**
 * Search result from grep.app
 */
export interface GrepAppResult {
  repository: string;
  path: string;
  lineNumber: number;
  content: string;
  url: string;
}

/**
 * Search response
 */
export interface GrepAppSearchResponse {
  success: boolean;
  results: GrepAppResult[];
  totalCount: number;
  query: string;
  error?: string;
}

/**
 * Search options
 */
export interface GrepAppSearchOptions {
  query: string;
  language?: string;
  repository?: string;
  path?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  maxResults?: number;
}

/**
 * Searches GitHub code via grep.app
 */
export async function searchGrepApp(options: GrepAppSearchOptions): Promise<GrepAppSearchResponse> {
  const {
    query,
    language,
    repository,
    path,
    caseSensitive = false,
    wholeWord = false,
    regex = false,
    maxResults = 25
  } = options;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      results: [],
      totalCount: 0,
      query: '',
      error: 'Query is required'
    };
  }

  try {
    // Build search URL
    const params = new URLSearchParams();
    params.set('q', query);

    if (language) {
      params.set('filter[lang][0]', language);
    }

    if (repository) {
      params.set('filter[repo][0]', repository);
    }

    if (path) {
      params.set('filter[path][0]', path);
    }

    if (caseSensitive) {
      params.set('case', 'true');
    }

    if (wholeWord) {
      params.set('words', 'true');
    }

    if (regex) {
      params.set('regexp', 'true');
    }

    const url = `https://grep.app/api/search?${params.toString()}`;

    logger.debug({ url, query }, 'Searching grep.app');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LLM-Router-MCP/2.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'grep.app API error');
      return {
        success: false,
        results: [],
        totalCount: 0,
        query,
        error: `API error: ${response.status} - ${errorText.substring(0, 100)}`
      };
    }

    const data = await response.json() as {
      facets?: {
        count?: number;
      };
      hits?: {
        total?: {
          value?: number;
        };
        hits?: Array<{
          _source?: {
            repo?: {
              raw?: string;
            };
            path?: {
              raw?: string;
            };
            content?: {
              snippet?: string;
            };
          };
          highlight?: {
            content?: string[];
          };
        }>;
      };
    };

    const results: GrepAppResult[] = [];
    const hits = data.hits?.hits || [];

    for (const hit of hits.slice(0, maxResults)) {
      const source = hit._source || {};
      const repo = source.repo?.raw || 'unknown';
      const filePath = source.path?.raw || 'unknown';

      // Extract content from highlight or snippet
      let content = '';
      if (hit.highlight?.content && hit.highlight.content.length > 0) {
        content = hit.highlight.content[0]
          .replace(/<em>/g, '**')
          .replace(/<\/em>/g, '**');
      } else if (source.content?.snippet) {
        content = source.content.snippet;
      }

      // Try to extract line number from content (if available)
      const lineNumber = 1; // grep.app doesn't always provide line numbers

      results.push({
        repository: repo,
        path: filePath,
        lineNumber,
        content: content.trim(),
        url: `https://github.com/${repo}/blob/master/${filePath}`
      });
    }

    const totalCount = data.hits?.total?.value || data.facets?.count || results.length;

    logger.info({ query, resultCount: results.length, totalCount }, 'grep.app search completed');

    return {
      success: true,
      results,
      totalCount,
      query
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage, query }, 'grep.app search failed');

    return {
      success: false,
      results: [],
      totalCount: 0,
      query,
      error: errorMessage
    };
  }
}

/**
 * Gets supported languages for grep.app search
 */
export function getSupportedLanguages(): string[] {
  return [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust',
    'C', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala',
    'Shell', 'PowerShell', 'Perl', 'R', 'MATLAB', 'Julia',
    'HTML', 'CSS', 'SCSS', 'LESS', 'Vue', 'Svelte',
    'JSON', 'YAML', 'TOML', 'XML', 'Markdown',
    'SQL', 'GraphQL', 'Dockerfile', 'Makefile'
  ];
}

export default {
  searchGrepApp,
  getSupportedLanguages
};
