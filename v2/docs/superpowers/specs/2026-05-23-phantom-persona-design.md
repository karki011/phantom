# Phantom Persona — Design Specification

**Author:** Subash Karki
**Date:** 2026-05-23
**Status:** Approved

---

## Overview

Phantom Persona is an interactive AI assistant embedded in Phantom OS v2 that provides ambient workspace intelligence through voice, keyboard, and visual interaction. It observes all terminal sessions and Claude instances, answers workspace questions, and progressively unlocks the ability to take actions — opening terminals, spawning Claude, running commands, and managing git.

Phantom Persona transforms Phantom from a developer environment into an intelligent developer runtime.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Placement | Top bar inline status pill + dropdown | Always visible, zero footprint when idle, shows live status even without interaction |
| Context scope | Hybrid — focused on active project, globally aware | Deep single-project intelligence + cross-project alerts and queries |
| Action model | Progressive trust — observe → terminal → Claude → git | Builds user confidence gradually; each tier unlockable per-project |
| Voice | Essential from V1 — "Phantom" wake word | Core differentiator; voice activation is the Siri-like experience |
| LLM backend | Local model first, Claude API fallback | Fast + private for common queries; Claude for complex reasoning |
| LLM providers | Flexible interface — Ollama, MLX, llama.cpp, Claude API | User configures preferred backend; no vendor lock-in |
| Keyboard shortcut | Double-tap ⌘ (Command key) | Natural gesture like macOS Siri; avoids conflict with ⌘K command palette |
| Claude integration | Phantom IS the Claude runtime — all sessions managed | Full control: context injection, pause/redirect, permission gating, memory persistence |

---

## Architecture

### Layer Model

```
Layer 4: Presentation
  ├── Top Bar Pill (status indicator + expand to dropdown)
  ├── Dropdown Panel (chat, quick actions, status summary)
  └── Voice Engine (wake word + STT + TTS)

Layer 3: Smart Router
  └── Intent Classifier → routes to correct handler
      (keyword/pattern matching first, local LLM fallback)

Layer 2: Capability Handlers (progressive unlock)
  ├── ObserveHandler  (always on — status, queries, search)
  ├── TerminalHandler (unlock tier 1 — open, run, kill)
  ├── ClaudeHandler   (unlock tier 2 — spawn, pause, redirect)
  └── GitHandler      (unlock tier 3 — commit, push, PR)

Layer 1: Context Engine
  └── Unified query layer over existing v2 services:
      session_watcher, terminal manager, stream service,
      git operations, file graph, knowledge store, activity hooks
```

### Key Principle

Layer 1 reads existing services. No new data collection infrastructure is needed for V1. Persona is a consumer of signals that already flow through the v2 codebase.

---

## Smart Router

Every user input (text, voice transcription, quick action click) enters the Smart Router which classifies it into one of four lanes:

### Routing Lanes

| Lane | LLM Required? | Latency Target | Examples |
|---|---|---|---|
| State lookup | No | <50ms | "What is Claude doing?", "git status", "how many terminals?" |
| Local reasoning | Local LLM | 1-3s | "Why did the build fail?", "summarize changes", "explain this error" |
| Claude task | Claude CLI spawn | 5s+ | "Refactor auth to JWT", "fix the failing test" |
| System action | No | <100ms | "Open terminal", "switch to project X", "show diff" |

### Intent Classification

Primary classification uses keyword + pattern matching rules. A compact rule table handles ~80% of queries without any LLM call:

```
Pattern                          → Handler.method()
─────────────────────────────────────────────────────
"what is claude doing"           → StatusHandler.claudeStatus()
"git (status|log|diff|blame)"   → GitHandler.query(type)
"open (terminal|tab|shell)"     → TerminalHandler.open()
"run (command)"                 → TerminalHandler.runCommand(cmd)
"start claude|help me with"     → ClaudeHandler.spawn(context)
"why did * fail"                → LLMHandler.analyzeFailure()
"what changed"                  → GitHandler.recentChanges()
"switch to (project)"          → WorkspaceHandler.switchProject()
"(search|find) (query)"        → SearchHandler.search(query)
```

When no rule matches, the input goes to the local LLM with a classification system prompt that returns a structured intent object.

---

## Claude Runtime

Phantom is the process owner for all Claude sessions. The existing Composer engine (`internal/composer/service.go`) provides the foundation.

### Spawn Paths

1. **Voice/keyboard:** User says "Phantom, help me with X" → Persona spawns managed Claude subprocess
2. **Composer pane:** User opens Composer → same as today, Composer spawns Claude
3. **Terminal intercept:** User types `claude` in a Phantom terminal → a shell function injected via the existing shell integration scripts (`internal/terminal/scripts/shell-integration.bash/zsh`) detects the `claude` command and routes it through Phantom's managed runtime instead of spawning an unmanaged process

### What "Managed" Means

- Phantom injects `--append-system-prompt` with workspace context (file graph, git state, terminal history, session memory)
- Phantom tracks every tool call in real-time via `--include-hook-events` + JSONL tailing
- Phantom can pause (SIGTSTP), resume (SIGCONT), kill, branch, rewind sessions
- Session memory persists to SQLite — next session starts with prior context
- Top bar pill shows live status from the managed session
- Permission gating: Phantom can intercept destructive tool calls for user confirmation

### Terminal Experience

The terminal experience is unchanged. Claude renders its normal CLI output. The user types normally. Phantom is invisible middleware that makes Claude smarter and gives Persona full observability.

### Observation Channels (No Wrapper Needed for Passive Monitoring)

Even for unmanaged Claude sessions (edge cases), Phantom has four passive observation channels:

| Channel | What It Sees | Latency |
|---|---|---|
| JSONL file tailing (`internal/stream/`) | Every message, tool call, thinking block | ~200ms |
| Claude Code hooks (`internal/api/`) | Pre/post tool use, file changes | Real-time |
| MCP server (`internal/mcp/`) | What files Claude is querying about | On-demand |
| Session watcher (`internal/collector/`) | Session alive/dead, PID, metadata | ~2-5s |

---

## Context Engine

A unified query layer that aggregates all existing v2 signals into answers Persona can use.

### Available Signals

| Signal | Source | Status |
|---|---|---|
| Claude session state | `internal/collector/session_watcher.go` | Exists — `computeLiveState()` |
| Claude tool activity | `internal/stream/service.go` | Exists — JSONL event tailing |
| Terminal sessions | `internal/terminal/manager.go` | Exists — PTY lifecycle |
| Shell commands (OSC 633) | `frontend/src/core/terminal/addons/shellIntegration.ts` | Frontend-only — needs Go-side parser for backend access |
| Git status/log/diff | `internal/git/` | Exists — full implementation |
| File dependency graph | `internal/ai/graph/filegraph/` | Exists — Go AST + TS regex |
| AI strategy decisions | `internal/ai/knowledge/decisions.go` | Exists — SQLite persistence |
| Session memory | `internal/ai/extractor/` + `internal/db/fts_search.sql.go` | Schema exists, Store is no-op — must wire |
| Activity hooks | `internal/app/activity_hooks.go` | Exists — detects plan mode, todos, tasks |

### Context Assembly

For each Persona query, the Context Engine assembles a context object scoped to the relevant project:

```go
type PersonaContext struct {
    ActiveProject    ProjectInfo
    ClaudeSessions   []ClaudeSessionStatus
    TerminalSessions []TerminalStatus
    RecentGitChanges GitSummary
    RecentCommands   []TerminalCommand     // requires OSC 633 Go parser
    FileGraph        GraphSummary
    RecentActivity   []ActivityEvent
}
```

For cross-project queries, the engine aggregates across all active projects.

---

## Voice Engine

### Components

**1. Wake Word Detection**
- Always-on when app is focused
- Listens for "Phantom" using a lightweight local model (Porcupine or Whisper-tiny)
- Runs on a background goroutine with minimal CPU footprint
- When detected: pill turns green, chime plays, STT activates

**2. Speech-to-Text (STT)**
- After wake word: captures audio until silence (Voice Activity Detection)
- Transcribes locally (Whisper.cpp via CGo or subprocess) or via API
- Result feeds into Smart Router as text — same pipeline as keyboard input

**3. Text-to-Speech (TTS)**
- Short responses spoken aloud
- Long responses: spoken summary + full text in dropdown
- Default: macOS `say` command (free, instant). Higher quality: API-based (ElevenLabs, OpenAI TTS)

**Provider Interface**
All three components use a provider interface — implementations are swappable without changing the router or handlers.

---

## Top Bar Pill

### Placement

Between system metrics and icon buttons in the existing title bar (`WindowDragStrip` component area).

### States

| State | Appearance | Trigger |
|---|---|---|
| Idle | Dim dot + "Phantom" text | No active sessions or observations |
| Observing | Cyan dot + live status text | Claude or terminal activity detected |
| Attention | Amber pulsing dot + alert text | Tests failed, errors, stale session |
| Listening | Green dot + "Listening..." | Wake word detected or double-tap ⌘ |
| Speaking | Green dot + waveform indicator | TTS output active |

### Expanded Dropdown

Click the pill to expand a dropdown panel anchored from the pill position:

- **Status banner:** Current Claude/terminal activity summary
- **Quick action chips:** Contextual buttons (Show diff, Open terminal, Ask Claude, Git status)
- **Chat area:** Message history with Persona
- **Input field:** Text input + mic icon + double-tap ⌘ hint

### Proactive Notifications

Phantom doesn't wait to be asked. Events that trigger proactive behavior:

- Claude session completes → pill pulses, spoken summary if voice active
- Tests fail → amber pulse, failure summary
- PR gets reviewed → notification with review summary
- Session goes stale → amber pulse, "Claude appears stuck"

User configures proactiveness level:
- **Silent:** Pill indicator only
- **Subtle:** Pill + notification sound
- **Vocal:** Pill + spoken one-liner

---

## Progressive Trust Model

### Capability Tiers

| Tier | Name | Capabilities | Default |
|---|---|---|---|
| 0 | Observe | Status queries, git info, terminal state, Claude observation, file graph search | Always unlocked |
| 1 | Terminal | Open new terminals, run commands, kill processes | Locked per-project |
| 2 | Claude | Spawn Claude sessions, inject context, pause/redirect, coordinate | Locked per-project |
| 3 | Git | Stage, commit, push, create branches, create PRs | Locked per-project |

### Unlock Mechanism

- Settings panel → Persona → toggle each tier per-project
- Voice: "Phantom, enable terminal actions" → confirmation dialog
- Persisted to preferences DB per-project

### Safety Rules

- Before any action: Phantom states what it will do
- Destructive actions (delete files, force push, kill process) always require confirmation, even when tier is unlocked
- All actions logged to `persona_actions` table for auditability

---

## Package Structure

### Go Backend

```
internal/persona/
├── persona.go              # Main service: lifecycle, state, Wails bindings
├── router.go               # Intent classification + handler dispatch
├── context.go              # Unified query layer over existing signals
├── personality.go          # System prompt template, tone, formatting
├── trust.go                # Progressive capability tier management
├── handlers/
│   ├── status.go           # Claude status, terminal state, session info
│   ├── git.go              # Git queries (status, log, diff, blame)
│   ├── terminal.go         # Open/run/kill terminal actions
│   ├── claude.go           # Spawn/pause/redirect Claude sessions
│   ├── search.go           # File graph, symbol lookup, FTS5 search
│   └── workspace.go        # Project switching, worktree management
├── provider/
│   ├── provider.go         # LLM provider interface
│   ├── ollama.go           # Ollama backend
│   ├── mlx.go              # Apple MLX backend
│   ├── llamacpp.go         # llama.cpp backend
│   └── claude_api.go       # Claude API fallback
└── voice/
    ├── engine.go           # Voice lifecycle, state machine
    ├── wakeword.go         # "Phantom" detection (Porcupine/Whisper-tiny)
    ├── stt.go              # Speech-to-text provider interface
    ├── tts.go              # Text-to-speech provider interface
    └── vad.go              # Voice activity detection
```

### SolidJS Frontend

```
frontend/src/
├── components/persona/
│   ├── PersonaPill.tsx          # Top bar status pill
│   ├── PersonaDropdown.tsx      # Expanded chat/status panel
│   ├── PersonaInput.tsx         # Text + voice input
│   ├── PersonaMessage.tsx       # Response bubbles
│   └── PersonaQuickActions.tsx  # Contextual action chips
└── core/persona/
    ├── signals.ts               # Persona state (active, listening, etc.)
    ├── bindings.ts              # Wails Go binding wrappers
    └── voice.ts                 # Web Audio API for mic capture + VAD
```

---

## Prerequisites (Signal Wiring)

Before Persona can answer useful questions, these existing gaps must be closed:

| Gap | Fix | Effort |
|---|---|---|
| `MemoryExtractor.Store()` is a no-op | Wire to `db.InsertMemory` | Small |
| Git log/diff not in AI context | Add to `context.go` | Small |
| OSC 633 parsed frontend-only | Build Go-side parser in PTY readLoop | Medium |
| No `ai.response.started/complete` events | Add to events.go + emit from stream service | Small |

These are Phase 0 tasks from the roadmap — they're prerequisite to Persona, not part of it.

---

## Build Sequence

### Phase A: Context Engine + Router (Week 1-2)
1. Create `internal/persona/` package scaffold
2. Build `context.go` — unified query layer reading existing services
3. Build `router.go` — keyword/pattern intent classification
4. Build observe-tier handlers (status, git, search, workspace)
5. Add Wails bindings for Persona queries
6. Verify: can answer "What is Claude doing?" with <50ms response from Go

### Phase B: Top Bar Pill + Dropdown UI (Week 2-3)
1. Build `PersonaPill.tsx` in the title bar area
2. Build `PersonaDropdown.tsx` with chat + quick actions
3. Wire pill states (idle/observing/attention)
4. Wire double-tap ⌘ detection
5. Connect frontend signals to Go bindings
6. Verify: pill shows live Claude status, dropdown answers text queries

### Phase C: Voice Engine (Week 3-4)
1. Build voice provider interfaces in `internal/persona/voice/`
2. Integrate wake word detection (Porcupine or Whisper-tiny)
3. Wire STT pipeline (audio capture → transcription → router)
4. Wire TTS pipeline (response text → speech)
5. Connect voice state to pill UI (green = listening, waveform = speaking)
6. Verify: say "Phantom, what is Claude doing?" → hear spoken answer

### Phase D: Claude Runtime (Week 4-5)
1. Evolve Composer engine to support terminal-embedded managed sessions
2. Add shell integration alias for `claude` → managed spawn
3. Build ClaudeHandler in Persona (spawn, pause, redirect)
4. Wire context injection on Claude session start
5. Verify: "Phantom, start Claude on auth" → managed Claude in terminal pane

### Phase E: Progressive Actions (Week 5-6)
1. Build trust tier system (`trust.go`)
2. Build TerminalHandler actions (open, run, kill)
3. Build GitHandler actions (commit, push, PR)
4. Build settings UI for tier management
5. Add confirmation dialogs for destructive actions
6. Verify: unlock terminal tier → "Phantom, run npm test" → executes in terminal

### Phase F: Local LLM Integration (Week 6-7)
1. Build provider interface (`provider/provider.go`)
2. Implement Ollama adapter
3. Implement llama.cpp adapter
4. Implement MLX adapter (Apple Silicon)
5. Implement Claude API fallback adapter
6. Wire local LLM into router for reasoning-lane queries
7. Build settings UI for provider selection
8. Verify: "Why did the build fail?" → local model analyzes terminal output → spoken answer

---

## Success Criteria

1. **"Phantom, what is Claude doing?"** → instant spoken answer with <50ms state lookup
2. **"Phantom, why did the build fail?"** → local LLM analyzes terminal output, responds in <3s
3. **"Phantom, open a terminal and run tests"** → new terminal tab opens, command executes
4. **"Phantom, start Claude on the auth refactor"** → managed Claude session with full context injection
5. **Top bar pill** shows live Claude/terminal status without any user interaction
6. **Proactive notification** when Claude completes a task or tests fail
7. **Double-tap ⌘** summons Persona from anywhere in the app
8. **Cross-project query** "What's happening in all my projects?" → aggregated answer
