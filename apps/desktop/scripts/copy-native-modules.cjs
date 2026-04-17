/**
 * copy-native-modules.cjs
 *
 * Resolves bun symlinks for native modules and copies them to the standard
 * node_modules layout expected by electron-builder's asarUnpack.
 *
 * Run during build, before electron-builder packages the app.
 *
 * Author: Subash Karki
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

// Runtime deps that bun keeps in its store but electron-builder needs in node_modules
const HIDDEN_DEPS = ['bindings', 'file-uri-to-path'];

// Install-time-only deps to strip from package.json so electron-builder doesn't chase them
const STRIP_DEPS = ['prebuild-install'];

/** apps/desktop */
const PROJECT_DIR = path.resolve(__dirname, '..');

/** monorepo root */
const ROOT_DIR = path.resolve(PROJECT_DIR, '..', '..');

/** Destination: apps/desktop/node_modules/ */
const TARGET_DIR = path.join(PROJECT_DIR, 'node_modules');

const LOG_PREFIX = '[copy-native-modules]';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function warn(msg) {
  console.warn(`${LOG_PREFIX} WARNING: ${msg}`);
}

/**
 * Recursively count .node files under a directory.
 * @param {string} dir
 * @returns {number}
 */
function countNodeFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return count;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countNodeFiles(full);
    } else if (entry.isFile() && entry.name.endsWith('.node')) {
      count += 1;
    }
  }
  return count;
}

/**
 * Copy src directory to dest using cp -R.
 * Removes dest first to ensure a clean copy (idempotent).
 * @param {string} src
 * @param {string} dest
 */
function copyDir(src, dest) {
  if (fs.existsSync(dest)) {
    log(`Removing existing ${dest}`);
    fs.rmSync(dest, { recursive: true, force: true });
  }
  execSync(`cp -R "${src}" "${dest}"`);
}

/**
 * Search the bun store (.bun directory under ROOT_DIR/node_modules/.bun) for
 * a package entry starting with `<name>@`.
 * Returns the resolved package directory path or null.
 * @param {string} name
 * @returns {string | null}
 */
function findInBunStore(name) {
  const bunStoreDir = path.join(ROOT_DIR, 'node_modules', '.bun');

  if (!fs.existsSync(bunStoreDir)) {
    log(`Bun store not found at ${bunStoreDir}`);
    return null;
  }

  const entries = fs.readdirSync(bunStoreDir);
  const match = entries.find((e) => e.startsWith(`${name}@`));

  if (!match) {
    log(`No bun store entry found matching "${name}@"`);
    return null;
  }

  // Bun store layout: .bun/<pkg>@version/node_modules/<pkg>/
  const candidate = path.join(bunStoreDir, match, 'node_modules', name);
  if (fs.existsSync(candidate)) {
    log(`Found in bun store: ${candidate}`);
    return candidate;
  }

  log(`Bun store entry found (${match}) but inner path does not exist: ${candidate}`);
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  log(`PROJECT_DIR : ${PROJECT_DIR}`);
  log(`ROOT_DIR    : ${ROOT_DIR}`);
  log(`TARGET_DIR  : ${TARGET_DIR}`);
  log(`Modules     : ${NATIVE_MODULES.join(', ')}`);
  log('─────────────────────────────────────────────');

  let exitCode = 0;

  for (const name of NATIVE_MODULES) {
    log(`Processing: ${name}`);

    const targetPath = path.join(TARGET_DIR, name);
    let sourceDir = null;

    // ── Step 1: Check local node_modules ─────────────────────────────────
    if (fs.existsSync(targetPath)) {
      let realPath;
      try {
        realPath = fs.realpathSync(targetPath);
      } catch {
        realPath = targetPath;
      }

      const isSymlink = realPath !== targetPath;

      if (isSymlink) {
        log(`${name}: symlink detected → ${realPath}`);
        log(`${name}: removing symlink and copying real directory`);
        // Remove the symlink itself (not the target)
        fs.unlinkSync(targetPath);
        sourceDir = realPath;
      } else {
        log(`${name}: already a real directory at ${targetPath}`);
        const nodeFileCount = countNodeFiles(targetPath);
        log(`${name}: ${nodeFileCount} .node file(s) found`);
        if (nodeFileCount === 0) {
          warn(`${name}: no .node files found in existing directory — may be incomplete`);
        }
        // Still strip install-time deps even for existing dirs
        const pkgJsonPath2 = path.join(targetPath, 'package.json');
        if (fs.existsSync(pkgJsonPath2) && STRIP_DEPS.length > 0) {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath2, 'utf8'));
          for (const dep of STRIP_DEPS) {
            if (pkg.dependencies && pkg.dependencies[dep]) {
              delete pkg.dependencies[dep];
              log(`${name}: stripped install-time dep "${dep}" from package.json`);
              fs.writeFileSync(pkgJsonPath2, JSON.stringify(pkg, null, 2) + '\n');
            }
          }
        }
        continue;
      }
    } else {
      // ── Step 2: Not found locally — search bun store ───────────────────
      log(`${name}: not found in ${TARGET_DIR}, searching bun store`);
      sourceDir = findInBunStore(name);
    }

    // ── Step 3: Copy ───────────────────────────────────────────────────────
    if (!sourceDir) {
      console.error(`${LOG_PREFIX} ERROR: Cannot find ${name} anywhere — aborting`);
      exitCode = 1;
      continue;
    }

    log(`${name}: copying from ${sourceDir} → ${targetPath}`);
    copyDir(sourceDir, targetPath);
    log(`${name}: copy complete`);

    // ── Step 4: Verify .node files ────────────────────────────────────────
    const nodeFileCount = countNodeFiles(targetPath);
    log(`${name}: ${nodeFileCount} .node file(s) found after copy`);
    if (nodeFileCount === 0) {
      warn(`${name}: no .node files found after copy — native bindings may be missing`);
    }

    // ── Step 5: Strip install-time-only deps from package.json ───────────
    const pkgJsonPath = path.join(targetPath, 'package.json');
    if (fs.existsSync(pkgJsonPath) && STRIP_DEPS.length > 0) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      let stripped = false;
      for (const dep of STRIP_DEPS) {
        if (pkg.dependencies && pkg.dependencies[dep]) {
          delete pkg.dependencies[dep];
          log(`${name}: stripped install-time dep "${dep}" from package.json`);
          stripped = true;
        }
      }
      if (stripped) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
      }
    }

    log('─────────────────────────────────────────────');
  }

  // ── Copy hidden deps that bun doesn't hoist ──────────────────────────────
  log('─────────────────────────────────────────────');
  log('Ensuring hidden dependencies are resolvable...');

  const rootNodeModules = path.join(ROOT_DIR, 'node_modules');

  for (const dep of HIDDEN_DEPS) {
    const destPath = path.join(rootNodeModules, dep);
    if (fs.existsSync(destPath) && !fs.lstatSync(destPath).isSymbolicLink()) {
      log(`${dep}: already present at ${destPath}`);
      continue;
    }

    const storeDir = findInBunStore(dep);
    if (!storeDir) {
      warn(`${dep}: not found in bun store — electron-builder may fail`);
      continue;
    }

    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    log(`${dep}: copying from bun store → ${destPath}`);
    copyDir(storeDir, destPath);
    log(`${dep}: done`);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }

  log('All native modules processed successfully.');
}

main();
