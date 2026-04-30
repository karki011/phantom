-- 001_initial_schema.up.sql
-- Phantom - Initial schema (ported from v1 + new v2 tables)
-- Author: Subash Karki

-- sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    pid INTEGER,
    cwd TEXT,
    repo TEXT,
    name TEXT,
    kind TEXT,
    model TEXT,
    entrypoint TEXT,
    started_at INTEGER,
    ended_at INTEGER,
    status TEXT DEFAULT 'active',
    task_count INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    estimated_cost_micros INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    tool_use_count INTEGER DEFAULT 0,
    first_prompt TEXT,
    tool_breakdown TEXT,
    last_input_tokens INTEGER DEFAULT 0,
    context_used_pct INTEGER
);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    task_num INTEGER,
    subject TEXT,
    description TEXT,
    crew TEXT,
    status TEXT DEFAULT 'pending',
    active_form TEXT,
    blocks TEXT,
    blocked_by TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    duration_ms INTEGER
);

-- hunter_profile
CREATE TABLE IF NOT EXISTS hunter_profile (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'Hunter',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    xp_to_next INTEGER DEFAULT 100,
    rank TEXT DEFAULT 'E',
    title TEXT DEFAULT 'Awakened',
    total_sessions INTEGER DEFAULT 0,
    total_tasks INTEGER DEFAULT 0,
    total_repos INTEGER DEFAULT 0,
    streak_current INTEGER DEFAULT 0,
    streak_best INTEGER DEFAULT 0,
    last_active_date TEXT,
    created_at INTEGER
);

-- hunter_stats
CREATE TABLE IF NOT EXISTS hunter_stats (
    id INTEGER PRIMARY KEY DEFAULT 1,
    strength INTEGER DEFAULT 10,
    intelligence INTEGER DEFAULT 10,
    agility INTEGER DEFAULT 10,
    vitality INTEGER DEFAULT 10,
    perception INTEGER DEFAULT 10,
    sense INTEGER DEFAULT 10
);

-- achievements
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    category TEXT,
    xp_reward INTEGER DEFAULT 50,
    unlocked_at INTEGER
);

-- daily_quests
CREATE TABLE IF NOT EXISTS daily_quests (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    quest_type TEXT NOT NULL,
    label TEXT NOT NULL,
    target INTEGER NOT NULL,
    progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    xp_reward INTEGER DEFAULT 25
);

-- activity_log
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    session_id TEXT,
    metadata TEXT,
    xp_earned INTEGER DEFAULT 0
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT NOT NULL UNIQUE,
    default_branch TEXT DEFAULT 'main',
    worktree_base_dir TEXT,
    color TEXT,
    profile TEXT,
    starred INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- workspace_sections
CREATE TABLE IF NOT EXISTS workspace_sections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name TEXT NOT NULL,
    tab_order INTEGER DEFAULT 0,
    is_collapsed INTEGER DEFAULT 0,
    color TEXT,
    created_at INTEGER NOT NULL
);

-- workspaces (worktrees in v1)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT,
    port_base INTEGER,
    section_id TEXT REFERENCES workspace_sections(id),
    base_branch TEXT,
    tab_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 0,
    ticket_url TEXT,
    created_at INTEGER NOT NULL
);

-- chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    title TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES chat_conversations(id),
    workspace_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL
);

-- pane_states
CREATE TABLE IF NOT EXISTS pane_states (
    worktree_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- terminal_sessions
CREATE TABLE IF NOT EXISTS terminal_sessions (
    pane_id TEXT PRIMARY KEY,
    worktree_id TEXT,
    shell TEXT,
    cwd TEXT,
    env TEXT,
    cols INTEGER,
    rows INTEGER,
    scrollback TEXT,
    status TEXT DEFAULT 'active',
    started_at INTEGER,
    last_active_at INTEGER,
    ended_at INTEGER
);

-- user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- graph_nodes
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    type TEXT NOT NULL,
    path TEXT,
    name TEXT,
    content_hash TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- graph_edges
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    source_id TEXT NOT NULL REFERENCES graph_nodes(id),
    target_id TEXT NOT NULL REFERENCES graph_nodes(id),
    type TEXT NOT NULL,
    weight INTEGER DEFAULT 1,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- graph_meta
CREATE TABLE IF NOT EXISTS graph_meta (
    project_id TEXT PRIMARY KEY REFERENCES projects(id),
    last_built_at INTEGER,
    last_updated_at INTEGER,
    file_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    layer2_count INTEGER DEFAULT 0,
    coverage INTEGER DEFAULT 0
);

-- v2-only tables
CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    type TEXT NOT NULL,
    data TEXT,
    timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_policies (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id),
    policy TEXT NOT NULL DEFAULT 'supervised',
    updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_session ON activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_session_events_timestamp ON session_events(timestamp);
