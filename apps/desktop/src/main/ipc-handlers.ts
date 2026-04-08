/**
 * PhantomOS Desktop — IPC Handlers
 * Registers main-process IPC handlers for renderer communication.
 * Future: theme switching, settings, direct Hono calls bypassing HTTP.
 * @author Subash Karki
 */
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Register all IPC handlers. Call once during app init. */
export const registerIpcHandlers = (): void => {
  ipcMain.handle('phantom:ping', () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  /** Open native folder picker, returns selected path or null */
  ipcMain.handle('phantom:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Repository Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  /** Open a path in macOS Finder */
  ipcMain.handle('phantom:open-in-finder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  /** Open a path in the default editor */
  ipcMain.handle('phantom:open-in-editor', (_e, filePath: string) => {
    shell.openPath(filePath);
  });

  /** Return basic git status for a workspace path */
  ipcMain.handle('phantom:git-status', async (_e, repoPath: string) => {
    try {
      const { stdout } = await execFileAsync('git', [
        '-C', repoPath,
        'status', '--porcelain=v1', '-b', '--ahead-behind',
      ], { timeout: 5000 });

      const lines = stdout.split('\n').filter(Boolean);
      const branchLine = lines[0] ?? '';

      // Parse branch: ## main...origin/main [ahead 11]
      const branchMatch = branchLine.match(/^## (.+?)(?:\.\.\.(\S+))?(?:\s+\[(.+)])?$/);
      const branch = branchMatch?.[1] ?? 'unknown';
      const tracking = branchMatch?.[2] ?? null;
      const aheadBehind = branchMatch?.[3] ?? '';

      const aheadMatch = aheadBehind.match(/ahead (\d+)/);
      const behindMatch = aheadBehind.match(/behind (\d+)/);
      const ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
      const behind = behindMatch ? Number(behindMatch[1]) : 0;

      // Count file statuses
      const files = lines.slice(1);
      let staged = 0;
      let modified = 0;
      let untracked = 0;
      for (const f of files) {
        const x = f[0]; // index status
        const y = f[1]; // worktree status
        if (x === '?') { untracked++; continue; }
        if (x !== ' ' && x !== '?') staged++;
        if (y !== ' ' && y !== '?') modified++;
      }

      return { branch, tracking, ahead, behind, staged, modified, untracked };
    } catch {
      return null;
    }
  });

  /** Read and parse tsconfig.json from a workspace root */
  ipcMain.handle('phantom:read-tsconfig', (_e, repoPath: string) => {
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
  });

  /** Scan node_modules/@types and direct dependency types, return type definitions */
  ipcMain.handle('phantom:read-types', (_e, repoPath: string) => {
    const results: { filePath: string; content: string }[] = [];
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
        // Resolve: first check @types/<refPkg>, then node_modules/<refPkg>
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
          // Skip if already loaded
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
          // Skip @types — already scanned above
          if (depName.startsWith('@types/')) continue;

          const depModuleDir = join(repoPath, 'node_modules', depName);

          // Resolve the types entry point:
          // a) Check dep's package.json for "types" / "typings" field first
          // b) Fall back to dist/index.d.ts, then index.d.ts
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
  });
};
