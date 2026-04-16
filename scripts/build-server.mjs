/**
 * Build the PhantomOS server into dist/index.cjs using Bun's bundler.
 * Output as CJS for Electron utilityProcess compatibility.
 * Only truly native C++ addons are marked external.
 * @author Subash Karki
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, '..', 'packages', 'server');
const entry = resolve(serverRoot, 'src', 'index.ts');
const outdir = resolve(serverRoot, 'dist');

// Clean previous build to prevent stale bundles
if (existsSync(outdir)) {
  rmSync(outdir, { recursive: true });
  console.log('[build-server] Cleaned previous dist/');
}

execSync(
  `bun build "${entry}" --outdir "${outdir}" --target node --format cjs --external better-sqlite3 --external node-pty --external fsevents`,
  { stdio: 'inherit', cwd: serverRoot },
);

// Bun outputs index.js even with --format cjs. Rename to .cjs so
// Electron's utilityProcess (via server-preload.cjs) can require() it.
const jsPath = join(outdir, 'index.js');
const cjsPath = join(outdir, 'index.cjs');
if (existsSync(jsPath)) {
  renameSync(jsPath, cjsPath);
}

console.log('[build-server] Built packages/server/dist/index.cjs');
