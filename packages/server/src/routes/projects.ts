/**
 * PhantomOS Project Routes
 * @author Subash Karki
 */
import { randomUUID } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { desc, eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees, worktreeSections } from '@phantom-os/db';
import { isGitRepo, getDefaultBranch, getRepoName, getWorktreeDir, listWorktrees, cloneRepo } from '../worktree-manager.js';
import { removeWorktree } from '../worktree-manager.js';
import { detectProject } from '../project-detector.js';
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

/** POST /projects/open — Open (or create) a project + default worktree in one call */
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

  // If project already exists, return it with its first worktree
  const existing = db
    .select()
    .from(projects)
    .where(eq(projects.repoPath, repoPath))
    .get();

  if (existing) {
    // Fetch latest from remote in background so branch list stays current
    backgroundFetch(repoPath);

    // Ensure a branch-type worktree entry exists for the existing project
    const existingBranch = db
      .select()
      .from(worktrees)
      .where(and(eq(worktrees.projectId, existing.id), eq(worktrees.type, 'branch')))
      .get();

    if (!existingBranch) {
      const currentBranch = existing.defaultBranch ?? 'main';
      const branchEntry = {
        id: randomUUID(),
        projectId: existing.id,
        type: 'branch' as const,
        name: 'Local',
        branch: currentBranch,
        worktreePath: repoPath,
        portBase: null,
        sectionId: null,
        baseBranch: null,
        tabOrder: 0,
        isActive: 1,
        createdAt: Date.now(),
      };
      db.insert(worktrees).values(branchEntry).run();

      return c.json({ project: existing, worktree: branchEntry });
    }

    const firstWorktree = db
      .select()
      .from(worktrees)
      .where(eq(worktrees.projectId, existing.id))
      .get();

    return c.json({ project: existing, worktree: firstWorktree ?? null });
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

  // Auto-detect project profile
  const profile = detectProject(repoPath);
  db.update(projects).set({ profile: JSON.stringify(profile) }).where(eq(projects.id, project.id)).run();

  // Create a branch-type worktree entry for the repo's current branch
  const branchEntry = {
    id: randomUUID(),
    projectId: project.id,
    type: 'branch' as const,
    name: 'Local',
    branch: defaultBranch,
    worktreePath: repoPath,
    portBase: null,
    sectionId: null,
    baseBranch: null,
    tabOrder: 0,
    isActive: 1,
    createdAt: Date.now(),
  };
  db.insert(worktrees).values(branchEntry).run();

  return c.json({ project, worktree: branchEntry }, 201);
});

/** POST /projects/clone — Clone a repo and create project + branch worktree */
projectRoutes.post('/projects/clone', async (c) => {
  const body = await c.req.json<{ url: string; targetDir?: string }>();
  const { url } = body;

  if (!url?.trim()) {
    return c.json({ error: 'url is required' }, 400);
  }

  // Only support HTTPS and SSH URLs
  const cloneUrl = url.trim();
  if (!cloneUrl.startsWith('https://') && !cloneUrl.startsWith('git@')) {
    return c.json({ error: 'Only HTTPS (https://...) and SSH (git@...) URLs are supported' }, 400);
  }

  // Derive repo name from URL: strip .git suffix, take last path segment
  const repoName = cloneUrl.replace(/\.git$/, '').split('/').pop() ?? 'repo';

  // If user provides a directory, append repo name as subdirectory.
  // git clone creates the subdirectory — we just need the final path for validation.
  const baseDir = body.targetDir || `${homedir()}/Projects`;
  const targetDir = join(baseDir, repoName);

  // If target already exists, try to open it as a project instead of failing
  if (existsSync(targetDir)) {
    if (isGitRepo(targetDir)) {
      // Already cloned — open as project and tell the client it wasn't re-cloned
      const existing = db.select().from(projects).where(eq(projects.repoPath, targetDir)).get();
      if (existing) {
        const firstWorktree = db.select().from(worktrees).where(eq(worktrees.projectId, existing.id)).get();
        return c.json({ project: existing, worktree: firstWorktree ?? null, clonePath: targetDir, alreadyExists: true });
      }
      // Exists on disk but not in DB — fall through to project creation below
    } else {
      return c.json({ error: `Folder already exists at ${targetDir} and is not a git repository` }, 400);
    }
  } else {
    // Clone the repository
    try {
      await cloneRepo(cloneUrl, targetDir);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ error: `Failed to clone: ${msg}` }, 500);
    }
  }

  // Reuse same project creation logic as POST /projects/open
  const name = getRepoName(targetDir);
  const defaultBranch = await getDefaultBranch(targetDir);

  const project = {
    id: randomUUID(),
    name,
    repoPath: targetDir,
    defaultBranch,
    worktreeBaseDir: getWorktreeDir(name, ''),
    color: null,
    createdAt: Date.now(),
  };

  db.insert(projects).values(project).run();

  // Auto-detect project profile
  const profile = detectProject(targetDir);
  db.update(projects).set({ profile: JSON.stringify(profile) }).where(eq(projects.id, project.id)).run();

  // Create a branch-type worktree entry for the repo's current branch
  const branchEntry = {
    id: randomUUID(),
    projectId: project.id,
    type: 'branch' as const,
    name: 'Local',
    branch: defaultBranch,
    worktreePath: targetDir,
    portBase: null,
    sectionId: null,
    baseBranch: null,
    tabOrder: 0,
    isActive: 1,
    createdAt: Date.now(),
  };
  db.insert(worktrees).values(branchEntry).run();

  // Fetch remote refs in background
  backgroundFetch(targetDir);

  return c.json({ project, worktree: branchEntry, clonePath: targetDir }, 201);
});

/** POST /projects/:id/detect — Re-detect project profile */
projectRoutes.post('/projects/:id/detect', (c) => {
  const id = c.req.param('id');
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const profile = detectProject(project.repoPath);
  db.update(projects).set({ profile: JSON.stringify(profile) }).where(eq(projects.id, id)).run();

  return c.json(profile);
});

/** GET /projects/:id/profile — Get cached or auto-detect project profile */
projectRoutes.get('/projects/:id/profile', (c) => {
  const id = c.req.param('id');
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (project.profile) {
    return c.json(JSON.parse(project.profile));
  }

  // Auto-detect if no profile cached
  const profile = detectProject(project.repoPath);
  db.update(projects).set({ profile: JSON.stringify(profile) }).where(eq(projects.id, id)).run();
  return c.json(profile);
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

/** GET /projects/:id/worktrees — Discover git worktrees not tracked in the DB */
projectRoutes.get('/projects/:id/worktrees', async (c) => {
  const id = c.req.param('id');
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // Get all git worktrees for this repo
  const allWorktrees = await listWorktrees(project.repoPath);

  // Get all DB worktrees for this project (tracked worktree paths)
  const trackedPaths = new Set(
    db.select({ worktreePath: worktrees.worktreePath })
      .from(worktrees)
      .where(eq(worktrees.projectId, id))
      .all()
      .map((r) => r.worktreePath)
      .filter(Boolean),
  );

  // Filter: only worktrees NOT in DB, NOT the main repo, and active within 7 days
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - SEVEN_DAYS_MS;

  const discovered = allWorktrees
    .filter((wt) => !wt.isBare && wt.path !== project.repoPath && !trackedPaths.has(wt.path))
    .map((wt) => {
      // Get last commit timestamp on this worktree's branch
      let lastCommitMs = 0;
      try {
        const ts = execSync('git log -1 --format=%ct', {
          cwd: wt.path, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 2000,
        }).trim();
        lastCommitMs = parseInt(ts, 10) * 1000;
      } catch { /* treat as stale if we can't read */ }

      return {
        path: wt.path,
        branch: wt.branch ?? 'unknown',
        commit: wt.commit ?? '',
        lastCommitMs,
      };
    })
    .filter((wt) => wt.lastCommitMs > cutoff);

  return c.json(discovered);
});

/** POST /projects/:id/worktrees/import — Import a discovered worktree into the DB */
projectRoutes.post('/projects/:id/worktrees/import', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ path: string; name?: string }>();

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  if (!body.path || !existsSync(body.path)) {
    return c.json({ error: 'Worktree path does not exist' }, 400);
  }

  // Check not already tracked
  const existingWt = db.select().from(worktrees)
    .where(eq(worktrees.worktreePath, body.path))
    .get();
  if (existingWt) {
    return c.json({ error: 'Worktree already imported' }, 409);
  }

  // Extract branch name from the worktree
  let branch = 'unknown';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: body.path,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { /* use 'unknown' */ }

  // Detect base branch — use git log to find nearest branch point (fast, single command)
  let baseBranch = project.defaultBranch ?? 'main';
  try {
    // Find the most recent commit reachable from HEAD that's also on another branch
    const result = execSync(
      `git log --decorate=short --simplify-by-decoration --oneline --first-parent -20 "${branch}"`,
      { cwd: body.path, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 },
    ).trim();
    // Parse decorated refs — look for branch names other than our own
    for (const line of result.split('\n')) {
      const refMatch = line.match(/\(([^)]+)\)/);
      if (!refMatch) continue;
      const refs = refMatch[1].split(',').map((r) => r.trim()
        .replace(/^HEAD -> /, '')
        .replace(/^origin\//, ''));
      const otherBranch = refs.find((r) => r !== branch && r !== 'HEAD' && !r.startsWith('tag:'));
      if (otherBranch) {
        baseBranch = otherBranch;
        break;
      }
    }
  } catch { /* fall back to project default */ }

  const name = body.name || branch;

  const worktree = {
    id: randomUUID(),
    projectId: id,
    type: 'worktree' as const,
    name,
    branch,
    baseBranch,
    worktreePath: body.path,
    portBase: null,
    sectionId: null,
    tabOrder: 0,
    isActive: 1,
    createdAt: Date.now(),
  };

  db.insert(worktrees).values(worktree).run();

  return c.json(worktree, 201);
});

/** DELETE /projects/:id — Delete project and cascade worktrees */
projectRoutes.delete('/projects/:id', async (c) => {
  const id = c.req.param('id');

  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Remove all git worktrees for this project
  const projectWorktrees = db
    .select()
    .from(worktrees)
    .where(eq(worktrees.projectId, id))
    .all();

  for (const wt of projectWorktrees) {
    if (wt.worktreePath) {
      await removeWorktree(wt.worktreePath);
    }
  }

  // Cascade delete: worktrees, sections, then project
  db.delete(worktrees).where(eq(worktrees.projectId, id)).run();
  db.delete(worktreeSections).where(eq(worktreeSections.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();

  return c.json({ ok: true });
});
