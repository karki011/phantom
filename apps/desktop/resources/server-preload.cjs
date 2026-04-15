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

if (fs.existsSync(unpackedModules)) {
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    const modName = NATIVE_MODULES.find(m => request === m || request.startsWith(m + '/'));
    if (modName) {
      const redirected = path.join(unpackedModules, request);
      if (fs.existsSync(redirected) || fs.existsSync(redirected + '.js') || fs.existsSync(path.join(redirected, 'package.json'))) {
        return origResolve.call(this, redirected, parent, isMain, options);
      }
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
}

require(path.join(resourcesDir, 'server', 'index.cjs'));
