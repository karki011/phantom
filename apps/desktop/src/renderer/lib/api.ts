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

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

export const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3849' : '';

// Make available globally for packages (terminal, etc.) that can't import from here
(window as any).__PHANTOM_API_BASE = API_BASE;

const BASE_URL = API_BASE;

// ---------------------------------------------------------------------------
// Request dedup + TTL cache
// Only applies to GET requests (or requests with no body).
// POST/PUT/DELETE always go through fresh.
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/** In-flight GET request map — deduplicates concurrent requests to the same URL */
const inflight = new Map<string, Promise<unknown>>();

/** TTL cache for GET responses — avoids redundant requests within the cache window */
const cache = new Map<string, CacheEntry>();

/** Default TTL per path prefix (ms). More specific prefixes match first. */
const TTL_MAP: [string, number][] = [
  ['/api/hunter', 30_000],
  ['/api/projects', 5_000],   // Branches change frequently — keep short
  ['/api/worktrees', 30_000],
  ['/api/sessions', 10_000],
  ['/api/achievements', 60_000],
  ['/api/quests', 30_000],
];

/** Default TTL for paths not in the map */
const DEFAULT_TTL = 5_000;

function getTTL(path: string): number {
  for (const [prefix, ttl] of TTL_MAP) {
    if (path.startsWith(prefix)) return ttl;
  }
  return DEFAULT_TTL;
}

/** Invalidate cached responses for paths matching the given prefix */
export const invalidateCache = (pathPrefix?: string): void => {
  if (!pathPrefix) {
    cache.clear();
    return;
  }
  const prefix = `${BASE_URL}${pathPrefix}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
};

// Sweep expired cache entries every 60s to prevent unbounded Map growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// Generic fetch wrapper
// ---------------------------------------------------------------------------

export const fetchApi = async <T>(
  path: string,
  options?: RequestInit,
): Promise<T> => {
  const url = `${BASE_URL}${path}`;
  const method = (options?.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET' && !options?.body;

  // Check TTL cache for GET requests
  if (isGet) {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }

    // Deduplicate in-flight GET requests
    const existing = inflight.get(url);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const request = (async () => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = body?.error || response.statusText;
      throw new Error(detail);
    }

    const data = await response.json();

    // Cache GET responses
    if (isGet) {
      cache.set(url, { data, expiresAt: Date.now() + getTTL(path) });
    }

    // Invalidate related cache entries after mutations
    if (!isGet) {
      const parts = path.split('/');
      // Assumes all API resources are at the 3rd path segment (e.g., /api/worktrees)
      const basePath = parts.slice(0, 3).join('/');
      invalidateCache(basePath);
    }

    return data as T;
  })();

  // Track in-flight GET requests
  if (isGet) {
    inflight.set(url, request);
    request.finally(() => inflight.delete(url));
  }

  return request;
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
// Projects & Worktrees
// ---------------------------------------------------------------------------

export interface ProjectData {
  id: string;
  repoPath: string;
  name: string;
  defaultBranch: string;
  worktreeBaseDir: string;
  color: string | null;
  starred: number;
  createdAt: number;
}

export interface WorktreeData {
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
  ticketUrl?: string | null;
}

export interface FileEntry {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
  gitignored?: boolean;
}

export interface DirectoryListing {
  entries: FileEntry[];
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

export const getWorktrees = (projectId?: string): Promise<WorktreeData[]> =>
  fetchApi<WorktreeData[]>(
    `/api/worktrees${projectId ? `?projectId=${projectId}` : ''}`,
  );

export const createWorktree = (data: {
  projectId: string;
  name?: string;
  branch?: string;
  baseBranch?: string;
  ticketUrl?: string;
}): Promise<WorktreeData> =>
  fetchApi<WorktreeData>('/api/worktrees', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateWorktree = (
  id: string,
  data: Partial<{ name: string; branch: string }>,
): Promise<WorktreeData> =>
  fetchApi<WorktreeData>(`/api/worktrees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteWorktree = (id: string): Promise<{ ok: boolean; killedPaneIds?: string[] }> =>
  fetchApi<{ ok: boolean; killedPaneIds?: string[] }>(`/api/worktrees/${id}`, { method: 'DELETE' });

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

export const toggleProjectStar = (id: string): Promise<ProjectData> =>
  fetchApi<ProjectData>(`/api/projects/${id}/star`, { method: 'POST' });

export interface OpenRepositoryResult {
  project: ProjectData;
  worktree: WorktreeData;
}

export const openRepository = (repoPath: string): Promise<OpenRepositoryResult> =>
  fetchApi<OpenRepositoryResult>('/api/projects/open', {
    method: 'POST',
    body: JSON.stringify({ repoPath }),
  });

export interface ScannedRepo {
  path: string;
  name: string;
  alreadyAdded: boolean;
}

export interface ScanResult {
  repos: ScannedRepo[];
}

export const scanDirectory = (directory: string, maxDepth?: number): Promise<ScanResult> =>
  fetchApi<ScanResult>('/api/projects/scan', {
    method: 'POST',
    body: JSON.stringify({ directory, maxDepth }),
  });

export interface BatchOpenResult {
  results: Array<{
    repoPath: string;
    project?: ProjectData;
    worktree?: WorktreeData;
    error?: string;
  }>;
}

export const batchOpenRepositories = (repoPaths: string[]): Promise<BatchOpenResult> =>
  fetchApi<BatchOpenResult>('/api/projects/batch-open', {
    method: 'POST',
    body: JSON.stringify({ repoPaths }),
  });

export interface BranchesData {
  local: string[];
  remote: string[];
  current: string;
  defaultBranch: string;
}

export const getProjectBranches = (projectId: string): Promise<BranchesData> =>
  fetchApi<BranchesData>(`/api/projects/${projectId}/branches`);

export interface CloneResult {
  project: ProjectData;
  worktree: WorktreeData;
  clonePath: string;
  alreadyExists?: boolean;
}

export const cloneRepository = (
  url: string,
  targetDir?: string,
): Promise<CloneResult> =>
  fetchApi<CloneResult>('/api/projects/clone', {
    method: 'POST',
    body: JSON.stringify({ url, targetDir }),
  });

export const checkoutBranch = (
  worktreeId: string,
  branch: string,
): Promise<WorktreeData> =>
  fetchApi<WorktreeData>(`/api/worktrees/${worktreeId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ branch }),
  });

export const createBranch = (
  worktreeId: string,
  branch: string,
  baseBranch?: string,
): Promise<WorktreeData> =>
  fetchApi<WorktreeData>(`/api/worktrees/${worktreeId}/create-branch`, {
    method: 'POST',
    body: JSON.stringify({ branch, baseBranch }),
  });

export const getDirectoryListing = (
  worktreeId: string,
  path: string,
): Promise<DirectoryListing> =>
  fetchApi<DirectoryListing>(
    `/api/worktrees/${worktreeId}/files?path=${encodeURIComponent(path)}`,
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

// ---------------------------------------------------------------------------
// Running Servers (Multi-Server Dashboard)
// ---------------------------------------------------------------------------

export interface RunningServer {
  termId: string;
  workspaceId: string;
  projectId: string;
  recipe: string;
  recipeLabel: string;
  category: string;
  port: number | null;
  pid: number | null;
  startedAt: number;
}

export const getRunningServers = (worktreeId?: string): Promise<RunningServer[]> =>
  fetchApi<RunningServer[]>(`/api/servers${worktreeId ? `?workspaceId=${worktreeId}` : ''}`);

export const stopServer = (termId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/servers/${termId}/stop`, { method: 'POST' });

// ---------------------------------------------------------------------------
// Discovered Worktrees
// ---------------------------------------------------------------------------

export interface DiscoveredWorktree {
  path: string;
  branch: string;
  commit: string;
}

export const getDiscoveredWorktrees = (projectId: string): Promise<DiscoveredWorktree[]> =>
  fetchApi<DiscoveredWorktree[]>(`/api/projects/${projectId}/worktrees`);

export const importWorktree = (
  projectId: string,
  data: { path: string; name?: string },
): Promise<WorktreeData> =>
  fetchApi<WorktreeData>(`/api/projects/${projectId}/worktrees/import`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ---------------------------------------------------------------------------
// Git Status
// ---------------------------------------------------------------------------

export interface GitFileChange {
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  path: string;
  code: string;
  staged: boolean;
}

export interface GitStatusResult {
  added: number;
  modified: number;
  deleted: number;
  untracked: number;
  ahead: number;
  behind: number;
  files: GitFileChange[];
}

export const getGitStatus = (worktreeId: string): Promise<GitStatusResult> =>
  fetchApi<GitStatusResult>(`/api/worktrees/${worktreeId}/git-status`);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskData {
  id: string;
  sessionId: string | null;
  taskNum: number | null;
  subject: string | null;
  status: string | null;
  activeForm: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export const getTasksByCwd = (cwd: string): Promise<TaskData[]> =>
  fetchApi<TaskData[]>(`/api/tasks/by-cwd?cwd=${encodeURIComponent(cwd)}`);

export const gitStage = (worktreeId: string, paths: string[]): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'stage', paths }),
  });

export const gitUnstage = (worktreeId: string, paths: string[]): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'unstage', paths }),
  });

export const gitStageAll = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'stage-all' }),
  });

export const gitCommit = (worktreeId: string, message: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'commit', message }),
  });

export const gitPush = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'push' }),
  });

export const gitPull = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'pull' }),
  });

export const gitDiscard = (worktreeId: string, paths: string[]): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'discard', paths }),
  });

export const gitClean = (worktreeId: string, paths: string[]): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'clean', paths }),
  });

export const gitDiscardAll = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'discard-all' }),
  });

export const gitUndoCommit = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'undo-commit' }),
  });

export const gitStash = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'stash' }),
  });

export const gitStashPop = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'stash-pop' }),
  });

export const gitFetch = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'fetch' }),
  });

export const gitGenerateCommitMsg = (worktreeId: string): Promise<{ ok: boolean; status: string }> =>
  fetchApi<{ ok: boolean; status: string }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'generate-commit-msg' }),
  });

export const gitCancelCommitMsg = (worktreeId: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'cancel-commit-msg' }),
  });

// ---------------------------------------------------------------------------
// Git Activity
// ---------------------------------------------------------------------------

export interface PrStatus {
  url: string;
  state: string;
  title: string;
  number: number;
  headRefName: string;
  baseRefName: string;
}

export interface CiRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  createdAt: string;
  databaseId: number;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  timeAgo: string;
  url: string | null;
}

export const gitCreatePr = (worktreeId: string): Promise<{ ok: boolean; status: string }> =>
  fetchApi<{ ok: boolean; status: string }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'create-pr' }),
  });

export const gitPrStatus = async (worktreeId: string): Promise<PrStatus | null> => {
  const res = await fetchApi<{ ok: boolean; pr: PrStatus | null }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'pr-status' }),
  });
  return res.pr;
};

export const gitCiRuns = async (worktreeId: string): Promise<CiRun[] | null> => {
  const res = await fetchApi<{ ok: boolean; runs: CiRun[] | null }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'ci-runs' }),
  });
  return res.runs;
};

export const gitRecentCommits = async (worktreeId: string, scoped?: boolean): Promise<CommitInfo[]> => {
  const res = await fetchApi<{ ok: boolean; commits: CommitInfo[] }>(`/api/worktrees/${worktreeId}/git`, {
    method: 'POST',
    body: JSON.stringify({ action: 'recent-commits', scoped }),
  });
  return res.commits;
};

// ---------------------------------------------------------------------------
// Daily Journal
// ---------------------------------------------------------------------------

export interface JournalEntry {
  date: string;
  morningBrief: string | null;
  morningGeneratedAt: number | null;
  workLog: string[];
  endOfDayRecap: string | null;
  eodGeneratedAt: number | null;
  notes: string;
}

export const getJournal = (date: string): Promise<JournalEntry> =>
  fetchApi<JournalEntry>(`/api/journal/${date}`);

export const listJournalDates = (limit = 30): Promise<string[]> =>
  fetchApi<string[]>(`/api/journal/list?limit=${limit}`);

export const generateMorningBrief = (date: string): Promise<{ ok: boolean; entry: JournalEntry }> =>
  fetchApi<{ ok: boolean; entry: JournalEntry }>(`/api/journal/${date}/generate-morning`, {
    method: 'POST',
  });

export const generateEndOfDay = (date: string): Promise<{ ok: boolean; entry: JournalEntry }> =>
  fetchApi<{ ok: boolean; entry: JournalEntry }>(`/api/journal/${date}/generate-eod`, {
    method: 'POST',
  });

export const appendJournalLog = (date: string, line: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/journal/${date}/log`, {
    method: 'POST',
    body: JSON.stringify({ line }),
  });

export const updateJournalNotes = (date: string, notes: string): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>(`/api/journal/${date}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ notes }),
  });

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export const cleanupTerminals = (): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>('/api/cleanup/terminals', { method: 'POST' });

/** Shutdown cleanup — kills PTYs + purges DB session records */
export const shutdownTerminals = (): Promise<{ ok: boolean }> =>
  fetchApi<{ ok: boolean }>('/api/cleanup/terminals/shutdown', { method: 'POST' });

// ---------------------------------------------------------------------------
// User Preferences
// ---------------------------------------------------------------------------

export const getPreferences = (): Promise<Record<string, string>> =>
  fetchApi<Record<string, string>>('/api/preferences');

export const setPreference = (key: string, value: string): Promise<Record<string, string>> =>
  fetchApi<Record<string, string>>(`/api/preferences/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function fetchGitIdentity(): Promise<{ name: string; email: string }> {
  const res = await fetch(`${API_BASE}/api/git-identity`);
  if (!res.ok) return { name: '', email: '' };
  return res.json();
}

export async function applyClaudeIntegration(opts: {
  mcp: boolean;
  instructions: boolean;
  hooks: boolean;
  projectPath: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/api/claude-integration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Claude integration failed: ${res.statusText}`);
}
