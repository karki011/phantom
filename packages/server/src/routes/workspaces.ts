/**
 * PhantomOS Workspace Routes
 * @author Subash Karki
 */
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, workspaces } from '@phantom-os/db';
import {
  createWorktree,
  removeWorktree,
  getWorktreeDir,
} from '../workspace-manager.js';

export const workspaceRoutes = new Hono();

/** Generate a branch name from workspace name */
const toBranchName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** GET /workspaces — List all workspaces (optional ?projectId filter) */
workspaceRoutes.get('/workspaces', (c) => {
  const projectId = c.req.query('projectId');

  let query = db.select().from(workspaces).orderBy(desc(workspaces.createdAt));

  if (projectId) {
    query = query.where(eq(workspaces.projectId, projectId)) as typeof query;
  }

  return c.json(query.all());
});

/** POST /workspaces — Create a new workspace with git worktree */
workspaceRoutes.post('/workspaces', async (c) => {
  const body = await c.req.json<{
    projectId: string;
    name?: string;
    branch?: string;
    baseBranch?: string;
  }>();

  const { projectId } = body;
  if (!projectId) {
    return c.json({ error: 'projectId is required' }, 400);
  }

  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Derive name and branch
  const name = body.name || `workspace-${Date.now()}`;
  const branch = body.branch || toBranchName(name);
  const worktreePath = getWorktreeDir(project.name, branch);

  // Create git worktree
  try {
    await createWorktree(project.repoPath, branch, worktreePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to create worktree: ${msg}` }, 500);
  }

  const workspace = {
    id: randomUUID(),
    projectId,
    type: 'worktree' as const,
    name,
    branch,
    worktreePath,
    portBase: null,
    sectionId: null,
    tabOrder: 0,
    isActive: 1,
    createdAt: Date.now(),
  };

  db.insert(workspaces).values(workspace).run();

  return c.json(workspace, 201);
});

/** DELETE /workspaces/:id — Remove workspace and its git worktree */
workspaceRoutes.delete('/workspaces/:id', async (c) => {
  const id = c.req.param('id');

  const workspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  if (!workspace) {
    return c.json({ error: 'Workspace not found' }, 404);
  }

  // Remove git worktree if it exists
  if (workspace.worktreePath) {
    await removeWorktree(workspace.worktreePath);
  }

  db.delete(workspaces).where(eq(workspaces.id, id)).run();

  return c.json({ ok: true });
});

/** PATCH /workspaces/:id — Update workspace fields */
workspaceRoutes.patch('/workspaces/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    sectionId?: string | null;
    tabOrder?: number;
    isActive?: number;
  }>();

  const workspace = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  if (!workspace) {
    return c.json({ error: 'Workspace not found' }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId;
  if (body.tabOrder !== undefined) updates.tabOrder = body.tabOrder;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  db.update(workspaces).set(updates).where(eq(workspaces.id, id)).run();

  // Return updated record
  const updated = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .get();

  return c.json(updated);
});
