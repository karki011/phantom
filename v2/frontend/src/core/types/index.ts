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
