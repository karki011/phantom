# Phase 7: Remaining Features — All v1 Ported + Enhanced

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Dependencies:** Phases 0–6 complete (Shell, Core, Git, Smart View, AI Engine, Safety, Session Controller)

---

## Goal

Port every remaining v1 feature to the Go + Solid.js v2 stack with exact feature parity, then enhance where Go's concurrency model and Solid.js's fine-grained reactivity unlock improvements. This phase turns PhantomOS v2 from "functional dev tool" into the complete Solo Leveling–themed developer operating system.

---

## Prerequisites

- Phase 0: Wails v2 + Solid.js shell running
- Phase 1: SQLite (sqlc), terminal manager, session collectors, project detector operational
- Phase 2: Git pool with parallel status dashboard
- Phase 3: Stream parser + Smart View components rendering
- Phase 4: AI engine with tiered pipeline + model routing
- Phase 5: Safety rules engine with audit trail
- Phase 6: Session controller (pause, resume, kill, policies)
- All v1 DB tables migrated via `golang-migrate/migrate`

---

## 7a: Gamification (Hunter Stats, Achievements, Quests, Journal, XP, Leveling, CodeBurn Cockpit)

### Goal

Full Solo Leveling gamification system: XP engine, leveling curve, hunter stats (STR/INT/AGI/VIT/PER/SEN), achievements, daily quests, developer journal with AI-generated briefs, and CodeBurn cockpit dashboard.

### Tasks

**Go Backend:**

1. **`internal/gamification/xp.go`** — Port XP engine from `packages/gamification/src/xp-engine.ts`
   - `AwardXP(amount int, xpType string, sessionID string) AwardResult` — level-up loop with `levelXpRequired()` curve
   - Update `hunter_profile` table: xp, level, rank, title, xpToNext
   - Log to `activity_log` table on every award
   - All 14 XP event types: SESSION_START, TASK_COMPLETE, SPEED_TASK, SESSION_COMPLETE_BONUS, FIRST_SESSION_OF_DAY, DAILY_STREAK, LONG_SESSION, NEW_REPO, ACHIEVEMENT, DAILY_QUEST, plus reserved types

2. **`internal/gamification/achievements.go`** — Port achievement system
   - 13 achievement definitions: first_blood, shadow_army_10, shadow_monarch_100, arise_sessions_5, dungeon_master_50, explorer_3, streak_7, streak_30, rank_d, rank_c, rank_b, rank_a, rank_s
   - `CheckAchievements() []UnlockedAchievement` — scans all definitions, upserts newly unlocked
   - `SeedAchievements()` — ensures all definitions exist in DB (locked state) for UI display

3. **`internal/gamification/quests.go`** — Port daily quest system
   - Quest pool: 10 quest templates (tasks_completed x3, sessions_started x2, speed_tasks, repos_worked, long_session, perfect_session, streak_day)
   - `GenerateDailyQuests(date string)` — pick 3 random quests, insert to `daily_quests` table
   - `GetDailyQuests(date string) []Quest` — auto-generate if none exist for today
   - `UpdateDailyQuestProgress()` — recalculate progress for each quest type, award XP on completion

4. **`internal/gamification/journal.go`** — Port journal service from `services/journal-service.ts`
   - File-based storage at `~/.phantom-os/journal/YYYY-MM-DD.md`
   - Sections: Morning Brief, Work Log, End of Day, Notes
   - Frontmatter parser/serializer for metadata (morningGeneratedAt, eodGeneratedAt)
   - CRUD: `GetEntry`, `SetMorningBrief` (immutable once set), `SetEndOfDay` (immutable), `AppendWorkLog`, `SetNotes`, `ListDates`

5. **`internal/gamification/journal_generator.go`** — Port from `services/journal-generator.ts`
   - `GenerateMorningBrief(projects []ProjectInfo) string` — pulls git log, session stats, hunter status, quests, achievements
   - `GenerateEndOfDay(projects []ProjectInfo) string` — aggregates commits, PRs, sessions, tasks, quest progress, XP earned
   - Executes `git log`, `gh pr list`, `gh run list` via `exec.Command` with 10s timeouts
   - Respects gamification preference toggle

6. **`internal/gamification/hunter.go`** — Port hunter profile + stats routes from `routes/hunter.ts` and `routes/hunter-stats.ts`
   - Lifecycle hooks: `OnSessionStart`, `OnSessionEnd`, `OnTaskComplete` — wired into session controller
   - Streak management: track lastActiveDate, compute current/best streak, yesterday logic
   - Stat bumps: STR (tasks), INT (sessions), AGI (speed tasks), VIT (streaks), PER (new repos), SEN (perfect clears)

7. **`internal/gamification/cockpit.go`** — Port cockpit aggregator from `services/cockpit-aggregator.ts`
   - `AggregateDashboard(period string) CockpitDashboard` — overview, daily, projects, models, activities, tools, MCP servers, shell commands
   - Period filtering: today, 7d, 30d, all (SQL WHERE clause generation)
   - Tool usage tracker: per-invocation entries + aggregate stats from `sessions.tool_breakdown` JSON column
   - Skill usage aggregation from `Skill:/` prefixed keys in tool_breakdown
   - Turn classifier integration for activity categorization

8. **`internal/gamification/cockpit_metrics.go`** — Port system metrics from `routes/system-metrics.ts`
   - CPU usage: delta-based tick calculation from `/proc/stat` (Linux) or `os.CPUs` (Go)
   - Memory: `vm_stat` parsing on macOS for available memory (free + inactive + purgeable pages), `/proc/meminfo` on Linux
   - Swap: `sysctl vm.swapusage` (macOS) / `/proc/meminfo` (Linux)
   - Top processes: `ps -Ao pid,rss,command` with friendly name mapping (Phantom OS, Claude Code, Arc, etc.)
   - 2-second cache to prevent rapid polling from blocking

**sqlc Queries:**

9. **`internal/db/queries/gamification.sql`** — All gamification queries
   - Hunter profile CRUD, hunter stats CRUD
   - Achievement list/upsert, daily quest CRUD
   - Activity log insert, session aggregations for heatmap/lifetime/model-breakdown/timeline
   - Cockpit aggregation queries (overview, daily, projects, models, tool breakdown)

**Wails Bindings:**

10. **`internal/app/bindings_gamification.go`** — Expose all gamification operations
    - `GetHunterProfile`, `UpdateHunterName`
    - `GetHunterStats`, `GetLifetimeStats`, `GetHeatmapData`, `GetModelBreakdown`, `GetSessionTimeline`
    - `GetAchievements`
    - `GetDailyQuests`
    - `GetJournalEntry`, `GenerateMorningBrief`, `GenerateEndOfDay`, `AppendWorkLog`, `SetJournalNotes`, `ListJournalDates`
    - `GetCockpitDashboard`, `GetToolUsage`, `GetSkillUsage`, `GetSystemMetrics`

**Solid.js Frontend:**

11. **`frontend/src/components/hunter-stats/HunterDashboard.tsx`** — Port from `components/hunter-stats/HunterStatsView.tsx`
    - Activity heatmap (365-day grid from stats-cache.json data)
    - Lifetime stats cards (sessions, tokens, cost, streak, active days, peak hour)
    - Model breakdown chart (pie/bar by model)
    - Session timeline (scrollable, virtualized via `@tanstack/solid-virtual`)
    - Stat radar chart (STR/INT/AGI/VIT/PER/SEN)

12. **`frontend/src/components/hunter-stats/AchievementGrid.tsx`** — Port achievement display
    - Grid of achievement cards, locked/unlocked states
    - Unlock animation (Solo Leveling glow effect via `solid-motionone`)
    - Category filter tabs (Mastery, Combat, Exploration)

13. **`frontend/src/components/quest-board/QuestBoard.tsx`** — Port from `components/quest-board/`
    - 3 daily quest cards with progress bars
    - XP reward badges
    - Auto-refresh via Wails Events when quest progress updates

14. **`frontend/src/components/journal/JournalPane.tsx`** — Port from `components/JournalPane.tsx`
    - Date picker sidebar (list of dates with entries)
    - Morning Brief section (generate button, immutable display)
    - Work Log section (append-only list)
    - End of Day section (generate button, immutable display)
    - Notes section (editable textarea)

15. **`frontend/src/components/cockpit/Dashboard.tsx`** — Port from `components/cockpit/`
    - Overview stat cards (cost, calls, sessions, cache hit rate, token breakdown)
    - Daily cost chart (bar chart, last 14 days)
    - Project ranking list, model ranking list
    - Activity breakdown by category
    - Tool usage card (top 10, category filter)
    - Skill usage card (sorted by count, repo association)
    - MCP server usage
    - Period switcher (today/7d/30d/all)

16. **`frontend/src/components/cockpit/SystemMetrics.tsx`** — Port from system metrics
    - CPU gauge (real-time percentage)
    - Memory gauge (used/total with available breakdown)
    - Swap usage bar
    - Load average display
    - Top processes list (Phantom OS processes pinned at top)
    - Auto-poll via `setInterval` with 3-second cadence

17. **`frontend/src/signals/gamification.ts`** — Reactive state for all gamification data
    - Signals: hunterProfile, hunterStats, achievements, dailyQuests, journalEntry, cockpitDashboard, systemMetrics
    - Wails Event subscriptions: `gamification:xp-awarded`, `gamification:achievement-unlocked`, `gamification:quest-completed`, `gamification:level-up`

### Acceptance Criteria

- XP awards on all 14 event types, level-up works through multi-level jumps
- All 13 achievements seed and unlock correctly
- 3 daily quests auto-generate each day, progress updates in real-time
- Journal morning brief and EOD generate with git/session/gamification data, immutability enforced
- Cockpit dashboard renders all panels with correct period filtering
- System metrics show CPU/memory/swap/load/processes with 2s cache
- Heatmap shows 365-day activity grid populated from stats-cache.json
- Level-up triggers Wails Event with Solo Leveling animation in UI

### Estimated Effort

**7–9 days** (Go backend: 4–5 days, Solid.js frontend: 3–4 days)

---

## 7b: Chat with Claude (Floating Composer, Per-Worktree Context, Conversation History, Persistence)

### Goal

Direct chat with Claude via `claude -p` pipe, with floating composer UI, conversation management, graph context injection, and SQLite persistence.

### Tasks

**Go Backend:**

1. **`internal/chat/claude.go`** — Port from `routes/chat.ts`
   - `SendMessage(req ChatRequest) <-chan ChatChunk` — spawns `claude -p` with `--output-format stream-json --verbose --model <model> --no-session-persistence --dangerously-skip-permissions`
   - NDJSON stream parsing: extract `assistant` message text blocks, `result` events
   - Graph context injection: extract file paths from message, query AI engine graph for related files + blast radius
   - Caveman/concise mode toggle from user preferences
   - Multi-turn prompt building with conversation history
   - 5-minute timeout with SIGTERM
   - CWD set to worktree path for project-scoped context

2. **`internal/chat/history.go`** — Port conversation persistence
   - `ListConversations(worktreeID string, limit int) []Conversation`
   - `CreateConversation(worktreeID, title, model string) Conversation`
   - `DeleteConversation(id string)` — cascading delete of messages
   - `GetHistory(conversationID string, limit int) []Message` — chronological order
   - `SaveMessages(messages []Message)` — batch insert with conflict skip
   - Auto-title: first user message truncated to 60 chars
   - `ClearHistory(conversationID string)` or `ClearHistory(worktreeID string)`

3. **`internal/chat/upload.go`** — File upload for chat context
   - Save to temp directory (`/tmp/phantom-chat-uploads/`)
   - Return path, name, size for inclusion in prompt

**sqlc Queries:**

4. **`internal/db/queries/chat.sql`** — Chat conversation and message CRUD
   - Insert/select/delete conversations (filtered by workspaceId)
   - Insert/select/delete messages (filtered by conversationId or workspaceId)
   - Update conversation title and timestamp

**Wails Bindings:**

5. **`internal/app/bindings_chat.go`** — Chat operations
   - `ChatSend(req ChatRequest)` — returns streaming channel, bridges to WebSocket for real-time deltas
   - `ListConversations`, `CreateConversation`, `DeleteConversation`
   - `GetChatHistory`, `SaveChatMessages`, `ClearChatHistory`
   - `UploadChatFile`

**Solid.js Frontend:**

6. **`frontend/src/components/chat/ChatComposer.tsx`** — Port from `components/chat/FloatingClaudeComposer.tsx`
   - Floating overlay activated by keyboard shortcut (Cmd+Shift+C)
   - Model selector (sonnet/opus/haiku)
   - Conversation picker dropdown
   - Text input with Shift+Enter for newlines, Enter to send
   - File attachment button (drag-drop or click)
   - Streaming response display with markdown rendering
   - Graph context indicator (shows when codebase context injected)

7. **`frontend/src/components/chat/ChatHistory.tsx`** — Port from `components/chat/ChatPane.tsx`
   - Full conversation view with message bubbles (user/assistant)
   - Conversation list sidebar (per-worktree)
   - New conversation button, delete conversation
   - Scroll-to-bottom on new messages
   - Copy message button, code block syntax highlighting

8. **`frontend/src/signals/chat.ts`** — Chat reactive state
   - Signals: conversations, activeConversation, messages, isStreaming
   - Wails Event: `chat:delta` (streaming text chunks), `chat:done` (response complete)

### Acceptance Criteria

- Floating composer opens/closes with keyboard shortcut
- Messages stream in real-time via WebSocket
- Per-worktree conversation isolation works
- Graph context injection enriches prompts with codebase awareness
- Conversation auto-titling from first message
- File uploads attach to chat context
- Chat history persists across app restarts

### Estimated Effort

**4–5 days** (Go: 2–3 days, Solid.js: 2 days)

---

## 7c: MCP Server (phantom-ai: graph_context, blast_radius, orchestrator_process as MCP Tools)

### Goal

Go implementation of the MCP stdio server exposing the same 11 tools as v1, compatible with Claude's MCP protocol.

### Tasks

**Go Backend:**

1. **`internal/mcp/server.go`** — Port from `packages/server/src/mcp/server.ts`
   - MCP stdio server using `github.com/mark3labs/mcp-go` (Go MCP SDK)
   - Server info: name="phantom-os", version="2.0.0"
   - Instructions prompt injected on connect (same text as v1)
   - Tool registration with JSON Schema input validation
   - Scoped mode: when `scopedProjectId` set, auto-inject projectId (Claude doesn't need to specify)
   - Lifecycle: `StartMcpServer()`, `StopMcpServer()`, `CreateMcpServer()` (factory for custom instances)

2. **`internal/mcp/handlers.go`** — Port all 11 tool handlers from `packages/server/src/mcp/handlers.ts`
   - `HandleGraphContext(params)` — BFS traversal with relevance scores, edges, modules
   - `HandleBlastRadius(params)` — direct + transitive affected files with impact score
   - `HandleRelated(params)` — multi-file neighbor discovery
   - `HandleStats(params)` — file/edge/module counts, coverage, lastBuiltAt
   - `HandlePath(params)` — shortest dependency path between two files
   - `HandleBuild(params)` — fire-and-forget graph rebuild
   - `HandleListProjects()` — all projects with IDs and repo paths
   - `HandleOrchestratorProcess(params)` — full strategy pipeline (Direct/Advisor/Self-Refine/ToT/Debate/GoT)
   - `HandleOrchestratorStrategies(params)` — list available strategies with enabled status
   - `HandleOrchestratorHistory(params)` — past decisions with outcomes
   - `HandleTaskStatus(params)` — build lifecycle polling (idle/building/ready/error)

3. **`internal/mcp/handlers_test.go`** — Table-driven tests for all handlers
   - Mock graph engine adapter with in-memory graph
   - Mock orchestrator engine adapter
   - Test error cases: project not found, graph not built, malformed input

**Integration:**

4. Wire MCP server startup in `cmd/phantomos/main.go` — start after DB and graph engine init
5. Register in Claude's config at `~/.claude/settings.json` under `mcpServers.phantom-ai`

### Acceptance Criteria

- All 11 tools respond correctly via stdio MCP protocol
- Scoped mode auto-injects projectId
- Handler unit tests pass with >90% coverage
- Claude Code sessions can call `mcp__phantom-ai__phantom_graph_context` successfully
- Instructions appear in Claude's system prompt when connected

### Estimated Effort

**3–4 days** (Go: 2–3 days, testing: 1 day)

---

## 7d: Claude Integration (CLAUDE.md Management, PreToolUse Hooks)

### Goal

Manage project-level Claude Code configuration: inject Phantom AI instructions into CLAUDE.md files and install PreToolUse hooks that remind Claude to use phantom-ai tools.

### Tasks

**Go Backend:**

1. **`internal/claude/integration.go`** — Port from `services/claude-integration.ts`
   - `ApplyClaudeIntegration(opts ApplyOpts)` — consent-based application of MCP + instructions + hooks
   - `WriteProjectClaudeMd(projectPath string)` — append `## Phantom AI Integration` section to `~/.claude/projects/<sanitized>/CLAUDE.md`
     - Idempotent: skip if section already exists, append if file exists without it, create if file missing
   - `RemoveProjectClaudeMd(projectPath string)` — strip Phantom AI section, delete file if empty
   - `WriteProjectHooks(projectPath string)` — install PreToolUse hook in `~/.claude/projects/<sanitized>/settings.json`
     - Hook command: jq-based matcher for Edit/Write/MultiEdit/Grep/Glob/Read tools
     - Produces `<phantom-ai-reminder>` tags nudging Claude to use graph context
   - `RemoveProjectHooks(projectPath string)` — filter out phantom-ai hooks, clean empty structures

2. **`internal/claude/mcp_config.go`** — Port MCP registration from `services/mcp-config.ts`
   - `RegisterPhantomMcpGlobal()` — add phantom-ai entry to `~/.claude/settings.json` mcpServers
   - `UnregisterPhantomMcpGlobal()` — remove entry
   - `SanitizeProjectPath(path string) string` — path-to-directory-name conversion
   - `ResolveProjectIdFromCwd(cwd string) string` — match CWD to known project

**Wails Bindings:**

3. **`internal/app/bindings_claude.go`**
   - `ApplyClaudeIntegration(mcp, instructions, hooks bool, projectPath string)`
   - `GetClaudeIntegrationStatus(projectPath string) IntegrationStatus` — check what's currently installed

### Acceptance Criteria

- CLAUDE.md sections are appended/removed idempotently
- PreToolUse hooks installed in project settings.json with correct jq matcher
- MCP server registered/unregistered in global Claude settings
- Integration status accurately reflects current state

### Estimated Effort

**2 days** (Go: 1.5 days, bindings + testing: 0.5 days)

---

## 7e: Cockpit/Stats (CodeBurn Dashboard, System Metrics, CPU/Memory/Load)

> Note: Cockpit aggregator and system metrics are included in 7a (gamification) since they share the same DB queries and are tightly coupled. This section covers any remaining stats routes not covered in 7a.

### Tasks

**Go Backend:**

1. **`internal/gamification/stats.go`** — Port from `routes/stats.ts`
   - `GetDashboardStats() DashboardStats` — aggregate: active sessions, today's tasks, total sessions, total tasks, streak, achievements unlocked, total tokens, total cost, total completed tasks
   - Single binding call for sidebar/status bar quick stats

**Wails Bindings:**

2. **`internal/app/bindings_stats.go`**
   - `GetDashboardStats() DashboardStats`

**Solid.js Frontend:**

3. **`frontend/src/components/layout/StatusBar.tsx`** — Port status bar stats integration
   - Active sessions count, today's tasks, streak fire indicator
   - CPU/memory mini gauges
   - Token spend indicator

### Acceptance Criteria

- Stats endpoint returns correct aggregates
- Status bar shows live updates via Wails Events

### Estimated Effort

**1 day** (included in 7a effort)

---

## 7f: Recipes/Process Registry (Spawn Dev Servers, Test Runners, Build Commands)

### Goal

Port the process registry that manages long-running processes (dev servers, test watchers, build commands) tied to worktrees, with recipes for common project types.

### Tasks

**Go Backend:**

1. **`internal/project/registry.go`** — Port process registry from `process-registry.ts` (referenced by `routes/servers.ts`)
   - `RegisterProcess(termID, worktreeID, name, command string)` — track running processes
   - `UnregisterProcess(termID string)`
   - `GetProcesses(worktreeID string) []ProcessInfo` — list with PID, name, command, started_at
   - Process lifecycle tied to terminal PTY sessions

2. **`internal/project/recipes.go`** — Recipe definitions
   - Auto-detected recipes based on project type (from project detector):
     - Node.js: `pnpm dev`, `pnpm test:watch`, `pnpm build`
     - Python: `python -m pytest --watch`, `uvicorn app:main --reload`
     - Go: `go run .`, `go test ./...`
     - Custom: user-defined in `~/.phantom-os/config.yaml` under `recipes:`
   - `GetRecipes(projectPath string) []Recipe` — returns applicable recipes for project
   - `LaunchRecipe(recipe Recipe, worktreeID string)` — spawns PTY with recipe command

**Wails Bindings:**

3. **`internal/app/bindings_recipes.go`**
   - `GetRunningServers(worktreeID string) []ProcessInfo`
   - `StopServer(termID string)`
   - `GetRecipes(projectPath string) []Recipe`
   - `LaunchRecipe(recipeID, worktreeID string)`

**Solid.js Frontend:**

4. **`frontend/src/components/recipes/RecipeQuickLaunch.tsx`** — Port from `components/RecipeQuickLaunch.tsx`
   - Recipe grid with one-click launch buttons
   - Project type detection indicator
   - Custom recipe form modal

5. **`frontend/src/components/recipes/RunningServers.tsx`** — Port from `components/RunningServersCard.tsx`
   - List of running processes with stop button
   - Server log viewer modal (connects to terminal PTY output)
   - Status indicators (running/stopped/crashed)

### Acceptance Criteria

- Recipes auto-detected for Node.js, Python, Go projects
- Custom recipes configurable via config.yaml
- Running processes tracked and stoppable via UI
- Server logs viewable in modal

### Estimated Effort

**2–3 days** (Go: 1.5 days, Solid.js: 1–1.5 days)

---

## 7g: Plans Discovery (Scan ~/.claude/plans/ for Matching Plan Files)

### Goal

Discover Claude plan files and match them to worktrees by content analysis, showing relevant plans in the workspace UI.

### Tasks

**Go Backend:**

1. **`internal/project/plans.go`** — Port from `routes/plans.ts`
   - `ScanPlans() []CachedPlan` — read `~/.claude/plans/*.md`, parse title + preview from content, 10s cache, 48h max age
   - `GetPlansByWorktree(worktreeID string) PlanResult` — match plans to worktree by:
     - Branch-specific: worktree path or branch name found in plan content
     - Project-level: project name or repo path found in plan content
     - Session fallback: plans modified after earliest active session start
   - `GetPlansByCwd(cwd string) PlanResult` — match by CWD path lookup
   - Content matching: case-insensitive substring search, minimum 6-char term length

**Wails Bindings:**

2. **`internal/app/bindings_plans.go`**
   - `GetPlans(worktreeID string) PlanResult`
   - `GetPlansByCwd(cwd string) PlanResult`
   - `ReadPlanFile(fullPath string) string` — sandboxed to `~/.claude/plans/`

**Solid.js Frontend:**

3. **`frontend/src/components/plans/PlansCard.tsx`** — Port from `components/PlansCard.tsx`
   - Collapsible card showing branch-specific and project-level plans
   - Plan title, preview, modification time
   - Click to open plan content in editor or read-only modal

### Acceptance Criteria

- Plans discovered from `~/.claude/plans/` within 48h window
- Branch-specific plans ranked above project-level plans
- Session fallback catches recently-modified plans during active work
- Plan content readable from UI

### Estimated Effort

**1–2 days** (Go: 1 day, Solid.js: 0.5–1 day)

---

## 7h: Claude Slash-Command Discovery (Cmd+K Palette Integration)

### Goal

Discover all Claude CLI slash commands (skills, user commands, project commands) and integrate them into the command palette for quick invocation.

### Tasks

**Go Backend:**

1. **`internal/claude/commands.go`** — Port from `routes/claude-commands.ts`
   - `ScanSkillsDir(root string) []SlashCommand` — walk `~/.claude/skills/<name>/SKILL.md` directories
   - `ScanCommandsDir(root string, source string) []SlashCommand` — walk `~/.claude/commands/**/*.md`, nested dirs become `:` prefixed names
   - `ExtractDescription(filePath string) string` — frontmatter `description:` field, or first non-heading non-fence line
   - `GetSlashCommands(worktreeID string) CommandResult` — union of user skills + user commands + project commands
   - Scope precedence: project > user > skill (closest scope wins)
   - 30-second in-memory cache per worktree, invalidated on explicit refresh

**Wails Bindings:**

2. **`internal/app/bindings_claude.go`** (extend from 7d)
   - `GetSlashCommands(worktreeID string) CommandResult`

**Solid.js Frontend:**

3. **`frontend/src/components/layout/CommandPalette.tsx`** — Extend from Phase 0/1 shell
   - Cmd+K opens palette
   - Slash command section: all discovered commands with name, description, source badge
   - Fuzzy search filtering
   - Enter to insert command into active terminal or chat composer
   - Recent commands at top

### Acceptance Criteria

- All skill, user-command, and project-command markdown files discovered
- Descriptions extracted from frontmatter or first content line
- Command palette shows slash commands with source attribution
- Fuzzy search works across all commands
- 30s cache prevents filesystem thrashing on rapid keystroke

### Estimated Effort

**1–2 days** (Go: 0.5–1 day, Solid.js: 0.5–1 day)

---

## 7i: Onboarding Flow (Boot Terminal Animation, Multi-Phase Setup, Audio)

### Goal

First-launch experience with Solo Leveling–themed boot animation, multi-phase setup wizard, and optional audio cues.

### Tasks

**Go Backend:**

1. **`internal/app/onboarding.go`** — Onboarding state management
   - `GetOnboardingState() OnboardingState` — check if onboarding completed (stored in `user_preferences`)
   - `CompleteOnboardingPhase(phase int)` — mark phase done
   - `CompleteOnboarding()` — mark entire onboarding done
   - Phases:
     1. System detection (OS, shell, Claude CLI version, git version)
     2. Project import (scan for repos, select projects to track)
     3. Gamification setup (hunter name, enable/disable gamification)
     4. Claude integration consent (MCP, CLAUDE.md, hooks — calls 7d)
     5. Theme selection
   - `DetectSystem() SystemInfo` — gather OS, shell, Claude CLI path/version, git version, Node version

**Solid.js Frontend:**

2. **`frontend/src/components/onboarding/OnboardingFlow.tsx`** — Port from `components/onboarding/OnboardingFlow.tsx`
   - Phase stepper with progress indicator
   - Each phase as a separate component with forward/back navigation
   - Skip button for optional phases
   - Final "System Online" confirmation

3. **`frontend/src/components/onboarding/BootTerminal.tsx`** — Port from `components/onboarding/BootTerminal.tsx`
   - Typewriter effect boot sequence animation
   - ASCII art PhantomOS logo
   - System detection output (displaying detected values)
   - Solo Leveling theme colors (purple/cyan glow)
   - `solid-motionone` for entrance animations

4. **`frontend/src/components/onboarding/phases/`** — Individual phase components
   - `SystemDetect.tsx` — shows detected system info, validates requirements
   - `ProjectImport.tsx` — file picker or auto-detect repos, multi-select
   - `GamificationSetup.tsx` — hunter name input, gamification toggle
   - `ClaudeIntegration.tsx` — consent checkboxes for MCP/instructions/hooks
   - `ThemeSelect.tsx` — theme preview cards

5. **`frontend/src/hooks/useBootAudio.ts`** — Port from `components/onboarding/useBootAudio.ts`
   - Optional audio cue on boot complete
   - Volume control, mute toggle
   - Audio file bundled in `frontend/public/audio/`

### Acceptance Criteria

- First launch shows onboarding, subsequent launches skip to main app
- Boot terminal animation renders typewriter effect with system info
- All 5 phases complete successfully and persist state
- Claude integration phase correctly calls 7d ApplyClaudeIntegration
- Audio plays on boot complete (when enabled)

### Estimated Effort

**2–3 days** (Go: 0.5 days, Solid.js: 2–2.5 days)

---

## 7j: Shutdown Ceremony (Graceful Shutdown with Animation)

### Goal

Clean shutdown flow that saves state, stops processes, and shows a brief Solo Leveling–themed exit animation.

### Tasks

**Go Backend:**

1. **`internal/app/shutdown.go`** — Graceful shutdown coordinator
   - `Shutdown(ctx context.Context)` — orchestrated shutdown sequence:
     1. Emit `app:shutting-down` Wails Event (triggers UI animation)
     2. Stop all terminal PTY sessions (SIGHUP)
     3. Stop MCP server
     4. Flush pending DB writes
     5. Close SQLite connection
     6. Cancel all goroutine contexts
   - 5-second timeout — force-kill any remaining goroutines

**Solid.js Frontend:**

2. **`frontend/src/components/system/ShutdownCeremony.tsx`**
   - Subscribe to `app:shutting-down` event
   - Full-screen overlay with fade-out animation
   - "System Offline" text with Solo Leveling styling
   - 1-2 second animation before app window closes

### Acceptance Criteria

- All processes cleanly terminated on shutdown
- DB flushed and closed without corruption
- Animation displays before window closes
- Forced shutdown within 5 seconds if graceful fails

### Estimated Effort

**1 day** (Go: 0.5 days, Solid.js: 0.5 days)

---

## 7k: File Explorer (Gitignore-Aware File Tree with CRUD and Search)

### Goal

Full file explorer with gitignore-aware filtering, CRUD operations, git status integration, and recursive search.

### Tasks

**Go Backend:**

1. **`internal/project/files.go`** — Port from `routes/worktree-files.ts`
   - `ListDirectory(worktreeID, relativePath string) []FileEntry` — gitignore-aware directory listing
     - Uses `go-gitignore` or equivalent for `.gitignore` rule matching
     - Returns: name, relativePath, isDirectory, size, mtime, gitignored flag
     - Sort: directories first, then alphabetical
     - Path sandboxing: resolved path must be within worktree root (prevent traversal)
   - `SearchFiles(worktreeID, query string, limit int) []FileEntry` — recursive filename search
     - Skip dirs: `.git`, `node_modules`, `.next`, `dist`, `.turbo`, `.cache`, `__pycache__`, `.venv`
     - Case-insensitive substring match
     - Configurable limit (default 50, max 200)
   - `ReadFile(worktreeID, relativePath string) (string, int64)` — content + mtime, max 10MB
   - `WriteFile(worktreeID, relativePath string, content string)` — create/overwrite with parent mkdir
   - `DeleteFile(worktreeID, relativePath string)` — recursive delete, cannot delete worktree root
   - `MakeDirectory(worktreeID, relativePath string)`
   - `GetGitStatus(worktreeID string) GitStatusResult` — `git status --porcelain` parsing (staged/unstaged/untracked)
   - `GetGitDiff(worktreeID, filePath string) DiffResult` — HEAD vs working copy

2. **`internal/project/files_generic.go`** — Generic file read/write for non-worktree paths
   - Sandboxed to allowed directories: `~/.claude/plans/`, `~/.phantom-os/`
   - `ReadGenericFile(path string) (string, int64)`
   - `WriteGenericFile(path, content string)`

**Wails Bindings:**

3. **`internal/app/bindings_files.go`**
   - `ListFiles(worktreeID, path string) []FileEntry`
   - `SearchFiles(worktreeID, query string, limit int) []FileEntry`
   - `ReadFile(worktreeID, path string) FileContent`
   - `WriteFile(worktreeID, path, content string)`
   - `DeleteFile(worktreeID, path string)`
   - `MakeDirectory(worktreeID, path string)`
   - `GetGitStatus(worktreeID string) GitStatusResult`
   - `GetGitDiff(worktreeID, filePath string) DiffResult`
   - `ReadGenericFile(path string) FileContent`
   - `WriteGenericFile(path, content string)`

**Solid.js Frontend:**

4. **`frontend/src/components/sidebar/FileExplorer.tsx`** — Port from v1 equivalent
   - Tree view with expand/collapse (lazy-loaded children)
   - Gitignored files shown dimmed (toggle visibility)
   - Git status indicators on changed files (M/A/D/? badges)
   - Right-click context menu: new file, new folder, rename, delete, copy path
   - Inline rename (double-click)
   - Drag-drop move (v2.x enhancement — defer for now)

5. **`frontend/src/components/sidebar/FileSearch.tsx`**
   - Search input with debounced query (300ms)
   - Result list with file path highlighting
   - Click to open in editor pane

### Acceptance Criteria

- File tree renders with correct gitignore filtering
- CRUD operations work with proper path sandboxing (no traversal attacks)
- Git status badges show on changed files
- Search returns results within 300ms for typical repos
- 10MB file size guard enforced on reads

### Estimated Effort

**3–4 days** (Go: 2 days, Solid.js: 1.5–2 days)

---

## 7l: Enrichment Queue (Prioritized Graph Builds for Multiple Projects)

### Goal

Background graph build queue that processes multiple projects with priority ordering, preventing concurrent builds from overwhelming system resources.

### Tasks

**Go Backend:**

1. **`internal/project/enrichment.go`** — Port enrichment queue concept
   - `EnrichmentQueue` struct with priority queue (heap-based)
   - Priority levels: HIGH (active worktree), MEDIUM (recently used project), LOW (background discovery)
   - `Enqueue(projectID string, priority int)` — deduplicate by projectID, upgrade priority if higher
   - `Start(ctx context.Context)` — background goroutine processing queue items serially
   - Concurrency limit: 1 active build at a time (graph builds are CPU-intensive)
   - Progress reporting via Wails Events: `enrichment:started`, `enrichment:progress`, `enrichment:completed`, `enrichment:error`
   - Auto-enqueue: when project detector finds a new project, enqueue at LOW
   - Re-enqueue: when major git changes detected (new branch, large commit), enqueue at MEDIUM

**Wails Bindings:**

2. **`internal/app/bindings_enrichment.go`**
   - `GetEnrichmentQueue() []QueueItem` — current queue with status
   - `EnqueueProject(projectID string, priority int)`
   - `CancelEnrichment(projectID string)`

**Solid.js Frontend:**

3. **`frontend/src/components/system/EnrichmentWidget.tsx`** — Port from `components/EnrichmentWidget.tsx`
   - Queue status indicator in status bar (building/idle/queued count)
   - Expandable panel showing queue items with priority and status
   - Cancel button per item
   - Progress bar for active build

### Acceptance Criteria

- Queue processes builds serially with correct priority ordering
- Priority upgrades work (LOW item bumped to HIGH when worktree activated)
- Progress events stream to UI in real-time
- Cancel stops active build gracefully
- New project discovery auto-enqueues at LOW priority

### Estimated Effort

**2 days** (Go: 1.5 days, Solid.js: 0.5 days)

---

## Cross-Cutting Concerns

### Database Migrations

**`internal/db/migrations/007_gamification_tables.sql`** — Ensure all tables exist:
- `hunter_profile` (id, name, level, xp, xpToNext, rank, title, streakCurrent, streakBest, lastActiveDate, totalSessions, totalTasks, totalRepos)
- `hunter_stats` (id, strength, intelligence, agility, vitality, perception, sense)
- `achievements` (id, name, description, icon, category, xpReward, unlockedAt)
- `daily_quests` (id, date, questType, label, target, progress, completed, xpReward)
- `activity_log` (id, timestamp, type, sessionId, xpEarned, metadata)
- `chat_conversations` (id, workspaceId, title, model, createdAt, updatedAt)
- `chat_messages` (id, conversationId, workspaceId, role, content, model, createdAt)
- `user_preferences` (key, value)

Column names preserved exactly from v1 for migration compatibility.

### Wails Events (Go → Solid.js Push)

| Event | Payload | Source |
|-------|---------|--------|
| `gamification:xp-awarded` | `{amount, type, leveledUp, newLevel, newRank}` | 7a |
| `gamification:achievement-unlocked` | `{id, name, icon, xpReward}` | 7a |
| `gamification:quest-completed` | `{questId, label, xpReward}` | 7a |
| `gamification:level-up` | `{level, rank, title}` | 7a |
| `chat:delta` | `{conversationId, content}` | 7b |
| `chat:done` | `{conversationId, fullText}` | 7b |
| `enrichment:started` | `{projectId}` | 7l |
| `enrichment:progress` | `{projectId, percent, stage}` | 7l |
| `enrichment:completed` | `{projectId, durationMs}` | 7l |
| `enrichment:error` | `{projectId, error}` | 7l |
| `app:shutting-down` | `{}` | 7j |

### Testing Strategy

- **Go:** Table-driven tests for all service functions. Mock DB via in-memory SQLite. >80% coverage on gamification engine and MCP handlers.
- **Solid.js:** Component tests via `@solidjs/testing-library` + `vitest`. Test signal reactivity, event handling, UI state transitions.
- **Integration:** End-to-end smoke tests: onboarding flow completes, gamification awards XP on session start, chat streams response, MCP tools return valid JSON.

### Error Handling

- All Go errors wrapped with context: `fmt.Errorf("gamification.AwardXP: %w", err)`
- Gamification failures (XP, achievements, quests) are non-fatal: logged but never block session operations
- Chat subprocess failures return typed error event to UI
- MCP handler errors return `isError: true` with message

---

## Implementation Order

| Order | Sub-phase | Reason |
|-------|-----------|--------|
| 1 | 7a: Gamification | Largest scope, provides data for 7e (cockpit) and 7i (onboarding) |
| 2 | 7k: File Explorer | Core utility used by many other features |
| 3 | 7b: Chat | Independent, high user value |
| 4 | 7c: MCP Server | Depends on AI engine (Phase 4), enables 7d |
| 5 | 7d: Claude Integration | Depends on 7c (MCP), enables 7i (onboarding Phase 4) |
| 6 | 7f: Recipes | Independent, moderate complexity |
| 7 | 7g: Plans Discovery | Independent, low complexity |
| 8 | 7h: Slash Commands | Independent, low complexity |
| 9 | 7l: Enrichment Queue | Depends on AI engine graph builder |
| 10 | 7i: Onboarding | Depends on 7d (Claude integration), 7a (gamification) |
| 11 | 7j: Shutdown | Depends on all services being registered |
| 12 | 7e: Cockpit/Stats | Mostly covered in 7a, finalize any remaining pieces |

---

## Estimated Total Effort

| Sub-phase | Go Backend | Solid.js Frontend | Total |
|-----------|-----------|-------------------|-------|
| 7a: Gamification | 4–5 days | 3–4 days | 7–9 days |
| 7b: Chat | 2–3 days | 2 days | 4–5 days |
| 7c: MCP Server | 2–3 days | — | 2–4 days |
| 7d: Claude Integration | 1.5 days | — | 2 days |
| 7e: Cockpit/Stats | (included in 7a) | (included in 7a) | 1 day |
| 7f: Recipes | 1.5 days | 1–1.5 days | 2–3 days |
| 7g: Plans | 1 day | 0.5–1 day | 1–2 days |
| 7h: Slash Commands | 0.5–1 day | 0.5–1 day | 1–2 days |
| 7i: Onboarding | 0.5 days | 2–2.5 days | 2–3 days |
| 7j: Shutdown | 0.5 days | 0.5 days | 1 day |
| 7k: File Explorer | 2 days | 1.5–2 days | 3–4 days |
| 7l: Enrichment Queue | 1.5 days | 0.5 days | 2 days |
| **Total** | **17–22 days** | **12–16 days** | **28–38 days (~6–8 weeks)** |

---

**Author:** Subash Karki
