/**
 * native-shim.ts — Resolve native .node binaries for production builds.
 * In dev: returns undefined (use normal require paths).
 * In production (Electron): returns the path to the .node file in app.asar.unpacked.
 *
 * @author Subash Karki
 */
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Get the absolute path to a native .node binary.
 * Returns undefined in dev (let the module find it normally).
 */
export function getNativeBinding(moduleName: string, binaryName: string): string | undefined {
  // In dev mode, __dirname is packages/server/src — no Resources dir
  // Let the module use its default resolution
  if (!process.resourcesPath && !process.env.ELECTRON_RUN_AS_NODE) {
    return undefined;
  }

  // Production: check app.asar.unpacked
  const candidates = [
    // Electron utilityProcess
    process.resourcesPath && join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName, 'build', 'Release', binaryName),
    // Fallback: sibling to server bundle
    join(dirname(process.argv[1] || __dirname), '..', 'app.asar.unpacked', 'node_modules', moduleName, 'build', 'Release', binaryName),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}
