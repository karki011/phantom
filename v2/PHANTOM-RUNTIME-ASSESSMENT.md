# Phantom Runtime — PRD Gap Analysis & Roadmap

**Author:** Subash Karki
**Date:** 2026-05-23
**Scope:** PRD "Phantom Runtime & Intelligent Terminal System" vs v2 current state

---

## Executive Summary

The v2 codebase (Wails/Go/SolidJS) already implements **~60% of the PRD's V1 vision**. The foundation is strong — PTY management, shell integration, AI strategy pipeline, file dependency graph, event system, and Claude session observation all exist in production-quality form.

The critical missing pieces are:

1. **Signal integration** — Terminal events, git history, and session memories are collected but live in silos. They don't flow into the AI context pipeline.
2. **Phantom Persona Assistant** — No conversational assistant exists. The Composer wraps Claude CLI but has no Phantom-specific personality, workspace Q&A, or proactive intelligence.
3. **Ghostty surface wiring** — Code is 80% complete but never called from the app startup path.
4. **Semantic memory** — FTS5 schema is ready but `session_memories_fts` is permanently empty (Store is a no-op).

The Electron/ai-ware variant is being deprecated. All work targets v2.

---

## Component-by-Component Assessment

### 1. PTY Runtime Layer

| Requirement | Status | Evidence |
|---|---|---|
| Spawn shell sessions | Done | `internal/terminal/manager.go` — `Create()` via `creack/pty` |
| Multiple concurrent sessions | Done | `sync.Map` of sessions, fan-out listener channels |
| Process tracking | Partial | `internal/linker/pid.go` — PID ancestry check, no subprocess enumeration |
| Stream stdout/stderr | Done | `session.go` readLoop, 16KB hot-path, ring buffer scrollback |
| Session metadata | Done | `terminal_sessions` table, attach/detach tracking |
| Cross-restart PTY survival | Missing | `AdoptOrphans` is a stub; sessions die with Go process |
| Subprocess tree listing | Missing | Only ancestry check, no enumeration of children |

**Overall: 90% done.** The 10% gap (PTY handoff, subprocess tracking) is V2+ scope per PRD.

---

### 2. Ghostty Integration Layer

| Requirement | Status | Evidence |
|---|---|---|
| CGo bridge | Done | `ghostty/bridge.go` — `ghostty_init`, `ghostty_info`, link chain proven |
| Runtime lifecycle | Done | `ghostty/runtime.go` — `NewApp()`, `StartTickLoop()` at 60Hz, all 6 callbacks |
| Surface management | Done | `ghostty/surface.go` — `NewSurface()`, `SetFrame()`, `RequestClose()` |
| NSView integration | Done | `ghostty/native_macos.m` — full `PhantomTerminalView`, CAMetalLayer, keymap, IME |
| Wails host window discovery | Done | `ghostty/wails_host.go` — `FindHostWindow()`, `AttachSubview()` |
| Y-flip coord translation | Done | `ghostty/surface_layout.go` — web→AppKit coordinate conversion |
| **Wired into app startup** | **Missing** | No code calls `NewApp()` in `main.go` or `app.Startup()` |
| **Wails bindings for frontend** | **Missing** | No `CreateNativeTerminal(paneId, x, y, w, h)` binding |
| **Frontend NativeTerminalPane wiring** | **Partial** | `NativeTerminalPane.tsx` exists but calls placeholder bindings |

**Overall: 80% done.** The remaining 20% is plumbing: wire `NewApp()` into startup, expose bindings, connect `NativeTerminalPane` → bindings → surface lifecycle.

**Build gate:** `//go:build ghostty` tag. Default builds use xterm.js. Frontend gates on `nativeTerminalIsEnabled()` flag.

---

### 3. Shell Integration System

| Requirement | Status | Evidence |
|---|---|---|
| preexec / precmd hooks | Done | `scripts/shell-integration.bash` + `.zsh` — full OSC 633 A/B/C/D/E/P |
| Command start/end events | **Frontend only** | `addons/shellIntegration.ts` parses OSC 633 → `TerminalCommand` objects |
| Exit code capture | **Frontend only** | OSC 633;D carries exit code, parsed by addon |
| CWD tracking | **Frontend only** | OSC 633;P;Cwd parsed, stored in addon state |
| Duration calculation | **Frontend only** | Timestamps on `TerminalCommand`, not exposed as events |
| Events flow to Go backend | **Missing** | OSC 633 data never leaves the frontend |
| Events flow to AI pipeline | **Missing** | No connection between shell events and context provider |

**Overall: 50% done for the full PRD vision.** Shell hooks work perfectly, parsing works perfectly — but the data is trapped in the frontend xterm.js addon. The backend has zero awareness of shell command boundaries, exit codes, or CWD changes from the terminal.

**Root cause fix:** Build a Go-side OSC 633 parser in the PTY readLoop fan-out. This single change would close most terminal intelligence gaps.

---

### 4. Terminal Event Bus

| PRD Event Type | Status | Notes |
|---|---|---|
| `session.created` | Done | `session:new` in events.go |
| `session.closed` | Done | `session:end` in events.go |
| `session.focused` | Missing | No focus tracking event |
| `command.start` | **Missing** | OSC 633;B parsed frontend-only |
| `command.end` | **Missing** | OSC 633;D parsed frontend-only |
| `command.error` | **Missing** | Exit code captured frontend-only |
| `ai.response.started` | **Missing** | Inferred from `stream:event` but no explicit event |
| `ai.response.streaming` | Partial | `stream:batch` emits during streaming |
| `ai.response.complete` | **Missing** | Session end detected via stale check (5-30s lag) |
| `ai.response.interrupted` | **Missing** | No interrupt detection event |
| `git.status.changed` | Done | `git:status` event |
| `git.diff.created` | Missing | No event for new diffs |
| `git.commit.created` | Missing | No event for new commits |
| `workspace.index.updated` | Missing | Graph reindex doesn't emit events |
| `diagnostic.created` | Missing | No LSP/diagnostics integration |

**Overall: 35% of PRD event types implemented.** The existing events are Wails string constants with untyped payloads. No formal EventBus abstraction with routing/filtering.

---

### 5. AI Agent Observation Layer

| Requirement | Status | Evidence |
|---|---|---|
| Detect streaming state | Partial | `computeLiveState` in session_watcher.go — JSONL tail-based, 2-5s lag |
| Detect completion | Partial | Stale check (5s poll) + fsnotify on session file removal |
| Detect stalls | Partial | Composer watchdog at 120s; no `ai.stalled` event |
| Summarize actions | Post-hoc only | `SessionEnricher.generateSummary` runs at session end |
| Classify changes | Post-hoc only | `classifySession` runs at session end |
| Track files modified | Post-hoc only | `aggregateFiles` runs at session end |
| Real-time file change events | Missing | Only end-of-session aggregation |
| Real-time action summary | Missing | No streaming summarization |

**Overall: 45% done.** Detection exists but is latent (polling-based, post-hoc). The PRD wants real-time observation.

---

### 6. Workspace Intelligence Engine

| Requirement | Status | Evidence |
|---|---|---|
| Dependency graph | Done | `ai/graph/filegraph/` — Go AST + TS/JS regex, fsnotify |
| Graph → AI context | Done | `context.go` → `graphContextFromMessage()` injects neighbors |
| Git history → AI context | **Missing** | `git/log.go` exists but not wired to context provider |
| Terminal events → AI context | **Missing** | Shell events don't reach context pipeline |
| Diagnostics → AI context | **Missing** | No LSP integration |
| Symbol index | Done | Graph stores symbols; exposed via `SymbolLookup` |
| Recent edits → AI context | Done | `activity_log` → "Recently Touched Files" in prompts |
| AI interaction memory | Partial | Decisions + outcomes stored; strategy patterns in system prompt |
| Semantic search (FTS5) | **Schema only** | `session_memories_fts` table exists, zero rows, Store is no-op |
| Architecture awareness | **Missing** | No module boundary or layer pattern detection |
| Cross-session memory | **Missing** | Only strategy metadata crosses session boundaries |

**Overall: 45% done.** The graph and recent-edits paths are solid. Everything else is either siloed or stubbed.

---

### 7. Personal Assistant Runtime (Phantom Persona)

| Requirement | Status | Evidence |
|---|---|---|
| Conversational workspace Q&A | **Missing** | No assistant feature; Composer is bare Claude wrapper |
| Summarize Claude activity | Partial | `GetDigestSummary(date)` exists; not conversational |
| Explain architecture | **Missing** | No architecture explanation API |
| Execute terminal actions | **Missing** | No PA-initiated terminal commands |
| Coordinate workflows | **Missing** | No multi-agent orchestration from assistant |
| Assist debugging | **Missing** | Verifier runs post-turn but no proactive debug assistant |
| Phantom personality/persona | **Missing** | No system prompt, no personality config anywhere |
| Proactive notifications | **Missing** | No "Claude finished" or "build failed" assistant alerts |

**Overall: 10% done.** This is the largest gap and the most impactful feature for the PRD vision.

---

## Signal Integration Matrix

This is the **core architectural gap**. Data exists in silos but doesn't flow between systems.

```
                    ┌─────────────────────────────────────┐
                    │        AI Context Pipeline          │
                    │  (context.go + SessionMemoryBuilder) │
                    └──────────┬──────────────────────────┘
                               │
              Currently feeds: │  Missing feeds:
              ─────────────────│──────────────────
              ✅ File graph    │  ❌ Git log/blame/diff
              ✅ Recent edits  │  ❌ Terminal command events
              ✅ Branch name   │  ❌ Build/test results
              ✅ Strategy      │  ❌ Session memories (FTS5)
                 patterns      │  ❌ Error history
              ✅ Project type  │  ❌ Architecture patterns
                               │  ❌ Cross-session file knowledge
```

---

## Phased Roadmap

### Phase 0: Foundation Cleanup (1 week)

**Goal:** Remove dead code paths and close the easiest high-impact gaps.

| Task | Impact | Effort |
|---|---|---|
| Wire `MemoryExtractor.Store()` → `db.InsertMemory` | Unlocks session memory persistence | S |
| Wire `InsertPattern` callers for `ai_patterns_fts` | Unlocks pattern search | S |
| Add git log summary (last 10 commits) to `context.go` | Git history in AI context | S |
| Add git diff summary (staged + unstaged) to `context.go` | Current changes in AI context | S |
| Emit explicit `ai.response.started` and `ai.response.complete` Wails events | Observable AI lifecycle | S |
| Remove Electron/Hono references from ai-ware branch | Clean up dead path | M |

---

### Phase 1: Terminal Intelligence Bridge (2-3 weeks)

**Goal:** Shell events flow from frontend → backend → AI pipeline.

| Task | Impact | Effort |
|---|---|---|
| Build Go-side OSC 633 parser in PTY readLoop | Root cause fix for all shell event gaps | M |
| Emit `command.start`, `command.end`, `cwd.changed` Wails events from Go | Observable terminal | S |
| Persist terminal commands to DB (command, exit code, duration, cwd) | Workspace memory | M |
| Wire terminal command history into `context.go` | AI knows what you've been running | S |
| Add `session.focused` event tracking | Focus-aware intelligence | S |
| Build formal `EventBus` abstraction with typed events + routing | Architecture foundation | M |

---

### Phase 2: Phantom Persona Assistant (3-4 weeks)

**Goal:** Interactive AI companion with workspace awareness.

| Task | Impact | Effort |
|---|---|---|
| Design Phantom persona system prompt (personality, capabilities, constraints) | Core identity | S |
| Create `internal/assistant/` package — dedicated assistant runtime | Separation from Composer | M |
| Build workspace query handlers: "What changed?", "What is Claude doing?", "Why did build fail?" | Natural language workspace Q&A | L |
| Wire all context signals (graph, git, terminal, memories) into assistant prompt | Full workspace awareness | M |
| Build assistant UI pane in frontend (distinct from Composer) | User-facing feature | M |
| Add proactive notifications: Claude completion, build failures, stale sessions | Push intelligence | M |
| Per-workspace persona config (tone, verbosity, proactiveness) | Customization | S |

---

### Phase 3: Ghostty Terminal Surface (2-3 weeks)

**Goal:** Replace xterm.js with native GPU-accelerated Ghostty rendering.

| Task | Impact | Effort |
|---|---|---|
| Wire `ghostty.NewApp()` into `app.Startup()` with build tag | App lifecycle | S |
| Create Wails bindings: `CreateNativeTerminal`, `DestroyNativeTerminal`, `ResizeNativeTerminal` | Frontend API | M |
| Connect `NativeTerminalPane.tsx` → bindings → surface lifecycle | End-to-end rendering | M |
| ResizeObserver → `SetPlacement()` with Y-flip coords | Correct positioning | S |
| Integration test: split panes with mixed xterm.js + Ghostty | Stability | M |
| Make Ghostty the default, xterm.js the fallback | Ship it | S |

---

### Phase 4: Deep Intelligence (4-6 weeks)

**Goal:** Architecture awareness, semantic search, proactive debugging.

| Task | Impact | Effort |
|---|---|---|
| Module boundary detection from import graph (cluster analysis) | Architecture awareness | L |
| Build error capture → AI context pipeline | Proactive debugging | M |
| Populate vector embeddings for file content + commit messages | Semantic search | L |
| Cross-session knowledge retrieval (what was done + learned) | Persistent memory | M |
| Multi-agent coordination from assistant (spawn + observe + report) | V2 feature | L |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Ghostty libghostty API instability | Feature-flag behind `//go:build ghostty`; xterm.js fallback always works |
| OSC 633 parser in Go readLoop adds latency | Parse in a separate goroutine on the fan-out channel, not in hot path |
| Assistant prompt size explosion | Hard cap context at 8KB (current) with tiered priority system |
| Persona "uncanny valley" | Start minimal — workspace awareness first, personality second |
| Session memory storage grows unbounded | TTL-based cleanup already in schema; add compaction schedule |

---

## Recommended First Move

**Phase 0 + Phase 1 in parallel.** Wire the memory Store (15 min fix), add git context (1 hour), and start the OSC 633 Go parser. These three changes transform v2 from "terminal app with AI features" to "AI-aware terminal runtime" — which is the PRD's core thesis.

The Phantom Persona (Phase 2) builds on top of all that context. Without signals flowing, the assistant has nothing interesting to say.

---

## Architecture Target State

```
┌──────────────────────────────────────────────────┐
│                  Phantom UI (SolidJS)              │
│  ┌────────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Terminal    │  │ Composer  │  │ Phantom       │ │
│  │ Pane       │  │ (Claude)  │  │ Assistant     │ │
│  │ (Ghostty)  │  │           │  │ (Persona)     │ │
│  └─────┬──────┘  └─────┬────┘  └──────┬────────┘ │
└────────┼────────────────┼──────────────┼──────────┘
         │                │              │
    ┌────▼────────────────▼──────────────▼────┐
    │           Wails Event Bus               │
    │  (typed events, routing, persistence)    │
    └────┬────────────────┬──────────────┬────┘
         │                │              │
    ┌────▼────┐    ┌──────▼──────┐  ┌───▼──────────┐
    │ PTY     │    │ AI Engine   │  │ Workspace    │
    │ Runtime │    │ Orchestrator│  │ Intelligence │
    │ + OSC   │    │ + Strategies│  │ + Memory     │
    │ Parser  │    │ + Verifier  │  │ + Search     │
    └────┬────┘    └──────┬──────┘  └───┬──────────┘
         │                │              │
    ┌────▼────┐    ┌──────▼──────┐  ┌───▼──────────┐
    │ Ghostty │    │ Claude CLI  │  │ SQLite + FTS5│
    │ libterm │    │ (subprocess)│  │ (persistence)│
    └─────────┘    └─────────────┘  └──────────────┘
```

---

## Metrics to Track

| Metric | Baseline (today) | Phase 1 target | Phase 4 target |
|---|---|---|---|
| Event types in bus | 12 | 25 | 40+ |
| Context signals feeding AI | 3 (graph, edits, branch) | 7 (+git, terminal, memories, errors) | 12+ |
| Session memories in FTS5 | 0 | 100+ per day | 500+ per day |
| AI stall detection latency | 5-30s | <2s | <500ms |
| Claude completion detection | 5-30s | <2s | <1s |
| Assistant query response | N/A | <3s | <1s |
