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

  // Copy build files from source if missing in unpacked
  if (!fs.existsSync(path.join(modulePath, 'binding.gyp')) && srcPath) {
    console.log(`[rebuild-native] Copying build files for ${name}...`);
    for (const item of ['binding.gyp', 'deps', 'src']) {
      const src = path.join(srcPath, item);
      const dst = path.join(modulePath, item);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        execSync(`cp -R "${src}" "${dst}"`);
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
  try {
    console.log(`[rebuild-native] Running electron-rebuild for Electron ${electronVersion}...`);
    // Create a minimal package.json so electron-rebuild can find modules
    const tmpPkg = path.join(unpackedDir, '..', 'package.json');
    const hadPkg = fs.existsSync(tmpPkg);
    if (!hadPkg) {
      fs.writeFileSync(tmpPkg, JSON.stringify({ name: 'phantom-rebuild', private: true }));
    }
    execSync(
      `npx --yes electron-rebuild --version ${electronVersion} --module-dir "${path.join(unpackedDir, '..')}" --force`,
      { stdio: 'inherit', timeout: 300000 }
    );
    if (!hadPkg) fs.unlinkSync(tmpPkg);
    console.log('[rebuild-native] All native modules rebuilt successfully');
    return;
  } catch (err) {
    console.warn('[rebuild-native] electron-rebuild failed, falling back to per-module rebuild:', err.message);
  }

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
