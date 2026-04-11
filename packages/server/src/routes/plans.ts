/**
 * Plans API — surfaces Claude plan files relevant to a worktree.
 * Scans ~/.claude/plans/ for .md files and matches them to a worktree
 * by searching plan content for worktree name or path references.
 * @author Subash Karki
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, projects, worktrees } from '@phantom-os/db';

const PLANS_DIR = join(homedir(), '.claude', 'plans');
const CACHE_TTL = 10_000; // 10s cache

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

    // Sort by modifiedAt descending (most recent first)
    plans.sort((a, b) => b.modifiedAt - a.modifiedAt);

    planCache = { plans, ts: Date.now() };
    return plans;
  } catch {
    return [];
  }
}

/** Strip internal _content field before sending to the client */
function toClientPlan({ _content, ...rest }: CachedPlan): PlanFile {
  return rest;
}

export const plansRoutes = new Hono();

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

  return c.json({ branch: branchPlans, project: projectPlans });
});
