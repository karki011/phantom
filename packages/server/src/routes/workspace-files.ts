/**
 * PhantomOS Workspace File Explorer Routes
 * @author Subash Karki
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, workspaces } from '@phantom-os/db';

export const workspaceFileRoutes = new Hono();

// ---------------------------------------------------------------------------
// Path Sandboxing
// ---------------------------------------------------------------------------

/** Resolve and validate a path is within the workspace root. Returns null if invalid. */
const safePath = (workspaceRoot: string, relativePath: string): string | null => {
  // Strip leading slash — resolve('/path', '/') returns '/' not '/path/'
  const cleaned = relativePath.replace(/^\/+/, '') || '.';
  const resolved = resolve(workspaceRoot, cleaned);
  // CRITICAL: Prevent path traversal — resolved path must start with workspace root
  if (!resolved.startsWith(workspaceRoot)) {
    return null;
  }
  return resolved;
};

/** Get workspace root path or return 404 */
const getWorkspaceRoot = (id: string): string | null => {
  const workspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  if (!workspace?.worktreePath) return null;
  return workspace.worktreePath;
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /workspaces/:id/files — List directory contents */
workspaceFileRoutes.get('/workspaces/:id/files', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path') || '/';

  const root = getWorkspaceRoot(id);
  if (!root) return c.json({ error: 'Workspace not found' }, 404);

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

    return c.json(items);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to list directory: ${msg}` }, 500);
  }
});

/** GET /workspaces/:id/file — Read file content */
workspaceFileRoutes.get('/workspaces/:id/file', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path');

  if (!relativePath) return c.json({ error: 'path query parameter is required' }, 400);

  const root = getWorkspaceRoot(id);
  if (!root) return c.json({ error: 'Workspace not found' }, 404);

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

/** PUT /workspaces/:id/file — Write file content */
workspaceFileRoutes.put('/workspaces/:id/file', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ path: string; content: string }>();

  if (!body.path || body.content === undefined) {
    return c.json({ error: 'path and content are required' }, 400);
  }

  const root = getWorkspaceRoot(id);
  if (!root) return c.json({ error: 'Workspace not found' }, 404);

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

/** DELETE /workspaces/:id/file — Delete a file or directory */
workspaceFileRoutes.delete('/workspaces/:id/file', (c) => {
  const id = c.req.param('id');
  const relativePath = c.req.query('path');

  if (!relativePath) return c.json({ error: 'path query parameter is required' }, 400);

  const root = getWorkspaceRoot(id);
  if (!root) return c.json({ error: 'Workspace not found' }, 404);

  const target = safePath(root, relativePath);
  if (!target) return c.json({ error: 'Invalid path' }, 403);

  // Prevent deleting the workspace root itself
  if (target === root) {
    return c.json({ error: 'Cannot delete workspace root' }, 403);
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

/** POST /workspaces/:id/mkdir — Create a directory */
workspaceFileRoutes.post('/workspaces/:id/mkdir', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ path: string }>();

  if (!body.path) {
    return c.json({ error: 'path is required' }, 400);
  }

  const root = getWorkspaceRoot(id);
  if (!root) return c.json({ error: 'Workspace not found' }, 404);

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
