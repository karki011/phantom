# PhantomOS v2 — Feature Checklist

**Last Updated:** 2026-04-20

---

## Core Infrastructure

### SQLite Persistence
- [x] Database connection with WAL mode
- [x] Custom migration runner (PRAGMA user_version)
- [x] 20-table schema (v1 parity)
- [x] sqlc-generated type-safe queries
- [x] v1 database import logic
- [ ] Migration v2 (when schema changes needed)

### Terminal Manager
- [x] PTY spawning with creack/pty
- [x] Ring buffer scrollback (64KB)
- [x] Session subscribe/unsubscribe (fan-out)
- [x] Resize propagation
- [x] Graceful shutdown (SIGHUP)
- [x] Cold restore snapshots
- [x] 49 unit tests passing (race-detector clean)
- [x] Context propagation (inherits app context)
- [ ] Terminal reattach on session switch (UI wiring)

### Session Collectors
- [x] Session watcher (fsnotify on ~/.claude/sessions/)
- [x] JSONL scanner (token/cost aggregation)
- [x] Activity poller (real-time feed, 5s interval)
- [x] Task watcher (fsnotify on ~/.claude/tasks/)
- [x] Todo watcher (fsnotify on ~/.claude/todos/)
- [x] Stale session detection (PID check)
- [x] Collector registry with lifecycle management
- [x] Typed event name constants (no stringly-typed events)
- [x] Structured logging (slog)
- [x] Stale map eviction (rescanAttempts, fileOffsets)

### Project Detector
- [x] Auto-detect: Node, Python, Go, Rust, monorepo, infra
- [x] Recipe extraction: package.json, Makefile, pyproject.toml, Cargo.toml, go.mod
- [x] Package manager detection (pnpm, bun, npm, poetry, uv, pip)
- [x] Environment needs detection
- [x] Recipes tied to project level (not branch)

### Worktree Manager
- [x] Create/Remove worktrees
- [x] List worktrees (porcelain parser)
- [x] Discover worktrees from ~/.phantom-os/worktrees/
- [x] Default branch detection
- [x] Offline-safe (fetch timeout)

### Shared Utilities
- [x] Shared pricing package (internal/pricing) — deduplicated from collector + stream
- [x] Frontend format utils (utils/format.ts) — tokens, cost, time, model
- [x] NullString normalization layer (wails/bindings.ts)

---

## Git Layer (Wave A1 — Done, 10 tests)

### Goroutine Pool
- [x] Worker pool for parallel git operations
- [x] FetchAll across multiple repos
- [x] StatusAll with progress callback
- [x] Context cancellation support (break, not drain)

### Diff Engine
- [x] Changed files between refs (numstat)
- [x] Full file diff with hunk parsing
- [x] Staged changes
- [x] Working tree changes
- [ ] Rename detection

### Branch Operations
- [x] List branches with tracking info
- [x] Ahead/behind counts
- [x] Merge branch
- [x] Rebase branch
- [x] Cherry-pick
- [x] Delete branch

### Status
- [x] Enriched repo status (porcelain v2)
- [x] Conflict detection
- [x] Worktree status (branch + status + PR + cost)

### Log
- [x] Commit log with pagination
- [x] Branch-specific log
- [x] Branch graph (ASCII topology)

### Stash
- [x] List stash entries
- [x] Save/Pop/Drop

### Blame
- [x] Per-line blame (porcelain format)

### Wails Bindings
- [x] 14 git bindings (status, diff, branches, log, graph, merge, rebase, stash, blame, fetch)

---

## Stream Parser (Wave A2 — Done, 14 tests)

### Event Model
- [x] Typed events: thinking, tool_use, tool_result, assistant, user, error
- [x] Diff extraction from Edit tool calls
- [x] File path extraction from tool inputs
- [x] Token/cost tracking per event
- [x] Sequence numbering for timeline

### JSONL Parser
- [x] Classify all Claude JSONL line types
- [x] Flexible parsing (handle format variations)
- [x] Cost calculation per event (shared pricing package)
- [x] Model detection

### File Scanner
- [x] Batch scan (full file → events)
- [x] Incremental scan (from byte offset)
- [x] Live tail (poll for new lines)

### Storage
- [x] Persist events to session_events table
- [x] Batch insert in transactions
- [x] Paginated event retrieval
- [x] Timeline generation

### Service
- [x] Parse historical sessions
- [x] Start/stop live tailing per session
- [x] Emit Wails events for live updates

### Wails Bindings
- [x] GetSessionEvents, GetSessionTimeline, StartStreamSession, StopStreamSession, ParseSessionHistory

---

## Safety Engine (Wave A3 — Done, 15 tests)

### Rules Engine
- [x] YAML rule loader (gopkg.in/yaml.v3)
- [x] Hot-reload via fsnotify (500ms debounce)
- [x] 4 action levels: block, confirm, warn, log
- [x] Pattern matching (regex on tool input, file paths)
- [x] PII scanner (email, API keys, AWS AKIA, GitHub tokens, passwords)
- [x] Bypass flow with audit trail
- [x] 3 default ward rules (embedded)
- [ ] Rate limiter (sliding window) — deferred

### Storage
- [x] ward_audit table (auto-created)
- [x] Trigger/bypass statistics (top-10 rules, bypass rate)

### Wails Bindings
- [x] GetWards, GetWard, GetWardAudit, GetWardStats, DryRunWard

---

## Session Controller (Wave A4 — Done, 11 tests)

- [x] Pause/Resume (PTY output buffering via PauseBuffer)
- [x] Session policies (supervised/auto/smart) with PolicyStore
- [x] Session state tracking (StateManager with sync.Map + SQLite)
- [x] Session branching (fork from event, copies events via SaveBatch)
- [x] Session rewind (soft-mark, no deletes)
- [x] Branch tree queries (recursive BFS)
- [ ] Multi-session coordination — deferred to UI phase
- [x] Lifecycle events (session:paused, session:resumed, session:branched, session:rewound)

### Wails Bindings
- [x] PauseSession, ResumeSession, SetSessionPolicy, GetSessionState, BranchSession, RewindSession, GetSessionBranches

---

## Code Quality (Simplify Review — Done)

- [x] Extract shared pricing package (collector + stream dedup)
- [x] Frontend: deduplicate SessionList.tsx helpers → utils/format.ts
- [x] Terminal context: inherit app context instead of Background()
- [x] Collector event constants (stringly-typed → const)
- [x] Evict stale entries from unbounded maps (rescanAttempts, fileOffsets)
- [x] Git pool: break on cancel instead of draining channel
- [x] session_watcher: migrate log.Printf → slog

---

## Testing

### Unit Tests (99 passing)
- [x] Terminal: 49 tests (ring buffer, session, manager, restore, helpers)
- [x] Git: 10 tests (pool, diff parsing, integration with temp repos)
- [x] Stream: 14 tests (parser, scanner)
- [x] Safety: 15 tests (rule matching, evaluator, PII)
- [x] Session: 11 tests (pause buffer, controller integration)

### Stress Tests (In Progress)
- [ ] Terminal: 100+ concurrent create/destroy, write/resize, subscribers
- [ ] Git: concurrent pool ops, cancel mid-flight, parallel diff/status
- [ ] Stream: concurrent parser, store saves, batch saves, tail with writes
- [ ] Safety: concurrent evaluator, hot-reload under load, audit writes
- [ ] Session: concurrent pause/resume, branch creation, state management

---

## UI — Modular Restructure (Phase 2.0 — Done)

### Architecture
- [x] Modular folder structure: core/, shared/, screens/, chrome/, terminal/, styles/
- [x] Split monolith wails/bindings.ts → 7 domain-specific binding modules
- [x] Barrel exports (index.ts) for all modules
- [x] Deleted 20+ dead/placeholder files from Phase 1.5
- [x] 41 TypeScript files, zero type errors

### Backend Additions
- [x] bindings_prefs.go: GetPreference, SetPreference
- [x] bindings_prefs.go: GetGitUserName (git config --global user.name)

---

## UI — Onboarding Redesign (Phase 2.5 — Done)

### Data-Driven Architecture
- [x] Phase config schema (PhaseConfig, PhaseId, BootLine, Ability types)
- [x] Content config (config/phases.ts — all text, speech, timers, abilities as data)
- [x] Centralized voice preset (config/voice.ts — rate:0.84, pitch:0.72)
- [x] PhaseRunner generic coordinator (announcement + auto-timer + PhasePanel wrap)
- [x] AutoTimer engine (countdown bar, pause-on-interaction)
- [x] AbilityReveal engine (sequential reveal, speech-synced)

### 7-Phase Cinematic Flow
- [x] Awakening (BootTerminal) — dynamic content based on session count
- [x] Identity Lock (IdentityBind) — git name auto-detect, 5s auto-accept
- [x] Domain Selection (DomainSelect) — 6 themes + 3 fonts, 2s auto-resolve
- [x] Domain Link (DomainLink) — project scanner, 8s auto-resolve, skip option
- [x] Ability Awakening (AbilityAwaken) — 5 abilities, sequential sound + speech
- [x] Ward Configuration (WardConfig) — 3 defense levels, 5s auto-resolve
- [x] Complete Awakening (Awakening) — summary, authority grant, hunter card, CTA

### Audio System
- [x] Web Audio API synthesized sounds (zero audio files)
- [x] 8 sound cues: hum, typing, scan, ok, reveal, whoosh, bass
- [x] Speech synthesis with centralized voice preset
- [x] Silent oscillator anti-throttle (AudioContext stays alive when unfocused)
- [x] Speech-synced ability reveals (await speech before next card)
- [x] Separated text (protocol output) vs speech (sentient system intent)

### Theme System (6 Solo Leveling Themes)
- [x] System Core Dark (cyan futuristic HUD)
- [x] System Core Light (blue holographic)
- [x] Shadow Monarch Dark (purple royal aura — default)
- [x] Shadow Monarch Light (violet mystic)
- [x] Hunter Rank Dark (green tactical ops)
- [x] Hunter Rank Light (green mission control)
- [x] 3 font styles: System, Monospace, Gaming
- [x] Live theme preview in onboarding
- [x] Preferences persisted to SQLite

### Post-Onboarding
- [x] Power-on sweep transition (CRT line sweep + fade)
- [x] Fullscreen on launch (WindowStartState: Fullscreen)

### Component Library
- [x] Kobalte @kobalte/core headless components
- [x] ToggleGroup (theme/font/ward selectors with [data-pressed])
- [x] Switch (gamification toggle with [data-checked])
- [x] TextField (operator name, project path)
- [x] Tabs (Settings sidebar navigation)
- [x] vanilla-extract sprinkles activated (type-safe utility classes)

---

## UI — Chrome Shell (Wave 4 — Done)

### Navigation
- [x] Bottom dock (9 screen buttons, active glow, Kobalte-ready)
- [x] Screen routing (Switch/Match, 11 screen IDs)
- [x] Top status strip (brand, active sessions, burn rate, tokens, live dot)
- [x] Command palette (⌘K fuzzy search, keyboard nav, backdrop dismiss)

---

## UI — Settings (Screen 1 — Done)

- [x] Sidebar + content layout (Kobalte Tabs, vertical orientation)
- [x] Theme switching (6 themes, ToggleGroup with [data-pressed])
- [x] Font style switching (3 styles, ToggleGroup)
- [x] Operator name edit (TextField, debounced save)
- [x] Gamification toggle (Switch with [data-checked])
- [x] Ward defense level (ToggleGroup, 3 options)
- [x] Reset onboarding (danger zone section)
- [x] Scalable sidebar for future sections

---

## UI — Command Center (Screen 2 — Planned, Rebuild)

- [ ] 3-column layout (project tree / session grid / context)
- [ ] Session card grid (name, model, tokens, cost, context bar)
- [ ] Project tree with grouping
- [ ] System feed (live activity log)

---

## UI — Smart View (Wave B1 — Planned)

- [ ] Structured event cards (thinking, tool, diff, bash)
- [ ] Accept/Reject/Auto buttons on Edit diffs
- [ ] Collapsible cards
- [ ] Ward block cards
- [ ] Run ledger (tokens, cache, cost)
- [ ] Pinned context panel
- [ ] Timeline scrubber
- [ ] Raw terminal toggle (⌘\)
- [ ] Session list sidebar with policy switcher

## UI — Eagle Eye (Wave B2 — Planned)

- [ ] Worktree table (branch, status, ahead/behind, PR, burn)
- [ ] Branch topology graph
- [ ] Parallel fetch monitor
- [ ] Click row → navigate to Command Center

## UI — Wards (Wave B3 — Planned)

- [ ] Ward list with tier grouping
- [ ] YAML rule editor
- [ ] Audit trail table
- [ ] Pattern insights
- [ ] Ward health metrics
- [ ] Dry-run mode

## UI — AI Playground (Wave B4 — Planned)

- [ ] Pipeline hex-node visualization
- [ ] Branch debate UI
- [ ] Model routing table
- [ ] Knowledge DB stats
- [ ] Dependency graph
- [ ] Structured trace log

## UI — Hunter Stats (Wave B5 — Planned)

- [ ] Status sheet (level, rank, XP, streak)
- [ ] Attribute bars (Velocity, Precision, Discipline, Thrift, Insight)
- [ ] Activity heatmap (26 weeks)
- [ ] Achievement tiles
- [ ] Model usage breakdown
- [ ] Auto-generated journal

## UI — CodeBurn (Wave B6 — Planned)

- [ ] Live burn ring
- [ ] 24h timeline chart
- [ ] Per-session burn breakdown
- [ ] Efficiency metric ($/diff)
- [ ] Budget wards
- [ ] Cost projection
- [ ] CSV export

---

## Polish (Wave C — Planned)

### Editor (C1)
- [ ] Monaco editor embedded
- [ ] Accept/reject diff flow
- [ ] Git blame annotations
- [ ] Cross-worktree file search
- [ ] Finder drag-drop

### Plugins (C2)
- [ ] Go plugin interfaces
- [ ] gRPC out-of-process plugins
- [ ] Plugin discovery + lifecycle
- [ ] Frontend component registry
- [ ] Plugin SDK template

### Distribution (C3)
- [ ] Apple code signing
- [ ] Notarization
- [ ] DMG packaging
- [ ] Sparkle auto-updater
- [ ] GitHub Actions release pipeline
- [ ] Appcast XML feed
