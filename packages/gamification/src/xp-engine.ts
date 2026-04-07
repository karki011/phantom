/**
 * PhantomOS XP Engine
 * Calculates and awards experience points, manages leveling, ranks, and achievements.
 * @author Subash Karki
 */
import { eq, sql } from 'drizzle-orm';
import { db, achievements, activityLog, hunterProfile, hunterStats, sessions, tasks, dailyQuests } from '@phantom-os/db';
import { XP, levelXpRequired, rankForLevel } from '@phantom-os/shared';

interface AwardResult {
  leveledUp: boolean;
  newLevel?: number;
  newRank?: string;
}

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const logActivity = (
  type: string,
  xpEarned: number,
  sessionId?: string,
  metadata?: Record<string, unknown>,
): void => {
  db.insert(activityLog)
    .values({
      timestamp: Date.now(),
      type,
      sessionId: sessionId ?? null,
      xpEarned,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .run();
};

export const awardXP = (
  amount: number,
  type: string,
  sessionId?: string,
): AwardResult => {
  const profile = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
  if (!profile) return { leveledUp: false };

  let newXp = (profile.xp ?? 0) + amount;
  let currentLevel = profile.level ?? 1;
  let leveledUp = false;

  // Check for level-ups (can level multiple times in one award)
  while (newXp >= levelXpRequired(currentLevel)) {
    newXp -= levelXpRequired(currentLevel);
    currentLevel++;
    leveledUp = true;
  }

  const { rank, title } = rankForLevel(currentLevel);
  const xpToNext = levelXpRequired(currentLevel);

  db.update(hunterProfile)
    .set({
      xp: newXp,
      level: currentLevel,
      rank,
      title,
      xpToNext,
    })
    .where(eq(hunterProfile.id, 1))
    .run();

  logActivity(type, amount, sessionId, {
    newLevel: currentLevel,
    rank,
    leveledUp,
  });

  return {
    leveledUp,
    newLevel: leveledUp ? currentLevel : undefined,
    newRank: leveledUp ? rank : undefined,
  };
};


/** Update daily quest progress based on current stats */
export const updateDailyQuestProgress = (): void => {
  const today = todayStr();
  const quests = db.select().from(dailyQuests).where(eq(dailyQuests.date, today)).all();
  if (quests.length === 0) return;

  for (const quest of quests) {
    if (quest.completed) continue;

    let progress = 0;

    switch (quest.questType) {
      case 'sessions_completed':
      case 'sessions_started': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ id: sessions.id })
          .from(sessions)
          .where(sql`${sessions.startedAt} >= ${startOfDay} AND ${sessions.startedAt} < ${endOfDay}`)
          .all();
        progress = rows.length;
        break;
      }

      case 'tasks_completed': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ id: tasks.id })
          .from(tasks)
          .where(sql`${tasks.status} = 'completed' AND ${tasks.updatedAt} >= ${startOfDay} AND ${tasks.updatedAt} < ${endOfDay}`)
          .all();
        progress = rows.length;
        break;
      }

      case 'speed_tasks': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ id: tasks.id })
          .from(tasks)
          .where(sql`${tasks.status} = 'completed' AND ${tasks.updatedAt} >= ${startOfDay} AND ${tasks.updatedAt} < ${endOfDay} AND (${tasks.updatedAt} - ${tasks.createdAt}) < 120000`)
          .all();
        progress = rows.length;
        break;
      }

      case 'repos_worked': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ repo: sessions.repo })
          .from(sessions)
          .where(sql`${sessions.startedAt} >= ${startOfDay} AND ${sessions.startedAt} < ${endOfDay} AND ${sessions.repo} IS NOT NULL`)
          .all();
        const uniqueRepos = new Set(rows.map((r) => r.repo));
        progress = uniqueRepos.size;
        break;
      }

      case 'long_session': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ id: sessions.id })
          .from(sessions)
          .where(sql`${sessions.startedAt} >= ${startOfDay} AND ${sessions.startedAt} < ${endOfDay} AND ${sessions.endedAt} IS NOT NULL AND (${sessions.endedAt} - ${sessions.startedAt}) > 3600000`)
          .all();
        progress = rows.length;
        break;
      }

      case 'perfect_session': {
        const startOfDay = new Date(today).getTime();
        const endOfDay = startOfDay + 86_400_000;
        const rows = db
          .select({ id: sessions.id })
          .from(sessions)
          .where(sql`${sessions.startedAt} >= ${startOfDay} AND ${sessions.startedAt} < ${endOfDay} AND ${sessions.taskCount} > 0 AND ${sessions.completedTasks} = ${sessions.taskCount}`)
          .all();
        progress = rows.length;
        break;
      }

      case 'streak_day': {
        const profile = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
        progress = profile?.lastActiveDate === today ? 1 : 0;
        break;
      }

      default:
        continue;
    }

    const completed = progress >= quest.target ? 1 : 0;
    const wasCompleted = quest.completed;

    db.update(dailyQuests)
      .set({ progress, completed })
      .where(eq(dailyQuests.id, quest.id))
      .run();

    // Award XP when newly completed
    if (completed && !wasCompleted) {
      awardXP(quest.xpReward ?? 25, 'DAILY_QUEST', undefined);
    }
  }
};

export const onTaskComplete = (sessionId: string, taskId: string): void => {
  // Award task completion XP
  awardXP(XP.TASK_COMPLETE, 'TASK_COMPLETE', sessionId);

  // Update session completed task count
  db.update(sessions)
    .set({
      completedTasks: sql`${sessions.completedTasks} + 1`,
      xpEarned: sql`${sessions.xpEarned} + ${XP.TASK_COMPLETE}`,
    })
    .where(eq(sessions.id, sessionId))
    .run();

  // Update hunter total tasks
  db.update(hunterProfile)
    .set({ totalTasks: sql`${hunterProfile.totalTasks} + 1` })
    .where(eq(hunterProfile.id, 1))
    .run();

  // Update STR stat (tasks completed = strength)
  db.update(hunterStats)
    .set({ strength: sql`${hunterStats.strength} + 1` })
    .where(eq(hunterStats.id, 1))
    .run();

  // Check if all tasks in session are done -> bonus
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (session && session.taskCount && session.taskCount > 0) {
    const allTasks = db
      .select()
      .from(tasks)
      .where(eq(tasks.sessionId, sessionId))
      .all();
    const allDone = allTasks.length > 0 && allTasks.every((t) => t.status === 'completed');
    if (allDone) {
      awardXP(XP.SESSION_COMPLETE_BONUS, 'SESSION_COMPLETE_BONUS', sessionId);
    }
  }

  // Check speed bonus: task completed within 2 minutes of creation
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (task?.createdAt && task.updatedAt) {
    const elapsed = task.updatedAt - task.createdAt;
    if (elapsed < 2 * 60 * 1000) {
      awardXP(XP.SPEED_TASK, 'SPEED_TASK', sessionId);
      // Boost AGI for fast tasks
      db.update(hunterStats)
        .set({ agility: sql`${hunterStats.agility} + 1` })
        .where(eq(hunterStats.id, 1))
        .run();
    }
  }

  // Update daily quest progress
  updateDailyQuestProgress();
};

export const onSessionStart = (sessionId: string): void => {
  // Award session start XP
  awardXP(XP.SESSION_START, 'SESSION_START', sessionId);

  // Update total sessions
  db.update(hunterProfile)
    .set({ totalSessions: sql`${hunterProfile.totalSessions} + 1` })
    .where(eq(hunterProfile.id, 1))
    .run();

  // Update INT stat (sessions = intelligence growth)
  db.update(hunterStats)
    .set({ intelligence: sql`${hunterStats.intelligence} + 1` })
    .where(eq(hunterStats.id, 1))
    .run();

  const today = todayStr();
  const profile = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();

  // Check if first session of the day
  if (profile && profile.lastActiveDate !== today) {
    awardXP(XP.FIRST_SESSION_OF_DAY, 'FIRST_SESSION_OF_DAY', sessionId);

    // Update streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = 1;
    if (profile.lastActiveDate === yesterdayStr) {
      newStreak = (profile.streakCurrent ?? 0) + 1;
      awardXP(XP.DAILY_STREAK, 'DAILY_STREAK', sessionId);
      // Boost VIT for streaks
      db.update(hunterStats)
        .set({ vitality: sql`${hunterStats.vitality} + 1` })
        .where(eq(hunterStats.id, 1))
        .run();
    }

    const bestStreak = Math.max(newStreak, profile.streakBest ?? 0);

    db.update(hunterProfile)
      .set({
        lastActiveDate: today,
        streakCurrent: newStreak,
        streakBest: bestStreak,
      })
      .where(eq(hunterProfile.id, 1))
      .run();
  } else if (profile && !profile.lastActiveDate) {
    db.update(hunterProfile)
      .set({ lastActiveDate: today, streakCurrent: 1 })
      .where(eq(hunterProfile.id, 1))
      .run();
  }

  // Check if new repo
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (session?.repo) {
    const existingRepo = db
      .select()
      .from(sessions)
      .where(eq(sessions.repo, session.repo))
      .all();
    // Only this session has this repo = it's new
    if (existingRepo.length <= 1) {
      awardXP(XP.NEW_REPO, 'NEW_REPO', sessionId);
      db.update(hunterProfile)
        .set({
          totalRepos: sql`${hunterProfile.totalRepos} + 1`,
          // Boost PER for exploring new repos
        })
        .where(eq(hunterProfile.id, 1))
        .run();
      db.update(hunterStats)
        .set({ perception: sql`${hunterStats.perception} + 1` })
        .where(eq(hunterStats.id, 1))
        .run();
    }
  }
};

export const onSessionEnd = (sessionId: string): void => {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return;

  // Check long session (>2 hours)
  if (session.startedAt && session.endedAt) {
    const duration = session.endedAt - session.startedAt;
    if (duration > 2 * 60 * 60 * 1000) {
      awardXP(XP.LONG_SESSION, 'LONG_SESSION', sessionId);
    }
  }

  // Check perfect clear: all tasks completed
  if (session.taskCount && session.taskCount > 0 && session.completedTasks === session.taskCount) {
    // Boost SEN for perfect clears
    db.update(hunterStats)
      .set({ sense: sql`${hunterStats.sense} + 1` })
      .where(eq(hunterStats.id, 1))
      .run();
  }

  // Update daily quest progress
  updateDailyQuestProgress();
};

/** Achievement definitions — checked against current hunter state */
const ACHIEVEMENT_DEFS = [
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Complete your first task',
    icon: '⚔️',
    category: 'Mastery',
    xpReward: 50,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalTasks ?? 0) >= 1;
    },
  },
  {
    id: 'shadow_army_10',
    name: 'Shadow Army',
    description: 'Complete 10 tasks',
    icon: '👤',
    category: 'Mastery',
    xpReward: 100,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalTasks ?? 0) >= 10;
    },
  },
  {
    id: 'shadow_monarch_100',
    name: 'Shadow Monarch',
    description: 'Complete 100 tasks',
    icon: '👑',
    category: 'Mastery',
    xpReward: 500,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalTasks ?? 0) >= 100;
    },
  },
  {
    id: 'arise_sessions_5',
    name: 'Arise!',
    description: 'Start 5 sessions',
    icon: '🌑',
    category: 'Mastery',
    xpReward: 75,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalSessions ?? 0) >= 5;
    },
  },
  {
    id: 'dungeon_master_50',
    name: 'Dungeon Master',
    description: 'Start 50 sessions',
    icon: '🏰',
    category: 'Mastery',
    xpReward: 250,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalSessions ?? 0) >= 50;
    },
  },
  {
    id: 'explorer_3',
    name: 'World Explorer',
    description: 'Work in 3 different repositories',
    icon: '🌍',
    category: 'Exploration',
    xpReward: 100,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.totalRepos ?? 0) >= 3;
    },
  },
  {
    id: 'streak_7',
    name: 'Iron Will',
    description: 'Maintain a 7-day streak',
    icon: '🔥',
    category: 'Mastery',
    xpReward: 150,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.streakBest ?? 0) >= 7;
    },
  },
  {
    id: 'streak_30',
    name: 'Unstoppable Force',
    description: 'Maintain a 30-day streak',
    icon: '💎',
    category: 'Mastery',
    xpReward: 500,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.streakBest ?? 0) >= 30;
    },
  },
  {
    id: 'rank_d',
    name: 'D-Rank Promotion',
    description: 'Reach D-Rank',
    icon: '📈',
    category: 'Combat',
    xpReward: 50,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.level ?? 1) >= 10;
    },
  },
  {
    id: 'rank_c',
    name: 'C-Rank Promotion',
    description: 'Reach C-Rank',
    icon: '📈',
    category: 'Combat',
    xpReward: 100,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.level ?? 1) >= 25;
    },
  },
  {
    id: 'rank_b',
    name: 'B-Rank Promotion',
    description: 'Reach B-Rank',
    icon: '⭐',
    category: 'Combat',
    xpReward: 200,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.level ?? 1) >= 50;
    },
  },
  {
    id: 'rank_a',
    name: 'A-Rank Promotion',
    description: 'Reach A-Rank',
    icon: '🌟',
    category: 'Combat',
    xpReward: 300,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.level ?? 1) >= 75;
    },
  },
  {
    id: 'rank_s',
    name: 'S-Rank Promotion',
    description: 'Reach S-Rank — National Level Hunter',
    icon: '💫',
    category: 'Combat',
    xpReward: 500,
    check: () => {
      const p = db.select().from(hunterProfile).where(eq(hunterProfile.id, 1)).get();
      return (p?.level ?? 1) >= 100;
    },
  },
];

export const checkAchievements = (): Array<{ id: string; name: string }> => {
  const unlocked: Array<{ id: string; name: string }> = [];

  for (const def of ACHIEVEMENT_DEFS) {
    // Check if already unlocked
    const existing = db.select().from(achievements).where(eq(achievements.id, def.id)).get();
    if (existing?.unlockedAt) continue;

    // Check condition
    if (!def.check()) continue;

    // Upsert achievement as unlocked
    const now = Date.now();
    if (existing) {
      db.update(achievements)
        .set({ unlockedAt: now })
        .where(eq(achievements.id, def.id))
        .run();
    } else {
      db.insert(achievements)
        .values({
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          xpReward: def.xpReward,
          unlockedAt: now,
        })
        .run();
    }

    // Award achievement XP
    awardXP(def.xpReward, 'ACHIEVEMENT', undefined);

    unlocked.push({ id: def.id, name: def.name });
  }

  return unlocked;
};

/** Seed achievement rows (locked) so the UI can show all of them */
export const seedAchievements = (): void => {
  for (const def of ACHIEVEMENT_DEFS) {
    const existing = db.select().from(achievements).where(eq(achievements.id, def.id)).get();
    if (!existing) {
      db.insert(achievements)
        .values({
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          category: def.category,
          xpReward: def.xpReward,
          unlockedAt: null,
        })
        .run();
    }
  }
};
