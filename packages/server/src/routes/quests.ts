/**
 * PhantomOS Quest Routes
 * @author Subash Karki
 */
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, dailyQuests } from '@phantom-os/db';

/** Quest pool — each entry defines a template for generating daily quests */
const QUEST_POOL = [
  { questType: 'tasks_completed', label: 'Complete 3 tasks', target: 3, xpReward: 25 },
  { questType: 'tasks_completed', label: 'Complete 5 tasks', target: 5, xpReward: 40 },
  { questType: 'tasks_completed', label: 'Complete 10 tasks', target: 10, xpReward: 75 },
  { questType: 'sessions_started', label: 'Start 2 sessions', target: 2, xpReward: 20 },
  { questType: 'sessions_started', label: 'Start 5 sessions', target: 5, xpReward: 50 },
  { questType: 'speed_tasks', label: 'Complete 2 tasks in under 2 minutes each', target: 2, xpReward: 30 },
  { questType: 'repos_worked', label: 'Work in 2 different repos', target: 2, xpReward: 35 },
  { questType: 'long_session', label: 'Run a session for over 1 hour', target: 1, xpReward: 30 },
  { questType: 'perfect_session', label: 'Complete a session with all tasks done', target: 1, xpReward: 40 },
  { questType: 'streak_day', label: 'Maintain your daily streak', target: 1, xpReward: 20 },
] as const;

const todayStr = (): string => new Date().toISOString().slice(0, 10);

/** Pick n random unique items from an array */
const pickRandom = <T>(arr: readonly T[], n: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};

const generateDailyQuests = (date: string): void => {
  const picks = pickRandom(QUEST_POOL, 3);

  for (let i = 0; i < picks.length; i++) {
    const quest = picks[i];
    db.insert(dailyQuests)
      .values({
        id: `${date}-${i}`,
        date,
        questType: quest.questType,
        label: quest.label,
        target: quest.target,
        progress: 0,
        completed: 0,
        xpReward: quest.xpReward,
      })
      .run();
  }
};

export const questRoutes = new Hono();

/** GET /quests/daily — Today's daily quests (generate if not exists) */
questRoutes.get('/quests/daily', (c) => {
  const today = todayStr();

  let rows = db
    .select()
    .from(dailyQuests)
    .where(eq(dailyQuests.date, today))
    .all();

  if (rows.length === 0) {
    generateDailyQuests(today);
    rows = db
      .select()
      .from(dailyQuests)
      .where(eq(dailyQuests.date, today))
      .all();
  }

  return c.json(rows);
});
