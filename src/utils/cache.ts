// src/utils/cache.ts

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from './logger.js';

interface CacheEntry {
  response: string;
  expertId: string;
  timestamp: Date;
}

const cache = new LRUCache<string, CacheEntry>({
  max: config.cache.maxSize,
  ttl: config.cache.ttlMs
});

function generateCacheKey(expertId: string, prompt: string, context?: string): string {
  const content = `${expertId}:${prompt}:${context || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export function getCached(expertId: string, prompt: string, context?: string): CacheEntry | null {
  if (!config.cache.enabled) return null;

  const key = generateCacheKey(expertId, prompt, context);
  const entry = cache.get(key);

  if (entry) {
    logger.debug({ expertId, cacheKey: key }, 'Cache hit');
  }

  return entry || null;
}

export function setCache(expertId: string, prompt: string, response: string, context?: string): void {
  if (!config.cache.enabled) return;

  const key = generateCacheKey(expertId, prompt, context);
  cache.set(key, {
    response,
    expertId,
    timestamp: new Date()
  });

  logger.debug({ expertId, cacheKey: key }, 'Cache set');
}

export function clearCache(): void {
  cache.clear();
  logger.info('Cache cleared');
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxSize: config.cache.maxSize,
    ttlMs: config.cache.ttlMs
  };
}
