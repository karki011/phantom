/**
 * validate-native-runtime.cjs — Post-build validation for the PhantomOS .app bundle.
 * Verifies that native modules are present, contain .node binaries with correct
 * architecture, and are externalized in the server bundle.
 *
 * Usage: node apps/desktop/scripts/validate-native-runtime.cjs
 *
 * @author Subash Karki
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NATIVE_MODULES = ['better-sqlite3', 'node-pty'];

const RELEASE_DIR = path.join(__dirname, '..', 'release');

const ARCH_SUBDIRS = ['mac-universal', 'mac-arm64', 'mac'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk a directory recursively and collect all file paths matching a suffix.
 * @param {string} dir
 * @param {string} suffix
 * @returns {string[]}
 */
function findFiles(dir, suffix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        results.push(full);
      }
    }
  };

  walk(dir);
  return results;
}

/**
 * Find the first .app bundle inside the release directory.
 * Checks mac-universal, mac-arm64, mac subdirs in that order.
 * @returns {string|null} Absolute path to the .app bundle or null.
 */
function findAppBundle() {
  for (const subdir of ARCH_SUBDIRS) {
    const candidate = path.join(RELEASE_DIR, subdir);
    if (!fs.existsSync(candidate)) continue;

    let entries;
    try {
      entries = fs.readdirSync(candidate, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.app')) {
        return path.join(candidate, entry.name);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

function main() {
  // Require release directory to exist
  if (!fs.existsSync(RELEASE_DIR)) {
    console.error('No release directory found. Run electron-builder first.');
    process.exit(1);
  }

  const appBundle = findAppBundle();
  if (!appBundle) {
    console.error('No .app bundle found in release directory. Run electron-builder first.');
    process.exit(1);
  }

  console.log(`Validating bundle: ${appBundle}\n`);

  const resources = path.join(appBundle, 'Contents', 'Resources');
  const unpackedModules = path.join(resources, 'app.asar.unpacked', 'node_modules');
  const serverBundle = path.join(resources, 'server', 'index.cjs');

  const errors = [];

  // -------------------------------------------------------------------------
  // Check 5: server bundle exists (checked first so we can reference it below)
  // -------------------------------------------------------------------------
  const serverExists = fs.existsSync(serverBundle);
  if (!serverExists) {
    const msg = `Server bundle not found: ${serverBundle}`;
    console.log(`  ✗ ${msg}`);
    errors.push(msg);
  } else {
    console.log(`  ✓ Server bundle found: ${serverBundle}`);
  }

  let serverContent = null;
  if (serverExists) {
    try {
      serverContent = fs.readFileSync(serverBundle, 'utf8');
    } catch (err) {
      const msg = `Failed to read server bundle: ${err.message}`;
      console.log(`  ✗ ${msg}`);
      errors.push(msg);
    }
  }

  console.log('');

  // -------------------------------------------------------------------------
  // Per-module checks
  // -------------------------------------------------------------------------
  for (const name of NATIVE_MODULES) {
    console.log(`--- ${name} ---`);

    const moduleDir = path.join(unpackedModules, name);

    // Check 1: directory existence
    if (!fs.existsSync(moduleDir)) {
      const msg = `[${name}] Module directory not found: ${moduleDir}`;
      console.log(`  ✗ ${msg}`);
      errors.push(msg);
      // No point running further checks for this module
      console.log('');
      continue;
    }
    console.log(`  ✓ Module directory exists: ${moduleDir}`);

    // Check 2: .node binaries present
    const nodeFiles = findFiles(moduleDir, '.node');
    if (nodeFiles.length === 0) {
      const msg = `[${name}] No .node binary files found in ${moduleDir}`;
      console.log(`  ✗ ${msg}`);
      errors.push(msg);
    } else {
      console.log(`  ✓ Found ${nodeFiles.length} .node binary file(s)`);

      // Check 3: architecture of each .node file
      const foundArchitectures = new Set();
      for (const nodeFile of nodeFiles) {
        let fileOutput = '';
        try {
          fileOutput = execSync(`file "${nodeFile}"`, { encoding: 'utf8', timeout: 10000 });
        } catch (err) {
          const msg = `[${name}] Failed to run 'file' on ${nodeFile}: ${err.message}`;
          console.log(`  ✗ ${msg}`);
          errors.push(msg);
          continue;
        }

        const hasArm64 = fileOutput.includes('arm64');
        const hasX86 = fileOutput.includes('x86_64');

        if (!hasArm64 && !hasX86) {
          const msg = `[${name}] .node file has unrecognized architecture: ${path.basename(nodeFile)} — output: ${fileOutput.trim()}`;
          console.log(`  ✗ ${msg}`);
          errors.push(msg);
        } else {
          if (hasArm64) foundArchitectures.add('arm64');
          if (hasX86) foundArchitectures.add('x86_64');
          console.log(`  ✓ ${path.basename(nodeFile)}: architectures [${[...foundArchitectures].join(', ')}]`);
        }
      }
    }

    // Check 4: externalized in server bundle
    if (serverContent !== null) {
      const hasDoubleQuote = serverContent.includes(`require("${name}")`);
      const hasSingleQuote = serverContent.includes(`require('${name}')`);
      if (hasDoubleQuote || hasSingleQuote) {
        console.log(`  ✓ ${name} is externalized in server bundle`);
      } else {
        const msg = `[${name}] Not externalized in server bundle — require("${name}") / require('${name}') not found`;
        console.log(`  ✗ ${msg}`);
        errors.push(msg);
      }
    }

    console.log('');
  }

  // -------------------------------------------------------------------------
  // Final report
  // -------------------------------------------------------------------------
  if (errors.length > 0) {
    console.error(`\nValidation FAILED with ${errors.length} error(s):\n`);
    for (const err of errors) {
      console.error(`  ✗ ${err}`);
    }
    process.exit(1);
  }

  console.log('All checks passed. DMG is safe to distribute.');
}

main();
