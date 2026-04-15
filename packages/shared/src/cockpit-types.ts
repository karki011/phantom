// Cockpit Dashboard types — shared between server and client

export type CockpitPeriod = 'today' | '7d' | '30d' | 'all';

export type ActivityCategory =
  | 'coding' | 'debugging' | 'feature' | 'refactoring'
  | 'testing' | 'exploration' | 'planning' | 'delegation'
  | 'git' | 'build_deploy' | 'conversation' | 'brainstorming' | 'general';

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'coding', 'debugging', 'feature', 'refactoring', 'testing',
  'exploration', 'planning', 'delegation', 'git', 'build_deploy',
  'conversation', 'brainstorming', 'general',
];

export const ACTIVITY_LABELS: Record<ActivityCategory, string> = {
  coding: 'Coding', debugging: 'Debugging', feature: 'Feature',
  refactoring: 'Refactoring', testing: 'Testing', exploration: 'Exploration',
  planning: 'Planning', delegation: 'Delegation', git: 'Git',
  build_deploy: 'Build/Deploy', conversation: 'Conversation',
  brainstorming: 'Brainstorming', general: 'General',
};

export interface CockpitOverview {
  totalCost: number;       // microdollars
  totalCalls: number;      // API call count (message_count sum)
  totalSessions: number;
  cacheHitRate: number;    // 0-1 float
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface DailyEntry {
  date: string;            // YYYY-MM-DD
  cost: number;            // microdollars
  calls: number;
  sessions: number;
}

export interface RankedEntry {
  name: string;
  cost: number;            // microdollars
  count: number;           // sessions or calls
}

export interface ActivityEntry {
  category: ActivityCategory;
  cost: number;            // microdollars
  sessions: number;
  oneShotRate: number | null; // 0-1 float, null if no edits
}

export interface CockpitDashboard {
  period: CockpitPeriod;
  overview: CockpitOverview;
  daily: DailyEntry[];
  projects: RankedEntry[];
  models: RankedEntry[];
  activities: ActivityEntry[];
  tools: RankedEntry[];
  mcpServers: RankedEntry[];
  shellCommands: RankedEntry[];
}
