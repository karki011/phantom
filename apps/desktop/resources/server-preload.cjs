/**
 * server-preload.cjs — Electron utilityProcess entry point.
 * Hooks Module._resolveFilename to redirect native module requires
 * to app.asar.unpacked/node_modules BEFORE the server bundle loads.
 *
 * @author Subash Karki
 */
'use strict';

const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const resourcesDir = path.dirname(__filename);
const unpackedModules = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

console.log('[server-preload] resourcesDir:', resourcesDir);
console.log('[server-preload] unpackedModules:', unpackedModules, 'exists:', fs.existsSync(unpackedModules));

if (fs.existsSync(unpackedModules)) {
  for (const mod of NATIVE_MODULES) {
    const modDir = path.join(unpackedModules, mod);
    const exists = fs.existsSync(modDir);
    console.log(`[server-preload] ${mod}: ${modDir} exists=${exists}`);
    if (exists) {
      try {
        const files = [];
        const walk = (dir, prefix) => {
          for (const f of fs.readdirSync(dir)) {
            const full = path.join(dir, f);
            const rel = prefix ? prefix + '/' + f : f;
            if (f.endsWith('.node')) files.push(rel);
            else if (fs.statSync(full).isDirectory() && !f.startsWith('.')) walk(full, rel);
          }
        };
        walk(modDir, '');
        console.log(`[server-preload] ${mod} .node files:`, files.length ? files.join(', ') : 'NONE FOUND');
      } catch (e) {
        console.error(`[server-preload] Error scanning ${mod}:`, e.message);
      }
    }
  }

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    const modName = NATIVE_MODULES.find(m => request === m || request.startsWith(m + '/'));
    if (modName) {
      const redirected = path.join(unpackedModules, request);
      if (fs.existsSync(redirected) || fs.existsSync(redirected + '.js') || fs.existsSync(path.join(redirected, 'package.json'))) {
        console.log(`[server-preload] Redirecting ${request} → ${redirected}`);
        return origResolve.call(this, redirected, parent, isMain, options);
      }
      console.warn(`[server-preload] ${request} not found in unpacked, falling through`);
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
} else {
  console.error('[server-preload] WARNING: unpacked node_modules not found at', unpackedModules);
}

try {
  require(path.join(resourcesDir, 'server', 'index.cjs'));
} catch (err) {
  console.error('[server-preload] FATAL: Server failed to start:', err.message);
  console.error('[server-preload] Stack:', err.stack);
  process.exit(1);
}
