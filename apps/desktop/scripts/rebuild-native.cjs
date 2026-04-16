/**
 * rebuild-native.cjs — electron-builder afterPack hook
 * Rebuilds ALL native modules in the unpacked asar against Electron's Node ABI.
 * Does not touch source node_modules — dev builds remain unaffected.
 *
 * @author Subash Karki
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

function findElectronVersion(context) {
  try {
    return require(path.join(context.packager.projectDir, 'node_modules', 'electron', 'package.json')).version;
  } catch {
    // bun layout
    try {
      const bunDir = path.join(context.packager.projectDir, '..', '..', 'node_modules', '.bun');
      const entry = fs.readdirSync(bunDir).find(d => d.startsWith('electron@'));
      if (entry) return require(path.join(bunDir, entry, 'node_modules', 'electron', 'package.json')).version;
    } catch {}
    return '41.1.1';
  }
}

function findSourceModule(name, projectDir) {
  const bunDir = path.join(projectDir, '..', '..', 'node_modules', '.bun');
  if (fs.existsSync(bunDir)) {
    const entry = fs.readdirSync(bunDir).find(d => d.startsWith(`${name}@`));
    if (entry) return path.join(bunDir, entry, 'node_modules', name);
  }
  return null;
}

function rebuildModule(modulePath, srcPath, electronVersion) {
  const name = path.basename(modulePath);

  // Copy build files from source (bun cache) if missing in unpacked.
  // Use rsync to deep-merge — the unpacked dir may have partial files
  // (e.g. src/ with .ts files but missing C++ subdirectories like src/unix/).
  if (srcPath) {
    console.log(`[rebuild-native] Syncing build files for ${name} from source...`);
    for (const item of ['binding.gyp', 'deps', 'src', 'node-addon-api']) {
      const src = path.join(srcPath, item);
      const dst = path.join(modulePath, item);
      if (fs.existsSync(src)) {
        // For files, copy if missing. For dirs, rsync to merge contents.
        if (fs.statSync(src).isDirectory()) {
          execSync(`rsync -a "${src}/" "${dst}/"`);
        } else if (!fs.existsSync(dst)) {
          execSync(`cp "${src}" "${dst}"`);
        }
      }
    }
  }

  if (!fs.existsSync(path.join(modulePath, 'binding.gyp'))) {
    console.log(`[rebuild-native] No binding.gyp for ${name}, skipping`);
    return;
  }

  console.log(`[rebuild-native] Rebuilding ${name} for Electron ${electronVersion}...`);
  execSync(
    `npx --yes node-gyp rebuild --target=${electronVersion} --arch=arm64 --dist-url=https://electronjs.org/headers --runtime=electron`,
    { cwd: modulePath, stdio: 'inherit', timeout: 180000 }
  );
  console.log(`[rebuild-native] ${name} rebuilt successfully`);
}

module.exports = async function afterPack(context) {
  const appName = context.packager.appInfo.productFilename;
  const unpackedDir = path.join(
    context.appOutDir,
    `${appName}.app`,
    'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'
  );

  if (!fs.existsSync(unpackedDir)) {
    console.log('[rebuild-native] No unpacked node_modules, skipping');
    return;
  }

  const electronVersion = findElectronVersion(context);
  console.log(`[rebuild-native] Electron version: ${electronVersion}`);

  // Use electron-rebuild for all native modules at once — it handles
  // different build systems (node-gyp, cmake, etc.) correctly.
  // Falls back to per-module node-gyp if electron-rebuild isn't available.
  // Rebuild each native module individually with node-gyp targeting Electron's ABI.
  // electron-rebuild's --version flag is unreliable with bun workspaces — it often
  // rebuilds against the system Node ABI instead of Electron's.

  // Fallback: rebuild individually with node-gyp
  for (const name of NATIVE_MODULES) {
    const modulePath = path.join(unpackedDir, name);
    if (!fs.existsSync(modulePath)) continue;

    const srcPath = findSourceModule(name, context.packager.projectDir);
    try {
      rebuildModule(modulePath, srcPath, electronVersion);
    } catch (err) {
      console.warn(`[rebuild-native] Failed to rebuild ${name} (non-fatal):`, err.message);
    }
  }
};
