# AGENTCHATTR vs PHANTOM-OS/V2 — Research & Upgrade Recommendations

**Author:** Subash Karki
**Date:** 2026-04-29
**Coordination note:** A parallel research file lives at `/Users/subash.karki/phantom-os/v2/AGENT_DECK_RESEARCH.md` (agent-deck comparison). This file is independent.

---

## Executive Summary (5 bullets)

- **Different product categories.** `agentchattr` is a Python/FastAPI **multi-agent chat hub** (MCP server + browser UI) for orchestrating Claude Code, Codex, Gemini, etc. in shared channels. Phantom-os/v2 is a Wails (Go + SolidJS) **desktop AI workstation** with terminal panes, Monaco editor, sessions, and an embedded chat pane. They overlap only in the "chat with AI" surface.
- **Stack mismatch with CLAUDE.md.** Phantom-os/v2 frontend is **SolidJS + vanilla-extract + Kobalte UI** (`frontend/package.json`). It does **not** use Chakra UI v3, despite the global rule. Any "Chakra v3 mandatory" guideline does not apply here — flag this with the user.
- **Highest-ROI upgrades come from agentchattr's chat *features*, not its stack.** Adopt @mention autocomplete, multi-channel/conversation organization, agent-to-agent loop guard, message edit/delete, and Slack-style threading into `frontend/src/components/panes/ChatPane.tsx`. Skip the Python/FastAPI/MCP-server architecture — phantom-os already owns its provider layer.
- **Phantom-os already has stronger primitives** than agentchattr in three areas: typed Wails event streaming (`internal/chat/types.go` `StreamEvent`), a multi-provider Compare feature (`CompareEvent`), and a real provider abstraction (`internal/provider/provider.go`). Don't regress these.
- **Top concrete picks (ranked):** (1) @mention autocomplete + agent pills, (2) multi-channel timeline within a conversation, (3) per-channel loop guard for autonomous agent-to-agent, (4) message delete UX with multi-select, (5) channel summaries (`chat_summary` MCP tool), (6) image paste/drag-drop polish + lightbox, (7) export/import zip archives, (8) `/continue` `/summary` `/clear` slash commands.

**Blockers / open questions:** none for research. agentchattr `package.json` returned 404 (it is Python — no package.json). All other content was reachable.

---

## 1. What is agentchattr

A local, **Python 3.11+ / FastAPI** chat server that lets multiple AI coding CLIs (Claude Code, Codex, Gemini, Copilot, Kimi, Qwen, Kilo, CodeBuddy, MiniMax, plus any MCP agent) talk to each other and to a human in a Slack-style web UI at `http://localhost:8300`. The core flow: human types `@claude` in the browser → server detects mention → a `wrapper.py` (Win32 console-input or tmux send-keys) **injects a stdin prompt** into the agent's terminal → agent calls MCP tools (`chat_send`, `chat_read`, etc.) to read context and reply → if the agent @mentions another agent, the loop continues until a per-channel **loop guard** pauses after N hops. Architecturally: WebSocket on port 8300 to browser, MCP-over-HTTP per-agent on auto-assigned ports, JSONL on disk for messages/jobs/rules/summaries. Distinctive features: channels, jobs (Slack-thread-with-status), rules (working-style proposals from agents), sessions (multi-phase casted workflows), per-agent notification sounds, hats (SVG avatar overlays), zip export/import.

## 2. What is phantom-os/v2

A Wails desktop app — Go backend (`main.go`, `internal/`) + **SolidJS** frontend (`frontend/src/`) — that wraps local AI coding CLIs and presents them as a unified workspace. It watches `~/.claude/` and `~/.codex/` JSONL files and pushes typed events to the UI over Wails (`internal/app/events.go`); the embedded Chat pane (`frontend/src/components/panes/ChatPane.tsx` — 961 LOC) spawns the local `claude` CLI for streaming completions through `internal/chat/service.go`. Key surfaces: terminal panes (xterm.js + webgl), Monaco editor with worktree integration, command palette / quick open / settings dialog, session/journal/gamification screens, an AI Command Center, and a multi-provider **Compare** feature (`CompareEvent`) that runs the same prompt across providers in parallel goroutines. State is signal-based (Solid signals under `frontend/src/core/signals/` and `frontend/src/core/panes/signals.ts`); styling is **vanilla-extract** (`*.css.ts`) + **Kobalte** primitives (`@kobalte/core`); icons are `lucide-solid`; markdown is `marked + DOMPurify + highlight.js`.

## 3. Side-by-side comparison

| Dimension | agentchattr | phantom-os/v2 |
|---|---|---|
| **Product type** | Browser-served local chat server | Native Wails desktop app |
| **Backend** | Python 3.11+, FastAPI, JSONL store | Go, SQLite via sqlc (`sqlc.yaml`), `internal/db/migrations/` |
| **Frontend framework** | Vanilla JS in `static/chat.js` (179 KB), `static/channels.js`, `static/sessions.js` | SolidJS 1.9 (`solid-js`, `vite-plugin-solid`) |
| **UI library** | Hand-rolled CSS (`static/*.css`) | Kobalte (`@kobalte/core` 0.13) headless primitives |
| **Styling** | Plain CSS files | vanilla-extract (`@vanilla-extract/css`, `recipes`, `sprinkles`) — `*.css.ts` colocated with components |
| **Build tooling** | None on FE (static files); Python venv on BE | Vite 8 + `vite-plugin-solid`; pnpm; Wails CLI for desktop bundling |
| **State mgmt** | DOM + WebSocket events | Solid signals (`createSignal`, `createEffect`); no Redux/Zustand |
| **Routing** | Single page, channel switcher | No router; signal-driven view state (`activeTab`, `activePaneId`, screens dispatched in `app.tsx`) |
| **Agent integration** | MCP over HTTP, terminal stdin injection (Win32 / tmux) | Direct provider abstraction (`internal/provider/{claude,codex,local}`), spawns `claude` CLI for chat (`chat/service.go:198`), watches CLI JSONL files for sessions |
| **Streaming protocol** | WebSocket from server → browser | Wails events (`chat:stream`, `chat:compare:event`, `stream:event`, `stream:batch`); typed `StreamEvent { type: delta\|done\|error\|thinking\|tool_use, content, tool_name, tool_input }` |
| **Tool-call display** | Implicit (agent posts text) | First-class `ToolUseBlock` + `ThinkingBlock` collapsible UI (`ChatPane.tsx`) |
| **Multi-agent** | Native — N agents in one channel, agent-to-agent via @mention with loop guard | Compare-mode (parallel single-prompt fan-out) — no shared room or agent-to-agent |
| **Channels / threads** | Channels (`#general` + custom), Jobs (threaded work items with status) | Single linear conversation per `ConversationID`; sidebar lists conversations |
| **@mentions** | Slack-style colored pills, autocomplete with arrows/Enter, pre-message lock-on toggles | None |
| **Message ops** | Delete (multi-select drag), edit, copy-raw, reply with inline quote | Copy-on-code-block only |
| **Persistence** | JSONL files + zip export/import | SQLite (sqlc), `internal/db/queries/`, `WorkspaceID` scoping |
| **Markdown** | GH-flavored, code blocks, tables, copy buttons | `marked + markedHighlight + highlight.js + DOMPurify` (already strong) |
| **Attachments** | Image paste/drag, MCP image upload, lightbox modal | Image + code-file paste/drag, no lightbox; classifies by extension |
| **Slash commands** | `/summary`, `/continue`, `/clear` | None visible in `ChatPane.tsx` |
| **Notifications** | Per-agent sounds, 7 built-ins | Toast region (`shared/Toast`), gamification toasts |
| **Auth / network** | Session token; `--allow-network` LAN mode | Local-only desktop app |
| **Author signal** | bcurts | Subash Karki (per `wails.json`) |

## 4. Top upgrade ideas (ranked by ROI)

### #1 — @mention autocomplete + agent pills in ChatPane (S–M)

**(a) agentchattr does:** Type `@` to open a popover listing online agents + "all agents" + the human user; arrows/Enter/Tab to insert; pre-message toggle "lock-on" pills above the textarea select recipients without typing; mentions render as colored pills; agent status pills show online/working/offline with animated activity indicators.

**(b) Why for phantom-os/v2:** Phantom-os already has multi-provider Compare (`internal/chat/service.go:277` `Compare(...)` with `[]providerIDs`) but no UX for picking *which* provider to address per turn. An @mention autocomplete reuses provider IDs (`internal/provider/provider.go` `ProviderIdentity`) and turns Compare into a directed conversation — "ask only @codex this turn, then @claude react." Real benefit: less cognitive load than dropdown-per-message; aligns with how users already think.

**(c) Effort:** S for autocomplete only; M with status pills (need `provider:status` event from `internal/provider/registry.go`).

**(d) Files:**
- `frontend/src/components/panes/ChatPane.tsx` — input handler, mention popover, pill rendering in `MarkdownContent`
- `frontend/src/styles/chat.css.ts` — pill styles (vanilla-extract)
- `frontend/src/core/bindings/providers.ts` — already has `GetProviders` / `GetActiveProvider`; add a signal for online providers
- `internal/chat/service.go` — accept optional `targetProviderIDs` on `SendRequest`; route to that subset

### #2 — Multi-channel within a conversation (M)

**(a) agentchattr does:** Each chat has channel tabs (`#general`, custom channels via `+`). Channels persist, can be renamed/deleted by clicking the active tab. Filters scrollback. Decouples topics.

**(b) Why for phantom-os/v2:** Today `Conversation` is the only grouping (`internal/chat/types.go` — flat list). For long projects users restart conversations to context-switch (debug → planning → review), losing scrollback. Channels-within-conversation lets one project keep parallel topical streams. Tie to user benefit: faster topic switching, no "which conversation was that in?" hunt.

**(c) Effort:** M — schema add (`channels` table FK to `conversations`), Go service mutation, Solid sidebar tab strip.

**(d) Files:**
- `internal/db/migrations/` — new migration for `channels` table
- `internal/db/queries/` — `CreateChannel`, `ListChannelsByConversation`, `DeleteChannel`
- `internal/chat/types.go` + `internal/chat/service.go` — `ChannelID` on `Message`, filter in `ListMessages`
- `frontend/src/core/bindings/chat.ts` — add `getChannels`, `createChannel`
- `frontend/src/components/panes/ChatPane.tsx` — channel tab strip in main header (next to title); filter `messages()` by active channel

### #3 — Loop-guard for agent-to-agent autonomous Compare (M)

**(a) agentchattr does:** When agent A @mentions agent B, the server auto-prompts B; B may @mention C; per-channel loop guard pauses after N hops; human types `/continue` to resume; human @mentions always pass through.

**(b) Why for phantom-os/v2:** Phantom-os Compare runs providers in parallel (one prompt → N answers). The interesting next step is **sequential** — let provider A read provider B's reply and react. With a loop guard, this stays safe (no infinite loops, no surprise cost). Real benefit: turns Compare from a one-shot "second opinion" into an actual debate / review chain. Customer problem: "I want Claude to critique Codex's plan and Codex to revise" without copy-paste.

**(c) Effort:** M — Go orchestration on top of existing `Compare`, plus a small UI affordance for hop count + pause/resume.

**(d) Files:**
- `internal/chat/service.go` — new method `Chain(ctx, conversationID, prompt, sequence []string, maxHops int)`; emit `chat:stream` deltas tagged with `provider_id`; emit `chat:loop:paused` event after maxHops
- `internal/chat/types.go` — `ChainEvent` struct (mirrors `CompareEvent` but with hop number)
- `frontend/src/components/panes/ChatPane.tsx` — toolbar button "Chain" beside Compare; `/continue` slash command handler
- `frontend/src/core/bindings/chat.ts` — `runChain(...)`, `continueChain(...)`

### #4 — Message delete with multi-select drag (S)

**(a) agentchattr does:** Click `del` on a message → timeline slides right to reveal radio buttons → click or drag across to multi-select → confirmation bar slides up with count → Delete or Esc. Cleans up attached images on disk.

**(b) Why for phantom-os/v2:** Right now there is no message delete in `ChatPane.tsx`. Users accidentally paste secrets or rapid-fire prompts and want clean history. Multi-select-by-drag is the right primitive (single-select is tedious). Customer benefit: "I can clean up before exporting/sharing" + privacy hygiene.

**(c) Effort:** S — backend already has `DeleteMessagesByConversation` (`internal/chat/service.go:115`); add `DeleteMessages(ctx, ids []string)`; UI for the slide-out selection mode.

**(d) Files:**
- `internal/db/queries/` — `DeleteMessagesByIDs`
- `internal/chat/service.go` — `DeleteMessages([]string) error`
- `frontend/src/core/bindings/chat.ts` — `deleteMessages(ids)`
- `frontend/src/components/panes/ChatPane.tsx` — `selectionMode()` signal; mouse-down drag handler on `MessageBubble`; confirmation bar component
- `frontend/src/styles/chat.css.ts` — slide animations

### #5 — Channel/conversation summaries (M)

**(a) agentchattr does:** `chat_summary(action='read')` returns a per-channel concise text snapshot; `chat_summary(action='write')` updates it. Lets new agent sessions catch up without rereading scrollback.

**(b) Why for phantom-os/v2:** Phantom-os already has `internal/ai/knowledge/`, `internal/journal/`, and a "morning brief" generator (`generateMorningBrief` in `core/bindings/journal.ts`). A conversation-level summary is the missing companion. Real benefit: when a user resumes a long chat tomorrow, the model gets a 200-token recap instead of a 50K-token rehydrate — directly cuts cost and latency.

**(c) Effort:** M — wire into existing journal/knowledge plumbing; add a "Summarize" button in conversation header that calls a new Go method.

**(d) Files:**
- `internal/chat/service.go` — `SummarizeConversation(ctx, conversationID) (string, error)`
- `internal/db/migrations/` — `summary TEXT` column on `conversations`
- `frontend/src/components/panes/ChatPane.tsx` — header button; show summary above messages on conversation open
- `frontend/src/core/bindings/chat.ts` — `summarizeConversation`, `getSummary`

### #6 — Image lightbox + better paste UX (S)

**(a) agentchattr does:** Images render inline; click opens a lightbox modal. Paste and drag both supported.

**(b) Why for phantom-os/v2:** Phantom-os already has paste/drag (`ChatPane.tsx` `handleDrop`) and renders an attachment chip. But after send, there is no full-screen view. Screenshots are 90% of attached images — users want to inspect detail. Customer benefit: no "right-click open in new tab" workaround.

**(c) Effort:** S — one new `<ImageLightbox>` component, click handler on inline images in `MarkdownContent`.

**(d) Files:**
- `frontend/src/shared/` — new `ImageLightbox/` directory (Kobalte `Dialog`)
- `frontend/src/components/panes/ChatPane.tsx` — bind click on rendered `<img>` inside `MarkdownContent`
- `frontend/src/styles/chat.css.ts` — lightbox styles

### #7 — Export/Import as zip (S–M)

**(a) agentchattr does:** Settings → Project History exports messages, jobs, rules, channel summaries to a portable zip. Import merges (dedups by ID); safe to import twice.

**(b) Why for phantom-os/v2:** Right now switching machines means copying the whole SQLite. A scoped per-conversation or per-workspace zip is the user-friendly primitive. Customer benefit: easy backup, share-with-teammate, "send Claude my whole debug session". Idempotent import (skip duplicates) matches user mental model better than full DB import.

**(c) Effort:** S for export, M for import (need ID collision handling).

**(d) Files:**
- `internal/chat/export.go` (new) — write zip with `messages.jsonl`, `conversations.jsonl`, `attachments/`
- `internal/chat/service.go` — `ExportConversation(id) ([]byte, error)`, `ImportArchive(b []byte) error`
- `frontend/src/shared/SettingsDialog/` — Project History section
- `cmd/` — could expose a CLI flag `phantomos export --conversation=...`

### #8 — Slash commands `/continue` `/summary` `/clear` (S)

**(a) agentchattr does:** In-chat slash commands: `/summary @agent`, `/continue` (resume loop guard), `/clear` (clear current channel).

**(b) Why for phantom-os/v2:** Existing CommandPalette (`frontend/src/shared/CommandPalette/`) is global; users want **in-chat** quick actions without leaving the textarea. Customer benefit: faster, no mouse, discoverable via `/`.

**(c) Effort:** S — parse leading `/` in `handleSend`, dispatch to existing methods.

**(d) Files:**
- `frontend/src/components/panes/ChatPane.tsx` — `handleSend` early-return on slash command; small `/help` popover that lists registered commands

---

## 5. Things to NOT copy

- **Python/FastAPI server.** Phantom-os already owns its session storage in Go + SQLite. Adding a Python sidecar process violates "Less is More" and creates a deploy-and-permissions headache.
- **MCP-over-HTTP per-instance terminal injection (`wrapper.py` Win32 `WriteConsoleInput` / `tmux send-keys`).** This is agentchattr's *core* mechanic but solves a problem phantom-os already solved differently (`internal/linker/linker.go` couples terminal panes to AI sessions; `internal/collector/` watches CLI artifacts). Don't graft on a second mechanism. Phantom-os's "terminal-bind by CWD + PID ancestry" is structurally cleaner.
- **JSONL store as primary persistence.** Phantom-os has sqlc + migrations. Stay there.
- **Vanilla JS megafiles (`static/chat.js` ~179 KB, `static/channels.js`, `static/sessions.js`).** No types, no module boundaries. Phantom-os's component-per-file SolidJS layout is better.
- **Auto-approve flags (`--dangerously-skip-permissions`, `--yolo`, `--dangerously-bypass-approvals-and-sandbox`).** agentchattr ships launchers that run agents with these by default plus an `--allow-network` LAN mode. Phantom-os has `internal/safety/` and approval modal; do not regress to "trust everything." This is a security ceiling, not a feature gap.
- **Hats (SVG overlays on avatars).** Cute, but feature creep — fails "Less is More" unless a clear customer ask exists.
- **Chakra UI v3 patterns.** Phantom-os does not use Chakra at all. The user's CLAUDE.md global rule "Chakra v3 mandatory" assumes a different project. Anything that says "wrap in `<Box>`" or uses `recipes` from `@chakra-ui/react` should be **translated to vanilla-extract recipes + Kobalte primitives**. No Chakra in this codebase — confirm with user before adding it.

---

## 6. Open questions for the user

1. **Chakra UI v3 directive.** Your global CLAUDE.md says "Chakra v3 mandatory" but `frontend/package.json` uses SolidJS + vanilla-extract + Kobalte. Should I treat that rule as not-applicable here, or are you planning a Chakra migration? (If yes, that is a separate L-effort project — recommend not blending it with these chat upgrades.)
2. **Multi-agent direction.** Is the goal to keep phantom-os single-user-talks-to-one-AI (today), make Compare richer (parallel/sequential same prompt), or move toward a true shared room (agentchattr-style channels with multiple AIs)? This determines how many of the top-3 ideas to take.
3. **Channels vs. Jobs.** agentchattr distinguishes channels (free-form) from jobs (threaded work with status). Phantom-os has `task:new`/`task:update` events from `internal/collector/`. Worth fusing channel→job conversion into the existing task pipeline, or keep separate?
4. **Provider scope for @mentions.** Should @mentions be limited to enabled providers in `internal/provider/registry.go`, or also include named instances (e.g., `@claude-fast`, `@claude-deep`)?
5. **Export format.** JSONL-in-zip (agentchattr's pattern) or SQLite snapshot? JSONL is portable and human-readable; SQLite is roundtrip-perfect.
6. **Loop guard default hop count.** agentchattr's docs say "N hops" without specifying. If we add the chain feature, propose default = 4? (Tunable per workspace.)

---

## Appendix: key file paths referenced

**Phantom-os/v2:**
- `/Users/subash.karki/phantom-os/v2/frontend/package.json`
- `/Users/subash.karki/phantom-os/v2/frontend/src/components/panes/ChatPane.tsx` (961 LOC)
- `/Users/subash.karki/phantom-os/v2/frontend/src/core/bindings/chat.ts`
- `/Users/subash.karki/phantom-os/v2/frontend/src/core/bindings/providers.ts`
- `/Users/subash.karki/phantom-os/v2/frontend/src/styles/chat.css.ts`
- `/Users/subash.karki/phantom-os/v2/frontend/src/components/ai-command-center/AICommandCenter.tsx`
- `/Users/subash.karki/phantom-os/v2/frontend/src/shared/` (CommandPalette, PromptComposer, SettingsDialog, Toast, etc.)
- `/Users/subash.karki/phantom-os/v2/internal/chat/service.go`
- `/Users/subash.karki/phantom-os/v2/internal/chat/types.go`
- `/Users/subash.karki/phantom-os/v2/internal/provider/provider.go`
- `/Users/subash.karki/phantom-os/v2/internal/db/migrations/`
- `/Users/subash.karki/phantom-os/v2/internal/app/events.go`
- `/Users/subash.karki/phantom-os/v2/internal/linker/linker.go`
- `/Users/subash.karki/phantom-os/v2/wails.json`
- `/Users/subash.karki/phantom-os/v2/docs/ai-engine.md`

**agentchattr (GitHub):**
- README: https://github.com/bcurts/agentchattr/blob/main/README.md
- `app.py` (104 KB — main FastAPI server)
- `agents.py` (3 KB — agent registry)
- `archive.py` (18 KB — export/import)
- `static/chat.js` (179 KB — frontend JS)
- `static/channels.js` (27 KB), `static/sessions.js` (39 KB), `static/rules-panel.js`
- `windows/start_*.bat` launchers, `wrapper_windows.py`, `wrapper_unix.py`
- `session_templates/*.json`
