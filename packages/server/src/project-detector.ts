/**
 * PhantomOS Project Detector
 * Auto-detects project type, build system, and available commands from repo files.
 * @author Subash Karki
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  label: string;
  command: string;
  icon: string;
  category: 'setup' | 'test' | 'lint' | 'build' | 'serve' | 'deploy' | 'custom';
  description?: string;
  auto: boolean; // true = auto-detected, false = user-added
}

export interface ProjectProfile {
  type: 'python' | 'node' | 'monorepo' | 'infra' | 'go' | 'rust' | 'unknown';
  buildSystem: string;
  recipes: Recipe[];
  envNeeds: string[];
  detected: boolean;
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RECIPES = 75;

const fileExists = (repoPath: string, name: string): boolean => {
  try {
    return existsSync(join(repoPath, name));
  } catch {
    return false;
  }
};

const readFile = (repoPath: string, name: string): string | null => {
  try {
    return readFileSync(join(repoPath, name), 'utf-8');
  } catch {
    return null;
  }
};

/** Capitalize and humanize a target name (e.g. "sam-deploy" → "SAM Deploy") */
const humanize = (target: string): string =>
  target
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Sam|Aws|Api|Cli|Npm|Ci|Cd)\b/gi, (m) => m.toUpperCase());

/** Categorize a target/script name based on keyword matching */
const categorize = (name: string): Recipe['category'] => {
  const lower = name.toLowerCase();
  if (/test|pytest|check/.test(lower)) return 'test';
  if (/lint|fmt|format|ruff/.test(lower)) return 'lint';
  if (/build|compile|sam-build/.test(lower)) return 'build';
  if (/serve|dev|start|run/.test(lower)) return 'serve';
  if (/deploy|sam-deploy/.test(lower)) return 'deploy';
  if (/init|setup|install|venv/.test(lower)) return 'setup';
  return 'custom';
};

/** Pick a sensible icon for a recipe category */
const iconForCategory = (category: Recipe['category']): string => {
  switch (category) {
    case 'setup':  return '📦';
    case 'test':   return '🧪';
    case 'lint':   return '🔍';
    case 'build':  return '🔨';
    case 'serve':  return '🚀';
    case 'deploy': return '☁️';
    case 'custom': return '⚙️';
  }
};

// ---------------------------------------------------------------------------
// Recipe extractors
// ---------------------------------------------------------------------------

/** Extract Makefile targets as recipes */
const extractMakefileRecipes = (repoPath: string): Recipe[] => {
  try {
    const output = execSync(
      "grep -E '^[a-zA-Z_-]+:' Makefile | sed 's/:.*//'",
      { cwd: repoPath, encoding: 'utf-8', timeout: 5_000 },
    );

    return output
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t && !t.startsWith('_') && !t.startsWith('.'))
      .map((target) => {
        const category = categorize(target);
        return {
          id: `make-${target}`,
          label: humanize(target),
          command: `make ${target}`,
          icon: iconForCategory(category),
          category,
          auto: true,
        };
      });
  } catch (err) {
    logger.debug('ProjectDetector', 'Makefile extraction failed', err);
    return [];
  }
};

/** Extract package.json scripts as recipes */
const extractNpmRecipes = (repoPath: string): Recipe[] => {
  try {
    const raw = readFile(repoPath, 'package.json');
    if (!raw) return [];

    const pkg = JSON.parse(raw);
    const scripts: Record<string, string> = pkg.scripts ?? {};

    const useBun = fileExists(repoPath, 'bun.lock') || fileExists(repoPath, 'bun.lockb');
    const usePnpm = fileExists(repoPath, 'pnpm-lock.yaml');
    const runner = useBun ? 'bun run' : usePnpm ? 'pnpm' : 'npm run';

    return Object.entries(scripts).map(([name, cmd]) => {
      const category = categorize(name);
      return {
        id: `npm-${name}`,
        label: humanize(name),
        command: `${runner} ${name}`,
        icon: iconForCategory(category),
        category,
        description: cmd,
        auto: true,
      };
    });
  } catch (err) {
    logger.debug('ProjectDetector', 'package.json extraction failed', err);
    return [];
  }
};

/** Extract Python project recipes from pyproject.toml */
const extractPythonRecipes = (repoPath: string): Recipe[] => {
  const recipes: Recipe[] = [];

  try {
    const raw = readFile(repoPath, 'pyproject.toml');

    // Extract [project.scripts] entries if present
    if (raw) {
      const scriptsMatch = raw.match(/\[project\.scripts\]\s*\n([\s\S]*?)(?:\n\[|$)/);
      if (scriptsMatch) {
        const lines = scriptsMatch[1].split('\n').filter((l) => l.includes('='));
        for (const line of lines) {
          const [name] = line.split('=').map((s) => s.trim().replace(/"/g, ''));
          if (name) {
            recipes.push({
              id: `py-${name}`,
              label: humanize(name),
              command: name,
              icon: '🐍',
              category: 'custom',
              auto: true,
            });
          }
        }
      }
    }

    // Always add pytest if tests/ directory exists
    if (fileExists(repoPath, 'tests')) {
      recipes.push({
        id: 'py-pytest',
        label: 'Pytest',
        command: 'pytest',
        icon: '🧪',
        category: 'test',
        auto: true,
      });
    }

    // Add ruff if configured (in pyproject.toml or ruff.toml)
    const hasRuff =
      (raw && raw.includes('[tool.ruff]')) || fileExists(repoPath, 'ruff.toml');
    if (hasRuff) {
      recipes.push({
        id: 'py-ruff',
        label: 'Ruff Check',
        command: 'ruff check .',
        icon: '🔍',
        category: 'lint',
        auto: true,
      });
    }
  } catch (err) {
    logger.debug('ProjectDetector', 'Python extraction failed', err);
  }

  return recipes;
};

/** Extract Nx monorepo recipes */
const extractNxRecipes = (repoPath: string): Recipe[] => {
  return [
    {
      id: 'nx-test',
      label: 'Nx Test',
      command: 'nx test',
      icon: '🧪',
      category: 'test',
      auto: true,
    },
    {
      id: 'nx-lint',
      label: 'Nx Lint',
      command: 'nx lint',
      icon: '🔍',
      category: 'lint',
      auto: true,
    },
    {
      id: 'nx-build',
      label: 'Nx Build',
      command: 'nx build',
      icon: '🔨',
      category: 'build',
      auto: true,
    },
    {
      id: 'nx-serve',
      label: 'Nx Serve',
      command: 'nx serve',
      icon: '🚀',
      category: 'serve',
      auto: true,
    },
    {
      id: 'nx-affected',
      label: 'Nx Affected Test',
      command: 'nx affected:test --base=main',
      icon: '🧪',
      category: 'test',
      description: 'Run tests for affected projects only',
      auto: true,
    },
  ];
};

/** Extract Cargo (Rust) recipes */
const extractCargoRecipes = (_repoPath: string): Recipe[] => {
  return [
    { id: 'cargo-build', label: 'Cargo Build', command: 'cargo build', icon: '🔨', category: 'build', auto: true },
    { id: 'cargo-test', label: 'Cargo Test', command: 'cargo test', icon: '🧪', category: 'test', auto: true },
    { id: 'cargo-run', label: 'Cargo Run', command: 'cargo run', icon: '🚀', category: 'serve', auto: true },
    { id: 'cargo-clippy', label: 'Cargo Clippy', command: 'cargo clippy', icon: '🔍', category: 'lint', auto: true },
    { id: 'cargo-fmt', label: 'Cargo Fmt', command: 'cargo fmt', icon: '🔍', category: 'lint', auto: true },
  ];
};

/** Extract Go recipes */
const extractGoRecipes = (_repoPath: string): Recipe[] => {
  return [
    { id: 'go-build', label: 'Go Build', command: 'go build ./...', icon: '🔨', category: 'build', auto: true },
    { id: 'go-test', label: 'Go Test', command: 'go test ./...', icon: '🧪', category: 'test', auto: true },
    { id: 'go-run', label: 'Go Run', command: 'go run .', icon: '🚀', category: 'serve', auto: true },
    { id: 'go-vet', label: 'Go Vet', command: 'go vet ./...', icon: '🔍', category: 'lint', auto: true },
  ];
};

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

const detectEnvNeeds = (repoPath: string): string[] => {
  const needs: string[] = [];

  if (fileExists(repoPath, 'pyproject.toml') || fileExists(repoPath, 'requirements.txt')) {
    const versionFile = readFile(repoPath, '.python-version');
    needs.push(versionFile ? `python ${versionFile.trim()}` : 'python');
  }

  if (fileExists(repoPath, 'package.json')) {
    const nvmrc = readFile(repoPath, '.nvmrc');
    needs.push(nvmrc ? `node ${nvmrc.trim()}` : 'node');
  }

  if (fileExists(repoPath, 'docker-compose.yml') || fileExists(repoPath, 'docker-compose.yaml')) {
    needs.push('docker');
  }

  if (fileExists(repoPath, '.env.example')) {
    needs.push('env-vars');
  }

  // Check Makefile for AWS-related targets
  try {
    const makefile = readFile(repoPath, 'Makefile');
    if (makefile && /aws|sam-|cloudformation/i.test(makefile)) {
      needs.push('aws-cli');
    }
  } catch { /* ignore */ }

  if (fileExists(repoPath, 'Cargo.toml')) {
    needs.push('rust');
  }

  if (fileExists(repoPath, 'go.mod')) {
    needs.push('go');
  }

  return needs;
};

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export const detectProject = (repoPath: string): ProjectProfile => {
  logger.info('ProjectDetector', `Scanning ${repoPath}`);

  const hasPyproject = fileExists(repoPath, 'pyproject.toml');
  const hasPackageJson = fileExists(repoPath, 'package.json');
  const hasMakefile = fileExists(repoPath, 'Makefile');
  const hasCargoToml = fileExists(repoPath, 'Cargo.toml');
  const hasGoMod = fileExists(repoPath, 'go.mod');
  const hasNxJson = fileExists(repoPath, 'nx.json');
  const hasTurboJson = fileExists(repoPath, 'turbo.json');

  // Determine project type
  let type: ProjectProfile['type'] = 'unknown';
  let buildSystem = 'unknown';

  if (hasPackageJson && (hasNxJson || hasTurboJson)) {
    type = 'monorepo';
    const pkgMgr = fileExists(repoPath, 'pnpm-lock.yaml') ? 'pnpm' : fileExists(repoPath, 'bun.lock') ? 'bun' : 'npm';
    buildSystem = `${hasNxJson ? 'nx' : 'turbo'}+${pkgMgr}`;
  } else if (hasPyproject) {
    type = 'python';
    buildSystem = 'pyproject';
  } else if (hasPackageJson) {
    type = 'node';
    const useBun = fileExists(repoPath, 'bun.lock') || fileExists(repoPath, 'bun.lockb');
    const usePnpm = fileExists(repoPath, 'pnpm-lock.yaml');
    buildSystem = useBun ? 'bun' : usePnpm ? 'pnpm' : 'npm';
  } else if (hasCargoToml) {
    type = 'rust';
    buildSystem = 'cargo';
  } else if (hasGoMod) {
    type = 'go';
    buildSystem = 'go';
  } else if (hasMakefile) {
    type = 'infra';
    buildSystem = 'make';
  }

  // Collect recipes — prioritize the primary build system's commands
  let recipes: Recipe[] = [];

  if (type === 'monorepo' || type === 'node') {
    // Node/monorepo: package.json scripts first, then Nx, Makefile last (if at all)
    if (hasPackageJson) recipes.push(...extractNpmRecipes(repoPath));
    if (hasNxJson) recipes.push(...extractNxRecipes(repoPath));
    // Only include Makefile for node projects if very few npm scripts detected
    if (hasMakefile && recipes.length < 3) recipes.push(...extractMakefileRecipes(repoPath));
  } else if (type === 'python') {
    // Python: pyproject first, then Makefile (common for make test/lint)
    if (hasPyproject) recipes.push(...extractPythonRecipes(repoPath));
    if (hasMakefile) recipes.push(...extractMakefileRecipes(repoPath));
  } else if (type === 'rust') {
    if (hasCargoToml) recipes.push(...extractCargoRecipes(repoPath));
  } else if (type === 'go') {
    if (hasGoMod) recipes.push(...extractGoRecipes(repoPath));
  } else {
    // Infra/unknown: Makefile is primary
    if (hasMakefile) recipes.push(...extractMakefileRecipes(repoPath));
    if (hasPackageJson) recipes.push(...extractNpmRecipes(repoPath));
  }

  // Deduplicate by id and cap at MAX_RECIPES
  const seen = new Set<string>();
  recipes = recipes.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).slice(0, MAX_RECIPES);

  const envNeeds = detectEnvNeeds(repoPath);

  const profile: ProjectProfile = {
    type,
    buildSystem,
    recipes,
    envNeeds,
    detected: true,
    detectedAt: Date.now(),
  };

  logger.info(
    'ProjectDetector',
    `Detected: type=${type}, buildSystem=${buildSystem}, recipes=${recipes.length}, envNeeds=${envNeeds.join(',')}`,
  );

  return profile;
};
