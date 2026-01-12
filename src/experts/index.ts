// src/experts/index.ts

import { Expert } from '../types.js';
import { strategist } from './strategist.js';
import { researcher } from './researcher.js';
import { reviewer } from './reviewer.js';
import { frontend } from './frontend.js';
import { writer } from './writer.js';
import { explorer } from './explorer.js';

export const experts: Record<string, Expert> = {
  strategist,
  researcher,
  reviewer,
  frontend,
  writer,
  explorer
};

export type ExpertId = keyof typeof experts;

// 폴백 매핑
export const FALLBACK_CHAIN: Record<string, string[]> = {
  strategist: ['researcher', 'reviewer'],
  researcher: ['reviewer', 'explorer'],
  reviewer: ['explorer'],
  frontend: ['writer', 'explorer'],
  writer: ['explorer'],
  explorer: []
};

export { strategist, researcher, reviewer, frontend, writer, explorer };
