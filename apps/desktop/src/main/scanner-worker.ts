/**
 * Scanner Worker — runs in Electron utilityProcess
 * Handles heavy file scanning off the main process thread so the UI stays responsive.
 *
 * Supports three message types:
 *   - read-types: Scans node_modules/@types and dependency types (up to 100 files)
 *   - scan-source-files: Walks workspace source files for Monaco (up to 500 files)
 *   - read-tsconfig: Parses tsconfig.json compilerOptions
 *
 * Communication: postMessage / on('message') with { id, type, payload } protocol.
 * @author Subash Karki
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────
interface WorkerMessage {
  id: string;
  type: 'read-types' | 'scan-source-files' | 'read-tsconfig';
  payload: { repoPath: string };
}

interface TypeFileResult {
  filePath: string;
  content: string;
}

interface SourceFileResult {
  path: string;
  content: string;
}

// ── read-types implementation ──────────────────────────────────────────────
function readTypes(repoPath: string): TypeFileResult[] {
  const results: TypeFileResult[] = [];
  const MAX_FILES = 100;
  const MAX_FILE_SIZE = 512 * 1024; // 512KB per file

  /** Read a single .d.ts file and push to results. Returns the content or null. */
  const pushTypeFile = (absPath: string, virtualPath: string): string | null => {
    if (results.length >= MAX_FILES) return null;
    try {
      const content = readFileSync(absPath, 'utf-8');
      if (content.length <= MAX_FILE_SIZE) {
        results.push({ filePath: virtualPath, content });
        return content;
      }
    } catch { /* skip unreadable */ }
    return null;
  };

  /**
   * Parse `/// <reference types="pkg" />` directives from a .d.ts file and
   * load each referenced package's root types (1 level deep only).
   */
  const followReferenceDirectives = (content: string): void => {
    const refRe = /\/\/\/\s*<reference\s+types="([^"]+)"\s*\/>/g;
    let match: RegExpExecArray | null;
    while ((match = refRe.exec(content)) !== null) {
      if (results.length >= MAX_FILES) break;
      const refPkg = match[1];
      const candidates: [string, string][] = [
        [
          join(repoPath, 'node_modules', '@types', refPkg, 'index.d.ts'),
          `file:///node_modules/@types/${refPkg}/index.d.ts`,
        ],
        [
          join(repoPath, 'node_modules', refPkg, 'index.d.ts'),
          `file:///node_modules/${refPkg}/index.d.ts`,
        ],
      ];
      for (const [absPath, virtualPath] of candidates) {
        if (results.some(r => r.filePath === virtualPath)) break;
        if (existsSync(absPath)) {
          pushTypeFile(absPath, virtualPath);
          break;
        }
      }
    }
  };

  // 1. Scan node_modules/@types — including scoped dirs like @types/@scope/pkg
  const typesDir = join(repoPath, 'node_modules', '@types');
  if (existsSync(typesDir)) {
    try {
      for (const entry of readdirSync(typesDir)) {
        if (results.length >= MAX_FILES) break;
        const entryPath = join(typesDir, entry);

        if (entry.startsWith('@')) {
          // Scoped dir under @types (e.g. @types/@testing-library/react)
          try {
            for (const scopedPkg of readdirSync(entryPath)) {
              if (results.length >= MAX_FILES) break;
              const indexPath = join(entryPath, scopedPkg, 'index.d.ts');
              if (existsSync(indexPath)) {
                const content = pushTypeFile(
                  indexPath,
                  `file:///node_modules/@types/${entry}/${scopedPkg}/index.d.ts`,
                );
                if (content) followReferenceDirectives(content);
              }
            }
          } catch { /* skip unreadable scoped dir */ }
        } else {
          // Normal @types/<pkg>
          const indexPath = join(entryPath, 'index.d.ts');
          if (existsSync(indexPath)) {
            const content = pushTypeFile(
              indexPath,
              `file:///node_modules/@types/${entry}/index.d.ts`,
            );
            if (content) followReferenceDirectives(content);
          }
        }
      }
    } catch { /* skip if @types dir can't be read */ }
  }

  // 2. Read package.json dependencies and look for their type roots
  try {
    const pkgPath = join(repoPath, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const depName of Object.keys(deps)) {
        if (results.length >= MAX_FILES) break;
        if (depName.startsWith('@types/')) continue;

        let depModuleDir = join(repoPath, 'node_modules', depName);
        if (!existsSync(depModuleDir)) {
          const bunDir = join(repoPath, 'node_modules', '.bun');
          if (existsSync(bunDir)) {
            try {
              const bunEntry = readdirSync(bunDir).find((d) =>
                d.startsWith(`${depName}@`) || d.startsWith(`${depName.replace('/', '+')}@`),
              );
              if (bunEntry) {
                const candidate = join(bunDir, bunEntry, 'node_modules', depName);
                if (existsSync(candidate)) depModuleDir = candidate;
              }
            } catch { /* skip */ }
          }
        }

        let typesRelPath: string | null = null;
        try {
          const depPkgPath = join(depModuleDir, 'package.json');
          if (existsSync(depPkgPath)) {
            const depPkg = JSON.parse(readFileSync(depPkgPath, 'utf-8'));
            typesRelPath = depPkg.types ?? depPkg.typings ?? null;
          }
        } catch { /* ignore malformed package.json */ }

        const candidates: string[] = [];
        if (typesRelPath) {
          candidates.push(join(depModuleDir, typesRelPath));
        }
        candidates.push(
          join(depModuleDir, 'dist', 'index.d.ts'),
          join(depModuleDir, 'index.d.ts'),
        );

        const virtualBase = `file:///node_modules/${depName}/index.d.ts`;
        for (const candidate of candidates) {
          if (existsSync(candidate)) {
            const content = pushTypeFile(candidate, virtualBase);
            if (content) followReferenceDirectives(content);
            break;
          }
        }
      }
    }
  } catch { /* skip */ }

  return results;
}

// ── scan-source-files implementation ───────────────────────────────────────
function scanSourceFiles(repoPath: string): SourceFileResult[] {
  const results: SourceFileResult[] = [];
  // Align with Monaco's MAX_SOURCE_MODELS (500) in LazyMonaco.tsx so TS
  // Go-to-Definition has the maximum coverage the editor will accept.
  const MAX_FILES = 1500;
  const MAX_FILE_SIZE = 200 * 1024; // 200KB per file
  const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'build', '.git', '.next',
    'coverage', '.turbo', '.cache', '.output', '__pycache__',
  ]);
  const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

  function walk(dir: string, relBase: string): void {
    if (results.length >= MAX_FILES) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (results.length >= MAX_FILES) return;
      const absPath = join(dir, entry);
      const relPath = relBase ? `${relBase}/${entry}` : entry;
      try {
        const stat = statSync(absPath);
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(entry)) walk(absPath, relPath);
        } else if (SOURCE_EXTS.has(extname(entry).toLowerCase()) && stat.size <= MAX_FILE_SIZE) {
          results.push({ path: relPath, content: readFileSync(absPath, 'utf-8') });
        }
      } catch { /* skip unreadable */ }
    }
  }

  walk(repoPath, '');
  return results;
}

// ── read-tsconfig implementation ───────────────────────────────────────────
function readTsConfig(repoPath: string): Record<string, unknown> | null {
  try {
    const tsconfigPath = join(repoPath, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) return null;
    const raw = readFileSync(tsconfigPath, 'utf-8');
    // Strip comments (tsconfig allows them) before parsing
    const stripped = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const parsed = JSON.parse(stripped);
    return parsed.compilerOptions ?? null;
  } catch {
    return null;
  }
}

// ── Message handler ────────────────────────────────────────────────────────
process.parentPort?.on('message', (event: { data: WorkerMessage }) => {
  const { id, type, payload } = event.data;

  try {
    let result: unknown;

    if (type === 'read-types') {
      result = readTypes(payload.repoPath);
    } else if (type === 'scan-source-files') {
      result = scanSourceFiles(payload.repoPath);
    } else if (type === 'read-tsconfig') {
      result = readTsConfig(payload.repoPath);
    } else {
      process.parentPort?.postMessage({ id, error: `Unknown message type: ${type}` });
      return;
    }

    process.parentPort?.postMessage({ id, result });
  } catch (err) {
    process.parentPort?.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
