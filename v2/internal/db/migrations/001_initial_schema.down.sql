-- 001_initial_schema.down.sql
-- Drop all tables in reverse dependency order
-- Author: Subash Karki

-- Drop indexes first
DROP INDEX IF EXISTS idx_session_events_timestamp;
DROP INDEX IF EXISTS idx_session_events_session;
DROP INDEX IF EXISTS idx_graph_edges_target;
DROP INDEX IF EXISTS idx_graph_edges_source;
DROP INDEX IF EXISTS idx_graph_edges_project;
DROP INDEX IF EXISTS idx_graph_nodes_project;
DROP INDEX IF EXISTS idx_workspaces_project_id;
DROP INDEX IF EXISTS idx_activity_log_session;
DROP INDEX IF EXISTS idx_activity_log_timestamp;
DROP INDEX IF EXISTS idx_tasks_status;
DROP INDEX IF EXISTS idx_tasks_session_id;
DROP INDEX IF EXISTS idx_sessions_started_at;
DROP INDEX IF EXISTS idx_sessions_status;

-- v2-only tables
DROP TABLE IF EXISTS session_policies;
DROP TABLE IF EXISTS session_events;

-- Graph tables (edges before nodes due to FK)
DROP TABLE IF EXISTS graph_meta;
DROP TABLE IF EXISTS graph_edges;
DROP TABLE IF EXISTS graph_nodes;

-- User data
DROP TABLE IF EXISTS user_preferences;

-- Terminal/pane
DROP TABLE IF EXISTS terminal_sessions;
DROP TABLE IF EXISTS pane_states;

-- Chat
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_conversations;

-- Workspaces (depend on projects, sections)
DROP TABLE IF EXISTS workspaces;
DROP TABLE IF EXISTS workspace_sections;
DROP TABLE IF EXISTS projects;

-- Activity
DROP TABLE IF EXISTS activity_log;

-- Gamification
DROP TABLE IF EXISTS daily_quests;
DROP TABLE IF EXISTS achievements;
DROP TABLE IF EXISTS hunter_stats;
DROP TABLE IF EXISTS hunter_profile;

-- Tasks depend on sessions
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS sessions;
