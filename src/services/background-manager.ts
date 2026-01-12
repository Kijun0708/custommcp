// src/services/background-manager.ts

import { BackgroundTask } from '../types.js';
import { callExpertWithFallback } from './expert-router.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { experts } from '../experts/index.js';
import crypto from 'crypto';

// 백그라운드 작업 저장소
const tasks = new Map<string, BackgroundTask>();

// 동시성 제어
const runningByProvider = new Map<string, number>();
const runningByModel = new Map<string, number>();

function getProvider(model: string): string {
  if (model.includes('gpt') || model.includes('openai')) return 'openai';
  if (model.includes('claude') || model.includes('anthropic')) return 'anthropic';
  return 'google';
}

function canStartTask(model: string): boolean {
  const provider = getProvider(model);

  // 모델별 한도 체크
  const modelLimit = config.concurrency.byModel[model] || Infinity;
  const modelRunning = runningByModel.get(model) || 0;
  if (modelRunning >= modelLimit) return false;

  // 프로바이더별 한도 체크
  const providerLimit = config.concurrency.byProvider[provider] || config.concurrency.default;
  const providerRunning = runningByProvider.get(provider) || 0;
  if (providerRunning >= providerLimit) return false;

  return true;
}

function incrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, (runningByModel.get(model) || 0) + 1);
  runningByProvider.set(provider, (runningByProvider.get(provider) || 0) + 1);
}

function decrementRunning(model: string): void {
  const provider = getProvider(model);
  runningByModel.set(model, Math.max(0, (runningByModel.get(model) || 1) - 1));
  runningByProvider.set(provider, Math.max(0, (runningByProvider.get(provider) || 1) - 1));
}

// 대기 큐
const pendingQueue: Array<{
  taskId: string;
  expertId: string;
  model: string;
  prompt: string;
  context?: string;
}> = [];

function processQueue(): void {
  while (pendingQueue.length > 0) {
    const next = pendingQueue[0];
    if (!canStartTask(next.model)) break;

    pendingQueue.shift();
    executeTask(next.taskId, next.expertId, next.prompt, next.context);
  }
}

async function executeTask(
  taskId: string,
  expertId: string,
  prompt: string,
  context?: string
): Promise<void> {
  const task = tasks.get(taskId);
  if (!task || task.status === 'cancelled') return;

  const expert = experts[expertId];
  const model = expert?.model || 'gemini-3.0-flash';
  incrementRunning(model);

  task.status = 'running';
  tasks.set(taskId, task);

  logger.info({ taskId, expertId }, 'Background task started');

  try {
    const result = await callExpertWithFallback(expertId, prompt, context);

    const updatedTask: BackgroundTask = {
      ...task,
      status: 'completed',
      result: result.response,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);

    logger.info({ taskId, expertId, latencyMs: result.latencyMs }, 'Background task completed');
  } catch (error) {
    const updatedTask: BackgroundTask = {
      ...task,
      status: 'failed',
      error: (error as Error).message,
      completedAt: new Date()
    };
    tasks.set(taskId, updatedTask);

    logger.error({ taskId, expertId, error: (error as Error).message }, 'Background task failed');
  } finally {
    decrementRunning(model);
    processQueue();
  }
}

export function startBackgroundTask(
  expertId: string,
  prompt: string,
  context?: string,
  taskId?: string
): BackgroundTask {
  const id = taskId || crypto.randomUUID();

  const task: BackgroundTask = {
    id,
    expert: expertId,
    status: 'pending',
    startedAt: new Date()
  };

  tasks.set(id, task);

  const expert = experts[expertId];
  const model = expert?.model || 'gemini-3.0-flash';

  if (canStartTask(model)) {
    executeTask(id, expertId, prompt, context);
  } else {
    pendingQueue.push({ taskId: id, expertId, model, prompt, context });
    logger.debug({ taskId: id }, 'Task queued, waiting for capacity');
  }

  return task;
}

export function getTaskStatus(taskId: string): BackgroundTask | null {
  return tasks.get(taskId) || null;
}

export function getTaskResult(taskId: string): { status: string; result?: string; error?: string } {
  const task = tasks.get(taskId);
  if (!task) {
    return { status: 'not_found' };
  }

  return {
    status: task.status,
    result: task.result,
    error: task.error
  };
}

export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;

  if (task.status === 'pending' || task.status === 'running') {
    task.status = 'cancelled';
    task.completedAt = new Date();
    tasks.set(taskId, task);

    // 대기 큐에서 제거
    const queueIndex = pendingQueue.findIndex(t => t.taskId === taskId);
    if (queueIndex !== -1) {
      pendingQueue.splice(queueIndex, 1);
    }

    logger.info({ taskId }, 'Task cancelled');
    return true;
  }

  return false;
}

export function listTasks(status?: BackgroundTask['status']): BackgroundTask[] {
  const allTasks = Array.from(tasks.values());
  if (status) {
    return allTasks.filter(t => t.status === status);
  }
  return allTasks;
}

export function cleanupOldTasks(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [taskId, task] of tasks) {
    const taskAge = now - task.startedAt.getTime();
    if (taskAge > maxAgeMs && (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')) {
      tasks.delete(taskId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info({ cleaned }, 'Old tasks cleaned up');
  }

  return cleaned;
}

export function getStats() {
  const allTasks = Array.from(tasks.values());
  return {
    total: allTasks.length,
    pending: allTasks.filter(t => t.status === 'pending').length,
    running: allTasks.filter(t => t.status === 'running').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
    failed: allTasks.filter(t => t.status === 'failed').length,
    cancelled: allTasks.filter(t => t.status === 'cancelled').length,
    queueLength: pendingQueue.length,
    concurrency: {
      byProvider: Object.fromEntries(runningByProvider),
      byModel: Object.fromEntries(runningByModel)
    }
  };
}
