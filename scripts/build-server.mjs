/**
 * Build the PhantomOS server into dist/index.cjs using Bun's bundler.
 * Output as CJS for Electron utilityProcess compatibility.
 * Only truly native C++ addons are marked external.
 * @author Subash Karki
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, '..', 'packages', 'server');
const entry = resolve(serverRoot, 'src', 'index.ts');
const outdir = resolve(serverRoot, 'dist');

execSync(
  `bun build "${entry}" --outdir "${outdir}" --outfile index.cjs --target node --format cjs --external better-sqlite3 --external node-pty --external fsevents`,
  { stdio: 'inherit', cwd: serverRoot },
);

console.log('[build-server] Built packages/server/dist/index.cjs');
