// PhantomOS v2 — TypeScript types matching Go models
// Author: Subash Karki

export interface Session {
  id: string;
  pid: number | null;
  cwd: string | null;
  repo: string | null;
  name: string | null;
  kind: string | null;
  model: string | null;
  entrypoint: string | null;
  started_at: number | null;
  ended_at: number | null;
  status: string | null;
  task_count: number | null;
  completed_tasks: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  estimated_cost_micros: number | null;
  message_count: number | null;
  tool_use_count: number | null;
  first_prompt: string | null;
  context_used_pct: number | null;
}

export interface Task {
  id: string;
  session_id: string | null;
  subject: string | null;
  status: string | null;
  crew: string | null;
  created_at: number | null;
  updated_at: number | null;
}

export interface ActivityLog {
  id: number;
  timestamp: number;
  type: string;
  session_id: string | null;
  metadata: string | null;
}

export interface Project {
  id: string;
  name: string;
  repo_path: string;
  default_branch: string | null;
  worktree_base_dir: string | null;
  color: string | null;
  profile: string | null;
  starred: number | null;
  created_at: number;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_ms: number;
  ws_port: number;
  go_version: string;
  goroutines: number;
  mem_alloc_mb: number;
}

export interface WsMessage {
  type: string;
  session_id: string;
  payload: string;
}

export interface Workspace {
  id: string;
  project_id: string;
  type: string;
  name: string;
  branch: string;
  worktree_path: string | null;
  port_base: number | null;
  section_id: string | null;
  base_branch: string | null;
  tab_order: number | null;
  is_active: number | null;
  ticket_url: string | null;
  created_at: number;
}

export interface WorktreeStatus {
  path: string;
  branch: string;
  commit: string;
  is_bare: boolean;
  ahead_by: number;
  behind_by: number;
  is_clean: boolean;
  has_conflicts: boolean;
  conflicts: string[];
  active_session?: string;
  pr_number?: number;
}

export interface RepoStatus {
  branch: string;
  ahead_by: number;
  behind_by: number;
  is_clean: boolean;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
  has_conflicts: boolean;
  conflicts: string[];
}

export interface FileStatus {
  path: string;
  status: string;
}

export interface BranchInfo {
  name: string;
  commit: string;
  upstream: string;
  ahead_by: number;
  behind_by: number;
  is_current: boolean;
  is_remote: boolean;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: number;
  subject: string;
  body: string;
  parents: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  git_status: string;
}

export interface Recipe {
  id: string;
  label: string;
  command: string;
  icon: string;
  description: string;
  category: 'setup' | 'test' | 'lint' | 'build' | 'serve' | 'deploy' | 'custom';
  auto: boolean;
}

export interface ActivityMetadata {
  icon?: string;
  detail?: string;
  file_path?: string;
  command?: string;
}

export interface PrStatus {
  number: number;
  title: string;
  state: string;
  is_draft: boolean;
  url: string;
  head_ref_name: string;
  base_ref_name: string;
  author: string;
  created_at: string;
  checks_passed: number;
  checks_failed: number;
  checks_pending: number;
  checks_total: number;
}

export interface CiRun {
  name: string;
  status: string;
  conclusion: string;
  url: string;
  bucket: string;
  workflow: string;
  description: string;
}

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: string;
  title: string;
  message: string;
}

export interface FailedStep {
  name: string;
  number: number;
  errors: string[];
}

export interface SessionState {
  session_id: string;
  state: string;
  policy: string;
  paused_at: number;
  resumed_at: number;
  event_count: number;
}

/** Per-line git blame metadata from the Go backend. */
export interface BlameLine {
  /** Full commit SHA */
  commit: string;
  /** Author name */
  author: string;
  /** Unix timestamp (seconds) */
  date: number;
  /** 1-based line number */
  line_num: number;
  /** Line content (without leading tab) */
  content: string;
}

export interface WardEvaluation {
  rule_id: string;
  rule_name: string;
  level: 'block' | 'confirm' | 'warn' | 'log';
  message: string;
  matched: boolean;
  timestamp: number;
  session_id: string;
  event_seq: number;
  tool_name: string;
  tool_input: string;
  outcome: string;
}

export interface JournalEntry {
  id: string;
  date: string | null;
  summary: string | null;
  outcome: string | null;
  files_touched: string | null;
  git_commits: number | null;
  git_lines_added: number | null;
  git_lines_removed: number | null;
  branch: string | null;
  pr_url: string | null;
  pr_status: string | null;
  model: string | null;
  repo: string | null;
  cwd: string | null;
  started_at: number | null;
  ended_at: number | null;
  status: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_micros: number | null;
  message_count: number | null;
  tool_use_count: number | null;
  first_prompt: string | null;
  tool_breakdown: string | null;
}

/** File-based daily journal entry (v2 — Morning Brief / Work Log / End of Day / Notes). */
export interface DailyJournalEntry {
  date: string;
  morning_brief: string;
  morning_generated_at: number;
  work_log: string[];
  end_of_day_recap: string;
  eod_generated_at: number;
  notes: string;
}

export interface DailyStats {
  date: string;
  project_id: string | null;
  session_count: number;
  total_duration_secs: number;
  total_cost_micros: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tool_calls: number;
  total_commits: number;
  pr_count: number;
  top_files: string | null;
}
