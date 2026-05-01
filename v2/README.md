# Phantom (v2)

Phantom is a Wails-based desktop app for managing AI coding sessions across multiple providers (Claude Code, Codex, etc.) with a config-driven provider architecture and a local AI reasoning engine.

## How this was built

Fully vibe-coded — built end-to-end through natural-language prompts in Claude Code, no spec-first or TDD-first ceremony.
The workflow is tuned for Anthropic's Claude (Sonnet/Opus): Claude Code CLI, Claude API integration, MCP servers all assume it as the primary copilot.
Other models and tools are supported through the same provider abstraction, but Claude is where the rough edges have been sanded down.
Author: Subash Karki — solo project, hacked together in evenings.
Trade-off worth naming: rapid iteration and opinionated defaults, with the occasional rough edge you'd expect from one person shipping after dinner.

## Highlights

- **Composer** — full agentic coding pane with Claude CLI stream-json output, markdown rendering (headings, code blocks, lists, tables, links, blockquotes), session cost meter, context window gauge (color-coded accent/warning/danger), turn efficiency cards (duration, tokens, cost, files edited, lines changed), auto-accept toggle, ASSISTANT/YOU badges with turn dividers, edit card review (accept/discard per-file with inline diff), model picker (Sonnet 4.6/Opus/Haiku), effort level control (Auto/Low/Medium/High/Max), strategy visualization (name, confidence, complexity, risk, blast radius), tool call status dots (blinking/green/red), thinking blocks (collapsed, expandable), memory viewer panel, skill browser panel, hook event visibility, past sessions sidebar (resume/delete), drag-and-drop file mentions + image paste, no-context mode toggle, session persistence across restarts.
- **AI Engine** — 7+ local reasoning strategies (Direct, Decompose, Advisor, SelfRefine, TreeOfThought, Debate, GraphOfThought), orchestrator pipeline (assess > graph context > blast radius > select strategy > decide > verify > learn), dependency graph intelligence with blast radius analysis, auto-tune (EMA-smoothed), decision learning (per-project + cross-project GlobalPatternStore), hallucination detection, gap detector, penalty system, context injector.
- **Safety** — Ward rules engine (YAML guardrails in `~/.phantom-os/wards/`), PII scanner (emails, API keys, AWS keys, passwords, tokens), edit gate hook (blocks Write/Edit/MultiEdit), audit logging (ward_audit SQLite table), BYOK key in macOS Keychain.
- **Terminal** — xterm.js 6.0 with 497 themes, OSC 633 shell integration, Quick-Fix on errors, sticky scroll, jump-to-prompt, Cmd+P command history palette, persistent sessions (hot + cold restore), PTY snapshot via addon-serialize, tab auto-rename via OSC 0/1/2.
- **Workspace** — Monaco editor with workspace type checking, live git diff viewer, file browser with drag-to-mention, branch switcher, push/pull/discard/stash/undo, PR creation with reviewer chips, worktree management with dirty-files badge, split panes (up to 6), journal with daily digest, custom audio engine, system metrics (CPU/memory), boot/shutdown ceremonies.
- **Hook System** — 6 auto-registered hooks (prompt-enricher, edit-gate, outcome-capture, feedback-detector, async-analyzer, file-changed). MCP server (phantom-ai) with 10+ tools for graph context, blast radius, strategy routing. Auto-registration in `~/.mcp.json` and `~/.claude/settings.json`.
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

- `cmd/` — Go entrypoints (Wails app, standalone MCP binary).
- `internal/` — Go backend: AI engine, providers, app bindings, db (sqlc), git, terminal, tui, MCP, wards, collectors, streaming.
- `frontend/` — SolidJS + Vanilla Extract + Kobalte UI.
- `configs/` — provider config TOMLs/YAMLs.
- `docs/` — design docs, plans, research notes.

## For agents

If you are an LLM/coding agent loading this repo, start with **`llms-full.txt`** at the repo root. It is a single-file digest of the curated docs (README, AI engine, config-driven architecture, home redesign plan, phase 1 upgrades plan) and is sized to fit in a single context window.

Regenerate it after doc changes:

```bash
make docs-llm
```

The file is committed to the repo so it can be fetched directly via raw URL.

## Authoritative docs

- `docs/ai-engine.md` — Phantom AI engine (graph, blast radius, orchestrator, providers, streaming).
- `docs/DESIGN-config-driven-architecture.md` — provider abstraction and 3-tier config loading.
- `docs/PLAN-home-redesign.md` — home screen redesign plan.
- `docs/PLAN-phase-1-upgrades.md` — current phase 1 PR plan.
- `UPGRADE_ROADMAP.md` — 16-item upgrade roadmap (3 phases).
