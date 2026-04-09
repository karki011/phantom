/**
 * PhantomOS Project Routes
 * @author Subash Karki
 */
import { randomUUID } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, workspaces, workspaceSections } from '@phantom-os/db';
import { isGitRepo, getDefaultBranch, getRepoName, getWorktreeDir } from '../workspace-manager.js';
import { removeWorktree } from '../workspace-manager.js';
import { logger } from '../logger.js';

export const projectRoutes = new Hono();

/** Non-blocking git fetch — runs in background, doesn't block the response */
const backgroundFetch = (repoPath: string): void => {
  exec('git fetch origin', { cwd: repoPath, timeout: 15_000 }, (err) => {
    if (err) logger.debug('Projects', `fetch failed for ${repoPath}: ${err.message}`);
    else logger.debug('Projects', `fetched ${repoPath}`);
  });
};

/** GET /projects — List all projects */
projectRoutes.get('/projects', (c) => {
  const rows = db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .all();

  return c.json(rows);
});

/** POST /projects — Create a new project from a repo path */
projectRoutes.post('/projects', async (c) => {
  const body = await c.req.json<{ repoPath: string; name?: string }>();
  const { repoPath } = body;

  if (!repoPath) {
    return c.json({ error: 'repoPath is required' }, 400);
  }

  if (!existsSync(repoPath)) {
    return c.json({ error: 'Path does not exist' }, 400);
  }

  if (!isGitRepo(repoPath)) {
    return c.json({ error: 'Path is not a git repository' }, 400);
  }

  // Check for duplicate repo path
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.repoPath, repoPath))
    .get();

  if (existing) {
    return c.json({ error: 'Project already exists for this repository' }, 409);
  }

  const name = body.name || getRepoName(repoPath);
  const defaultBranch = await getDefaultBranch(repoPath);

  const project = {
    id: randomUUID(),
    name,
    repoPath,
    defaultBranch,
    worktreeBaseDir: getWorktreeDir(name, ''),
    color: null,
    createdAt: Date.now(),
  };

  db.insert(projects).values(project).run();

  return c.json(project, 201);
});

/** POST /projects/open — Open (or create) a project + default workspace in one call */
projectRoutes.post('/projects/open', async (c) => {
  const body = await c.req.json<{ repoPath: string }>();
  const { repoPath } = body;

  if (!repoPath) {
    return c.json({ error: 'repoPath is required' }, 400);
  }

  if (!existsSync(repoPath)) {
    return c.json({ error: 'Path does not exist' }, 400);
  }

  if (!isGitRepo(repoPath)) {
    return c.json({ error: 'Path is not a git repository' }, 400);
  }

  // If project already exists, return it with its first workspace
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.repoPath, repoPath))
    .get();

  if (existing) {
    // Fetch latest from remote in background so branch list stays current
    backgroundFetch(repoPath);

    const firstWorkspace = db
      .select()
      .from(workspaces)
      .where(eq(workspaces.projectId, existing.id))
      .get();

    return c.json({ project: existing, workspace: firstWorkspace ?? null });
  }

  // Fetch remote refs before reading branches
  backgroundFetch(repoPath);

  // Auto-detect project name from directory basename
  const name = getRepoName(repoPath);
  const defaultBranch = await getDefaultBranch(repoPath);

  const project = {
    id: randomUUID(),
    name,
    repoPath,
    defaultBranch,
    worktreeBaseDir: getWorktreeDir(name, ''),
    color: null,
    createdAt: Date.now(),
  };

  db.insert(projects).values(project).run();

  return c.json({ project, workspace: null }, 201);
});

/** PATCH /projects/:id — Rename a project */
projectRoutes.patch('/projects/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string }>();

  if (!body.name?.trim()) {
    return c.json({ error: 'name is required' }, 400);
  }

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  db.update(projects)
    .set({ name: body.name.trim() })
    .where(eq(projects.id, id))
    .run();

  const updated = db.select().from(projects).where(eq(projects.id, id)).get();
  return c.json(updated);
});

/** GET /projects/:id/branches — List local + remote branches for a project's repo */
projectRoutes.get('/projects/:id/branches', (c) => {
  const id = c.req.param('id');

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  if (!existsSync(project.repoPath)) {
    return c.json({ error: 'Repository path does not exist' }, 400);
  }

  // Sync fetch so branch list includes latest remote refs
  try { execSync('git fetch origin', { cwd: project.repoPath, timeout: 10_000, stdio: 'ignore' }); } catch { /* offline is fine */ }

  try {
    const output = execSync('git branch -a --no-color', {
      cwd: project.repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const local: string[] = [];
    const remote: string[] = [];
    let current = '';

    for (const raw of output.split('\n')) {
      const line = raw.trim();
      if (!line) continue;

      const isCurrent = line.startsWith('* ');
      const name = line.replace(/^\*\s+/, '');

      if (name.startsWith('remotes/')) {
        // Skip HEAD pointer
        if (name.includes('/HEAD')) continue;
        // Strip remotes/origin/ prefix
        const short = name.replace(/^remotes\/origin\//, '');
        remote.push(short);
      } else {
        local.push(name);
        if (isCurrent) current = name;
      }
    }

    return c.json({ local, remote, current, defaultBranch: project.defaultBranch ?? 'main' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to list branches: ${msg}` }, 500);
  }
});

/** DELETE /projects/:id — Delete project and cascade workspaces */
projectRoutes.delete('/projects/:id', async (c) => {
  const id = c.req.param('id');

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Remove all worktrees for this project's workspaces
  const projectWorkspaces = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.projectId, id))
    .all();

  for (const ws of projectWorkspaces) {
    if (ws.worktreePath) {
      await removeWorktree(ws.worktreePath);
    }
  }

  // Cascade delete: workspaces, sections, then project
  db.delete(workspaces).where(eq(workspaces.projectId, id)).run();
  db.delete(workspaceSections).where(eq(workspaceSections.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();

  return c.json({ ok: true });
});
