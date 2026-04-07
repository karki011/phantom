/**
 * PhantomOS Project Routes
 * @author Subash Karki
 */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, workspaces, workspaceSections } from '@phantom-os/db';
import { isGitRepo, getDefaultBranch, getRepoName, getWorktreeDir } from '../workspace-manager.js';
import { removeWorktree } from '../workspace-manager.js';

export const projectRoutes = new Hono();

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
