/**
 * PhantomOS Worktree Routes
 * @author Subash Karki
 */
import { exec, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees } from '@phantom-os/db';
import {
  createWorktree,
  removeWorktree,
  getWorktreeDir,
  checkoutBranch,
  createAndCheckoutBranch,
  hasUncommittedChanges,
} from '../worktree-manager.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Broadcast injection (set once from index.ts at boot)
// ---------------------------------------------------------------------------

type Broadcast = (event: string, data: unknown) => void;
let broadcastFn: Broadcast = () => {};
export const initWorktreeBroadcast = (broadcast: Broadcast): void => { broadcastFn = broadcast; };

/** Run dependency installation in background based on project profile */
const autoSetup = (
  worktreePath: string,
  profile: { buildSystem: string; type: string },
  worktreeId: string,
  broadcast: Broadcast,
): void => {
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
  broadcast('worktree:setup-start', { worktreeId, command: cmd });

  exec(cmd, { cwd: worktreePath, timeout: 120_000 }, (err) => {
    if (err) {
      logger.warn('Worktrees', `Auto-setup failed: ${err.message}`);
      broadcast('worktree:setup-done', { worktreeId, success: false, error: err.message });
    } else {
      logger.info('Worktrees', `Auto-setup complete in ${worktreePath}`);
      broadcast('worktree:setup-done', { worktreeId, success: true });
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

  const worktree = {
    id: randomUUID(),
    projectId,
    type: 'worktree' as const,
    name,
    branch,
    baseBranch: body.baseBranch ?? project.defaultBranch ?? null,
    worktreePath,
    portBase: null,
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
      autoSetup(worktree.worktreePath, profile, worktree.id, broadcastFn);
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

/** POST /worktrees/:id/checkout — Switch branch on a branch-type worktree */
worktreeRoutes.post('/worktrees/:id/checkout', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ branch: string }>();

  const worktree = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  if (!worktree) return c.json({ error: 'Worktree not found' }, 404);

  if (worktree.type !== 'branch') {
    return c.json({ error: 'Checkout is only supported for branch-type worktrees' }, 400);
  }

  if (!body.branch?.trim()) {
    return c.json({ error: 'branch is required' }, 400);
  }

  const repoPath = worktree.worktreePath;
  if (!repoPath || !existsSync(repoPath)) {
    return c.json({ error: 'Worktree path does not exist' }, 400);
  }

  // Check for uncommitted changes
  const status = hasUncommittedChanges(repoPath);
  if (status.dirty) {
    return c.json({ error: 'Uncommitted changes', dirty: true, changes: status.changes }, 409);
  }

  // Attempt checkout
  try {
    checkoutBranch(repoPath, body.branch);
  } catch {
    // Branch may not exist locally but may exist on remote — try tracking checkout
    try {
      createAndCheckoutBranch(repoPath, body.branch, `origin/${body.branch}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: `Failed to checkout branch: ${msg}` }, 500);
    }
  }

  // Update DB record
  db.update(worktrees).set({ branch: body.branch }).where(eq(worktrees.id, id)).run();

  const updated = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  return c.json(updated);
});

/** POST /worktrees/:id/create-branch — Create and switch to a new branch */
worktreeRoutes.post('/worktrees/:id/create-branch', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ branch: string; baseBranch?: string }>();

  const worktree = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  if (!worktree) return c.json({ error: 'Worktree not found' }, 404);

  if (worktree.type !== 'branch') {
    return c.json({ error: 'Create-branch is only supported for branch-type worktrees' }, 400);
  }

  if (!body.branch?.trim()) {
    return c.json({ error: 'branch is required' }, 400);
  }

  const repoPath = worktree.worktreePath;
  if (!repoPath || !existsSync(repoPath)) {
    return c.json({ error: 'Worktree path does not exist' }, 400);
  }

  try {
    createAndCheckoutBranch(repoPath, body.branch, body.baseBranch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to create branch: ${msg}` }, 500);
  }

  // Update DB record
  db.update(worktrees).set({ branch: body.branch }).where(eq(worktrees.id, id)).run();

  const updated = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  return c.json(updated);
});

/** POST /worktrees/:id/git — Run a git action */
worktreeRoutes.post('/worktrees/:id/git', async (c) => {
  const id = c.req.param('id');
  const worktree = db.select().from(worktrees).where(eq(worktrees.id, id)).get();
  if (!worktree) return c.json({ error: 'Worktree not found' }, 404);

  const repoPath = worktree.worktreePath;
  if (!repoPath || !existsSync(repoPath)) {
    return c.json({ error: 'Worktree path does not exist' }, 400);
  }

  const body = await c.req.json<{
    action: string;
    paths?: string[];
    message?: string;
  }>();
  const { action } = body;

  const allowed = ['fetch', 'pull', 'push', 'stage', 'unstage', 'stage-all', 'commit', 'discard', 'clean'];
  if (!allowed.includes(action)) {
    return c.json({ error: `Invalid action: ${action}. Allowed: ${allowed.join(', ')}` }, 400);
  }

  try {
    let cmd: string;
    switch (action) {
      case 'fetch':
        cmd = 'git fetch origin';
        break;
      case 'stage': {
        if (!body.paths?.length) return c.json({ error: 'paths required for stage' }, 400);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git add -- ${safePaths}`;
        break;
      }
      case 'unstage': {
        if (!body.paths?.length) return c.json({ error: 'paths required for unstage' }, 400);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git reset HEAD -- ${safePaths}`;
        break;
      }
      case 'stage-all':
        cmd = 'git add -A';
        break;
      case 'commit': {
        if (!body.message?.trim()) return c.json({ error: 'message required for commit' }, 400);
        const safeMsg = body.message.replace(/"/g, '\\"');
        cmd = `git commit -m "${safeMsg}"`;
        break;
      }
      case 'discard': {
        if (!body.paths?.length) return c.json({ error: 'paths required for discard' }, 400);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git checkout -- ${safePaths}`;
        break;
      }
      case 'clean': {
        if (!body.paths?.length) return c.json({ error: 'paths required for clean' }, 400);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git clean -f -- ${safePaths}`;
        break;
      }
      default:
        cmd = `git ${action}`;
    }

    execSync(cmd, { cwd: repoPath, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    return c.json({ ok: true, action });
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.()?.trim() || '';
    const msg = stderr || (err instanceof Error ? err.message : 'Unknown error');
    return c.json({ error: `git ${action} failed: ${msg}` }, 500);
  }
});
