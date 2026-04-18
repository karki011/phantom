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

// electron-builder Arch enum → Node arch string
const ARCH_MAP = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function findNodeFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findNodeFiles(full));
    else if (entry.name.endsWith('.node')) results.push(full);
  }
  return results;
}

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

function rebuildModule(modulePath, srcPath, electronVersion, arch) {
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
    `npx --yes node-gyp rebuild --target=${electronVersion} --arch=${arch} --dist-url=https://electronjs.org/headers --runtime=electron`,
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
  const arch = ARCH_MAP[context.arch] || process.arch;
  console.log(`[rebuild-native] Electron version: ${electronVersion}, arch: ${arch}`);

  for (const name of NATIVE_MODULES) {
    const modulePath = path.join(unpackedDir, name);
    if (!fs.existsSync(modulePath)) continue;

    const srcPath = findSourceModule(name, context.packager.projectDir);
    try {
      rebuildModule(modulePath, srcPath, electronVersion, arch);
    } catch (err) {
      console.warn(`[rebuild-native] Failed to rebuild ${name} (non-fatal):`, err.message);
    }
  }

  // node-pty's spawn-helper is a standalone executable Electron launches via
  // posix_spawn. Without an embedded signature, macOS blocks it with
  // "posix_spawnp failed". electron-builder ad-hoc signs the .app bundle but
  // not unpacked binaries — sign it ourselves.
  const spawnHelper = path.join(unpackedDir, 'node-pty', 'build', 'Release', 'spawn-helper');
  if (fs.existsSync(spawnHelper)) {
    try {
      execSync(`codesign --force --sign - "${spawnHelper}"`, { stdio: 'inherit' });
      console.log('[rebuild-native] spawn-helper ad-hoc signed');
    } catch (err) {
      console.warn('[rebuild-native] Failed to sign spawn-helper:', err.message);
    }
  }

  const nodeFiles = findNodeFiles(unpackedDir);
  for (const file of nodeFiles) {
    try {
      execSync(`codesign --force --sign - "${file}"`, { stdio: 'inherit' });
    } catch (err) {
      console.warn(`[rebuild-native] Failed to sign ${path.basename(file)}:`, err.message);
    }
  }
  console.log(`[rebuild-native] Signed ${nodeFiles.length} .node binaries`);

  // node-pty's unixTerminal.js unconditionally does
  //   helperPath = helperPath.replace('app.asar', 'app.asar.unpacked')
  // Our server-preload.cjs already resolves node-pty from app.asar.unpacked,
  // so the path starts out .../app.asar.unpacked/... and this rewrite turns
  // it into .../app.asar.unpacked.unpacked/... — spawn-helper then fails to
  // exec with ENOENT and terminals die with "posix_spawnp failed".
  // Make the two replace() calls idempotent.
  const uxTerm = path.join(unpackedDir, 'node-pty', 'lib', 'unixTerminal.js');
  if (fs.existsSync(uxTerm)) {
    try {
      let src = fs.readFileSync(uxTerm, 'utf8');
      src = src.replace(
        "helperPath = helperPath.replace('app.asar', 'app.asar.unpacked');",
        "helperPath = helperPath.replace(/app\\.asar(?!\\.unpacked)/, 'app.asar.unpacked');"
      );
      src = src.replace(
        "helperPath = helperPath.replace('node_modules.asar', 'node_modules.asar.unpacked');",
        "helperPath = helperPath.replace(/node_modules\\.asar(?!\\.unpacked)/, 'node_modules.asar.unpacked');"
      );
      fs.writeFileSync(uxTerm, src);
      console.log('[rebuild-native] patched unixTerminal.js asar-unpacked rewrite');
    } catch (err) {
      console.warn('[rebuild-native] Failed to patch unixTerminal.js:', err.message);
    }
  }
};
