/**
 * JournalGenerator — Generates morning brief and end-of-day recap
 * Pulls data from git, sessions DB, and gh CLI
 * @author Subash Karki
 */
import { execSync } from 'node:child_process';
import { db, sessions } from '@phantom-os/db';
import { gte } from 'drizzle-orm';

interface ProjectInfo {
  id: string;
  name: string;
  repoPath: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
  } catch {
    return '';
  }
}

function formatCost(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Morning Brief
// ---------------------------------------------------------------------------

export async function generateMorningBrief(
  projects: ProjectInfo[],
): Promise<string> {
  const lines: string[] = ['Since yesterday:'];

  // Yesterday boundary
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  // Per-project git data
  for (const project of projects) {
    try {
      // Yesterday's commits
      const commitLog = run(
        'git log --since="yesterday" --oneline --format="%s"',
        project.repoPath,
      );
      const commits = commitLog ? commitLog.split('\n').filter(Boolean) : [];

      // Current branch
      const branch = run('git rev-parse --abbrev-ref HEAD', project.repoPath);

      if (commits.length > 0) {
        lines.push(`- [${project.name}] ${commits.length} commit${commits.length === 1 ? '' : 's'} on ${branch || 'unknown'}`);
      }

      // Merged PRs (gh may not be available)
      const prJson = run(
        `gh pr list --repo "${project.repoPath}" --state merged --search "merged:>yesterday" --json title,number --limit 5`,
        project.repoPath,
      );
      if (prJson) {
        try {
          const prs = JSON.parse(prJson) as Array<{ title: string; number: number }>;
          for (const pr of prs) {
            lines.push(`- [${project.name}] PR #${pr.number} "${pr.title}" merged`);
          }
        } catch { /* skip malformed JSON */ }
      }

      // CI status
      const ciJson = run(
        'gh run list --branch main --limit 1 --json conclusion',
        project.repoPath,
      );
      if (ciJson) {
        try {
          const runs = JSON.parse(ciJson) as Array<{ conclusion: string }>;
          if (runs.length > 0 && runs[0].conclusion) {
            lines.push(`- [${project.name}] CI: ${runs[0].conclusion} on main`);
          }
        } catch { /* skip */ }
      }
    } catch {
      // Skip project if any unrecoverable error
    }
  }

  // Session data from DB
  try {
    const recentSessions = db
      .select()
      .from(sessions)
      .where(gte(sessions.startedAt, yesterday.getTime()))
      .all();

    const sessionCount = recentSessions.length;
    const totalCost = recentSessions.reduce(
      (sum, s) => sum + (s.estimatedCostMicros ?? 0),
      0,
    );

    if (sessionCount > 0) {
      lines.push(`- ${sessionCount} session${sessionCount === 1 ? '' : 's'}, ${formatCost(totalCost)} spent`);
    }
  } catch {
    // DB read failed — skip
  }

  // If no data was gathered beyond the header, add a fallback
  if (lines.length === 1) {
    lines.push('- No activity detected since yesterday');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// End of Day
// ---------------------------------------------------------------------------

export async function generateEndOfDay(
  projects: ProjectInfo[],
): Promise<string> {
  const lines: string[] = [];

  // Today boundary
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalCommits = 0;
  let totalSessionCount = 0;
  let totalCostMicros = 0;

  // Per-project git data
  const projectLines: string[] = [];
  for (const project of projects) {
    try {
      // Today's commits
      const commitLog = run(
        'git log --since="today 00:00" --oneline',
        project.repoPath,
      );
      const commits = commitLog ? commitLog.split('\n').filter(Boolean) : [];
      totalCommits += commits.length;

      if (commits.length > 0) {
        // Files changed
        const diffStat = run(
          `git diff --stat HEAD~${commits.length} 2>/dev/null`,
          project.repoPath,
        );
        const filesChanged = diffStat
          ? diffStat.split('\n').filter((l) => l.includes('|')).length
          : 0;

        projectLines.push(
          `- [${project.name}] ${commits.length} commit${commits.length === 1 ? '' : 's'}, ${filesChanged} file${filesChanged === 1 ? '' : 's'} changed`,
        );
      }

      // PR status
      const prJson = run(
        'gh pr list --state open --json title,number --limit 3',
        project.repoPath,
      );
      if (prJson) {
        try {
          const prs = JSON.parse(prJson) as Array<{ title: string; number: number }>;
          for (const pr of prs) {
            projectLines.push(`- [${project.name}] PR #${pr.number} open: "${pr.title}"`);
          }
        } catch { /* skip */ }
      }
    } catch {
      // Skip project on error
    }
  }

  // Session data from DB
  try {
    const todaySessions = db
      .select()
      .from(sessions)
      .where(gte(sessions.startedAt, today.getTime()))
      .all();

    totalSessionCount = todaySessions.length;
    totalCostMicros = todaySessions.reduce(
      (sum, s) => sum + (s.estimatedCostMicros ?? 0),
      0,
    );
  } catch {
    // DB read failed — skip
  }

  // Summary line
  lines.push(
    `Today: ${totalCommits} commit${totalCommits === 1 ? '' : 's'}, ${totalSessionCount} session${totalSessionCount === 1 ? '' : 's'}, ${formatCost(totalCostMicros)} total`,
  );

  // Add project detail lines
  lines.push(...projectLines);

  // CI status (check first project with available data)
  for (const project of projects) {
    const ciJson = run(
      'gh run list --branch main --limit 1 --json conclusion',
      project.repoPath,
    );
    if (ciJson) {
      try {
        const runs = JSON.parse(ciJson) as Array<{ conclusion: string }>;
        if (runs.length > 0 && runs[0].conclusion) {
          lines.push(`Tests: ${runs[0].conclusion}`);
          break;
        }
      } catch { /* skip */ }
    }
  }

  if (lines.length === 1 && totalCommits === 0) {
    lines.push('- No commits or sessions recorded today');
  }

  return lines.join('\n');
}
