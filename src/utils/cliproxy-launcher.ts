// src/utils/cliproxy-launcher.ts

import { spawn, ChildProcess } from 'child_process';
import { config } from '../config.js';
import { logger } from './logger.js';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

let cliproxyProcess: ChildProcess | null = null;

/**
 * CLIProxyAPI가 실행 중인지 확인 (포트 연결 테스트)
 */
async function isCliproxyRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(config.cliproxyUrl);
    const port = parseInt(url.port) || 8787;
    const host = url.hostname || '127.0.0.1';

    const socket = new net.Socket();
    socket.setTimeout(2000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * CLIProxyAPI 실행 파일 경로 찾기
 */
function findCliproxyPath(): string | null {
  // 1. 환경변수에서 경로 확인
  if (config.cliproxyPath && fs.existsSync(config.cliproxyPath)) {
    return config.cliproxyPath;
  }

  // 2. 기본 경로들 확인
  const possiblePaths = [
    // 현재 프로젝트 상위의 CLIProxyAPI 폴더
    path.resolve(process.cwd(), '../CLIProxyAPI_6.6.102_windows_amd64/cli-proxy-api.exe'),
    // Windows 기본 설치 경로
    path.resolve(process.env.USERPROFILE || '', 'CLIProxyAPI/cli-proxy-api.exe'),
    // 프로젝트 루트 경로
    'C:/project/CLIProxyAPI_6.6.102_windows_amd64/cli-proxy-api.exe',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

/**
 * CLIProxyAPI가 준비될 때까지 대기
 */
async function waitForCliproxy(maxAttempts: number = 10, delayMs: number = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isCliproxyRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * CLIProxyAPI 자동 시작
 * @returns 성공 여부
 */
export async function ensureCliproxyRunning(): Promise<boolean> {
  // 1. 이미 실행 중인지 확인
  if (await isCliproxyRunning()) {
    logger.info('CLIProxyAPI is already running');
    return true;
  }

  // 2. 실행 파일 경로 찾기
  const cliproxyPath = findCliproxyPath();
  if (!cliproxyPath) {
    logger.warn('CLIProxyAPI executable not found. Please set CLIPROXY_PATH environment variable or start CLIProxyAPI manually.');
    return false;
  }

  // 3. CLIProxyAPI 시작
  logger.info({ path: cliproxyPath }, 'Starting CLIProxyAPI...');

  try {
    const cwd = path.dirname(cliproxyPath);

    cliproxyProcess = spawn(cliproxyPath, [], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    // 부모 프로세스와 분리
    cliproxyProcess.unref();

    // 4. 시작 대기
    const started = await waitForCliproxy(15, 500);

    if (started) {
      logger.info('CLIProxyAPI started successfully');
      return true;
    } else {
      logger.error('CLIProxyAPI failed to start within timeout');
      return false;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to start CLIProxyAPI');
    return false;
  }
}

/**
 * CLIProxyAPI 프로세스 정리 (필요시)
 */
export function cleanupCliproxy(): void {
  if (cliproxyProcess && !cliproxyProcess.killed) {
    cliproxyProcess.kill();
    cliproxyProcess = null;
  }
}
