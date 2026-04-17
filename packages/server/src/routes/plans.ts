/**
 * Plans API — surfaces Claude plan files relevant to a worktree.
 * Scans ~/.claude/plans/ for .md files and matches them to a worktree
 * by searching plan content for worktree name or path references.
 * @author Subash Karki
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { eq, and } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees, sessions } from '@phantom-os/db';

const PLANS_DIR = join(homedir(), '.claude', 'plans');
const CACHE_TTL = 10_000; // 10s cache
const PLANS_MAX_AGE = 48 * 60 * 60 * 1000; // Only show plans from last 48 hours

interface PlanFile {
  filename: string;
  title: string;
  modifiedAt: number;
  preview: string;
  fullPath: string;
}

interface CachedPlan extends PlanFile {
  /** Raw content (first 2KB) kept for matching — stripped before sending to client */
  _content: string;
}

// Simple in-memory cache
let planCache: { plans: CachedPlan[]; ts: number } | null = null;

async function scanPlans(): Promise<CachedPlan[]> {
  // Return cache if fresh
  if (planCache && Date.now() - planCache.ts < CACHE_TTL) return planCache.plans;

  try {
    const files = await readdir(PLANS_DIR);
    const mdFiles = files.filter((f) => f.endsWith('.md'));

    const plans = await Promise.all(
      mdFiles.map(async (filename): Promise<CachedPlan> => {
        const fullPath = join(PLANS_DIR, filename);
        const [content, fileStat] = await Promise.all([
          // Only read first 2KB for matching + preview
          readFile(fullPath, { encoding: 'utf-8' }).then((c) => c.slice(0, 2048)),
          stat(fullPath),
        ]);

        // Extract title (first # heading)
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1] ?? filename.replace('.md', '');

        // Extract preview (first non-empty, non-heading, non-frontmatter line after title)
        const lines = content.split('\n');
        const titleIdx = lines.findIndex((l) => l.startsWith('# '));
        const previewLine = lines
          .slice(titleIdx + 1)
          .find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
        const preview = (previewLine?.trim() ?? '').slice(0, 100);

        return {
          filename,
          title,
          modifiedAt: fileStat.mtimeMs,
          preview,
          fullPath,
          _content: content,
        };
      }),
    );

    // Sort by modifiedAt descending (most recent first), keep only last 48 hours
    plans.sort((a, b) => b.modifiedAt - a.modifiedAt);
    const cutoff = Date.now() - PLANS_MAX_AGE;
    const recent = plans.filter((p) => p.modifiedAt >= cutoff);

    planCache = { plans: recent, ts: Date.now() };
    return recent;
  } catch {
    return [];
  }
}

/** Strip internal _content field before sending to the client */
function toClientPlan({ _content, ...rest }: CachedPlan): PlanFile {
  return rest;
}

export const plansRoutes = new Hono();

/** GET /plans/by-cwd?cwd=<path> — List plan files matching a working directory */
plansRoutes.get('/plans/by-cwd', async (c) => {
  const cwd = c.req.query('cwd');
  if (!cwd) return c.json({ branch: [], project: [] });

  const allPlans = await scanPlans();

  // Look up project by matching repo path
  const allProjects = db.select().from(projects).all();
  const project = allProjects.find((p) => p.repoPath && cwd.startsWith(p.repoPath));

  // Build search terms from cwd and project
  const branchTerms: string[] = [cwd.toLowerCase()];

  // Look up worktree by path for branch name
  const allWorktrees = db.select().from(worktrees).all();
  const worktree = allWorktrees.find((w) => w.worktreePath && cwd.startsWith(w.worktreePath));
  if (worktree?.branch) branchTerms.push(worktree.branch.toLowerCase());

  const projectTerms: string[] = [];
  if (project?.name) projectTerms.push(project.name.toLowerCase());
  if (project?.repoPath) projectTerms.push(project.repoPath.toLowerCase());

  const matchesTerm = (content: string, terms: string[]) =>
    terms.some((term) => term.length >= 6 && content.includes(term));

  const branchPlans: PlanFile[] = [];
  const projectPlans: PlanFile[] = [];

  for (const plan of allPlans) {
    const content = plan._content.toLowerCase();
    if (matchesTerm(content, branchTerms)) {
      branchPlans.push(toClientPlan(plan));
    } else if (matchesTerm(content, projectTerms)) {
      projectPlans.push(toClientPlan(plan));
    }
  }

  if (branchPlans.length === 0 && projectPlans.length === 0) {
    const activeSessions = db
      .select({ startedAt: sessions.startedAt })
      .from(sessions)
      .where(and(eq(sessions.cwd, cwd), eq(sessions.status, 'active')))
      .all();

    if (activeSessions.length > 0) {
      const earliestStart = Math.min(...activeSessions.map((s) => s.startedAt ?? 0));
      for (const plan of allPlans) {
        const alreadyMatched =
          branchPlans.some((p) => p.filename === plan.filename) ||
          projectPlans.some((p) => p.filename === plan.filename);
        if (!alreadyMatched && plan.modifiedAt >= earliestStart) {
          projectPlans.push(toClientPlan(plan));
        }
      }
    }
  }

  return c.json({ branch: branchPlans, project: projectPlans });
});

/** GET /plans?worktreeId=<id> — List plan files matching a worktree */
plansRoutes.get('/plans', async (c) => {
  const worktreeId = c.req.query('worktreeId');
  if (!worktreeId) {
    return c.json([]);
  }

  // Look up the worktree from DB
  const worktree = db.select().from(worktrees).where(eq(worktrees.id, worktreeId)).get();
  if (!worktree) return c.json([]);

  const allPlans = await scanPlans();

  // Look up the parent project for its name
  const project = worktree.projectId
    ? db.select().from(projects).where(eq(projects.id, worktree.projectId)).get()
    : null;

  // Build branch-specific and project-level search terms
  const branchTerms: string[] = [];
  if (worktree.worktreePath) branchTerms.push(worktree.worktreePath.toLowerCase());
  if (worktree.branch) branchTerms.push(worktree.branch.toLowerCase());

  const projectTerms: string[] = [];
  if (project?.name) projectTerms.push(project.name.toLowerCase());
  if (project?.repoPath) projectTerms.push(project.repoPath.toLowerCase());

  const matchesTerm = (content: string, terms: string[]) =>
    terms.some((term) => term.length >= 6 && content.includes(term));

  // Categorize each plan as branch-specific or project-level
  // Only the "branch" type (Local checkout) sees project-level plans.
  // Worktrees only see their own branch-scoped plans.
  const isLocalBranch = worktree.type === 'branch';
  const branchPlans: PlanFile[] = [];
  const projectPlans: PlanFile[] = [];

  for (const plan of allPlans) {
    const content = plan._content.toLowerCase();
    if (matchesTerm(content, branchTerms)) {
      branchPlans.push(toClientPlan(plan));
    } else if (isLocalBranch && matchesTerm(content, projectTerms)) {
      projectPlans.push(toClientPlan(plan));
    }
  }

  return c.json({ branch: branchPlans, project: projectPlans });
});
