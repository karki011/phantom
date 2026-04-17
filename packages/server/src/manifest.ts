/**
 * Server manifest — write/read/remove manifest for process adoption.
 * @author Subash Karki
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ServerManifest {
  pid: number;
  port: number;
  startedAt: string;
  version: string;
}

const MANIFEST_DIR = join(homedir(), '.phantom-os', 'server');
const MANIFEST_PATH = join(MANIFEST_DIR, 'manifest.json');

export const writeManifest = (port: number, version: string): void => {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  const manifest: ServerManifest = {
    pid: process.pid,
    port,
    startedAt: new Date().toISOString(),
    version,
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
};

export const readManifest = (): ServerManifest | null => {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return null;
  }
};

export const removeManifest = (): void => {
  try { rmSync(MANIFEST_PATH, { force: true }); } catch {}
};

export const MANIFEST_PATH_EXPORT = MANIFEST_PATH;
