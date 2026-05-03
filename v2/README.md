# Phantom (v2)

Phantom is a Wails-based desktop app for managing AI coding sessions across multiple providers (Claude Code, Codex, etc.) with a config-driven provider architecture and a local AI reasoning engine.

## How this was built

Fully vibe-coded — built end-to-end through natural-language prompts in Claude Code, no spec-first or TDD-first ceremony.
The workflow is tuned for Anthropic's Claude (Sonnet/Opus): Claude Code CLI, Claude API integration, MCP servers all assume it as the primary copilot.
Other models and tools are supported through the same provider abstraction, but Claude is where the rough edges have been sanded down.
Author: Subash Karki — solo project, hacked together in evenings.
Trade-off worth naming: rapid iteration and opinionated defaults, with the occasional rough edge you'd expect from one person shipping after dinner.

## Highlights

- **Composer** — full agentic coding pane with Claude CLI stream-json output, markdown rendering (headings, code blocks, lists, tables, links, blockquotes), session cost meter, context window gauge (color-coded accent/warning/danger), turn efficiency cards (duration, tokens, cost, files edited, lines changed), auto-accept toggle, ASSISTANT/YOU badges with turn dividers, Monaco DiffEditor for edit cards (syntax-highlighted inline diffs with accept/reject), model picker (Sonnet 4.6/Opus/Haiku), effort level control (Auto/Low/Medium/High/Max), strategy visualization (name, confidence, complexity, risk, blast radius), tool call status badges (spinning ring while running, green checkmark on success, red X on error) with rich tool metadata ("Bash — go test ./..." instead of just "Bash"), tool-specific icons (Read→FileCode, Bash→Terminal, Edit→Pencil, Agent→Bot, Skill→Zap, LS→FolderSearch, Monitor→Eye), tool call grouping (12 agent calls collapse into "Agent (12 calls) — A11y, Security..."), Expand All / Collapse All toggle for tool call sections, collapsible thinking blocks (collapsed by default, click to expand with line count + preview), **syntax highlighting** (highlight.js with github-dark-dimmed theme for code blocks), **token breakdown per tool** (~estimated tokens shown in expanded tool calls), memory viewer panel, skill browser panel, hook event visibility, past sessions sidebar (resume/delete), drag-and-drop file mentions + image paste, no-context mode toggle, Pokémon session names (sessions named "Charizard", "Gengar" instead of UUIDs), conflict detection banner (amber warning when two sessions edit the same repo), optimized resume model (`--resume` on follow-up turns for 2-5x faster first-token), tab auto-rename on session start, new-chat opens new tab (preserves running session), tool result persistence (agent results no longer disappear), session persistence across restarts, **retry failed turns** (RefreshCw button on error turns re-sends the prompt), **conversation search** (Cmd+F opens floating search pill with CSS-based highlighting and match count), **auto-compact warning** (yellow banner at 80% context, red with "Compact Now" at 90%), **plan mode toggle** (toolbar pill that prepends plan-only directive, persisted), **context menu on messages** (right-click → Copy, Retry, Delete), **clickable file paths** (file paths in assistant text open inline preview popover with rendered markdown), **strategy chip fix** (fixed turn-ID race condition where strategy events were silently dropped), **symbol inference** (extracts PascalCase/camelCase identifiers from prompts, greps source tree for blast radius), **accessibility ARIA pass** (landmarks, labels, expanded states, live regions, keyboard handlers, progressbar).
- **AI Engine** — 7+ local reasoning strategies (Direct, Decompose, Advisor, SelfRefine, TreeOfThought, Debate, GraphOfThought), orchestrator pipeline (assess > graph context > blast radius > select strategy > decide > verify > learn), dependency graph intelligence with blast radius analysis, auto-tune (EMA-smoothed), decision learning (per-project + cross-project GlobalPatternStore), hallucination detection, gap detector, penalty system, context injector, **semantic embedding engine** (local ONNX all-MiniLM-L6-v2, 384-dim vectors, cosine similarity search, SQLite-backed VectorStore with TTL), **memory extraction pipeline** (5 accumulators — files, errors, commands, satisfaction, profile — with deterministic single-pass extraction from session transcripts), **confidence decay** (query-time exponential decay on AI decisions — 30d success / 90d failure half-lives, access boost), **ambiguity-aware strategy selection** (Direct penalized 50% for ambiguous tasks, Debate activated at 0.85 threshold), **LLM-powered pattern dedup** (HaikuClient consolidates similar decisions via Anthropic API, semantic clustering at cosine > 0.85, 120s cooldown, audit trail), **session-start memory injection** (SessionMemoryBuilder assembles 4KB phantom-memory block with 5 tiered sections, injected via `--append-system-prompt` on first turn).
- **AI Engine Playground** — interactive dry-run pane: type goals and see strategy selection + alternatives + inferred files + enriched prompt + session memory + graph stats in real-time. Registered in PaneRegistry + Command Palette (searchable as "ai", "playground", "engine", "strategy").
- **Conflict Detection** — multi-session conflict tracker (repo-level via git root resolution + file-level via edit registration), handler pattern for consumers (Composer UI, AI Engine risk assessment, MCP tools, Wards safety), concurrent-safe with cached repo root lookups.
- **Safety** — Ward rules engine (YAML guardrails in `~/.phantom-os/wards/`), PII scanner (emails, API keys, AWS keys, passwords, tokens), edit gate hook (blocks Write/Edit/MultiEdit), audit logging (ward_audit SQLite table), BYOK key in macOS Keychain.
- **Crash Recovery** — interrupted session detection (migration 015 adds `was_interrupted` column, `ReapInterruptedTurns` on boot), amber "Resume?" banner in sidebar for sessions that didn't close cleanly.
- **Terminal** — xterm.js 6.0 with 497 themes, OSC 633 shell integration, Quick-Fix on errors, sticky scroll, jump-to-prompt, Cmd+P command history palette, persistent sessions (hot + cold restore), PTY snapshot via addon-serialize, tab auto-rename via OSC 0/1/2, **terminal activity pipeline** (JSONL tailing gives Composer-level visibility for terminal Claude sessions).
- **Workspace** — Monaco editor with workspace type checking, live git diff viewer, file browser with drag-to-mention, branch switcher, push/pull/discard/stash/undo, PR creation with reviewer chips, worktree management with dirty-files badge, split panes (up to 6), journal with daily digest and **session-enriched summaries** (error resolution rates, command patterns), custom audio engine, system metrics (CPU/memory), boot/shutdown ceremonies, **colored logging** (tint + charmbracelet/log with INFO=green, WARN=yellow, ERROR=red).
- **Hook System** — 7 auto-registered hooks (prompt-enricher, edit-gate, outcome-capture, feedback-detector, async-analyzer, file-changed, **phantom-relay**). MCP server (phantom-ai) with 10+ tools for graph context, blast radius, strategy routing. Auto-registration in `~/.mcp.json` and `~/.claude/settings.json`. **Phantom Relay** captures all Claude Code tool events in real-time via PostToolUse hook with rich content parsing (file paths, diffs, commands, exit codes).
- **Gamification** — XP system with 6 stat categories (Intelligence, Strength, Sense, Vitality, Agility, Perception), achievements, daily quests, streaks, rank progression, hunter profile, cockpit analytics dashboard.
- **BYOK** — store your own Anthropic API key in the macOS Keychain via Settings > AI Provider; fall back to the Claude subscription anytime.
- **Multi-provider** — config-driven provider architecture supporting Claude, Codex, and Gemini. 3-tier config loading: embedded defaults > user overrides > custom providers.
- **Persistent terminals** — addon-serialize PTY snapshot + tab auto-rename via OSC 0/1/2 keep sessions where you left them.

## Quick start

```bash
make frontend-install
make dev
```

Open Composer from the QuickLaunch grid (or hit Cmd+I to focus the prompt composer). See `Makefile` for all targets (`build`, `release-dmg`, `mcp-build`, etc.).

## Repository layout

- `cmd/` — Go entrypoints (Wails app, standalone MCP binary, `onnx-setup` developer tool).
- `internal/` — Go backend: AI engine, providers, app bindings, db (sqlc), git, terminal, tui, MCP, wards, collectors, streaming, conflict detection, embedding engine, memory extraction.
- `internal/ai/embedding/` — Semantic vector search engine (ONNX embedder, VectorStore, cosine similarity).
- `internal/ai/extractor/` — Deterministic memory extraction from session transcripts.
- `internal/ai/knowledge/haiku_client.go` — LLM-powered pattern consolidation via Anthropic API.
- `internal/composer/session_memory.go` — Session-start memory injection builder.
- `internal/app/bindings_playground.go` — AI Engine Playground dry-run binding.
- `internal/conflict/` — Multi-session conflict detection (repo-level + file-level).
- `internal/namegen/` — Pokémon session name generator (200+ Gen 1-3 names).
- `frontend/src/components/panes/PlaygroundPane.tsx` — AI Engine Playground UI.
- `frontend/` — SolidJS + Vanilla Extract + Kobalte UI.
- `configs/` — provider config TOMLs/YAMLs.
- `hooks/` — Claude Code hooks (edit-gate, prompt-enricher, phantom-relay, etc.).
- `docs/` — design docs, plans, research notes.

## ONNX setup (embedding engine)

The embedding engine uses ONNX Runtime + all-MiniLM-L6-v2 for local semantic search. On first launch, Phantom auto-downloads the runtime (~35MB) and model (~87MB) to `~/.phantom-os/lib/` and `~/.phantom-os/models/`. To set up manually:

```bash
# Developer convenience tool
go run cmd/onnx-setup/main.go

# Or set the runtime path explicitly
export ONNX_RUNTIME_LIB=/path/to/libonnxruntime.dylib
```

Search paths for the runtime library (in order): `ONNX_RUNTIME_LIB` env var, `~/.phantom-os/lib/`, relative to executable (`.app` bundles), `/usr/local/lib/`, Homebrew (`/opt/homebrew/lib/` on ARM Mac).

Without ONNX, the system degrades gracefully — `StubEmbedder` returns `ErrONNXNotAvailable` and all non-embedding features continue to work.

## Database migrations

Recent migrations:

| Migration | Table | Purpose |
|---|---|---|
| 012 | `ai_embeddings` | Vector storage for semantic search (id, type, source, text, blob, TTL) |
| 013 | `extraction_offsets` + `session_profile` column | Incremental extraction tracking and session classification |
| 014 | `ai_patterns` extensions + `ai_consolidation_log` | Pattern schema extensions (description, conditions, failure_modes, source, last_consolidated_at) + consolidation audit log |
| 015 | `composer_turns.was_interrupted` | Crash recovery — marks turns that didn't close cleanly |

Migrations run automatically on startup via `internal/db/`.

## For agents

If you are an LLM/coding agent loading this repo, start with **`llms-full.txt`** at the repo root. It is a single-file digest of the curated docs (README, AI engine, config-driven architecture, home redesign plan, phase 1 upgrades plan) and is sized to fit in a single context window.

Regenerate it after doc changes:

```bash
make docs-llm
```

The file is committed to the repo so it can be fetched directly via raw URL.

## Authoritative docs

- `docs/ai-engine.md` — Phantom AI engine (graph, blast radius, orchestrator, providers, streaming, embedding, extraction, conflict detection).
- `docs/DESIGN-config-driven-architecture.md` — provider abstraction and 3-tier config loading.
- `docs/PLAN-home-redesign.md` — home screen redesign plan.
- `docs/PLAN-phase-1-upgrades.md` — current phase 1 PR plan.
- `UPGRADE_ROADMAP.md` — 16-item upgrade roadmap (3 phases).
