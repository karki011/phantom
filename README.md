# Phantom

**A native desktop workspace for developers — terminal, editor, composer, git diff, and journal in one tabbed pane system, backed by a local AI engine with dependency graph intelligence.**

> **macOS only** (Apple Silicon + Intel). Windows and Linux are not supported today. See [Platform support](#platform-support).

Built by [Subash Karki](https://github.com/karki011)

---

## What it is

Phantom collapses your terminal, code editor, AI composer, git diff viewer, journal, and markdown preview into a single tabbed pane system — so you stop alt-tabbing between iTerm, VS Code, ChatGPT, and your git client and just work in one place. It's built on Wails (Go + SolidJS) for native performance, watches your filesystem in real time, routes every git call through a hardened wrapper to keep state sane, and ships with a first-class AI engine that's hook-aware and MCP-channel-ready — meaning the AI can see what you're editing, what changed, and what you ran, then act on it.

## Status

- **Platform:** macOS only (Apple Silicon + Intel — universal binary)
- **Version:** 0.1.9
- **Distribution:** Signed with Apple Developer ID + notarized + stapled (no Gatekeeper prompts)

## Platform support

| OS | Status | Why |
|---|---|---|
| **macOS** (Apple Silicon + Intel) | Supported | Primary target. Universal binary, signed + notarized. |
| **Windows** | Not supported | No build target, no installer, untested. Wails *can* target Windows via WebView2 — contributors welcome. |
| **Linux** | Not supported | No build target, untested. Wails *can* target Linux via WebKitGTK — contributors welcome. |

Phantom is built for macOS first because the AI engine, file watcher, audio cues, Keychain integration, and shell integration are all tuned to macOS conventions (`~/Library/`, AVFoundation, Security framework, etc.). Cross-platform support isn't on the near-term roadmap. If you need Windows or Linux, open an issue or send a PR — but treat both as greenfield work.

---

## Install (prebuilt)

1. Download `Phantom-latest.zip` from [Releases](https://github.com/karki011/phantom/releases)
2. Unzip and drag `Phantom.app` to `/Applications`
3. Double-click — no first-launch internet required (notarization is stapled)

## Build from source

> Build instructions assume macOS. Windows/Linux builds are not supported.

### Prerequisites

- macOS with Xcode Command Line Tools
- [Go](https://go.dev/) 1.25+
- [Wails CLI](https://wails.io/) — `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/) 10+

### Development

```bash
cd v2
wails dev      # or: make dev
```

### Release (signed + notarized + zipped)

```bash
cd v2
make release-zip   # signed + notarized zip
make release       # signed + notarized DMG (requires `brew install create-dmg`)
```

Apple notarization credentials are loaded from `phantom-os/.env.notarize` (gitignored — see `.env.notarize.example`).

### Authentication

Phantom supports two authentication modes. All local features (AI engine, graph, hooks, MCP, safety) work with both.

| Mode | Setup | Billing |
|---|---|---|
| **Claude Subscription** (Max/Pro/Enterprise) | `claude login` — zero config | Included in subscription |
| **BYOK API Key** | Settings > AI Provider > enter key | Per-token via Anthropic API |

BYOK keys are stored in the macOS Keychain and never logged to disk.

---

## Features

### Composer

Full agentic coding pane powered by Claude CLI with stream-json output.

- **Markdown rendering** — headings, code blocks with syntax highlighting, lists, tables, links, blockquotes
- **Session cost meter** — running dollar total per session
- **Context window gauge** — color-coded progress bar (accent/warning/danger thresholds)
- **Turn efficiency cards** — duration, tokens in/out, cost, files edited, lines changed per turn
- **Auto-accept toggle** — persisted preference, auto-marks edit cards as accepted
- **ASSISTANT/YOU badges** with turn dividers between conversation turns
- **Edit card review** — accept/discard per-file with inline diff viewer
- **Model picker** — Sonnet 4.6 / Opus / Haiku
- **Effort level control** — Auto / Low / Medium / High / Max
- **Strategy visualization** — shows the orchestrator's strategy name, confidence, complexity, risk, blast radius
- **Tool call status dots** — blinking = in-progress, green = success, red = error
- **Thinking blocks** — collapsed by default, click to expand
- **Memory viewer panel** — right rail showing loaded CLAUDE.md, project rules
- **Skill browser panel** — right rail listing `.claude/skills/` with search and invoke
- **Hook event visibility** — `--include-hook-events` passed to CLI
- **Past sessions sidebar** — resume, context menu, delete
- **Drag and drop file mentions** + image paste
- **No-context mode toggle**
- **Session persistence** across app restarts

### AI Engine

Local Go-based reasoning engine with dependency graph intelligence. Runs entirely on-device — no cloud calls for engine logic.

- **7+ reasoning strategies:** Direct, Decompose, Advisor, SelfRefine, TreeOfThought, Debate, GraphOfThought
- **Orchestrator pipeline:** assess > graph context > blast radius > select strategy > decide > verify > learn
- **Dependency graph intelligence** — file-level graph with blast radius analysis, related file discovery, shortest path queries
- **Auto-tune** — EMA-smoothed threshold recalibration based on observed outcomes
- **Decision learning** — per-project SQLite storage, cross-project `GlobalPatternStore`
- **Hallucination detection** — verifies file paths referenced in AI responses actually exist on disk
- **Gap detector** — identifies missing context before the AI acts
- **Penalty system** — tracks repeated failures to avoid known-bad approaches
- **Context injector** — enriches prompts with graph context automatically
- **Multi-language support** — parsers for TypeScript/JavaScript, Python, Go, Rust, Java

### Safety and Security

- **Ward rules engine** — YAML-based guardrails in `~/.phantom-os/wards/` (block patterns, require patterns, file scope filters)
- **PII scanner** — detects emails, API keys, AWS keys, passwords, tokens before they leave the machine
- **Edit gate hook** — blocks Write/Edit/MultiEdit tool calls when enabled via preferences
- **Audit logging** — `ward_audit` SQLite table for all rule evaluations
- **BYOK key storage** — macOS Keychain via Security framework (never written to disk or logs)

### Desktop Workspace

- **Terminal** — full PTY via xterm.js 6.0 with 497 themes, OSC 633 shell integration, Quick-Fix on errors, sticky scroll, jump-to-prompt, Cmd+P command history palette, persistent sessions (hot + cold restore), addon-serialize PTY snapshots, tab auto-rename via OSC 0/1/2
- **Editor** — Monaco-based code editor with diff support, workspace tsconfig + @types loaded for real type checking
- **Diff** — live git diff viewer with folding, inline editing, and save
- **Composer** — agentic coding pane (see above)
- **Journal** — per-project journaling with date pagination, AI-generated daily digest
- **Home** — workspace dashboard with project cards, graph stats, quick launch grid, git status, PR/CI badges
- **File browser** — tree view with search, drag-to-mention, create file/folder, context menus
- **Git workflow** — branch switcher, push/pull with feedback, discard, stash, undo commit, PR creation, worktree management
- **Split panes** — up to 6 per tab
- **Custom audio engine** — ambient feedback sounds, boot/shutdown ceremonies, configurable sound styles
- **System metrics** — live CPU and memory in the header bar, process breakdown popover
- **Onboarding** — 4-phase boot sequence (operator ID, display calibration, audio setup, AI consent) with particle burst animation

### Hook System and MCP

- **6 auto-registered hooks:** prompt-enricher, edit-gate, outcome-capture, feedback-detector, async-analyzer, file-changed
- **MCP server (`phantom-ai`)** with 10+ tools:
  - `phantom_before_edit` — pre-edit context + blast radius + strategy (one call does it all)
  - `phantom_graph_context` — file dependency deep-dive
  - `phantom_graph_blast_radius` — what breaks if a file changes
  - `phantom_graph_related` — find all files involved in a feature
  - `phantom_graph_stats` — graph coverage statistics
  - `phantom_graph_path` — shortest dependency path between two files
  - `phantom_orchestrator_process` — route goals through the strategy pipeline
  - `phantom_orchestrator_history` — learn from past decisions
  - `phantom_evaluate_output` — verify AI output quality
  - `phantom_list_projects` — enumerate tracked projects
- **Auto-registration** in `~/.mcp.json` and `~/.claude/settings.json`
- **Hook events visible** in Composer via `--include-hook-events`

### Gamification

- **XP system** with 6 stat categories: Intelligence, Strength, Sense, Vitality, Agility, Perception
- **Achievements** and **daily quests**
- **Streaks** — consecutive day tracking
- **Rank progression** with level thresholds
- **Hunter profile** — stats dashboard on the home screen
- **Cockpit view** — analytics dashboard with XP bar, skill usage, session metrics

### Multi-Provider Support

Config-driven provider architecture supporting multiple AI CLIs.

| Provider | Status | Notes |
|---|---|---|
| **Claude Code** | Full support | Primary target — sessions, streaming, conversation parsing, cost tracking |
| **OpenAI Codex** | Supported | SQLite + JSONL session discovery, event schema parsing |
| **Gemini** | Config-ready | YAML config; adapter pending |

Provider configs are 3-tier: embedded defaults > user overrides (`~/.phantom-os/providers/`) > custom providers (`~/.phantom-os/providers/custom/`).

---

## Architecture

Three-layer split:

```
┌─────────────────────────────────────────┐
│  SolidJS Frontend (frontend/src/)       │
│  Reactive UI, pane orchestration,       │
│  vanilla-extract styling                │
├─────────────────────────────────────────┤
│  Wails Bindings                         │
│  Type-safe RPC between Go and frontend  │
├─────────────────────────────────────────┤
│  Go Backend (internal/)                 │
│  Git ops, file watching, AI engine,     │
│  MCP server, SQLite, providers          │
└─────────────────────────────────────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Desktop runtime | [Wails](https://wails.io/) v2.12 + WebKit |
| Backend | Go 1.25 |
| Frontend | [SolidJS](https://www.solidjs.com/) + TypeScript |
| Styling | [vanilla-extract](https://vanilla-extract.style/) (typed CSS modules) |
| Database | SQLite via [sqlc](https://sqlc.dev/) |
| Terminal | [xterm.js](https://xtermjs.org/) 6.0 (497 themes) |
| Editor | [Monaco](https://microsoft.github.io/monaco-editor/) |
| File watching | [fsnotify](https://github.com/fsnotify/fsnotify) |
| AI integration | MCP (Model Context Protocol) + hook system |
| State management | [Jotai](https://jotai.org/) |
| UI primitives | [Kobalte](https://kobalte.dev/) |

## Project layout

```
phantom-os/
├── v2/                     # Active codebase (this is the app)
│   ├── internal/           # Go backend
│   │   ├── ai/            #   AI engine (strategies, orchestrator, graph, learning)
│   │   ├── chat/           #   Chat service (Claude CLI streaming)
│   │   ├── collector/      #   Session/task/todo watchers
│   │   ├── db/             #   SQLite schemas + sqlc queries
│   │   ├── git/            #   Git operations (hardened wrapper)
│   │   ├── mcp/            #   MCP server (phantom-ai tools)
│   │   ├── provider/       #   Multi-provider system (Claude, Codex, Gemini)
│   │   ├── stream/         #   JSONL streaming + event parsing
│   │   ├── terminal/       #   PTY management
│   │   └── ward/           #   Safety rules engine
│   ├── frontend/           # SolidJS frontend
│   │   └── src/
│   │       ├── components/ #   UI components (panes, sidebar, composer, etc.)
│   │       ├── core/       #   Audio, editor, bindings, branding
│   │       └── styles/     #   vanilla-extract theme + recipes
│   ├── configs/            # Provider config TOMLs/YAMLs
│   ├── docs/               # Design docs, plans, research
│   ├── build/              # Build artifacts + macOS plist/entitlements
│   └── Makefile            # dev / release / signing targets
├── docs/                   # Landing page + release setup
├── .env.notarize.example   # Apple notarization template
└── CHANGELOG.md            # Auto-generated from conventional commits
```

## For agents

If you are an LLM/coding agent loading this repo, start with **`v2/llms-full.txt`** at the repo root. It is a single-file digest of the curated docs (README, AI engine, config-driven architecture, plans) and is sized to fit in a single context window.

Regenerate it after doc changes:

```bash
cd v2 && make docs-llm
```

---

## Contributing

This is an early-stage project. Issues and PRs welcome — but expect things to move fast and break.

## License

TBD.
