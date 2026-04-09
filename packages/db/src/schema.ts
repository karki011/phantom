/**
 * PhantomOS Drizzle Schema
 * @author Subash Karki
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  pid: integer('pid'),
  cwd: text('cwd'),
  repo: text('repo'),
  name: text('name'),
  kind: text('kind'),
  model: text('model'),
  entrypoint: text('entrypoint'),
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
  status: text('status').default('active'),
  taskCount: integer('task_count').default(0),
  completedTasks: integer('completed_tasks').default(0),
  xpEarned: integer('xp_earned').default(0),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  cacheWriteTokens: integer('cache_write_tokens').default(0),
  estimatedCostMicros: integer('estimated_cost_micros').default(0),
  messageCount: integer('message_count').default(0),
  toolUseCount: integer('tool_use_count').default(0),
  firstPrompt: text('first_prompt'),
  toolBreakdown: text('tool_breakdown'),  // JSON: Record<string, number> e.g. {"Read": 61, "Write": 41, "Bash": 9}
  lastInputTokens: integer('last_input_tokens').default(0),
  contextUsedPct: integer('context_used_pct'),  // Live context %, from Claude statusline bridge
});

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  taskNum: integer('task_num'),
  subject: text('subject'),
  description: text('description'),
  crew: text('crew'),
  status: text('status').default('pending'),
  activeForm: text('active_form'),
  blocks: text('blocks'),
  blockedBy: text('blocked_by'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
  durationMs: integer('duration_ms'),
});

export const hunterProfile = sqliteTable('hunter_profile', {
  id: integer('id').primaryKey().default(1),
  name: text('name').default('Hunter'),
  level: integer('level').default(1),
  xp: integer('xp').default(0),
  xpToNext: integer('xp_to_next').default(100),
  rank: text('rank').default('E'),
  title: text('title').default('Awakened'),
  totalSessions: integer('total_sessions').default(0),
  totalTasks: integer('total_tasks').default(0),
  totalRepos: integer('total_repos').default(0),
  streakCurrent: integer('streak_current').default(0),
  streakBest: integer('streak_best').default(0),
  lastActiveDate: text('last_active_date'),
  createdAt: integer('created_at'),
});

export const hunterStats = sqliteTable('hunter_stats', {
  id: integer('id').primaryKey().default(1),
  strength: integer('strength').default(10),
  intelligence: integer('intelligence').default(10),
  agility: integer('agility').default(10),
  vitality: integer('vitality').default(10),
  perception: integer('perception').default(10),
  sense: integer('sense').default(10),
});

export const achievements = sqliteTable('achievements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  category: text('category'),
  xpReward: integer('xp_reward').default(50),
  unlockedAt: integer('unlocked_at'),
});

export const dailyQuests = sqliteTable('daily_quests', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  questType: text('quest_type').notNull(),
  label: text('label').notNull(),
  target: integer('target').notNull(),
  progress: integer('progress').default(0),
  completed: integer('completed').default(0),
  xpReward: integer('xp_reward').default(25),
});

export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(),
  type: text('type').notNull(),
  sessionId: text('session_id'),
  metadata: text('metadata'),
  xpEarned: integer('xp_earned').default(0),
});

// ---------------------------------------------------------------------------
// Workspace System
// ---------------------------------------------------------------------------

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoPath: text('repo_path').notNull().unique(),
  defaultBranch: text('default_branch').default('main'),
  worktreeBaseDir: text('worktree_base_dir'),
  color: text('color'),
  profile: text('profile'),  // JSON: ProjectProfile
  createdAt: integer('created_at').notNull(),
});

export const workspaceSections = sqliteTable('workspace_sections', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  tabOrder: integer('tab_order').default(0),
  isCollapsed: integer('is_collapsed').default(0),
  color: text('color'),
  createdAt: integer('created_at').notNull(),
});

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  type: text('type').notNull(), // 'worktree' | 'branch'
  name: text('name').notNull(),
  branch: text('branch').notNull(),
  worktreePath: text('worktree_path'),
  portBase: integer('port_base'),
  sectionId: text('section_id').references(() => workspaceSections.id),
  baseBranch: text('base_branch'),
  tabOrder: integer('tab_order').default(0),
  isActive: integer('is_active').default(0),
  createdAt: integer('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// Chat Conversations & History
// ---------------------------------------------------------------------------

export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  title: text('title').notNull(),
  model: text('model'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => chatConversations.id),
  workspaceId: text('workspace_id'),  // null = global chat (no workspace)
  role: text('role').notNull(),       // 'user' | 'assistant'
  content: text('content').notNull(),
  model: text('model'),
  createdAt: integer('created_at').notNull(),
});
