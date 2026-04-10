/**
 * PhantomOS Worktree Routes
 * @author Subash Karki
 */
import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees } from '@phantom-os/db';
import {
  createWorktree,
  removeWorktree,
  getWorktreeDir,
} from '../worktree-manager.js';
import { logger } from '../logger.js';

/** Run dependency installation in background based on project profile */
const autoSetup = (worktreePath: string, profile: { buildSystem: string; type: string }): void => {
  let cmd: string | null = null;

  switch (profile.buildSystem) {
    case 'pnpm':
    case 'nx+pnpm':
    case 'turbo+pnpm':
      cmd = 'pnpm install --frozen-lockfile';
      break;
    case 'bun':
    case 'nx+bun':
    case 'turbo+bun':
      cmd = 'bun install --frozen-lockfile';
      break;
    case 'npm':
    case 'nx+npm':
    case 'turbo+npm':
      cmd = 'npm ci';
      break;
    case 'cargo':
      cmd = 'cargo fetch';
      break;
    case 'go':
      cmd = 'go mod download';
      break;
    case 'pyproject':
      cmd = 'pip install -e ".[dev]" 2>/dev/null || pip install -e .';
      break;
    default:
      break;
  }

  if (!cmd) return;

  logger.info('Worktrees', `Auto-setup: running "${cmd}" in ${worktreePath}`);

  exec(cmd, { cwd: worktreePath, timeout: 120_000 }, (err) => {
    if (err) {
      logger.warn('Worktrees', `Auto-setup failed in ${worktreePath}: ${err.message}`);
    } else {
      logger.info('Worktrees', `Auto-setup complete in ${worktreePath}`);
    }
  });
};

export const worktreeRoutes = new Hono();

/** Generate a branch name from worktree name */
const toBranchName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** GET /worktrees — List all worktrees (optional ?projectId filter) */
worktreeRoutes.get('/worktrees', (c) => {
  const projectId = c.req.query('projectId');

  let query = db.select().from(worktrees).orderBy(desc(worktrees.createdAt));

  if (projectId) {
    query = query.where(eq(worktrees.projectId, projectId)) as typeof query;
  }

  const results = query.all().map((wt) => ({
    ...wt,
    worktreeValid: wt.worktreePath ? existsSync(wt.worktreePath) : false,
  }));
  return c.json(results);
});

/** POST /worktrees — Create a new worktree with git worktree */
worktreeRoutes.post('/worktrees', async (c) => {
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
  const name = body.name || `worktree-${Date.now()}`;
  const branch = body.branch || toBranchName(name);
  const worktreePath = getWorktreeDir(project.name, branch);

  // Create git worktree
  try {
    await createWorktree(project.repoPath, branch, worktreePath, body.baseBranch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to create worktree: ${msg}` }, 500);
  }

  // Port allocation: pick next available from Auth0-allowed pool
  const PORT_POOL = [8080, 8081, 8082];
  const usedPorts = new Set(
    db.select({ portBase: worktrees.portBase })
      .from(worktrees)
      .all()
      .map((r) => r.portBase)
      .filter((p): p is number => p !== null),
  );
  const portBase = PORT_POOL.find((p) => !usedPorts.has(p)) ?? null;

  const worktree = {
    id: randomUUID(),
    projectId,
    type: 'worktree' as const,
    name,
    branch,
    baseBranch: body.baseBranch ?? project.defaultBranch ?? null,
    worktreePath,
    portBase,
    sectionId: null,
    tabOrder: 0,
    isActive: 1,
    createdAt: Date.now(),
  };

  db.insert(worktrees).values(worktree).run();

  // Auto-setup: install dependencies in background
  if (project.profile) {
    try {
      const profile = JSON.parse(project.profile);
      autoSetup(worktree.worktreePath, profile);
    } catch { /* ignore parse errors */ }
  }

  return c.json(worktree, 201);
});

/** DELETE /worktrees/:id — Remove worktree and its git worktree */
worktreeRoutes.delete('/worktrees/:id', async (c) => {
  const id = c.req.param('id');

  const worktree = db
    .select()
    .from(worktrees)
    .where(eq(worktrees.id, id))
    .get();

  if (!worktree) {
    return c.json({ error: 'Worktree not found' }, 404);
  }

  // Remove git worktree if it exists
  if (worktree.worktreePath) {
    await removeWorktree(worktree.worktreePath);
  }

  db.delete(worktrees).where(eq(worktrees.id, id)).run();

  return c.json({ ok: true });
});

/** PATCH /worktrees/:id — Update worktree fields */
worktreeRoutes.patch('/worktrees/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    sectionId?: string | null;
    tabOrder?: number;
    isActive?: number;
  }>();

  const worktree = db
    .select()
    .from(worktrees)
    .where(eq(worktrees.id, id))
    .get();

  if (!worktree) {
    return c.json({ error: 'Worktree not found' }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId;
  if (body.tabOrder !== undefined) updates.tabOrder = body.tabOrder;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  db.update(worktrees).set(updates).where(eq(worktrees.id, id)).run();

  // Return updated record
  const updated = db
    .select()
    .from(worktrees)
    .where(eq(worktrees.id, id))
    .get();

  return c.json(updated);
});

/** POST /worktrees/:id/assign-port — Backfill portBase for existing worktrees */
worktreeRoutes.post('/worktrees/:id/assign-port', (c) => {
  const id = c.req.param('id');
  const worktree = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  if (!worktree) return c.json({ error: 'Worktree not found' }, 404);
  if (worktree.portBase !== null) return c.json({ portBase: worktree.portBase });

  const PORT_POOL = [8080, 8081, 8082];
  const usedPorts = new Set(
    db.select({ portBase: worktrees.portBase })
      .from(worktrees)
      .all()
      .map((r) => r.portBase)
      .filter((p): p is number => p !== null),
  );
  const portBase = PORT_POOL.find((p) => !usedPorts.has(p)) ?? null;
  db.update(worktrees).set({ portBase }).where(eq(worktrees.id, id)).run();
  return c.json({ portBase });
});
