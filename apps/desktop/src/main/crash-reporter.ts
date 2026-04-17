/**
 * crash-reporter.ts — Writes structured crash reports on server exit.
 * @author Subash Karki
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { release, arch } from 'node:os';

export interface CrashReport {
  timestamp: string;
  exitCode: number;
  electronVersion: string;
  arch: string;
  osVersion: string;
  appVersion: string;
  stderr: string[];
  nativeModules: Record<string, { found: boolean; nodeFiles: string[] }>;
}

const CRASHES_DIR = join(app.getPath('home'), '.phantom-os', 'logs', 'crashes');
const MAX_REPORTS = 10;

const scanNativeModules = (): CrashReport['nativeModules'] => {
  const modules: CrashReport['nativeModules'] = {};
  const NATIVE = ['better-sqlite3', 'node-pty'];

  for (const name of NATIVE) {
    const nodeFiles: string[] = [];
    try {
      const baseDir = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', name);
      if (existsSync(baseDir)) {
        const walk = (dir: string, prefix: string) => {
          for (const f of readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${f.name}` : f.name;
            if (f.name.endsWith('.node')) nodeFiles.push(rel);
            else if (f.isDirectory() && !f.name.startsWith('.')) walk(join(dir, f.name), rel);
          }
        };
        walk(baseDir, '');
        modules[name] = { found: true, nodeFiles };
      } else {
        modules[name] = { found: false, nodeFiles: [] };
      }
    } catch {
      modules[name] = { found: false, nodeFiles: [] };
    }
  }
  return modules;
};

export const writeCrashReport = (exitCode: number, stderrLines: string[]): string => {
  mkdirSync(CRASHES_DIR, { recursive: true });

  const report: CrashReport = {
    timestamp: new Date().toISOString(),
    exitCode,
    electronVersion: process.versions.electron ?? 'unknown',
    arch: arch(),
    osVersion: `Darwin ${release()}`,
    appVersion: app.getVersion(),
    stderr: stderrLines.slice(-50),
    nativeModules: scanNativeModules(),
  };

  const filename = `${report.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = join(CRASHES_DIR, filename);
  writeFileSync(filepath, JSON.stringify(report, null, 2));

  cleanupOldReports();
  return filepath;
};

const cleanupOldReports = (): void => {
  try {
    const files = readdirSync(CRASHES_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    for (const f of files.slice(MAX_REPORTS)) {
      rmSync(join(CRASHES_DIR, f), { force: true });
    }
  } catch {}
};
