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

// ---------------------------------------------------------------------------
// Tool Usage Tracker
// ---------------------------------------------------------------------------

export type ToolCategory = 'all' | 'code' | 'search' | 'agent' | 'terminal' | 'task' | 'git' | 'mcp';

export const TOOL_CATEGORIES: { value: ToolCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'code', label: 'Code' },
  { value: 'search', label: 'Search' },
  { value: 'agent', label: 'Agent' },
  { value: 'mcp', label: 'MCP' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'task', label: 'Task' },
  { value: 'git', label: 'Git' },
];

export interface ToolUsageEntry {
  id: number;
  timestamp: number;
  type: string;          // Raw tool name (Read, Edit, Skill, Agent, mcp__server__tool)
  displayName: string;   // Human-friendly name (e.g., "phantom-ai:phantom_graph_context")
  category: string;      // code, search, agent, mcp, terminal, task, git
  detail: string;        // Human-readable detail
  sessionName: string;
  skill?: string;        // Skill name if type === 'Skill'
  agentDesc?: string;    // Agent description if type === 'Agent'
  mcpServer?: string;    // MCP server name if category === 'mcp'
  mcpTool?: string;      // MCP tool name if category === 'mcp'
}

export interface ToolUsageStats {
  total: number;
  byCategory: Record<string, number>;
  topTools: { name: string; count: number }[];
}

export interface ToolUsageResponse {
  entries: ToolUsageEntry[];
  stats: ToolUsageStats;
}
