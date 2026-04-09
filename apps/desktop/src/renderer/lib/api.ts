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
  model: string | null;
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

export const stopSession = (id: string): Promise<{ ok: boolean; id: string }> =>
  fetchApi<{ ok: boolean; id: string }>(`/api/sessions/${id}/stop`, { method: 'POST' });

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

// ---------------------------------------------------------------------------
// Projects & Workspaces
// ---------------------------------------------------------------------------

export interface ProjectData {
  id: string;
  repoPath: string;
  name: string;
  defaultBranch: string;
  worktreeBaseDir: string;
  color: string | null;
  createdAt: number;
}

export interface WorkspaceData {
  id: string;
  projectId: string;
  type: string;
  name: string;
  branch: string;
  baseBranch?: string | null;
  worktreePath: string | null;
  portBase: number | null;
  sectionId: string | null;
  tabOrder: number;
  isActive: number;
  createdAt: number;
  worktreeValid: boolean;
}

export interface FileEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

export interface DirectoryListing {
  entries: FileEntry[];
}

export interface FileContent {
  content: string;
  mtime: number;
}

export const getProjects = (): Promise<ProjectData[]> =>
  fetchApi<ProjectData[]>('/api/projects');

export const createProject = (data: {
  repoPath: string;
  name?: string;
}): Promise<ProjectData> =>
  fetchApi<ProjectData>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getWorkspaces = (projectId?: string): Promise<WorkspaceData[]> =>
  fetchApi<WorkspaceData[]>(
    `/api/workspaces${projectId ? `?projectId=${projectId}` : ''}`,
  );

export const createWorkspace = (data: {
  projectId: string;
  name?: string;
  branch?: string;
  baseBranch?: string;
}): Promise<WorkspaceData> =>
  fetchApi<WorkspaceData>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateWorkspace = (
  id: string,
  data: Partial<{ name: string; branch: string }>,
): Promise<WorkspaceData> =>
  fetchApi<WorkspaceData>(`/api/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteWorkspace = (id: string): Promise<void> =>
  fetchApi<void>(`/api/workspaces/${id}`, { method: 'DELETE' });

export const deleteProject = (id: string, deleteWorktrees = false): Promise<void> =>
  fetchApi<void>(`/api/projects/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ deleteWorktrees }),
  });

export const renameProject = (id: string, name: string): Promise<ProjectData> =>
  fetchApi<ProjectData>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

export interface OpenRepositoryResult {
  project: ProjectData;
  workspace: WorkspaceData;
}

export const openRepository = (repoPath: string): Promise<OpenRepositoryResult> =>
  fetchApi<OpenRepositoryResult>('/api/projects/open', {
    method: 'POST',
    body: JSON.stringify({ repoPath }),
  });

export interface BranchesData {
  local: string[];
  remote: string[];
  current: string;
  defaultBranch: string;
}

export const getProjectBranches = (projectId: string): Promise<BranchesData> =>
  fetchApi<BranchesData>(`/api/projects/${projectId}/branches`);

export const getDirectoryListing = (
  workspaceId: string,
  path: string,
): Promise<DirectoryListing> =>
  fetchApi<DirectoryListing>(
    `/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`,
  );

export const getFileContent = (
  workspaceId: string,
  path: string,
): Promise<FileContent> =>
  fetchApi<FileContent>(
    `/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`,
  );

// ---------------------------------------------------------------------------
// Hunter Stats Dashboard (Phase 1)
// ---------------------------------------------------------------------------

export interface HeatmapDay {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface LifetimeStats {
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  favoriteModel: string;
  longestSession: number;
  currentStreak: number;
  bestStreak: number;
  activeDays: number;
  peakHour: number;
  totalMessages: number;
  totalToolCalls: number;
}

export interface ModelBreakdownEntry {
  model: string;
  sessions: number;
  tokens: number;
  cost: number;
}

export interface TimelineSession {
  id: string;
  model: string | null;
  startedAt: number;
  endedAt: number | null;
  duration: number;
  tokens: number;
  cost: number;
  taskCount: number;
  firstPrompt: string | null;
}

export const getHeatmap = (): Promise<HeatmapDay[]> =>
  fetchApi<HeatmapDay[]>('/api/hunter-stats/heatmap');

export const getLifetimeStats = (): Promise<LifetimeStats> =>
  fetchApi<LifetimeStats>('/api/hunter-stats/lifetime');

export const getModelBreakdown = (): Promise<ModelBreakdownEntry[]> =>
  fetchApi<ModelBreakdownEntry[]>('/api/hunter-stats/model-breakdown');

export const getSessionTimeline = (limit = 50): Promise<TimelineSession[]> =>
  fetchApi<TimelineSession[]>(`/api/hunter-stats/timeline?limit=${limit}`);

// ---------------------------------------------------------------------------
// Project Intelligence
// ---------------------------------------------------------------------------

export interface Recipe {
  id: string;
  label: string;
  command: string;
  icon: string;
  category: 'setup' | 'test' | 'lint' | 'build' | 'serve' | 'deploy' | 'custom';
  description?: string;
  auto: boolean;
}

export interface ProjectProfile {
  type: 'python' | 'node' | 'monorepo' | 'infra' | 'go' | 'rust' | 'unknown';
  buildSystem: string;
  recipes: Recipe[];
  envNeeds: string[];
  detected: boolean;
  detectedAt: number;
}

export const getProjectProfile = (projectId: string): Promise<ProjectProfile> =>
  fetchApi<ProjectProfile>(`/api/projects/${projectId}/profile`);

export const detectProjectProfile = (projectId: string): Promise<ProjectProfile> =>
  fetchApi<ProjectProfile>(`/api/projects/${projectId}/detect`, { method: 'POST' });
