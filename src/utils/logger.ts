// src/utils/logger.ts

import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

export function createExpertLogger(expertId: string) {
  return logger.child({ expert: expertId });
}
