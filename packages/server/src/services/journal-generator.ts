/**
 * JournalGenerator — Generates morning brief and end-of-day recap
 * Pulls data from git, sessions DB, hunter profile, quests, gh CLI, and AI engine
 * @author Subash Karki
 */
import { execSync } from 'node:child_process';
import { db, sessions, hunterProfile, hunterStats, dailyQuests, achievements, activityLog, tasks, worktrees, userPreferences } from '@phantom-os/db';
import { gte, eq, and, desc } from 'drizzle-orm';
import { gatherAIDigestData, formatAIDigestSection, formatHunterDigestSection } from './ai-digest.js';

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

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isGamificationOn(): boolean {
  try {
    const row = db.select().from(userPreferences).where(eq(userPreferences.key, 'gamification')).get();
    return row?.value === 'true';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Morning Brief
// ---------------------------------------------------------------------------

export async function generateMorningBrief(
  projects: ProjectInfo[],
): Promise<string> {
  const lines: string[] = [];

  // Yesterday boundary
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const gamification = isGamificationOn();

  // --- Hunter status (gamification only) ---
  if (gamification) {
    try {
      const profile = db.select().from(hunterProfile).get();
      const stats = db.select().from(hunterStats).get();
      if (profile) {
        lines.push(`Good morning, ${profile.name ?? 'Hunter'}. Rank ${profile.rank ?? 'E'} · Level ${profile.level ?? 1}`);
        if ((profile.streakCurrent ?? 0) > 0) {
          lines.push(`- 🔥 ${profile.streakCurrent}-day streak${(profile.streakCurrent ?? 0) >= (profile.streakBest ?? 0) ? ' (personal best!)' : ''}`);
        }
        const xpPct = profile.xpToNext ? Math.round(((profile.xp ?? 0) / profile.xpToNext) * 100) : 0;
        lines.push(`- XP: ${profile.xp ?? 0}/${profile.xpToNext ?? 100} (${xpPct}% to next level)`);
        if (stats) {
          lines.push(`- Stats: STR ${stats.strength} · INT ${stats.intelligence} · AGI ${stats.agility} · VIT ${stats.vitality} · PER ${stats.perception} · SEN ${stats.sense}`);
        }
      }
    } catch { /* skip */ }
  }

  lines.push('');
  lines.push('Since yesterday:');

  // --- Per-project git data ---
  for (const project of projects) {
    try {
      const commitLog = run(
        'git log --since="yesterday" --oneline --format="%s"',
        project.repoPath,
      );
      const commits = commitLog ? commitLog.split('\n').filter(Boolean) : [];
      const branch = run('git rev-parse --abbrev-ref HEAD', project.repoPath);

      if (commits.length > 0) {
        lines.push(`- [${project.name}] ${commits.length} commit${commits.length === 1 ? '' : 's'} on ${branch || 'unknown'}`);
        // Show top 3 commit messages for context
        const top = commits.slice(0, 3);
        for (const msg of top) {
          lines.push(`  · ${msg}`);
        }
        if (commits.length > 3) {
          lines.push(`  · ...and ${commits.length - 3} more`);
        }
      }

      // Lines changed yesterday
      const diffNumstat = run(
        'git log --since="yesterday" --numstat --format=""',
        project.repoPath,
      );
      if (diffNumstat) {
        let added = 0, removed = 0;
        for (const line of diffNumstat.split('\n').filter(Boolean)) {
          const [a, r] = line.split('\t');
          if (a !== '-') added += Number(a) || 0;
          if (r !== '-') removed += Number(r) || 0;
        }
        if (added > 0 || removed > 0) {
          lines.push(`- [${project.name}] +${added} / -${removed} lines`);
        }
      }

      // Merged PRs
      const prJson = run(
        `gh pr list --repo "${project.repoPath}" --state merged --search "merged:>yesterday" --json title,number,url --limit 5`,
        project.repoPath,
      );
      if (prJson) {
        try {
          const prs = JSON.parse(prJson) as Array<{ title: string; number: number; url: string }>;
          for (const pr of prs) {
            lines.push(`- [${project.name}] [PR #${pr.number}](${pr.url}) "${pr.title}" merged`);
          }
        } catch { /* skip malformed JSON */ }
      }

      // Open PRs needing attention
      const openPrJson = run(
        'gh pr list --state open --json title,number,url --limit 5',
        project.repoPath,
      );
      if (openPrJson) {
        try {
          const prs = JSON.parse(openPrJson) as Array<{ title: string; number: number; url: string }>;
          for (const pr of prs) {
            lines.push(`- [${project.name}] [PR #${pr.number}](${pr.url}) open: "${pr.title}"`);
          }
        } catch { /* skip */ }
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

      // Stale branches (>7 days)
      const staleRaw = run(
        'git for-each-ref --sort=-committerdate --format="%(refname:short) %(committerdate:relative)" refs/heads/ | head -20',
        project.repoPath,
      );
      if (staleRaw) {
        const stale = staleRaw.split('\n').filter(l => /\d+ (weeks?|months?) ago/.test(l));
        if (stale.length > 0) {
          lines.push(`- [${project.name}] ${stale.length} stale branch${stale.length === 1 ? '' : 'es'} (>1 week)`);
        }
      }
    } catch {
      // Skip project on error
    }
  }

  // --- Session data ---
  try {
    const recentSessions = db
      .select()
      .from(sessions)
      .where(gte(sessions.startedAt, yesterday.getTime()))
      .all();

    const sessionCount = recentSessions.length;
    const totalCost = recentSessions.reduce((sum, s) => sum + (s.estimatedCostMicros ?? 0), 0);
    const totalTokens = recentSessions.reduce((sum, s) => sum + (s.inputTokens ?? 0) + (s.outputTokens ?? 0), 0);

    if (sessionCount > 0) {
      lines.push(`- ${sessionCount} session${sessionCount === 1 ? '' : 's'}, ${formatCost(totalCost)} spent, ${(totalTokens / 1000).toFixed(0)}k tokens`);
    }
  } catch { /* skip */ }

  // --- Yesterday's completed tasks ---
  try {
    const completedTasks = db
      .select()
      .from(tasks)
      .where(and(gte(tasks.updatedAt, yesterday.getTime()), eq(tasks.status, 'completed')))
      .all();

    if (completedTasks.length > 0) {
      lines.push(`- ${completedTasks.length} task${completedTasks.length === 1 ? '' : 's'} completed`);
      for (const t of completedTasks.slice(0, 3)) {
        lines.push(`  · ${t.subject ?? 'Untitled'}`);
      }
    }
  } catch { /* skip */ }

  // --- Active worktrees ---
  try {
    const activeWt = db.select().from(worktrees).where(eq(worktrees.isActive, 1)).all();
    if (activeWt.length > 0) {
      lines.push(`- ${activeWt.length} active worktree${activeWt.length === 1 ? '' : 's'}: ${activeWt.map(w => w.branch).join(', ')}`);
    }
  } catch { /* skip */ }

  // --- Today's quests (gamification only) ---
  if (gamification) {
    try {
      const quests = db.select().from(dailyQuests).where(eq(dailyQuests.date, todayStr())).all();
      if (quests.length > 0) {
        lines.push('');
        lines.push("Today's quests:");
        for (const q of quests) {
          const done = q.completed ? '✓' : `${q.progress ?? 0}/${q.target}`;
          lines.push(`- ${q.label} [${done}] — ${q.xpReward ?? 25} XP`);
        }
      }
    } catch { /* skip */ }

    // --- Recent achievements ---
    try {
      const recentAch = db
        .select()
        .from(achievements)
        .where(gte(achievements.unlockedAt, yesterday.getTime()))
        .all();

      if (recentAch.length > 0) {
        lines.push('');
        lines.push('Recent achievements:');
        for (const a of recentAch) {
          lines.push(`- ${a.icon ?? '🏆'} ${a.name} — ${a.description ?? ''}`);
        }
      }
    } catch { /* skip */ }
  }

  // --- AI Engine Insights (yesterday's data) ---
  try {
    const aiData = await gatherAIDigestData(yesterdayStr());
    const aiSection = formatAIDigestSection(aiData);
    if (aiSection) {
      lines.push('');
      lines.push(aiSection);
    }
  } catch { /* skip — AI engine data is optional */ }

  // Fallback
  if (lines.filter(l => l.startsWith('- ')).length === 0) {
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
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalFilesChanged = 0;
  let totalSessionCount = 0;
  let totalCostMicros = 0;
  let totalTokens = 0;
  let totalToolUses = 0;

  // Per-project git data
  const projectLines: string[] = [];
  for (const project of projects) {
    try {
      // Today's commits
      const commitLog = run(
        'git log --since="today 00:00" --oneline --format="%s"',
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
        totalFilesChanged += filesChanged;

        // Lines changed
        const numstat = run(
          'git log --since="today 00:00" --numstat --format=""',
          project.repoPath,
        );
        let projAdded = 0, projRemoved = 0;
        if (numstat) {
          for (const line of numstat.split('\n').filter(Boolean)) {
            const [a, r] = line.split('\t');
            if (a !== '-') projAdded += Number(a) || 0;
            if (r !== '-') projRemoved += Number(r) || 0;
          }
        }
        totalAdded += projAdded;
        totalRemoved += projRemoved;

        projectLines.push(
          `- [${project.name}] ${commits.length} commit${commits.length === 1 ? '' : 's'}, ${filesChanged} file${filesChanged === 1 ? '' : 's'} changed (+${projAdded}/-${projRemoved})`,
        );

        // Top commit messages
        const top = commits.slice(0, 3);
        for (const msg of top) {
          projectLines.push(`  · ${msg}`);
        }
        if (commits.length > 3) {
          projectLines.push(`  · ...and ${commits.length - 3} more`);
        }
      }

      // Merged PRs today
      const mergedJson = run(
        `gh pr list --state merged --search "merged:>=${todayStr()}" --json title,number,url --limit 5`,
        project.repoPath,
      );
      if (mergedJson) {
        try {
          const prs = JSON.parse(mergedJson) as Array<{ title: string; number: number; url: string }>;
          for (const pr of prs) {
            projectLines.push(`- [${project.name}] [PR #${pr.number}](${pr.url}) merged: "${pr.title}"`);
          }
        } catch { /* skip */ }
      }

      // Still open PRs
      const openJson = run(
        'gh pr list --state open --json title,number,url --limit 5',
        project.repoPath,
      );
      if (openJson) {
        try {
          const prs = JSON.parse(openJson) as Array<{ title: string; number: number; url: string }>;
          for (const pr of prs) {
            projectLines.push(`- [${project.name}] [PR #${pr.number}](${pr.url}) open: "${pr.title}"`);
          }
        } catch { /* skip */ }
      }
    } catch {
      // Skip project on error
    }
  }

  // --- Session data ---
  try {
    const todaySessions = db
      .select()
      .from(sessions)
      .where(gte(sessions.startedAt, today.getTime()))
      .all();

    totalSessionCount = todaySessions.length;
    totalCostMicros = todaySessions.reduce((sum, s) => sum + (s.estimatedCostMicros ?? 0), 0);
    totalTokens = todaySessions.reduce((sum, s) => sum + (s.inputTokens ?? 0) + (s.outputTokens ?? 0), 0);
    totalToolUses = todaySessions.reduce((sum, s) => sum + (s.toolUseCount ?? 0), 0);
  } catch { /* skip */ }

  // --- Summary header ---
  lines.push(
    `Today: ${totalCommits} commit${totalCommits === 1 ? '' : 's'}, ${totalFilesChanged} file${totalFilesChanged === 1 ? '' : 's'} touched, +${totalAdded}/-${totalRemoved} lines`,
  );
  lines.push(
    `Sessions: ${totalSessionCount}, ${formatCost(totalCostMicros)} spent, ${(totalTokens / 1000).toFixed(0)}k tokens, ${totalToolUses} tool calls`,
  );

  // Add project detail lines
  if (projectLines.length > 0) {
    lines.push('');
    lines.push(...projectLines);
  }

  // --- CI status ---
  for (const project of projects) {
    const ciJson = run(
      'gh run list --branch main --limit 1 --json conclusion',
      project.repoPath,
    );
    if (ciJson) {
      try {
        const runs = JSON.parse(ciJson) as Array<{ conclusion: string }>;
        if (runs.length > 0 && runs[0].conclusion) {
          lines.push(`- [${project.name}] CI: ${runs[0].conclusion}`);
          break;
        }
      } catch { /* skip */ }
    }
  }

  // --- Tasks completed today ---
  try {
    const completedToday = db
      .select()
      .from(tasks)
      .where(and(gte(tasks.updatedAt, today.getTime()), eq(tasks.status, 'completed')))
      .all();

    if (completedToday.length > 0) {
      lines.push('');
      lines.push(`Tasks completed: ${completedToday.length}`);
      for (const t of completedToday.slice(0, 5)) {
        lines.push(`- ✓ ${t.subject ?? 'Untitled'}`);
      }
      if (completedToday.length > 5) {
        lines.push(`- ...and ${completedToday.length - 5} more`);
      }
    }

    const pendingTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, 'pending'))
      .all();

    if (pendingTasks.length > 0) {
      lines.push(`- ${pendingTasks.length} task${pendingTasks.length === 1 ? '' : 's'} still pending`);
    }
  } catch { /* skip */ }

  // --- Gamification sections (quests, hunter, achievements) ---
  const gamification = isGamificationOn();

  if (gamification) {
    // Quest progress
    try {
      const quests = db.select().from(dailyQuests).where(eq(dailyQuests.date, todayStr())).all();
      if (quests.length > 0) {
        const done = quests.filter(q => q.completed);
        const xpFromQuests = done.reduce((sum, q) => sum + (q.xpReward ?? 25), 0);
        lines.push('');
        lines.push(`Quests: ${done.length}/${quests.length} completed${xpFromQuests > 0 ? ` (+${xpFromQuests} XP)` : ''}`);
        for (const q of quests) {
          const mark = q.completed ? '✓' : `${q.progress ?? 0}/${q.target}`;
          lines.push(`- ${q.label} [${mark}]`);
        }
      }
    } catch { /* skip */ }

    // XP & level progress
    try {
      const profile = db.select().from(hunterProfile).get();
      if (profile) {
        const todayActivity = db
          .select()
          .from(activityLog)
          .where(gte(activityLog.timestamp, today.getTime()))
          .all();
        const xpToday = todayActivity.reduce((sum, a) => sum + (a.xpEarned ?? 0), 0);

        lines.push('');
        lines.push(`Hunter: Level ${profile.level ?? 1}, Rank ${profile.rank ?? 'E'}${xpToday > 0 ? ` — earned ${xpToday} XP today` : ''}`);
        const xpPct = profile.xpToNext ? Math.round(((profile.xp ?? 0) / profile.xpToNext) * 100) : 0;
        lines.push(`- XP: ${profile.xp ?? 0}/${profile.xpToNext ?? 100} (${xpPct}% to next level)`);
        if ((profile.streakCurrent ?? 0) > 0) {
          lines.push(`- 🔥 ${profile.streakCurrent}-day streak`);
        }
      }
    } catch { /* skip */ }

    // Achievements unlocked today
    try {
      const todayAch = db
        .select()
        .from(achievements)
        .where(gte(achievements.unlockedAt, today.getTime()))
        .all();
      if (todayAch.length > 0) {
        lines.push('');
        lines.push('Achievements unlocked:');
        for (const a of todayAch) {
          lines.push(`- ${a.icon ?? '🏆'} ${a.name}${a.xpReward ? ` (+${a.xpReward} XP)` : ''}`);
        }
      }
    } catch { /* skip */ }
  }

  // --- AI Engine Insights (today's data) ---
  try {
    const aiData = await gatherAIDigestData(todayStr());

    const aiSection = formatAIDigestSection(aiData);
    if (aiSection) {
      lines.push('');
      lines.push(aiSection);
    }

    // Hunter progress section (separate from gamification quests/achievements)
    const hunterSection = formatHunterDigestSection(aiData);
    if (hunterSection && !gamification) {
      // Only show AI-gathered hunter progress if gamification section didn't already cover it
      lines.push('');
      lines.push(hunterSection);
    }
  } catch { /* skip — AI engine data is optional */ }

  // Fallback
  if (totalCommits === 0 && totalSessionCount === 0) {
    lines.push('');
    lines.push('- No commits or sessions recorded today');
  }

  return lines.join('\n');
}
