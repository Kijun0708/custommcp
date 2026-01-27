#!/usr/bin/env node

/**
 * Claude Code Statusline 설정 스크립트
 *
 * Claude Code의 settings.json에 HUD statusline 명령어를 등록합니다.
 *
 * Usage: node scripts/setup-statusline.js [--preset minimal|standard|full] [--remove]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

function getHudCommand(preset = 'standard') {
  // 현재 프로젝트의 dist 경로
  const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')));
  const parentDir = path.dirname(projectRoot);
  const hudPath = path.join(parentDir, 'dist', 'cli', 'hud.js').replace(/\\/g, '/');
  return `node "${hudPath}" --preset ${preset}`;
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to read settings:', e.message);
  }
  return {};
}

function saveSettings(settings) {
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

function install(preset) {
  const settings = loadSettings();
  const command = getHudCommand(preset);

  settings.statusline = command;

  saveSettings(settings);
  console.log(`✅ Statusline configured in ${SETTINGS_FILE}`);
  console.log(`   Command: ${command}`);
  console.log(`   Preset: ${preset}`);
  console.log('');
  console.log('Claude Code를 재시작하면 상태바가 표시됩니다.');
}

function remove() {
  const settings = loadSettings();
  if (settings.statusline) {
    delete settings.statusline;
    saveSettings(settings);
    console.log('✅ Statusline removed from settings');
  } else {
    console.log('ℹ️  No statusline configured');
  }
}

// Main
const args = process.argv.slice(2);

if (args.includes('--remove')) {
  remove();
} else {
  let preset = 'standard';
  const presetIdx = args.indexOf('--preset');
  if (presetIdx !== -1 && args[presetIdx + 1]) {
    preset = args[presetIdx + 1];
  }
  install(preset);
}
