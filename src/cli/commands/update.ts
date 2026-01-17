// src/cli/commands/update.ts

/**
 * Update command - checks for and applies updates
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { UpdateInfo } from '../types.js';

// Get package info
function getPackageJson(): { name: string; version: string } {
  try {
    // Try to find package.json relative to this file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Go up to project root
    const packagePath = join(__dirname, '..', '..', '..', 'package.json');
    const content = readFileSync(packagePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { name: 'llm-router-mcp', version: '0.0.0' };
  }
}

/**
 * Checks for available updates
 */
export async function checkForUpdates(): Promise<UpdateInfo> {
  const pkg = getPackageJson();
  const currentVersion = pkg.version;

  try {
    // Query npm registry for latest version
    const result = execSync(`npm view ${pkg.name} version 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000
    }).trim();

    const latestVersion = result || currentVersion;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: `https://www.npmjs.com/package/${pkg.name}`
    };
  } catch {
    // If npm query fails, return current version
    return {
      currentVersion,
      latestVersion: currentVersion,
      hasUpdate: false
    };
  }
}

/**
 * Compares two semver versions
 * Returns: >0 if a > b, <0 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }

  return 0;
}

/**
 * Performs the update
 */
export async function performUpdate(global: boolean = true): Promise<{
  success: boolean;
  message: string;
  previousVersion?: string;
  newVersion?: string;
}> {
  const pkg = getPackageJson();
  const previousVersion = pkg.version;

  try {
    const globalFlag = global ? '-g' : '';
    const cmd = `npm install ${globalFlag} ${pkg.name}@latest`;

    execSync(cmd, {
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'inherit'
    });

    // Check new version
    const updateInfo = await checkForUpdates();

    return {
      success: true,
      message: 'Update completed successfully',
      previousVersion,
      newVersion: updateInfo.latestVersion
    };
  } catch (err) {
    return {
      success: false,
      message: `Update failed: ${err}`,
      previousVersion
    };
  }
}

/**
 * Formats update info for console output
 */
export function formatUpdateInfo(info: UpdateInfo): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('custommcp Update Check');
  lines.push('======================');
  lines.push('');
  lines.push(`Current version: ${info.currentVersion}`);
  lines.push(`Latest version:  ${info.latestVersion}`);
  lines.push('');

  if (info.hasUpdate) {
    lines.push('A new version is available!');
    lines.push('');
    lines.push('To update, run:');
    lines.push('  npm install -g llm-router-mcp@latest');
    lines.push('');
    if (info.releaseUrl) {
      lines.push(`Release notes: ${info.releaseUrl}`);
    }
  } else {
    lines.push('You are on the latest version.');
  }

  return lines.join('\n');
}

export default {
  checkForUpdates,
  performUpdate,
  formatUpdateInfo
};
