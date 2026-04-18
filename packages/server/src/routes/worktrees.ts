/**
 * PhantomOS Worktree Routes
 * @author Subash Karki
 */
import { exec, execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees, paneStates, chatConversations, chatMessages, terminalSessions, userPreferences } from '@phantom-os/db';
import {
  createWorktree,
  removeWorktree,
  getWorktreeDir,
  checkoutBranch,
  createAndCheckoutBranch,
  hasUncommittedChanges,
} from '../worktree-manager.js';
import { destroyPty, getPtySession } from '../terminal-manager.js';
import { historyWriter } from '../terminal-history.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Broadcast injection (set once from index.ts at boot)
// ---------------------------------------------------------------------------

type Broadcast = (event: string, data: unknown) => void;
let broadcastFn: Broadcast = () => {};
export const initWorktreeBroadcast = (broadcast: Broadcast): void => { broadcastFn = broadcast; };

/** Track in-flight PR creations to prevent duplicates */
const prInFlight = new Set<string>();
/** Track in-flight commit message generation to prevent duplicates */
const commitMsgInFlight = new Set<string>();
const commitMsgChildren = new Map<string, ReturnType<typeof spawn>>();
const prChildProcesses = new Map<string, ReturnType<typeof exec>>();

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

/** Read the current branch for a worktree path (fast, no-throw) */
function getLiveBranch(wtPath: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: wtPath, encoding: 'utf-8', timeout: 3000, stdio: 'pipe',
    }).trim() || null;
  } catch {
    return null;
  }
}

/** GET /worktrees — List all worktrees (optional ?projectId filter) */
worktreeRoutes.get('/worktrees', (c) => {
  const projectId = c.req.query('projectId');

  let query = db.select().from(worktrees).orderBy(desc(worktrees.createdAt));

  if (projectId) {
    query = query.where(eq(worktrees.projectId, projectId)) as typeof query;
  }

  const results = query.all().map((wt) => {
    const valid = wt.worktreePath ? existsSync(wt.worktreePath) : false;
    let { branch } = wt;

    // For worktrees with a valid path, read the live branch from git
    // so external branch changes (terminal, IDE) are always reflected.
    if (valid && wt.worktreePath) {
      const live = getLiveBranch(wt.worktreePath);
      if (live && live !== branch) {
        branch = live;
        // Sync DB so subsequent reads are consistent
        db.update(worktrees).set({ branch: live }).where(eq(worktrees.id, wt.id)).run();
      }
    }

    return { ...wt, branch, worktreeValid: valid };
  });
  return c.json(results);
});

/** POST /worktrees — Create a new worktree with git worktree */
worktreeRoutes.post('/worktrees', async (c) => {
  const body = await c.req.json<{
    projectId: string;
    name?: string;
    branch?: string;
    baseBranch?: string;
    ticketUrl?: string;
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
    ticketUrl: body.ticketUrl ?? null,
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

/** DELETE /worktrees/:id — Remove worktree, cascade cleanup terminals + pane state */
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

  // 1. Kill PTY sessions associated with this worktree and purge from DB
  const killedPaneIds = historyWriter.purgeSessionsByWorktree(id);
  for (const paneId of killedPaneIds) {
    if (getPtySession(paneId)) {
      destroyPty(paneId);
    }
  }

  // 2. Delete saved pane layout for this worktree
  try {
    db.delete(paneStates).where(eq(paneStates.worktreeId, id)).run();
  } catch { /* ignore — table may not have rows */ }

  // 2b. Delete chat conversations + messages for this worktree
  try {
    const convs = db.select({ id: chatConversations.id }).from(chatConversations).where(eq(chatConversations.workspaceId, id)).all();
    for (const conv of convs) {
      db.delete(chatMessages).where(eq(chatMessages.conversationId, conv.id)).run();
    }
    db.delete(chatConversations).where(eq(chatConversations.workspaceId, id)).run();
  } catch { /* ignore */ }

  // 2c. Delete terminal session history for this worktree
  try {
    db.delete(terminalSessions).where(eq(terminalSessions.worktreeId, id)).run();
  } catch { /* ignore */ }

  // 3. Remove git worktree from disk
  if (worktree.worktreePath) {
    await removeWorktree(worktree.worktreePath);
  }

  // 4. Delete worktree record
  db.delete(worktrees).where(eq(worktrees.id, id)).run();

  // Return killed pane IDs so the client can dispose its terminal sessions
  return c.json({ ok: true, killedPaneIds });
});

/** PATCH /worktrees/:id — Update worktree fields */
worktreeRoutes.patch('/worktrees/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    sectionId?: string | null;
    tabOrder?: number;
    isActive?: number;
    ticketUrl?: string | null;
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
  if (body.ticketUrl !== undefined) updates.ticketUrl = body.ticketUrl;

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

  // Switch branch (git DWIM auto-creates tracking branch if only on remote)
  try {
    checkoutBranch(repoPath, body.branch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: `Failed to switch branch: ${msg}` }, 500);
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

/** Remove stale index.lock if a previous git process crashed */
function clearStaleLock(repoPath: string): void {
  // Resolve the actual git dir — works for both repos and worktrees
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      cwd: repoPath, encoding: 'utf-8', timeout: 3000, stdio: 'pipe',
    }).trim();
    const lockPath = join(
      gitDir.startsWith('/') ? gitDir : join(repoPath, gitDir),
      'index.lock',
    );
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch { /* ignore — worst case the real git command will report the lock */ }
}

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
    scoped?: boolean;
  }>();
  const { action } = body;

  const allowed = ['fetch', 'pull', 'push', 'stage', 'unstage', 'stage-all', 'commit', 'discard', 'discard-all', 'clean', 'undo-commit', 'stash', 'stash-pop', 'generate-commit-msg', 'cancel-commit-msg', 'create-pr', 'pr-status', 'ci-runs', 'recent-commits', 'get-branch'];
  if (!allowed.includes(action)) {
    return c.json({ error: `Invalid action: ${action}. Allowed: ${allowed.join(', ')}` }, 400);
  }

  try {
    let cmd: string;
    switch (action) {
      case 'fetch':
        cmd = 'git fetch origin --prune';
        break;
      case 'stage': {
        if (!body.paths?.length) return c.json({ error: 'paths required for stage' }, 400);
        clearStaleLock(repoPath);
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
        clearStaleLock(repoPath);
        cmd = 'git add -A';
        break;
      case 'commit': {
        if (!body.message?.trim()) return c.json({ error: 'message required for commit' }, 400);
        clearStaleLock(repoPath);
        const safeMsg = body.message.replace(/"/g, '\\"');

        let gitIdentityFlags = '';
        try {
          const localName = execSync('git config user.name', { cwd: repoPath, encoding: 'utf8' }).trim();
          const localEmail = execSync('git config user.email', { cwd: repoPath, encoding: 'utf8' }).trim();
          if (!localName || !localEmail) throw new Error('missing');
        } catch {
          const prefs = db.select().from(userPreferences)
            .where(inArray(userPreferences.key, ['operator_git_name', 'operator_git_email']))
            .all();
          const savedName = prefs.find(p => p.key === 'operator_git_name')?.value;
          const savedEmail = prefs.find(p => p.key === 'operator_git_email')?.value;
          if (savedName && savedEmail) {
            const safeName = savedName.replace(/"/g, '\\"');
            const safeEmail = savedEmail.replace(/"/g, '\\"');
            gitIdentityFlags = `-c user.name="${safeName}" -c user.email="${safeEmail}" `;
          }
        }

        cmd = `git ${gitIdentityFlags}commit -m "${safeMsg}"`;
        break;
      }
      case 'discard': {
        if (!body.paths?.length) return c.json({ error: 'paths required for discard' }, 400);
        clearStaleLock(repoPath);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git checkout -- ${safePaths}`;
        break;
      }
      case 'discard-all': {
        clearStaleLock(repoPath);
        // Discard tracked changes + remove untracked files in one shot
        cmd = 'git checkout -- . && git clean -fd';
        break;
      }
      case 'clean': {
        if (!body.paths?.length) return c.json({ error: 'paths required for clean' }, 400);
        const safePaths = body.paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(' ');
        cmd = `git clean -f -- ${safePaths}`;
        break;
      }
      case 'undo-commit':
        cmd = 'git reset --soft HEAD~1';
        break;
      case 'stash':
        clearStaleLock(repoPath);
        cmd = 'git stash';
        break;
      case 'stash-pop':
        cmd = 'git stash pop';
        break;
      case 'get-branch': {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: repoPath, encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
        }).trim();
        const defaultBranch = (() => {
          try {
            return execSync('git symbolic-ref refs/remotes/origin/HEAD --short', {
              cwd: repoPath, encoding: 'utf-8', timeout: 5000, stdio: 'pipe',
            }).trim().replace('origin/', '');
          } catch {
            return 'main';
          }
        })();
        return c.json({ ok: true, branch, defaultBranch });
      }
      case 'cancel-commit-msg': {
        const child = commitMsgChildren.get(id);
        if (child) {
          child.kill('SIGTERM');
          commitMsgInFlight.delete(id);
          commitMsgChildren.delete(id);
        }
        return c.json({ ok: true });
      }
      case 'generate-commit-msg': {
        if (commitMsgInFlight.has(id)) {
          return c.json({ error: 'Commit message generation already in progress' }, 409);
        }
        commitMsgInFlight.add(id);

        const response = c.json({ ok: true, status: 'generating' });

        // Gather context in sync (fast git commands)
        let stagedDiff = '';
        let diffStat = '';
        let recentLog = '';
        try {
          stagedDiff = execSync('git diff --cached', { cwd: repoPath, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe' });
          diffStat = execSync('git diff --cached --stat', { cwd: repoPath, encoding: 'utf-8', timeout: 5_000, stdio: 'pipe' });
          recentLog = execSync('git log --oneline -10', { cwd: repoPath, encoding: 'utf-8', timeout: 5_000, stdio: 'pipe' });
        } catch { /* allow partial data */ }

        if (!stagedDiff.trim()) {
          commitMsgInFlight.delete(id);
          return c.json({ error: 'No staged changes found' }, 400);
        }

        // Truncate large diffs
        const maxDiff = 8000;
        const truncatedDiff = stagedDiff.length > maxDiff
          ? stagedDiff.slice(0, maxDiff) + '\n...truncated'
          : stagedDiff;

        const prompt = `Generate a git commit message for these staged changes.

Recent commits (match this style):
${recentLog.trim()}

Stats:
${diffStat.trim()}

Diff:
${truncatedDiff}

Rules:
- Concise summary under 72 chars on first line
- Use conventional commit format if recent commits follow it
- Optional body after blank line for complex changes
- Output ONLY the commit message text, nothing else`;

        // Spawn Claude in background — use spawn with args to avoid shell escaping issues
        const child = spawn('claude', ['--dangerously-skip-permissions', '-p', prompt], {
          cwd: repoPath,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        commitMsgChildren.set(id, child);

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        const killTimer = setTimeout(() => { child.kill('SIGTERM'); }, 60_000);

        child.on('close', (code) => {
          clearTimeout(killTimer);
          commitMsgInFlight.delete(id);
          commitMsgChildren.delete(id);
          if (code !== 0) {
            const errMsg = stderr.trim() || `Process exited with code ${code}`;
            broadcastFn('commit-msg:error', { worktreeId: id, error: errMsg });
          } else {
            const message = (stdout.trim()).replace(/^["']|["']$/g, '');
            broadcastFn('commit-msg:ready', { worktreeId: id, message });
          }
        });

        return response;
      }
      case 'create-pr': {
        if (prInFlight.has(id)) {
          return c.json({ error: 'PR creation already in progress for this worktree' }, 409);
        }
        prInFlight.add(id);

        // Get worktree name for notifications
        const wtName = worktree.name ?? worktree.branch ?? 'unknown';

        // Respond immediately
        const response = c.json({ ok: true, status: 'creating' });

        // Spawn Claude in background
        const child = exec(
          'claude --dangerously-skip-permissions -p "/commit-push-pr"',
          { cwd: repoPath, timeout: 120_000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            prInFlight.delete(id);
            prChildProcesses.delete(id);
            if (error) {
              const errMsg = stderr?.trim() || error.message || 'Unknown error';
              broadcastFn('pr:error', { worktreeId: id, worktreeName: wtName, error: errMsg });
            } else {
              broadcastFn('pr:success', { worktreeId: id, worktreeName: wtName, output: stdout?.trim() ?? '' });
            }
          },
        );
        prChildProcesses.set(id, child);
        return response;
      }
      case 'pr-status': {
        try {
          const output = execSync(
            'gh pr view --json url,state,title,number,headRefName,baseRefName',
            { cwd: repoPath, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe' },
          );
          const data = JSON.parse(output.trim());
          return c.json({ ok: true, pr: data });
        } catch {
          // No PR exists or gh not installed
          return c.json({ ok: true, pr: null });
        }
      }
      case 'ci-runs': {
        try {
          // Try gh pr checks first — gives individual check runs (lint, test, build, etc.)
          try {
            const checksOutput = execSync(
              'gh pr checks --json name,state,link,startedAt,completedAt,bucket,workflow',
              { cwd: repoPath, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe' },
            );
            const checks = JSON.parse(checksOutput.trim()) as Array<{
              name: string;
              state: string;
              link: string;
              startedAt: string;
              completedAt: string | null;
              bucket: string;
              workflow: string;
            }>;
            // Map to CiRun shape for the frontend
            const runs = checks.map((ch, i) => ({
              name: ch.name,
              status: ch.state === 'PENDING' ? 'in_progress' : 'completed',
              conclusion: ch.bucket === 'pass' ? 'success'
                : ch.bucket === 'fail' ? 'failure'
                : ch.bucket === 'pending' ? null
                : ch.bucket,
              url: ch.link,
              createdAt: ch.startedAt,
              databaseId: i,
            }));
            return c.json({ ok: true, runs });
          } catch {
            // No PR — fall back to workflow runs
          }

          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: repoPath, encoding: 'utf-8', timeout: 5_000, stdio: 'pipe',
          }).trim();
          const output = execSync(
            `gh run list --branch "${branch.replace(/"/g, '\\"')}" --limit 30 --json status,conclusion,name,url,createdAt,databaseId`,
            { cwd: repoPath, encoding: 'utf-8', timeout: 10_000, stdio: 'pipe' },
          );
          // Deduplicate by workflow name — keep only the latest run per workflow
          const allRuns = JSON.parse(output.trim()) as Array<{ name: string; [k: string]: unknown }>;
          const seen = new Set<string>();
          const latestRuns = allRuns.filter((run) => {
            if (seen.has(run.name)) return false;
            seen.add(run.name);
            return true;
          });
          return c.json({ ok: true, runs: latestRuns });
        } catch {
          return c.json({ ok: true, runs: null });
        }
      }
      case 'recent-commits': {
        try {
          const scoped = body.scoped !== false; // default true
          let logCmd = 'git log --oneline -10 --format="%H|%h|%s|%an|%ar"';

          if (scoped) {
            // Resolve base branch: worktree.baseBranch → project.defaultBranch → 'main'
            let base = worktree.baseBranch;
            if (!base) {
              const project = db.select().from(projects).where(eq(projects.id, worktree.projectId)).get();
              base = project?.defaultBranch ?? 'main';
            }
            const safeBase = base.replace(/"/g, '\\"');
            logCmd = `git log "${safeBase}..HEAD" --oneline -20 --format="%H|%h|%s|%an|%ar"`;
          }

          const logOutput = execSync(
            logCmd,
            { cwd: repoPath, encoding: 'utf-8', timeout: 5_000, stdio: 'pipe' },
          ).trim();

          // Get remote URL for building commit links
          let repoUrl: string | null = null;
          try {
            const remote = execSync('git remote get-url origin', {
              cwd: repoPath, encoding: 'utf-8', timeout: 5_000, stdio: 'pipe',
            }).trim();
            // Convert SSH to HTTPS: git@github.com:user/repo.git → https://github.com/user/repo
            if (remote.startsWith('git@')) {
              repoUrl = remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
            } else if (remote.startsWith('https://')) {
              repoUrl = remote.replace(/\.git$/, '');
            }
          } catch { /* no remote */ }

          const commits = logOutput.split('\n').filter(Boolean).map((line) => {
            const [sha, shortSha, message, author, timeAgo] = line.split('|');
            return {
              sha,
              shortSha,
              message,
              author,
              timeAgo,
              url: repoUrl ? `${repoUrl}/commit/${sha}` : null,
            };
          });

          return c.json({ ok: true, commits });
        } catch {
          return c.json({ ok: true, commits: [] });
        }
      }
      default:
        cmd = `git ${action}`;
    }

    const output = execSync(cmd, { cwd: repoPath, encoding: 'utf-8', timeout: 30_000, stdio: 'pipe' });
    return c.json({ ok: true, action });
  } catch (err: any) {
    const stderr = err?.stderr?.toString?.()?.trim() || '';
    const msg = stderr || (err instanceof Error ? err.message : 'Unknown error');
    return c.json({ error: `git ${action} failed: ${msg}` }, 500);
  }
});
