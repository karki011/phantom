/**
 * PhantomOS API Client
 * Typed fetch wrapper for the PhantomOS backend
 *
 * @author Subash Karki
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HunterProfile {
  id: number;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  rank: string;
  title: string;
  totalSessions: number;
  totalTasks: number;
  totalRepos: number;
  streakCurrent: number;
  streakBest: number;
  lastActiveDate: string | null;
}

export interface HunterStats {
  strength: number;
  intelligence: number;
  agility: number;
  vitality: number;
  perception: number;
  sense: number;
}

export interface HunterData {
  profile: HunterProfile;
  stats: HunterStats;
}

export interface SessionData {
  id: string;
  pid: number | null;
  cwd: string | null;
  repo: string | null;
  name: string | null;
  kind: string | null;
  startedAt: number;
  endedAt: number | null;
  status: string;
  taskCount: number;
  completedTasks: number;
  xpEarned: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostMicros: number;
  lastInputTokens: number;
  contextUsedPct: number | null;
  messageCount: number;
  toolUseCount: number;
  firstPrompt: string | null;
  toolBreakdown: string | null;  // JSON string of Record<string, number>
  tasks?: TaskData[];
}

export interface TaskData {
  id: string;
  sessionId: string;
  taskNum: number;
  subject: string;
  description: string;
  crew: string | null;
  status: string;
  activeForm: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xpReward: number;
  unlockedAt: number | null;
}

export interface DailyQuestData {
  id: string;
  date: string;
  questType: string;
  label: string;
  target: number;
  progress: number;
  completed: number;
  xpReward: number;
}

export interface DashboardStats {
  activeSessions: number;
  todayTasks: number;
  totalSessions: number;
  totalTasks: number;
  streak: number;
  achievementsUnlocked: number;
  totalTokens: number;
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const BASE_URL = '';

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export const fetchApi = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

// ---------------------------------------------------------------------------
// Typed endpoint functions
// ---------------------------------------------------------------------------

export const getHunter = (): Promise<HunterData> =>
  fetchApi<HunterData>('/api/hunter');

export const getSessions = (
  params?: { status?: string; limit?: number },
): Promise<SessionData[]> => {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return fetchApi<SessionData[]>(`/api/sessions${qs ? `?${qs}` : ''}`);
};

export const getActiveSessions = (): Promise<SessionData[]> =>
  fetchApi<SessionData[]>('/api/sessions?status=active');

export const getSessionTasks = (sessionId: string): Promise<TaskData[]> =>
  fetchApi<TaskData[]>(`/api/sessions/${sessionId}/tasks`);

export const getAchievements = (): Promise<AchievementData[]> =>
  fetchApi<AchievementData[]>('/api/achievements');

export const getDailyQuests = (): Promise<DailyQuestData[]> =>
  fetchApi<DailyQuestData[]>('/api/quests/daily');

export const getStats = (): Promise<DashboardStats> =>
  fetchApi<DashboardStats>('/api/stats');

export const updateHunterName = (name: string): Promise<void> =>
  fetchApi<void>('/api/hunter/name', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

// ---------------------------------------------------------------------------
// Session messages (on-demand JSONL viewer)
// ---------------------------------------------------------------------------

export interface MessageData {
  role: string;
  content: string;
  timestamp: string;
  toolUse?: { name: string }[];
}

export const getSessionMessages = async (
  sessionId: string,
  limit = 100,
): Promise<MessageData[]> => {
  const data = await fetchApi<{ messages: MessageData[] }>(
    `/api/sessions/${sessionId}/messages?limit=${limit}`,
  );
  return data.messages;
};
