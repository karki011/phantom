# Phantom Product V2 — Design Decisions

> Date: 2026-05-09
> Author: Subash Karki
> Branch: feature/product-v2

## Identity

**One-liner:** "The developer workspace that understands your codebase and gets smarter the more you use it."

AI-native, opinionated developer workspace. Not a VS Code clone. For AI power users and dev tool enthusiasts.

- macOS first, cross-platform later
- Claude first, multi-provider later
- Hybrid Approach A+C: AI-native workspace with opinionated choices

## 5 Differentiators

1. **Codebase brain** — dependency graph + blast radius prediction
2. **Strategy intelligence** — 12 reasoning strategies, complexity-based selection
3. **Learning loop** — outcomes adjust future strategy selection
4. **Worktree-native** — isolated workspaces per branch
5. **Crafted experience** — procedural audio, 22 themes, cinematic onboarding

## What Gets Cut

- Gamification (RPG system: XP, ranks, stats, achievements, quests)
- ONNX embeddings (replace with SQLite FTS5)
- Composer V1 (2807-line monolith, V2 replaces)
- Chat redirect pane (legacy shim)
- Markdown preview pane (barely functional)
- Journal pane (replaced by digest drawer)
- Playground pane (dev tool, not user feature)
- Wards/Safety system (nice-to-have, not core)
- Diff pane (merge into editor)

## What Stays

- Terminal (production-quality)
- Editor (Monaco, add: unsaved prompt, global search)
- Composer V2 (primary AI surface)
- Home/dashboard (worktree landing)
- Git/worktrees (first-class differentiator)
- AI Engine (strategy pipeline, learning loop, MCP server)
- Audio/theming (part of identity)
- Onboarding (streamlined: 7 phases → 4)

## What's New

- AI digest drawer (end-of-day notification with cost intelligence)
- Error toast system (red/danger variant)
- Global content search (grep from UI)
- Keyboard shortcut cheat sheet
- SQLite FTS5 for decision matching (replaces ONNX vectors)
- Detector/coordinator pipeline for context enrichment
- Cost intelligence layer (price table, pace coloring, cost model versioning)
- Work-type self-classification (inject-tag-extract-strip from CZ collector)

## Architecture Changes

- Break `internal/app/` god package (40 files) into domain packages
- Each domain owns its own `bindings.go`
- Event system: codegen from `events.yaml` → Go + TypeScript types
- Wails binding codegen (eliminate manual window.go.app.App.X calls)
- Frontend: surface errors via toasts, stop swallowing silently
- Remove CGO dependency (ONNX removal makes pure Go build)

## Phased Roadmap

- Phase 0: Branch + prune (delete cut features)
- Phase 1: Architecture cleanup (god package breakup, error handling)
- Phase 2: Composer V2 completion
- Phase 3: AI Engine evolution (detectors, cost intelligence, FTS5)
- Phase 4: UX polish (onboarding, digest, search, shortcuts)
- Phase 5: Stabilize & ship

## Lessons from CZ AI Collector

- Work-type self-classification (inject-tag-extract-strip)
- Detector/coordinator pattern for context enrichment
- Cost model versioning on every event
- ULID event IDs for time-ordered streams
- Pace coloring (usage vs time elapsed)
- Fail-open + watchdog hysteresis for background services
- YAML-driven context config
