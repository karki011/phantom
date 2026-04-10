/**
 * Tests for PhantomOS Project Detector
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { detectProject } from './project-detector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

const createTempDir = (): string => {
  const dir = join(tmpdir(), `phantom-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const writeJson = (dir: string, filename: string, data: unknown): void => {
  writeFileSync(join(dir, filename), JSON.stringify(data, null, 2));
};

const writeText = (dir: string, filename: string, content: string): void => {
  writeFileSync(join(dir, filename), content);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectProject', () => {
  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Node project detection
  // -------------------------------------------------------------------------

  describe('Node project', () => {
    it('detects a Node project with package.json', () => {
      writeJson(tempDir, 'package.json', {
        name: 'test-app',
        scripts: {
          dev: 'node index.js',
          build: 'tsc',
          test: 'vitest',
          lint: 'eslint .',
        },
      });

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('node');
      expect(profile.buildSystem).toBe('npm');
      expect(profile.detected).toBe(true);
      expect(profile.detectedAt).toBeTypeOf('number');
    });

    it('detects bun build system when bun.lock exists', () => {
      writeJson(tempDir, 'package.json', {
        name: 'bun-app',
        scripts: { dev: 'bun run index.ts' },
      });
      writeText(tempDir, 'bun.lock', '');

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('node');
      expect(profile.buildSystem).toBe('bun');
    });

    it('detects pnpm build system when pnpm-lock.yaml exists', () => {
      writeJson(tempDir, 'package.json', {
        name: 'pnpm-app',
        scripts: { dev: 'pnpm dev' },
      });
      writeText(tempDir, 'pnpm-lock.yaml', '');

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('node');
      expect(profile.buildSystem).toBe('pnpm');
    });

    it('extracts npm scripts as recipes', () => {
      writeJson(tempDir, 'package.json', {
        name: 'test-app',
        scripts: {
          dev: 'node index.js',
          build: 'tsc',
          test: 'vitest',
        },
      });

      const profile = detectProject(tempDir);
      const recipeIds = profile.recipes.map((r) => r.id);

      expect(recipeIds).toContain('npm-dev');
      expect(recipeIds).toContain('npm-build');
      expect(recipeIds).toContain('npm-test');
    });

    it('uses correct runner prefix for bun projects', () => {
      writeJson(tempDir, 'package.json', {
        name: 'bun-app',
        scripts: { dev: 'bun run index.ts' },
      });
      writeText(tempDir, 'bun.lock', '');

      const profile = detectProject(tempDir);
      const devRecipe = profile.recipes.find((r) => r.id === 'npm-dev');

      expect(devRecipe?.command).toBe('bun run dev');
    });
  });

  // -------------------------------------------------------------------------
  // Python project detection
  // -------------------------------------------------------------------------

  describe('Python project', () => {
    it('detects a Python project with pyproject.toml', () => {
      writeText(
        tempDir,
        'pyproject.toml',
        `[project]
name = "my-python-app"
version = "1.0.0"
`,
      );

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('python');
      expect(profile.buildSystem).toBe('pyproject');
    });

    it('adds pytest recipe when tests/ directory exists', () => {
      writeText(tempDir, 'pyproject.toml', '[project]\nname = "app"\n');
      mkdirSync(join(tempDir, 'tests'));

      const profile = detectProject(tempDir);
      const pytestRecipe = profile.recipes.find((r) => r.id === 'py-pytest');

      expect(pytestRecipe).toBeDefined();
      expect(pytestRecipe?.command).toBe('pytest');
      expect(pytestRecipe?.category).toBe('test');
    });

    it('adds ruff recipe when [tool.ruff] is configured', () => {
      writeText(
        tempDir,
        'pyproject.toml',
        `[project]
name = "app"

[tool.ruff]
line-length = 88
`,
      );

      const profile = detectProject(tempDir);
      const ruffRecipe = profile.recipes.find((r) => r.id === 'py-ruff');

      expect(ruffRecipe).toBeDefined();
      expect(ruffRecipe?.command).toBe('ruff check .');
      expect(ruffRecipe?.category).toBe('lint');
    });

    it('extracts [project.scripts] entries as recipes', () => {
      writeText(
        tempDir,
        'pyproject.toml',
        `[project]
name = "app"

[project.scripts]
my-cli = "app.main:cli"
serve = "app.server:run"
`,
      );

      const profile = detectProject(tempDir);
      const cliRecipe = profile.recipes.find((r) => r.id === 'py-my-cli');
      const serveRecipe = profile.recipes.find((r) => r.id === 'py-serve');

      expect(cliRecipe).toBeDefined();
      expect(serveRecipe).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Unknown / empty directory
  // -------------------------------------------------------------------------

  describe('unknown project', () => {
    it('returns "unknown" type for an empty directory', () => {
      const profile = detectProject(tempDir);

      expect(profile.type).toBe('unknown');
      expect(profile.buildSystem).toBe('unknown');
      expect(profile.recipes).toHaveLength(0);
      expect(profile.detected).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Monorepo detection
  // -------------------------------------------------------------------------

  describe('monorepo detection', () => {
    it('detects monorepo when nx.json + package.json exist', () => {
      writeJson(tempDir, 'package.json', {
        name: 'mono',
        scripts: { build: 'nx build' },
      });
      writeJson(tempDir, 'nx.json', { targetDefaults: {} });

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('monorepo');
      expect(profile.buildSystem).toContain('nx');
    });

    it('detects monorepo when turbo.json + package.json exist', () => {
      writeJson(tempDir, 'package.json', {
        name: 'mono',
        scripts: { build: 'turbo build' },
      });
      writeJson(tempDir, 'turbo.json', { pipeline: {} });

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('monorepo');
      expect(profile.buildSystem).toContain('turbo');
    });

    it('includes nx recipes for nx monorepo', () => {
      writeJson(tempDir, 'package.json', { name: 'mono', scripts: {} });
      writeJson(tempDir, 'nx.json', {});

      const profile = detectProject(tempDir);
      const nxRecipeIds = profile.recipes.filter((r) => r.id.startsWith('nx-')).map((r) => r.id);

      expect(nxRecipeIds).toContain('nx-test');
      expect(nxRecipeIds).toContain('nx-lint');
      expect(nxRecipeIds).toContain('nx-build');
      expect(nxRecipeIds).toContain('nx-serve');
    });
  });

  // -------------------------------------------------------------------------
  // Rust project detection
  // -------------------------------------------------------------------------

  describe('Rust project', () => {
    it('detects a Rust project with Cargo.toml', () => {
      writeText(tempDir, 'Cargo.toml', '[package]\nname = "my-crate"\nversion = "0.1.0"\n');

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('rust');
      expect(profile.buildSystem).toBe('cargo');
      expect(profile.recipes.some((r) => r.id === 'cargo-build')).toBe(true);
      expect(profile.recipes.some((r) => r.id === 'cargo-test')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Go project detection
  // -------------------------------------------------------------------------

  describe('Go project', () => {
    it('detects a Go project with go.mod', () => {
      writeText(tempDir, 'go.mod', 'module example.com/myapp\n\ngo 1.22\n');

      const profile = detectProject(tempDir);

      expect(profile.type).toBe('go');
      expect(profile.buildSystem).toBe('go');
      expect(profile.recipes.some((r) => r.id === 'go-build')).toBe(true);
      expect(profile.recipes.some((r) => r.id === 'go-test')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // MAX_RECIPES cap
  // -------------------------------------------------------------------------

  describe('MAX_RECIPES cap', () => {
    it('caps recipes at 75', () => {
      // Create a package.json with >75 scripts
      const scripts: Record<string, string> = {};
      for (let i = 0; i < 80; i++) {
        scripts[`script-${i}`] = `echo ${i}`;
      }
      writeJson(tempDir, 'package.json', { name: 'big-app', scripts });

      const profile = detectProject(tempDir);

      expect(profile.recipes.length).toBeLessThanOrEqual(75);
    });
  });

  // -------------------------------------------------------------------------
  // Recipe categorization (tested via detectProject output)
  // -------------------------------------------------------------------------

  describe('recipe categorization', () => {
    it('categorizes scripts correctly by keyword', () => {
      writeJson(tempDir, 'package.json', {
        name: 'test-app',
        scripts: {
          test: 'vitest',
          'test:e2e': 'playwright test',
          lint: 'eslint .',
          'lint:fix': 'eslint . --fix',
          build: 'tsc',
          dev: 'vite',
          start: 'node dist/index.js',
          deploy: 'cdk deploy',
          'format': 'prettier --write .',
          setup: 'npm install',
        },
      });

      const profile = detectProject(tempDir);
      const byId = (id: string) => profile.recipes.find((r) => r.id === id);

      expect(byId('npm-test')?.category).toBe('test');
      expect(byId('npm-test:e2e')?.category).toBe('test');
      expect(byId('npm-lint')?.category).toBe('lint');
      expect(byId('npm-lint:fix')?.category).toBe('lint');
      expect(byId('npm-build')?.category).toBe('build');
      expect(byId('npm-dev')?.category).toBe('serve');
      expect(byId('npm-start')?.category).toBe('serve');
      expect(byId('npm-deploy')?.category).toBe('deploy');
      expect(byId('npm-format')?.category).toBe('lint');
      expect(byId('npm-setup')?.category).toBe('setup');
    });
  });

  // -------------------------------------------------------------------------
  // Recipe humanization (tested via detectProject output)
  // -------------------------------------------------------------------------

  describe('recipe humanization', () => {
    it('humanizes script names into readable labels', () => {
      writeJson(tempDir, 'package.json', {
        name: 'test-app',
        scripts: {
          'sam-deploy': 'sam deploy',
          'api-test': 'vitest',
        },
      });

      const profile = detectProject(tempDir);
      const byId = (id: string) => profile.recipes.find((r) => r.id === id);

      // "sam-deploy" should become "SAM Deploy"
      expect(byId('npm-sam-deploy')?.label).toBe('SAM Deploy');
      // "api-test" should become "API Test"
      expect(byId('npm-api-test')?.label).toBe('API Test');
    });
  });

  // -------------------------------------------------------------------------
  // Environment needs detection
  // -------------------------------------------------------------------------

  describe('environment needs', () => {
    it('detects node env need from package.json', () => {
      writeJson(tempDir, 'package.json', { name: 'app', scripts: {} });

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('node');
    });

    it('detects python env need from pyproject.toml', () => {
      writeText(tempDir, 'pyproject.toml', '[project]\nname = "app"\n');

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('python');
    });

    it('detects docker env need from docker-compose.yml', () => {
      writeJson(tempDir, 'package.json', { name: 'app', scripts: {} });
      writeText(tempDir, 'docker-compose.yml', 'version: "3"\n');

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('docker');
    });

    it('detects env-vars need from .env.example', () => {
      writeJson(tempDir, 'package.json', { name: 'app', scripts: {} });
      writeText(tempDir, '.env.example', 'API_KEY=xxx\n');

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('env-vars');
    });

    it('includes specific node version from .nvmrc', () => {
      writeJson(tempDir, 'package.json', { name: 'app', scripts: {} });
      writeText(tempDir, '.nvmrc', '20.11.0');

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('node 20.11.0');
    });

    it('includes specific python version from .python-version', () => {
      writeText(tempDir, 'pyproject.toml', '[project]\nname = "app"\n');
      writeText(tempDir, '.python-version', '3.12.1');

      const profile = detectProject(tempDir);

      expect(profile.envNeeds).toContain('python 3.12.1');
    });
  });

  // -------------------------------------------------------------------------
  // Deduplication
  // -------------------------------------------------------------------------

  describe('recipe deduplication', () => {
    it('deduplicates recipes by id', () => {
      // A node project with few npm scripts + Makefile should merge
      // without duplicate ids
      writeJson(tempDir, 'package.json', {
        name: 'app',
        scripts: { build: 'tsc' },
      });
      // Makefile with a "build" target — but id will be "make-build" vs "npm-build" so both appear
      writeText(tempDir, 'Makefile', 'build:\n\ttsc\n\ntest:\n\tvitest\n');

      const profile = detectProject(tempDir);
      const ids = profile.recipes.map((r) => r.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids).toEqual(uniqueIds);
    });
  });
});
