# PhantomOS v2

PhantomOS is a Wails-based desktop app for managing AI coding sessions across multiple providers (Claude Code, Codex, etc.) with a config-driven provider architecture.

## How this was built

Fully vibe-coded — built end-to-end through natural-language prompts in Claude Code, no spec-first or TDD-first ceremony.
The workflow is tuned for Anthropic's Claude (Sonnet/Opus): Claude Code CLI, Claude API integration, MCP servers all assume it as the primary copilot.
Other models and tools are supported through the same provider abstraction, but Claude is where the rough edges have been sanded down.
Author: Subash Karki — solo project, hacked together in evenings.
Trade-off worth naming: rapid iteration and opinionated defaults, with the occasional rough edge you'd expect from one person shipping after dinner.

## Quick start

```bash
make frontend-install
make dev
```

See `Makefile` for all targets (`build`, `release-dmg`, `mcp-build`, etc.).

## Repository layout

- `cmd/` — Go entrypoints (Wails app, standalone MCP binary).
- `internal/` — Go backend: providers, app bindings, db (sqlc), git, terminal, tui.
- `frontend/` — SolidJS + Vanilla Extract + Kobalte UI.
- `docs/` — design docs, plans, research notes.
- `configs/` — provider config TOMLs.

## For agents

If you are an LLM/coding agent loading this repo, start with **`llms-full.txt`** at the repo root. It is a single-file digest of the curated docs (README, AI engine, config-driven architecture, home redesign plan, phase 1 upgrades plan) and is sized to fit in a single context window.

Regenerate it after doc changes:

```bash
make docs-llm
```

The file is committed to the repo so it can be fetched directly via raw URL.

## Authoritative docs

- `docs/ai-engine.md` — PhantomOS AI engine (graph, blast radius, orchestrator).
- `docs/DESIGN-config-driven-architecture.md` — provider abstraction.
- `docs/PLAN-home-redesign.md` — home screen redesign plan.
- `docs/PLAN-phase-1-upgrades.md` — current phase 1 PR plan.
