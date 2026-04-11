/**
 * PhantomOS Worktree File Explorer Routes
 * @author Subash Karki
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, worktrees } from '@phantom-os/db';

export const worktreeFileRoutes = new Hono();

// ---------------------------------------------------------------------------
// Path Sandboxing
// ---------------------------------------------------------------------------

/** Resolve and validate a path is within the worktree root. Returns null if invalid. */
const safePath = (worktreeRoot: string, relativePath: string): string | null => {
  // Strip leading slash — resolve('/path', '/') returns '/' not '/path/'
  const cleaned = relativePath.replace(/^\/+/, '') || '.';
  const resolved = resolve(worktreeRoot, cleaned);
  // CRITICAL: Prevent path traversal — resolved path must start with worktree root
  const rootWithSlash = worktreeRoot.endsWith('/') ? worktreeRoot : worktreeRoot + '/';
  if (!resolved.startsWith(rootWithSlash) && resolved !== worktreeRoot) {
    return null;
  }
  return resolved;
};

/** Get worktree root path or return 404 */
const getWorktreeRoot = (id: string): string | null => {
  const worktree = db
    .select()
    .from(worktrees)
    .where(eq(worktrees.id, id))
    .get();

  if (!worktree?.worktreePath) return null;
  return worktree.worktreePath;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /worktrees/:id/files — List directory contents */
worktreeFileRoutes.get('/worktrees/:id/files', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path') || '/';

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const target = safePath(root, relativePath);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  if (!existsSync(target)) {
    return c.json({ error: 'Directory not found' }, 404);
  }

  try {
    const entries = readdirSync(target, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith('.git') || e.name === '.gitignore')
      .map((entry) => {
        const fullPath = join(target, entry.name);
        const isDirectory = entry.isDirectory();
        let size = 0;
        let mtime = 0;
        try {
          const stat = statSync(fullPath);
          size = stat.size;
          mtime = stat.mtimeMs;
        } catch { /* skip stat errors */ }

        return {
          name: entry.name,
          relativePath: join(relativePath, entry.name),
          isDirectory,
          size,
          mtime,
        };
      })
      // Directories first, then alphabetical
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    return c.json({ entries: items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to list directory: ${msg}` }, 500);
  }
});

/** GET /worktrees/:id/files/search — Recursive file name search */
worktreeFileRoutes.get('/worktrees/:id/files/search', (c) => {
  const id = c.req.param('id');
  const query = c.req.query('q')?.toLowerCase();
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);

  if (!query) return c.json({ error: 'q query parameter is required' }, 400);

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const results: { name: string; relativePath: string; isDirectory: boolean; size: number; mtime: number }[] = [];

  const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', '.turbo', '.cache', '__pycache__', '.venv']);

  const walk = (dir: string, relDir: string) => {
    if (results.length >= limit) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const relPath = join(relDir, entry.name);
      const fullPath = join(dir, entry.name);

      if (!entry.isDirectory() && entry.name.toLowerCase().includes(query)) {
        let size = 0;
        let mtime = 0;
        try { const s = statSync(fullPath); size = s.size; mtime = s.mtimeMs; } catch {}
        results.push({ name: entry.name, relativePath: relPath, isDirectory: false, size, mtime });
      }

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      }
    }
  };

  walk(root, '/');
  return c.json({ entries: results });
});

/** GET /worktrees/:id/file — Read file content */
worktreeFileRoutes.get('/worktrees/:id/file', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path');

  if (!relativePath) return c.json({ error: 'path query parameter is required' }, 400);

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const target = safePath(root, relativePath);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  if (!existsSync(target)) {
    return c.json({ error: 'File not found' }, 404);
  }

  try {
    const stat = statSync(target);
    if (stat.isDirectory()) {
      return c.json({ error: 'Path is a directory, not a file' }, 400);
    }

    // Guard against reading very large files (>10MB)
    if (stat.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File too large (>10MB)' }, 413);
    }

    const content = readFileSync(target, 'utf-8');
    return c.json({ content, mtime: stat.mtimeMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to read file: ${msg}` }, 500);
  }
});

/** PUT /worktrees/:id/file — Write file content */
worktreeFileRoutes.put('/worktrees/:id/file', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ path: string; content: string }>();

  if (!body.path || body.content === undefined) {
    return c.json({ error: 'path and content are required' }, 400);
  }

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const target = safePath(root, body.path);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  try {
    // Ensure parent directory exists
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, body.content, 'utf-8');

    const stat = statSync(target);
    return c.json({ ok: true, mtime: stat.mtimeMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to write file: ${msg}` }, 500);
  }
});

/** DELETE /worktrees/:id/file — Delete a file or directory */
worktreeFileRoutes.delete('/worktrees/:id/file', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path');

  if (!relativePath) return c.json({ error: 'path query parameter is required' }, 400);

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const target = safePath(root, relativePath);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  // Prevent deleting the worktree root itself
  if (target === root) {
    return c.json({ error: 'Cannot delete worktree root' }, 403);
  }

  if (!existsSync(target)) {
    return c.json({ error: 'Path not found' }, 404);
  }

  try {
    rmSync(target, { recursive: true, force: true });
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to delete: ${msg}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// Generic file read (for plans, configs, etc. outside worktrees)
// ---------------------------------------------------------------------------

/** Allowed directories for generic file reads */
const ALLOWED_READ_PREFIXES = [
  join(homedir(), '.claude', 'plans'),
  join(homedir(), '.phantom-os'),
];

/** GET /file-read?path=<absolute_path> — Read a file from allowed directories */
worktreeFileRoutes.get('/file-read', (c) => {
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path query parameter is required' }, 400);

  const normalized = normalize(filePath);
  const allowed = ALLOWED_READ_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) return c.json({ error: 'Path not in allowed directories' }, 403);

  if (!existsSync(normalized)) return c.json({ error: 'File not found' }, 404);

  try {
    const fileStat = statSync(normalized);
    if (fileStat.isDirectory()) return c.json({ error: 'Path is a directory' }, 400);
    if (fileStat.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (>10MB)' }, 413);

    const content = readFileSync(normalized, 'utf-8');
    return c.json({ content, mtime: fileStat.mtimeMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to read file: ${msg}` }, 500);
  }
});

/** PUT /file-write?path=<absolute_path> — Write a file in allowed directories */
worktreeFileRoutes.put('/file-write', async (c) => {
  const body = await c.req.json<{ path: string; content: string }>();
  if (!body.path || body.content === undefined) return c.json({ error: 'path and content required' }, 400);

  const normalized = normalize(body.path);
  const allowed = ALLOWED_READ_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) return c.json({ error: 'Path not in allowed directories' }, 403);

  try {
    writeFileSync(normalized, body.content, 'utf-8');
    const fileStat = statSync(normalized);
    return c.json({ ok: true, mtime: fileStat.mtimeMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to write file: ${msg}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// Git Status
// ---------------------------------------------------------------------------

interface GitFileChange {
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  path: string;
  /** Short status code from git (e.g. 'M', 'A', 'D', '??') */
  code: string;
  staged: boolean;
}

interface GitStatusResult {
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  ahead: number;
  behind: number;
  files: GitFileChange[];
}

/** Parse git status --porcelain=v1 output (XY format: X=index/staged, Y=worktree/unstaged) */
function parseGitStatus(output: string): GitStatusResult {
  const files: GitFileChange[] = [];
  let added = 0, modified = 0, deleted = 0, untracked = 0;

  const mapCode = (ch: string): GitFileChange['status'] | null => {
    switch (ch) {
      case 'M': return 'modified';
      case 'A': return 'added';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      default: return null;
    }
  };

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const x = line[0]; // index (staged)
    const y = line[1]; // worktree (unstaged)
    const path = line.slice(3);

    if (x === '?' && y === '?') {
      files.push({ status: 'untracked', path, code: '??', staged: false });
      untracked++;
      continue;
    }

    // Staged change (index column)
    const stagedStatus = mapCode(x);
    if (stagedStatus) {
      files.push({ status: stagedStatus, path, code: x, staged: true });
      if (stagedStatus === 'added') added++;
      else if (stagedStatus === 'deleted') deleted++;
      else modified++;
    }

    // Unstaged change (worktree column)
    const unstagedStatus = mapCode(y);
    if (unstagedStatus) {
      files.push({ status: unstagedStatus, path, code: y, staged: false });
      if (unstagedStatus === 'added') added++;
      else if (unstagedStatus === 'deleted') deleted++;
      else modified++;
    }
  }

  return { added, modified, deleted, untracked, ahead: 0, behind: 0, files };
}

/** GET /worktrees/:id/git-status — Get git status summary for a worktree */
worktreeFileRoutes.get('/worktrees/:id/git-status', (c) => {
  const id = c.req.param('id');
  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  try {
    const output = execSync('git status -b --porcelain', {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    const result = parseGitStatus(output);

    // Parse ahead/behind from the branch line (## branch...origin/branch [ahead N, behind M])
    const branchLine = output.split('\n')[0] ?? '';
    const aheadMatch = branchLine.match(/ahead (\d+)/);
    const behindMatch = branchLine.match(/behind (\d+)/);
    if (aheadMatch) result.ahead = parseInt(aheadMatch[1], 10);
    if (behindMatch) result.behind = parseInt(behindMatch[1], 10);

    return c.json(result);
  } catch {
    return c.json({ added: 0, modified: 0, deleted: 0, untracked: 0, ahead: 0, behind: 0, files: [] });
  }
});

/** GET /worktrees/:id/git-diff — Get HEAD vs working copy for a file */
worktreeFileRoutes.get('/worktrees/:id/git-diff', (c) => {
  const id = c.req.param('id');
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path query parameter is required' }, 400);

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  let original = '';
  let modified = '';

  // Get HEAD version
  try {
    original = execSync(`git show HEAD:${filePath}`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
  } catch {
    // File is new (not in HEAD) — original stays empty
  }

  // Get working copy
  const target = safePath(root, filePath);
  if (target && existsSync(target)) {
    try {
      const fileStat = statSync(target);
      if (!fileStat.isDirectory() && fileStat.size < 10 * 1024 * 1024) {
        modified = readFileSync(target, 'utf-8');
      }
    } catch { /* ignore */ }
  }

  return c.json({ original, modified });
});

/** POST /worktrees/:id/mkdir — Create a directory */
worktreeFileRoutes.post('/worktrees/:id/mkdir', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ path: string }>();

  if (!body.path) {
    return c.json({ error: 'path is required' }, 400);
  }

  const root = getWorktreeRoot(id);
  if (!root) return c.json({ error: 'Worktree not found' }, 404);

  const target = safePath(root, body.path);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  try {
    mkdirSync(target, { recursive: true });
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to create directory: ${msg}` }, 500);
  }
});
