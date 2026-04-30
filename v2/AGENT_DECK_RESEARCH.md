# Agent Deck vs Phantom-OS v2 — Research & Upgrade Recommendations

**Author:** Subash Karki
**Date:** 2026-04-29
**Status:** Research report — non-binding recommendations
**Scope:** Compare `asheshgoplani/agent-deck` (GitHub) against `/Users/subash.karki/phantom-os/v2`. Identify upgrades worth adopting. Do **not** modify any code.

---

## 0. TL;DR — Executive Summary

- **Different shapes, same problem.** Agent Deck is a TUI (terminal-only) coordinator for many AI CLI sessions across many projects; Phantom-OS v2 is a Wails desktop GUI focused on rich worktree workflows for *one* developer at a time. They overlap in: session lifecycle, MCP management, status detection, cost tracking, hooks.
- **The five highest-ROI ideas to steal:** (1) **Session Fork** (one-keystroke branch from any conversation), (2) **MCP Manager UI** with per-session/global toggle (v2 has the backend, no UI), (3) **Conductor pattern** (a persistent supervisor agent that routes work + escalates), (4) **Watchers / external event ingress** (GitHub/Slack/ntfy → trigger a session), (5) **Skills Manager** with materialize-to-`.claude/skills` workflow.
- **Things to *not* copy:** TUI-only patterns (Phantom is a GUI), tmux socket isolation (no tmux in v2), Python watchdog daemon (v2 is single-binary Go), the optional Telegram bridge as a v1 feature (scope creep — defer).
- **One stack note (corrects the project CLAUDE.md):** Phantom-OS v2 frontend is **SolidJS + Vanilla Extract + Kobalte**, NOT React/Chakra. Chakra v2-vs-v3 concerns do not apply here. Recommendations are framed in Solid + Kobalte terms.
- **Blockers:** None for research itself. Implementation blockers called out per recommendation. Open questions in §6.

---

## 1. What is `agent-deck`

Agent Deck is a Go-based terminal app (TUI + CLI + small web UI) that acts as **mission control for terminal AI agents** — Claude Code, Codex, Gemini, OpenCode, Cursor — across many projects on one machine. Its core flow: register projects/sessions, attach to them in a tmux-managed list, fork conversations, attach/detach MCP servers and Claude Skills per session or globally, and watch live status (`running ● / waiting ◐ / idle ○ / error ✕`). Higher-order features layer on top: **Conductor** (a persistent meta-agent that supervises other sessions and escalates via Telegram/Slack/ntfy), **Watchers** (webhook/GitHub/Slack/ntfy → conductor), **Cost Dashboard** (token/cost rollups with budgets), **Container Sandboxing** (Docker overlay sessions), and **Remote SSH** session management. Storage is SQLite under `~/.agent-deck/`; config is a single `~/.agent-deck/config.toml`.

Source confirmed: GitHub repo public, README at `https://github.com/asheshgoplani/agent-deck` (~4 KB indexed README, plus directory listing). Python watchdog daemon and TUI frontend (Bubble Tea-style) are the only non-Go components.

## 2. What is `phantom-os/v2`

Phantom-OS v2 is a **Wails desktop application** (Go backend embedding a SolidJS frontend) that gives one developer a rich GUI workspace built around **git worktrees**. Backend (`internal/`) covers `provider` (Claude/Codex pluggable adapters, YAML-config-driven per `docs/DESIGN-config-driven-architecture.md`), `session` lifecycle + `linker` (binds terminal panes to AI sessions via CWD + PID ancestry), `collector` (5 fsnotify-driven watchers: SessionWatcher, JSONLScanner, ActivityPoller, TaskWatcher, TodoWatcher), `mcp` (server, project handlers, indexer pool), `safety` (chat middleware, PII rules, audit), `git` (worktrees, blame, PR/CI integration), `pricing`, `journal`, `gamification`, `chat`, `tui`, `ws`. Frontend (`frontend/src/`) is SolidJS with Vanilla Extract for styling, Kobalte for primitives, xterm.js terminals, Monaco editor, command palette, tour, themes, and a heavy `shared/` component library. Data: SQLite via sqlc; build via `wails` + `pnpm build`.

Author: Subash Karki. Single-developer focus, deeply integrated GUI, NOT a multi-project coordinator.

## 3. Side-by-side comparison

| Dimension | agent-deck | phantom-os/v2 |
|---|---|---|
| **Form factor** | TUI (Bubble Tea-style) + CLI + small web UI on `:8420` | Native desktop app (Wails, embedded webview) |
| **Backend lang** | Go 1.24+ | Go (see `go.mod`), Wails v2 |
| **Frontend** | None (TUI); web UI uses Chart.js | **SolidJS + Vanilla Extract + Kobalte** (NOT React/Chakra) |
| **State mgmt** | In-process Go state + SQLite | SolidJS signals (`frontend/src/core/signals/*.ts` — 24 signal modules) |
| **Routing** | TUI screens + key shortcuts | SolidJS screens (`frontend/src/screens/*`: boot, docs, hunter, onboarding, shutdown, system); top-tab via `signals/app.ts` |
| **Styling** | Terminal palette (Tokyo Night-ish) | Vanilla Extract `*.css.ts` + theme files (`styles/theme.css`, terminal themes) |
| **Agent/AI model** | Black-box CLI sessions in tmux panes; status inferred from output + transcripts | Pluggable `provider.Provider` interface (`internal/provider/provider.go:141-194`); 6 sub-interfaces (Identity, Discoverer, Parser, CostCalc, Runner, Paths) |
| **Session lifecycle** | tmux session per agent, SQLite-tracked, fork via transcript copy + new tmux | `SessionWatcher` fsnotify on provider sessions dir, debounce 200ms, upsert + auto-tail; `linker` binds terminal pane → session by CWD/PID |
| **MCP** | First-class: TUI manager + socket pool (shares MCP processes via Unix sockets, ~85-90% memory savings) + per-scope toggle | Backend exists (`internal/mcp/{handlers,indexer_pool,project,server,types}.go`) and `internal/integration/mcp_config.go`; **no dedicated UI surface** — MCP not user-toggleable from GUI |
| **Hooks** | Claude Code hooks for cost/transcript ingestion | Six JS hooks (`hooks/*.js`): async-analyzer, edit-gate, feedback-detector, file-changed, outcome-capture, prompt-enricher (richer than agent-deck's hooks) |
| **Cost tracking** | TUI dashboard + web `/costs` page; SSE; CSV/JSON export; budgets w/ 80% warn + 100% hard stop | `internal/pricing/pricing.go` exists; `estimated_cost_micros` per session referenced in design doc; **no budget enforcement, no export** |
| **Multi-project** | Core feature — manages 10+ projects at once | Single-workspace at a time (worktree-centric); top-tab cycles `system` / `worktree` |
| **Remote/SSH** | `agent-deck remote add` registers SSH boxes; sessions appear inline | None |
| **Sandbox** | Docker overlay sessions (`T` to attach container shell) | None |
| **Watchers / event ingress** | webhook / github / ntfy / slack adapters → conductor | None |
| **Conductor (supervisor)** | Persistent supervisor session; escalates; Telegram/Slack bridges | Not present — closest analogue is `internal/safety` + `internal/chat/service.go` |
| **Build tooling** | Go build + install.sh / Homebrew tap | `Makefile` + `wails` + `pnpm` (`wails.json`); `sqlc.yaml` for DB |
| **Database** | SQLite at `~/.agent-deck/` | SQLite via sqlc, default path `db.DefaultDBPath()`; v1 import path supported |
| **Config** | TOML at `~/.agent-deck/config.toml` (single file) | YAML per provider at `~/.phantom-os/providers/{name}.yaml` (per design doc) |
| **Distribution** | curl-pipe-bash, Homebrew, single Go binary | `Makefile` build, Wails packaging (macOS app) |

---

## 4. Top 8 concrete upgrade ideas (ranked by ROI)

### #1 — Session Fork (highest ROI)

- **(a) What agent-deck does:** Press `f` to instantly fork any Claude conversation, `F` for a custom-name dialog. The fork inherits full history. Forks of forks are supported. Implementation copies the transcript JSONL into a new session directory and starts a fresh tmux pane pointed at it.
- **(b) Why for phantom-os/v2:** Today, "try a different approach without losing my current session" requires the user to abandon, restart, re-paste context. A one-keystroke branch is the single most asked-for AI workflow primitive in 2026. Direct customer benefit: experimentation cost drops to zero — they can compare two strategies side-by-side in a split pane (which v2 already supports via `core/panes`).
- **(c) Effort:** **M** (medium). Most plumbing already exists.
- **(d) Files that would change:**
  - `internal/provider/provider.go` — add `ForkSession(ctx, sessionID, newName) (newID string, err error)` to a new optional sub-interface (or extend `CommandRunner`).
  - `internal/provider/claude/claude.go` — implement: locate transcript via `FindConversationFile`, copy JSONL with new UUID, register via `SessionWatcher` upsert flow.
  - `internal/app/bindings_terminal_sub.go` (or a new `bindings_session_fork.go`) — Wails binding `ForkSession(sessionID, name string)`.
  - `frontend/src/core/bindings/` — TypeScript wrapper.
  - `frontend/src/core/signals/sessions.ts` — `forkSession()` action.
  - `frontend/src/shared/CommandPalette/` — register "Fork session" command, default key `Cmd+Shift+F`.
  - Optional: new dialog under `frontend/src/shared/` (e.g., `ForkSessionDialog`) modeled on `NewWorktreeDialog`.

### #2 — MCP Manager UI (per-session toggle)

- **(a) What agent-deck does:** Press `m` for a TUI panel listing all MCP servers defined in `config.toml`. `Space` toggles a server on/off, `Tab` cycles scope (LOCAL = this project / GLOBAL = all sessions), type-to-jump. Apply restarts the MCP child automatically.
- **(b) Why for phantom-os/v2:** v2 already has the *hardest* part — `internal/mcp/server.go`, `indexer_pool.go`, `project.go`, plus `internal/integration/mcp_config.go`. The *missing* part is a GUI surface so users can toggle per-project without hand-editing JSON. This is the lowest-effort, highest-visibility "polish what you already built" win. Tied to **Less is More** — no new backend code, just expose what exists.
- **(c) Effort:** **S** (small) for v1 (read-only list + toggle), **M** if you also add the global/local scope cycle and live restart.
- **(d) Files that would change:**
  - `internal/app/` — add `bindings_mcp.go` exposing `ListMcpServers`, `ToggleMcpServer(name, scope)`, `RestartMcpServer(name)`.
  - `internal/integration/mcp_config.go` — already parses MCP config; add a write path.
  - `frontend/src/shared/` — new `McpManagerDialog/` (modeled on `SettingsDialog/sections/`).
  - `frontend/src/core/signals/` — new `mcp.ts`.
  - `frontend/src/shared/CommandPalette/` — register "Toggle MCP servers" (`Cmd+M` or via palette).
  - `frontend/src/shared/SettingsDialog/sections/` — add an MCP section linking to the manager.

### #3 — Watchers (external event ingress → session trigger)

- **(a) What agent-deck does:** Listens for inbound events (GitHub webhooks with HMAC verification, ntfy push, Slack via Cloudflare Worker bridge, generic webhook) and forwards a short event string to a conductor session. Adapter creation is `agent-deck watcher create github --name gh-alerts --secret $SECRET`. Routing rules in `~/.agent-deck/watcher/<name>/clients.json`. Events deduped in SQLite by `(watcher_name, event_id)`.
- **(b) Why for phantom-os/v2:** Phantom is currently a *pull*-only system (user opens app, user types). The "agent-aware desk" vision needs *push* — "when CI fails, surface it; when a teammate comments on the PR, notify; when a long task finishes, pop the session." This is the most strategic adoption because it changes Phantom from a sophisticated terminal UI into a true **mission control**. Tied to **Delight the Customer** — this solves a real interruption-management problem.
- **(c) Effort:** **L** (large). New service, security model (HMAC verification non-trivial), routing, and UI. Recommend shipping `webhook` + `github` first; defer `ntfy`/`slack` to a follow-up.
- **(d) Files that would change:**
  - New package: `internal/watcher/` (`server.go`, `adapter_webhook.go`, `adapter_github.go`, `routes.go`, `dedupe.go`).
  - `main.go` — start watcher server alongside collector (after step 5 in the boot sequence).
  - `internal/db/` — add migration for `watcher_events(watcher_name, event_id, payload, received_at)`.
  - `internal/app/bindings_watcher.go` — Wails bindings for create/list/test/route.
  - `frontend/src/screens/system/SystemCockpit.tsx` — add a Watchers panel.
  - Settings entry in `frontend/src/shared/SettingsDialog/sections/`.

### #4 — Conductor (persistent supervisor agent)

- **(a) What agent-deck does:** A long-running agent session that monitors other sessions, auto-responds when confident, escalates when not. Holds its own state in `~/.agent-deck/conductor/<name>/` with `CLAUDE.md`, `AGENTS.md`, `POLICY.md`, `LEARNINGS.md`, and a `task-log.md`. Per-conductor Claude config via `[conductors.<name>.claude]` overrides.
- **(b) Why for phantom-os/v2:** Phantom already has `internal/safety` (chat middleware, PII rules, evaluator) and `internal/chat/service.go` — a partial supervisor. Promoting this to a first-class **Conductor** is the natural next step: a persistent "Hunter" (already in `screens/hunter`) that runs in the background, classifies events from §3 watchers, and auto-routes or escalates. This unifies several v2 concepts (safety, gamification "wards", chat) under one mental model.
- **(c) Effort:** **L**. Touches state machine, persistence, UI, and policy. Recommend a v0 conductor that only logs + escalates (no auto-respond) before adding actions.
- **(d) Files that would change:**
  - New `internal/conductor/` (`conductor.go`, `policy.go`, `state.go`, `escalation.go`).
  - `internal/safety/` — split `evaluator.go` into a reusable policy engine the conductor can call.
  - `internal/chat/service.go` — add a "supervisor" caller path.
  - `internal/db/` — migration for `conductor_state` and `conductor_log`.
  - `frontend/src/screens/hunter/` — repurpose as Conductor home (already exists, currently underused based on screen list).
  - `frontend/src/core/signals/` — new `conductor.ts`.

### #5 — Skills Manager (project-scoped Claude Skills)

- **(a) What agent-deck does:** Press `s` to manage Claude skills per project. Available list is pool-only (`~/.agent-deck/skills/pool`) for deterministic attach/detach. Apply writes `.agent-deck/skills.toml` to the project and materializes into `.claude/skills/`. Type-to-jump dialog.
- **(b) Why for phantom-os/v2:** Skills are the de-facto unit of agent reuse. Today, v2 users hand-manage `.claude/skills/`. Adding a managed pool + per-project state file means Phantom can show "this worktree has skills X, Y, Z attached" in the sidebar and offer one-click attach. Pairs naturally with the worktree-centric model. **Commit and Iterate** — start with read-only listing, then add attach/detach.
- **(c) Effort:** **M**. Mostly file-management plus UI.
- **(d) Files that would change:**
  - New `internal/skills/` (`pool.go`, `manifest.go`, `materialize.go`).
  - `internal/app/bindings_skills.go`.
  - `frontend/src/shared/SkillsManagerDialog/` (new).
  - `frontend/src/components/sidebar/` — small "skills attached" badge per worktree.
  - `frontend/src/core/signals/skills.ts`.

### #6 — Cost dashboard with budgets + export

- **(a) What agent-deck does:** TUI `$` and web `/costs` page with daily/weekly/monthly views, model breakdown, group drill-down, SSE live updates, CSV/JSON export, and configurable budgets (80% warn / 100% hard stop) at daily/weekly/monthly/per-group/per-session granularity. 13 models priced; daily price refresh.
- **(b) Why for phantom-os/v2:** v2 has `internal/pricing/pricing.go` and per-session `estimated_cost_micros` — the data exists. The gaps are: (a) a real dashboard (today only the home screen shows per-session cost), (b) budgets, (c) export. As a CloudZero employee, *cost intelligence is on-brand* — this is a feature the user community likely wants and v2's design doc already calls out tokens/cost as first-class fields. **Delight the Customer** + **Own the Outcome** — finish the data story.
- **(c) Effort:** **M**. Backend mostly there; frontend dashboard is the bulk.
- **(d) Files that would change:**
  - `internal/pricing/pricing.go` — add `BudgetService` (eval + emit warn/stop events).
  - `internal/app/bindings_cost.go` — `GetCostRollup(period, groupBy)`, `ExportCostsCSV()`, `SetBudget(scope, limit)`.
  - `frontend/src/screens/system/SystemCockpit.tsx` or a new `screens/costs/` — dashboard.
  - `frontend/src/shared/BarChart` (already exists) — reuse for cost charts.
  - `frontend/src/shared/SettingsDialog/sections/` — new "Budgets" section.
  - `frontend/src/core/signals/cost.ts` (new).

### #7 — Status detection symbols + idle/waiting/error semantics

- **(a) What agent-deck does:** Smart polling classifies every agent into `running ●` (green) / `waiting ◐` (yellow, needs input) / `idle ○` (gray) / `error ✕` (red). Tmux status bar surfaces waiting sessions; `Ctrl+b 1-6` jumps to them.
- **(b) Why for phantom-os/v2:** v2's `SessionWatcher` already detects `active` status and `stale` status (5s detector mentioned in `ai-engine.md`), but the user-facing semantic is binary (active vs not). Adopting the four-state model in the sidebar would make "which sessions need me right now" instantly visible and is dirt-cheap to implement on top of existing collector. **Less is More** — no new infra, just clearer semantics.
- **(c) Effort:** **S**. ~1 day.
- **(d) Files that would change:**
  - `internal/collector/session_watcher.go` — extend status enum to `running|waiting|idle|error`; classify based on last activity timestamp + pending tool-use markers in JSONL.
  - `internal/collector/events.go` — emit status transitions.
  - `frontend/src/core/signals/sessions.ts` — already has session shape; add `status` discriminant.
  - `frontend/src/components/sidebar/` — add status dot icon.
  - `frontend/src/components/panes/Workspace.tsx` — header indicator.

### #8 — `llms-full.txt` + machine-readable docs surface

- **(a) What agent-deck does:** Ships an [`llms-full.txt`](https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/llms-full.txt) and a Claude plugin marketplace entry, so any LLM can answer "how do I X in agent-deck?" by reading one URL.
- **(b) Why for phantom-os/v2:** v2 already has rich `docs/` (PLANs, RESEARCH, HANDOFFs, ai-engine.md). Concatenating a curated subset into `llms-full.txt` at the repo root and publishing a small Claude skill (the project already has `.claude/`) means any agent — including phantom-ai itself — can self-document. Cheap, compounding ROI. **We, Not I** — lowers contribution friction.
- **(c) Effort:** **S**. A `Makefile` target + a manifest.
- **(d) Files that would change:**
  - New `Makefile` target `docs-llm` that concatenates `docs/ai-engine.md` + selected PLAN/RESEARCH files into `llms-full.txt`.
  - New `.claude/skills/phantom-os/SKILL.md`.
  - `README.md` — link the file.

---

## 5. Things to *NOT* copy

- **TUI as primary surface.** Phantom is a GUI. Don't import Bubble Tea idioms or terminal-only layouts. The keyboard-shortcut model is fine; the TUI rendering model is not.
- **tmux socket isolation (`socket_name`).** Phantom does not run sessions inside tmux — `internal/terminal` manages PTYs directly via xterm.js. The whole `[tmux]` config block from agent-deck has zero applicability.
- **Python watchdog daemon.** Agent-deck's optional auto-restart daemon is in Python. v2 is single-binary Go on purpose. If you want the same capability, write it as a goroutine in `internal/collector/` or `internal/watcher/` — do not introduce a Python runtime dependency.
- **Telegram bridge as a v1 feature.** Mobile bridges are a *late*-stage feature. Adopting them too early balloons scope and adds OAuth/secret-management surface that distracts from the core upgrades. Defer.
- **Docker overlay sandboxing.** Useful, but a heavy dependency that requires Docker on the user's machine. Phantom's audience (single dev, deep workspace) doesn't need it for v1; the worktree boundary already gives most of the safety. Revisit only if you find concrete data of users running risky agents.
- **`config.toml` as a single global file.** v2 already chose YAML-per-provider (`docs/DESIGN-config-driven-architecture.md`), which is *better* for the multi-provider use case. Don't regress to one TOML.
- **Chakra UI v2 patterns** (the project CLAUDE.md mentions translating these): **N/A — this codebase has no Chakra at all.** It uses Kobalte primitives and Vanilla Extract recipes. Any time someone references "Chakra v3 recipes" in the context of this repo, that's the project-level CLAUDE.md leaking from another repo. Worth flagging back to Subash.
- **Public GitHub Discussions feedback widget posting via `gh api graphql`.** Cute for an OSS TUI; awkward for a desktop app. Use a normal feedback channel.

---

## 6. Open questions

1. **Is phantom-os/v2 intended for a single user (you) or a public/team release?** This determines whether features like Watchers, Conductor, and Skills Manager are worth their effort. If single-user, prioritize #1 (Fork) and #2 (MCP UI) and stop.
2. **Project CLAUDE.md says "Chakra UI v3 mandatory"** — but this repo uses SolidJS + Kobalte + Vanilla Extract. Is the global CLAUDE.md a leftover from a different project, or do you intend to migrate the frontend? (Strong recommend: leave Solid as-is — the migration cost dwarfs any UI-library benefit and Solid's perf model fits a desktop app.)
3. **Is a `Conductor` aligned with the existing `Hunter` screen?** `frontend/src/screens/hunter/` is in the tree but I didn't open it. If Hunter is already the supervisor concept, recommendation #4 is more like "finish what's started" than "new feature."
4. **MCP server count + memory pressure** — agent-deck's socket-pool delivers 85-90% memory savings *because* sessions share MCP processes. v2 has `internal/mcp/indexer_pool.go` already, suggesting partial pooling. Worth investigating whether this is a real problem for your usage before lifting agent-deck's full pooling design.
5. **Cost dashboard scope** — do you want budget *enforcement* (hard stop the agent at 100%), or just visibility? Enforcement is a 2-3x bigger effort and risks blocking legitimate work mid-task. Recommend visibility-only for v1.
6. **Skill discovery directory** — agent-deck uses `~/.agent-deck/skills/pool/`. v2's design doc uses `~/.phantom-os/providers/`. Should skills live under `~/.phantom-os/skills/pool/` to match? If not, what?
7. **Watchers + safety** — if you adopt Watchers (#3), how should `internal/safety` evaluate auto-triggered events? Current safety rules assume a human-typed prompt; auto-triggered conductor input may need a separate ruleset.
8. **The `RESEARCH-product-name.md` file in `docs/`** suggests the product name might still be in flux. Worth deciding before any user-facing UI changes referencing the brand.

---

## File paths referenced

Phantom-OS v2:
- `/Users/subash.karki/phantom-os/v2/main.go`
- `/Users/subash.karki/phantom-os/v2/wails.json`
- `/Users/subash.karki/phantom-os/v2/frontend/package.json`
- `/Users/subash.karki/phantom-os/v2/frontend/src/app.tsx`
- `/Users/subash.karki/phantom-os/v2/frontend/src/core/keyboard.ts`
- `/Users/subash.karki/phantom-os/v2/frontend/src/core/signals/` (24 files)
- `/Users/subash.karki/phantom-os/v2/frontend/src/screens/{boot,docs,hunter,onboarding,shutdown,system}/`
- `/Users/subash.karki/phantom-os/v2/frontend/src/shared/CommandPalette/`
- `/Users/subash.karki/phantom-os/v2/internal/{ai,api,app,branding,chat,claude,collector,db,editor,gamification,git,integration,journal,linker,mcp,plugin,pricing,project,provider,safety,session,stream,terminal,tui,ws}/`
- `/Users/subash.karki/phantom-os/v2/hooks/{async-analyzer,edit-gate,feedback-detector,file-changed,outcome-capture,prompt-enricher}.js`
- `/Users/subash.karki/phantom-os/v2/docs/ai-engine.md`
- `/Users/subash.karki/phantom-os/v2/docs/DESIGN-config-driven-architecture.md`
- `/Users/subash.karki/phantom-os/v2/docs/PLAN-home-redesign.md`

Agent Deck (external reference, GitHub):
- `https://github.com/asheshgoplani/agent-deck`
- `https://raw.githubusercontent.com/asheshgoplani/agent-deck/main/README.md`
- `documentation/CONDUCTOR.md`, `documentation/SKILLS.md`, `documentation/WATCHDOG.md`, `documentation/WATCHERS.md`
- `skills/agent-deck/references/{cli,config,tui,sandbox,troubleshooting}-reference.md`
