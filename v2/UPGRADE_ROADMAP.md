# Phantom-OS v2 — Consolidated Upgrade Roadmap

**Author:** Subash Karki
**Date:** 2026-04-29
**Sources synthesized:** `AGENT_DECK_RESEARCH.md` + `AGENTCHATTR_RESEARCH.md`
**Status:** Ranked roadmap — non-binding. Pick a slice, then commit.

---

## 0. TL;DR

- **16 candidate upgrades** mined from two reference apps; deduped, re-ranked, and grouped into a 3-phase roadmap.
- **Phase 1 (Now, ~1–2 weeks):** Session Fork, MCP Manager UI, Status semantics, Slash commands, Image lightbox, `llms-full.txt`. All S/M effort. Highest ROI per day.
- **Phase 2 (Next, 2–4 weeks):** @mention autocomplete + agent pills, Channels-within-conversation, Multi-select delete, Conversation summaries, Cost dashboard + budgets, Skills Manager.
- **Phase 3 (Later, multi-sprint):** Watchers (external event ingress), Conductor (persistent supervisor), Loop-guarded agent-to-agent chains, Export/Import zip.
- **Three "killer combos"** where two ideas compound: (Fork + Channels), (Loop Guard + Conductor + Watchers), (@mention + Status semantics).
- **Stack note:** Phantom-OS v2 = **Wails + Go + SolidJS + vanilla-extract + Kobalte + sqlc/SQLite**. Confirmed against `frontend/package.json` and `.claude/rules/coding-principles.md`. Not Chakra, not Mantine, not Electron. The parent `~/phantom-os/CLAUDE.md` (Electron + Mantine) describes a *different* sibling project; the global `~/.claude/CLAUDE.md` (Chakra v3) is for yet another project. **For v2, follow `v2/.claude/rules/coding-principles.md`.**

---

## 1. Stack reality check

Three CLAUDE.md files say three different things. Resolved:

| File | Says | Applies to |
|---|---|---|
| `~/.claude/CLAUDE.md` (global) | Chakra UI v3 mandatory | Some other project (likely a CloudZero web app) |
| `~/phantom-os/CLAUDE.md` (parent) | Electron + Mantine + Hono + Jotai | Sibling Electron app at `~/phantom-os/apps/desktop/` |
| `~/phantom-os/v2/.claude/rules/coding-principles.md` | SolidJS + Kobalte + vanilla-extract + sqlc | **This roadmap targets THIS file** |

**Action:** When implementing any item below, follow `v2/.claude/rules/coding-principles.md`:
- `vars.color.*` / `vars.font.*` from `styles/theme.css.ts`
- `buttonRecipe` from `recipes.css.ts` for buttons
- `PhantomModal` for dialogs (never raw Kobalte `Dialog`)
- Kobalte `TextField` for inputs, `Tabs` for tab strips
- Co-locate `*.css.ts` next to component
- `globalStyle()` for descendant selectors
- sqlc regenerate after SQL changes: `~/go/bin/sqlc generate`

---

## 2. Unified backlog — all 16 ideas, ranked by ROI

ROI score = (user-visible benefit × likelihood-of-use) ÷ effort. Tied items broken by "ships independently" preference.

| # | Upgrade | Source | Effort | Phase | Why it ranks here |
|--:|---|---|---|---|---|
| 1 | **Session Fork** (1-keystroke conversation branch) | deck | M | 1 | Most-asked AI workflow primitive; v2 already has split panes to display A/B |
| 2 | **MCP Manager UI** (per-session toggle, scope cycle) | deck | S | 1 | Backend exists; pure "expose what's built" win |
| 3 | **Status semantics** (running/waiting/idle/error dots) | deck | S | 1 | Cheap visibility upgrade on existing collector data |
| 4 | **Slash commands** (`/summary`, `/clear`, `/continue`) | chattr | S | 1 | In-chat power surface; 1 file change |
| 5 | **Image lightbox** + paste/drag polish | chattr | S | 1 | Screenshots are 90% of attachments; obvious gap |
| 6 | **`llms-full.txt`** + machine-readable docs | deck | S | 1 | Compounds: agents can self-document the project |
| 7 | **@mention autocomplete + agent pills** | chattr | S–M | 2 | Turns Compare into directed multi-agent UX |
| 8 | **Channels within a conversation** | chattr | M | 2 | Decouples topics; pairs with Fork |
| 9 | **Multi-select message delete** (drag select) | chattr | S | 2 | Privacy/hygiene gap; backend partial already |
| 10 | **Conversation summaries** | chattr | M | 2 | Cuts cost/latency on resume; reuses journal/knowledge plumbing |
| 11 | **Cost dashboard + budgets + export** | deck | M | 2 | Data exists in `internal/pricing/`; on-brand for CloudZero |
| 12 | **Skills Manager** (project-scoped attach/detach) | deck | M | 2 | Pairs with worktree-centric model |
| 13 | **Loop-guarded agent-to-agent chain** | chattr | M | 3 | Foundation for Conductor; promotes Compare to debate |
| 14 | **Watchers** (GitHub/webhook → session) | deck | L | 3 | Strategic — turns Phantom into mission control |
| 15 | **Conductor** (persistent supervisor agent) | deck | L | 3 | Build on top of Watchers + Loop Guard + existing `internal/safety` |
| 16 | **Export/Import zip** (per-conversation) | chattr | S–M | 3 | Nice-to-have; Phase 3 to keep Phase 1/2 lean |

---

## 3. Phased roadmap

### Phase 1 — Quick wins (target: 1–2 weeks, all S/M)

Total: 6 items. Ship independently. Each is a separate PR.

| Item | Primary files |
|---|---|
| Status semantics | `internal/collector/session_watcher.go`, `internal/collector/events.go`, `frontend/src/core/signals/sessions.ts`, `frontend/src/components/sidebar/` |
| Slash commands | `frontend/src/components/panes/ChatPane.tsx` (handleSend early-return) |
| Image lightbox | new `frontend/src/shared/ImageLightbox/`, `ChatPane.tsx` markdown click binding |
| `llms-full.txt` | new `Makefile` target `docs-llm`, new `.claude/skills/phantom-os/SKILL.md`, `README.md` link |
| MCP Manager UI | new `internal/app/bindings_mcp.go`, new `frontend/src/shared/McpManagerDialog/`, `core/signals/mcp.ts`, palette entry |
| Session Fork | `internal/provider/provider.go` (interface), `internal/provider/claude/claude.go`, new `bindings_session_fork.go`, `core/signals/sessions.ts`, palette entry |

**Phase 1 exit criteria:** all 6 shipped, sidebar shows 4-state status dots, command palette has "Fork session" + "Toggle MCP server", chat input handles `/`-commands.

### Phase 2 — Chat & supervision (target: 2–4 weeks)

Themed: make ChatPane a power surface, expose existing data.

| Item | Primary files |
|---|---|
| @mention autocomplete + pills | `ChatPane.tsx` input, `styles/chat.css.ts` (vanilla-extract pill styles), `core/bindings/providers.ts`, `internal/chat/service.go` (target subset) |
| Channels within a conversation | new migration in `internal/db/migrations/`, sqlc queries, `internal/chat/types.go` (`ChannelID` on Message), `ChatPane.tsx` tab strip (Kobalte `Tabs`, `activationMode="manual"`) |
| Multi-select delete | `internal/db/queries/` (`DeleteMessagesByIDs`), `internal/chat/service.go`, `ChatPane.tsx` (`selectionMode()` signal + drag handler), `chat.css.ts` slide animation |
| Conversation summaries | `internal/chat/service.go` (`SummarizeConversation`), migration adding `summary` column, `ChatPane.tsx` header button |
| Cost dashboard + budgets | `internal/pricing/pricing.go` (`BudgetService`), new `bindings_cost.go`, new `screens/costs/` or extend `screens/system/SystemCockpit.tsx`, reuse `shared/BarChart`, settings "Budgets" section |
| Skills Manager | new `internal/skills/`, new `bindings_skills.go`, new `frontend/src/shared/SkillsManagerDialog/`, sidebar badge, `core/signals/skills.ts` |

**Phase 2 exit criteria:** chat pane supports `@mention`, channels, delete, summaries; users see cost dashboard with at least visibility-only budgets.

### Phase 3 — Mission-control vision (multi-sprint, requires alignment)

Items that change Phantom from sophisticated client → autonomous workstation.

| Item | Primary files |
|---|---|
| Loop-guarded chain | `internal/chat/service.go` (`Chain(...)`), `types.go` (`ChainEvent`), `ChatPane.tsx` Chain toolbar |
| Watchers | new `internal/watcher/` (server, adapter_webhook, adapter_github, dedupe), main.go boot, migration for `watcher_events`, `bindings_watcher.go`, `screens/system/SystemCockpit.tsx` panel |
| Conductor | new `internal/conductor/`, refactor `internal/safety/evaluator.go` into reusable policy engine, `screens/hunter/` repurposed, `core/signals/conductor.ts` |
| Export/Import zip | new `internal/chat/export.go`, service methods, `SettingsDialog/` Project History section |

**Phase 3 exit criteria:** decided in §6 open questions before starting.

---

## 4. Killer combos (compound benefits)

Three pairs where the whole > sum:

### Combo A — **Fork + Channels = Branchable Topic Tree**
Phase 1's Fork ships forks as new top-level conversations. Phase 2's Channels add intra-conversation tabs. Together, you get a 2-level hierarchy: each conversation has channels, each channel can be forked. Mental model: "branch this debug thread without losing planning thread."

**Coordination:** When designing the Channels migration in Phase 2, leave room for `parent_message_id` so Fork can later become "fork from message" instead of "fork from conversation."

### Combo B — **Loop Guard + Watchers + Conductor = Mission Control**
Loop Guard (Phase 3.1) is the technical primitive that makes safe agent-to-agent flow possible. Watchers (Phase 3.2) introduce push-based events. Conductor (Phase 3.3) is the supervisor that consumes Watcher events, decides when to fan out via Loop-Guarded chains, and escalates. Build in this exact order — Conductor without Loop Guard is unsafe; Watchers without Conductor have nowhere to route events.

**Coordination:** Phase 3 only makes sense if you commit to all three. If you stop after Watchers, you have webhooks with no consumer. Decide Phase 3 as a unit.

### Combo C — **@mention + Status semantics = Directed UX**
Phase 1's status dots tell users which provider is `running ● / waiting ◐ / idle ○ / error ✕`. Phase 2's @mention popover already lists providers. Combining them: the @mention popover renders status dots inline, so users see "@codex ●" (running, busy) vs "@claude ○" (idle, ready). Two lines of code in the popover render path; significant clarity gain.

**Coordination:** When wiring `core/signals/sessions.ts` status field in Phase 1, expose it in a shape the @mention popover (Phase 2) can subscribe to without rework.

---

## 5. Things to NOT copy (consolidated)

From both research reports — DO NOT adopt these:

- **TUI as primary surface** (deck) — Phantom is a desktop GUI. Keyboard shortcuts good; Bubble Tea bad.
- **tmux socket isolation** (deck) — Phantom uses xterm.js + PTY directly via `internal/terminal/`.
- **Python sidecar daemon** (deck + chattr both have one) — single-binary Go is a feature, not a constraint.
- **Telegram / mobile bridges as v1** (deck) — defer; not on critical path.
- **Docker overlay sandboxing** (deck) — heavy dep; worktree boundary is sufficient for v1.
- **Single `config.toml`** (deck) — v2's per-provider YAML is already better.
- **MCP-over-HTTP per-instance with terminal stdin injection** (chattr) — Phantom's `internal/linker/` (CWD + PID ancestry) is structurally cleaner.
- **JSONL as primary persistence** (chattr) — sqlc + migrations is the right answer.
- **Vanilla JS megafiles** (chattr `static/chat.js` is 179 KB) — keep component-per-file Solid layout.
- **Default `--dangerously-skip-permissions` / `--yolo` launchers** (chattr) — security ceiling, not a feature gap. Keep `internal/safety/`.
- **Hats (SVG avatar overlays)** (chattr) — feature creep without customer ask.
- **Public GitHub Discussions feedback widget** (deck) — wrong surface for a desktop app.
- **Chakra UI v3 patterns** (global CLAUDE.md) — not applicable to this repo. Translate any "Chakra recipe" guidance to Kobalte primitive + vanilla-extract recipe.

---

## 6. Open questions (must answer before Phase 3)

Numbered for easy reference back from PRs:

1. **Audience.** Single-user (you) or public/team? Phase 3 (Watchers/Conductor) only worth it if multi-user or if you personally want push-based interruption management. If single-user, stop after Phase 2.
2. **Hunter vs Conductor.** `frontend/src/screens/hunter/` already exists. Is Hunter the supervisor concept, or something else? Conductor work in Phase 3 should likely repurpose this screen, not add a new one.
3. **MCP pooling pressure.** Is `internal/mcp/indexer_pool.go` already solving the memory problem agent-deck's socket pool solves? Worth investigating before committing to a bigger pool refactor.
4. **Cost dashboard scope.** Visibility-only or hard-stop budgets? Hard-stop is 2–3× more work and risks blocking legitimate work mid-task. Recommend visibility-only for v1.
5. **Skill discovery dir.** `~/.phantom-os/skills/pool/` to mirror agent-deck's pattern? Or somewhere else?
6. **Watcher safety model.** `internal/safety/` rules assume human-typed prompts. Auto-triggered events need a separate ruleset — design in Phase 3 prep.
7. **Multi-agent direction.** Stay single-AI (today), enrich Compare (Phase 2 @mention), or move toward shared rooms (Phase 2 Channels + Phase 3 Loop Guard)? Phase 2 picks make the Phase 3 path feasible but don't commit you.
8. **Channels vs Jobs.** agentchattr separates them; v2's `internal/collector/` already has `task:new`/`task:update` events. Fuse channel→job into the existing task pipeline, or keep separate?
9. **Provider scope for @mentions.** Limit to enabled providers from `internal/provider/registry.go`, or allow named instances (`@claude-fast`, `@claude-deep`)?
10. **Export format.** JSONL-in-zip (portable, human-readable) or SQLite snapshot (round-trip-perfect)?
11. **Loop guard default hops.** Propose 4. Tunable per workspace.
12. **Product naming.** `docs/RESEARCH-product-name.md` suggests it's not final. Worth deciding before any user-facing UI changes that mention the brand.

---

## 7. Suggested first PR

**Pick:** Status semantics (Phase 1, item #3 in §2).

**Why first:**
- Smallest change set (≤5 files)
- No new UI surfaces — extends existing sidebar/workspace header
- Foundation for Combo C (@mention popover later subscribes to the same signal)
- No new migrations, no new dependencies
- Gives you a feel for the v2 collector → signals → component flow before tackling Fork (item #1)

**What it looks like:**
1. Extend `SessionStatus` enum in `internal/collector/session_watcher.go` to `running | waiting | idle | error`. Classification: `last_activity < 2s` = running, pending tool-use marker in JSONL = waiting, `5s < last_activity < 5min` = idle, error event = error.
2. Emit transitions through `internal/collector/events.go` as a new `session:status` event.
3. Subscribe in `frontend/src/core/signals/sessions.ts`; add `status` to the session shape.
4. Render a colored dot in `frontend/src/components/sidebar/` using `vars.color.*` tokens (success, warning, neutral, error).
5. Mirror in `frontend/src/components/panes/Workspace.tsx` header.

**Acceptance:** open two terminals on different agents, watch sidebar dots flip between running/idle correctly. Trigger an "approval needed" prompt; verify the dot goes yellow.

---

## 8. Sources

- `/Users/subash.karki/phantom-os/v2/AGENT_DECK_RESEARCH.md` (deck — infra/coordination)
- `/Users/subash.karki/phantom-os/v2/AGENTCHATTR_RESEARCH.md` (chattr — chat UX)
- `/Users/subash.karki/phantom-os/v2/.claude/rules/coding-principles.md` (binding for this work)
- External: `https://github.com/asheshgoplani/agent-deck`, `https://github.com/bcurts/agentchattr`
