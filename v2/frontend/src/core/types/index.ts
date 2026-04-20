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
  repo_path: string;
  name: string | null;
  detected_at: number | null;
}

export interface ProjectProfile {
  name: string;
  repo_path: string;
  language: string | null;
  framework: string | null;
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
