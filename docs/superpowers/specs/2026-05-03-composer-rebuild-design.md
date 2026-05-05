# Composer Rebuild — Design Spec

**Date:** 2026-05-03
**Author:** Subash Karki
**Status:** Approved with DA-driven revisions (2026-05-03)
**Companion review:** `2026-05-03-composer-rebuild-devils-advocate.md`

### DA revisions changelog (2026-05-03)
- §9.1 — added 500 ms / 5 s / 30 s waiting indicator (DA P1-9)
- §11.5 — pre-injection observability chip + timeout-rate metric (DA P1-6)
- §11.6 — per-session permission state, permissions tray (DA P1-8); leader-chord shortcuts to avoid collisions (DA P2-11)
- §11.7 — committed FIFO-detached subprocesses + offset-indexed rehydration to V2.0 (DA P0-5, P2-14)
- §11.8 — Haiku trim **deferred to V2.1**; correctness issues with tool_use_id boundaries documented (DA P0-4)
- §11.10.5 — privacy hardening: verbose auto-expiry, separate content opt-in, redaction filter (DA P2-12)
- §11.11 — new: CLI version contract, handshake, required-event allowlist, CI smoke test (DA P0-1)
- §11.12 — new: multi-process auth coordination with spawn mutex and coordinated refresh (DA P0-2)
- §11.13 — new: CLI binary onboarding (DA P2-13)
- §12 phase 6 — measurable parity gate, hidden flag retention, V1→V2 read-only conversion tool (DA P1-10)
- §13 — risk register extended with DA findings
- §15 — acceptance: absolute frame thresholds replaced by V1-baseline comparison + worker pre-warm + Wails event coalescing (DA P0-3)
**Replaces:** Current `v2/frontend/src/components/panes/ComposerPane.tsx` (2807 lines)

---

## 1. Problem

The current Composer pane was built as an overlay on top of a hidden terminal running the `claude` CLI. It works, but it leaks the abstraction in several ways:

- File-tail latency — events arrive by polling `~/.claude/projects/*/sessionID.jsonl`, not by reading the CLI's own stream.
- Re-render churn — markdown is reparsed on every token, syntax highlighting runs on the main thread, the entire turn re-renders on each delta.
- "Terminal pretense" — the surface still smells like a wrapped terminal; permission prompts, tool cards, and approval flows feel grafted on rather than first-class UI.
- 2807-line monolith — a single `ComposerPane.tsx` owns layout, state, event ingestion, markdown rendering, file linkification, and agent panel coordination. Hard to reason about, harder to optimize.

The goal is a composer that feels like Anthropic's first-party Claude Code VS Code extension: token-speed responsiveness, native UI for permission/tool/diff flows, editor-aware context, and the same agentic features users expect (subagents, slash commands, MCP).

## 2. Goals

1. **Feel as fast as the VS Code extension.** Optimistic echo, token-by-token render, no jank during streaming or scroll, no markdown reparses on every chunk.
2. **Preserve subscription auth.** Users keep using their existing Pro/Max/Team `claude` login. No API key required.
3. **Preserve all Anthropic agent features.** Subagents, custom slash commands, MCP servers, hooks, the full tool surface.
4. **Native first-class UI for every event type** — text, thinking, tool use, tool result, permission request, slash command, sub-agent dispatch.
5. **Editor integration.** The composer knows the current open file, current selection, and current cursor position; can inject them as context; can route proposed edits back into Monaco.
6. **Smaller, isolated files.** Split the 2807-line pane into composable units, each with one clear purpose.
7. **Many composers per worktree.** A single Composer tab hosts a row of sub-tabs, each a fully independent session with its own message history, mode, and supervised subprocess.
8. **Sessions survive worktree switches.** A running session keeps streaming when the user navigates to another worktree or pane. Resuming the worktree shows the conversation up-to-the-second, mid-stream tokens included.
9. **Enriched, structured logging.** Every notable event (spawn, send, receive, permission, tool use, error, restart, trim) is logged at INFO/WARN/ERROR with a stable schema, mirrored to `~/.phantom-os/logs/composer.ndjson` and indexable by Phantom AI's history layer.
10. **Opt-in rollout.** A Settings toggle gates V2 per user; V1 stays available for at least two releases.
11. **Globally accessible composer.** A drawer + bottom-bar pill let the user reach any running session from any view in the app (editor, terminal, settings, no-worktree). Sessions remain anchored to a home worktree for filesystem ops, but the UI is project-agnostic.

## 3. Non-Goals

- Replacing the `claude` CLI with an in-process Claude Agent SDK. (Loses subscription auth.)
- Rewriting any part of the stack in Rust. (No measurable win at this layer; the Node.js CLI binary itself is the dominant latency floor.)
- Replacing the existing terminal pane. Composer and terminal are separate panes. The current `ComposerPane` will retain access to terminal output via the existing pane registry, but no longer renders inside or on top of one.
- Building our own VT parser, native PTY surface, or alternate renderer. Out of scope for this spec.

## 4. Architectural Choice — A1: Stream-JSON IPC with `claude` CLI

We spawn `claude` as a long-lived subprocess per composer session, with `--output-format stream-json --input-format stream-json --verbose`. Both stdin and stdout speak newline-delimited JSON, where each line is a single typed event. This is what the official VS Code extension does under the hood; we inherit Anthropic's evolution of the protocol automatically.

**Why this and not the alternatives:**

- **vs. continuing JSONL file-tail**: gives us push-based events instead of polling, removes encoded-path quirks, removes file-tail latency, and gives us every event Anthropic emits — not just what survives the on-disk transcript format.
- **vs. talking directly to the Anthropic API in Go**: would force API-key auth and require us to reimplement Anthropic's tool runtime (Read/Edit/Bash/Glob/Grep/Task/etc.), subagents, MCP, slash commands, hooks. Months of work, then we permanently lag behind their roadmap.
- **vs. Claude Agent SDK as a library**: same auth problem (API key only); also adds a Node runtime dependency we'd have to ship and manage.

The `claude` CLI binary stays as the engine. We replace only the surface and the IPC mechanism.

## 5. Decision Log

| Decision | Choice | Reason |
|---|---|---|
| Language for IPC layer | **Go** | Latency dominated by Node CLI cold start + Anthropic API streaming. Go's IPC overhead is sub-millisecond per event. Rust adds nothing perceptible. |
| Auth | **Subscription via `claude` CLI** | Pro/Max/Team OAuth lives only in the CLI binary. API-key paths are off-limits if we want existing users' login. |
| Frontend framework | **Solid (status quo)** | Fine-grained reactivity is the right primitive for token streaming. Switching frameworks adds risk with zero perf upside. |
| State management | **Solid `createStore` + module-level signals** | No external state library. See §8. |
| Markdown library | **`marked` (status quo)** | Keep, but call it correctly — see §9.2. |
| Syntax highlighting | **`hljs` in a Web Worker** | Off main thread; results applied via post-stream pass per code block. |
| Virtualization | **`@tanstack/solid-virtual` (already in deps)** | Engaged when message count > a threshold (~50). |
| Process supervision | **Go process manager + Wails event bridge** | One supervisor per session; restart on crash; auto-resume on reconnect. |

## 6. End-to-End Architecture

The composer is a vertical pipeline. Each layer has one job and a typed boundary above and below it.

```
┌──────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Solid, runs inside WebKit)                                 │
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │ <ComposerPane>   │    │ <MessageList>    │    │ <Composer      │ │
│  │  layout + chrome │    │  virtualized     │    │  Input>        │ │
│  └────────┬─────────┘    └────────┬─────────┘    └───────┬────────┘ │
│           │                       │                      │          │
│           └─────── reads ─────────┴────── writes ────────┘          │
│                              │                                      │
│                ┌─────────────▼──────────────┐                       │
│                │  Composer Store (per-session) │                    │
│                │  • messages[]   • toolUses{} │                    │
│                │  • streaming    • permission │                    │
│                │  Solid createStore + signals │                    │
│                └─────────────┬──────────────┘                       │
│                              │                                      │
│                ┌─────────────▼──────────────┐                       │
│                │  Event Reducer             │                       │
│                │  StreamEvent → store patch │                       │
│                └─────────────▲──────────────┘                       │
│                              │                                      │
│                              │ Wails event channel                  │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│ BACKEND (Go)                 │                                      │
│                              │                                      │
│                ┌─────────────▼──────────────┐                       │
│                │ Composer Session Manager   │                       │
│                │ • spawn / supervise        │                       │
│                │ • stdin / stdout pipes     │                       │
│                │ • restart, resume, cancel  │                       │
│                └─────────────┬──────────────┘                       │
│                              │ stdin (json) / stdout (json)         │
│                ┌─────────────▼──────────────┐                       │
│                │ `claude` CLI subprocess    │                       │
│                │ --output-format stream-json│                       │
│                │ --input-format stream-json │                       │
│                │ --verbose                  │                       │
│                └────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                       Anthropic API
                  (subscription-authed)
```

### Event flow, end to end

1. User types in the input box → optimistic-echo reducer appends a user message to the store. The bubble paints in the next animation frame; no IPC has happened yet.
2. Frontend sends a `user_input` event over the Wails channel to the Go session manager.
3. Go writes a single JSON line to the CLI's stdin.
4. CLI streams events back on stdout. Go reads line-by-line, validates the envelope, forwards each event up the Wails channel.
5. Frontend reducer applies a typed patch to the store. Solid's fine-grained reactivity re-renders only the changed leaf — usually a single text node.
6. When a `permission_request` event arrives, the reducer parks it on `state.permission`, the input box disables, and a native modal renders. User approval/denial is sent back as a single `permission_response` event.
7. When `assistant_message_complete` arrives, the streaming bubble flips to `status: 'complete'`, which triggers the post-stream pass: parse final markdown, dispatch syntax highlighting to the worker.

## 7. Component Topology (frontend)

The current single 2807-line `ComposerPane.tsx` splits into a tree of small, single-purpose components. Target: every leaf component fits in one screen of code and re-renders only the data it directly owns.

```
<ComposerPane>                — layout shell, owns the session manager handle
  <ComposerHeader>            — model, mode (normal/plan/auto), session menu
  <MessageList>               — virtualized scroller; <For each={state.messages}>
    <MessageBubble>           — wraps <For each={message.content}> over blocks
      <TextBlock>             — plain text or memo'd markdown (see §9.2)
      <ThinkingBlock>         — collapsed by default, expandable
      <ToolUseCard>           — reads state.toolUses[id]; never receives the full map
        <ToolUseHeader>       — tool name, status pill, elapsed time
        <ToolUseInputView>    — formatted input (per-tool renderer)
        <ToolUseOutputView>   — streamed output, diff for Edit/Write, etc.
      <ErrorBlock>            — error rendering with retry
  <ComposerComposer>          — input area
    <ContextChips>            — current file, selection, attachments
    <SlashCommandMenu>        — pops on `/`, lists commands from CLI capabilities
    <FileMentionMenu>         — pops on `@`, lists files via Phantom AI graph
    <Textarea>                — Kobalte/native, autosize, Cmd-Enter to send
    <ModeToggle>              — normal | plan | auto-accept
    <SendButton>              — also serves as Stop while streaming
  <PermissionModal>           — gated on state.permission
  <AgentSidebar>              — preserved from current ComposerAgentPanel
  <DiffOverlay>               — proposed-edit preview that lifts into editor
```

This is a meaningful reduction in surface. Each card becomes individually testable. The `MessageList`, `ToolUseCard`, and `Composer` subtrees can be perf-profiled in isolation.

## 8. State Layer

Solid signals + `createStore` are the entire state layer. No Redux, Jotai, MobX, Zustand, or port thereof.

### Why no state manager

Solid's reactivity already provides what people reach for libraries to get:

- **Fine-grained diffing.** A path-style `setStore` patch (`setStore('messages', i, 'content', b, 'text', t => t + chunk)`) re-renders only the leaf text node. The bubble, the list, and every other message stay untouched. Bringing in a library with React-style coarse re-renders would *regress* perf, not improve it.
- **Selectors for free.** Components reading `state.toolUses[id].status` are auto-tracked at exactly that path.
- **Persistence/time-travel hooks** can be added by wrapping `produce()` to log patches to the Go side. No library needed.

### Store shape (one per active session)

| Field | Type | Purpose |
|---|---|---|
| `sessionId` | `string \| null` | Stable across resumes |
| `messages` | `Message[]` | Ordered turn list. Append-only during a turn; trimming for trash/clear is a separate explicit op |
| `toolUses` | `Record<id, ToolUseState>` | Map keyed by `tool_use_id`; cards read by id, never the whole map |
| `streaming` | `{ msgId, blockIdx } \| null` | Cursor for the actively appending block |
| `permission` | `PermissionRequest \| null` | When non-null, modal opens, input disables |
| `mode` | `'normal' \| 'plan' \| 'auto-accept'` | Mirrors CLI flags |
| `editorContext` | `{ filePath, selection, cursor } \| null` | Snapshot at send-time, attached to next user_input |

### Module-level signals (cross-pane)

Mirroring the existing `core/terminal/signals.ts` pattern:

- `currentSessionId()` — read by Activity/Sessions panes
- `streamingMessageCount()` — read by topbar status indicator
- `composerVisible()` — for keyboard shortcut routing

### Reducers

A single small file (`core/composer/reducers.ts`) holds every mutation. Each reducer is a one-to-one mapping from a stream event to a path-style store patch. No logic except validation. This is the only place writes happen — components never call `setStore` directly.

## 9. Performance Discipline

Seven explicit rules that pair with the architecture. Each has a measurable acceptance criterion.

### 9.1 Optimistic echo + waiting indicator

User input renders **before** the IPC round-trip completes. Reducer appends the user message synchronously on send. Backend errors flip the message to `status: 'error'` retroactively.

**Crucially**: optimistic echo without progress signal feels broken when the agent's first token is slow. After 500 ms with no stream activity, attach a subtle "waiting for agent…" indicator to the user bubble. After 5 s, escalate to a more visible "still waiting (5s)" with a Cancel affordance. After 30 s, surface as a soft warning toast offering to abort.

**Acceptance:** the user bubble is on screen within 16 ms of pressing Cmd-Enter, regardless of CLI state. Waiting indicator appears at 500 ms, escalates at 5 s, warns at 30 s.

### 9.2 Incremental markdown

`marked.parse()` is **never** called inside JSX during streaming. For a streaming block, the renderer outputs the raw text in a `<pre>`-like container. When the block flips to `complete`, a `createMemo` runs `marked.parse()` once on the final text and the rendered HTML replaces the plain content.

**Why:** markdown reparsing on every chunk is the single biggest source of jank in the current pane. A 2 KB assistant turn that streams in 50 chunks reparses ~50 KB of markdown work for one reader-visible result.

**Acceptance:** during a steady token stream, no `marked.parse` call shows up in profile traces; one call per finalized block.

### 9.3 Off-main-thread syntax highlighting

`hljs` runs in a Web Worker. The main thread sends `{ blockId, code, language }` and receives `{ blockId, html }` back. The block's rendered HTML swaps in when the worker responds. While streaming, code fences render as plain text; highlighting applies after `complete`.

**Acceptance:** main thread never spends more than 4 ms per frame on highlighting work during streaming.

### 9.4 Virtualized message list

`@tanstack/solid-virtual` wraps `<MessageList>` when `messages.length > 50`. Below the threshold, the simple non-virtualized list is faster (virtualization has its own bookkeeping cost). Anchor-bottom behavior preserved through the virtualizer's anchor APIs.

**Acceptance:** scrolling a 500-message session stays at ≥ 55 fps on M-series Macs.

### 9.5 Stable tool cards

Every `ToolUseCard` keys off `tool_use_id`. The card receives its id as prop and reads `state.toolUses[id]` itself. Updates to `output`, `status`, or `durationMs` are path-style patches; the card mounts once and mutates in place for its entire lifetime.

**Acceptance:** the same `ToolUseCard` instance survives from `tool_use_start` through `tool_use_complete` — no unmount/remount during streaming.

### 9.6 Scroll discipline

Auto-scroll-to-bottom only when the user is already at the bottom (within a small threshold, e.g. 64 px). If the user has scrolled up to read history, new tokens append silently and a "jump to latest" pill appears. No `scrollIntoView` ever fires while the user is above the threshold.

**Acceptance:** scrolling away during a stream never fights the user; pill appears within 200 ms of the first off-bottom event.

### 9.7 Layout containment

Each message bubble has `contain: layout style paint` set. A late-arriving image or code-fence highlight in one bubble cannot trigger reflow of earlier bubbles.

**Acceptance:** a deferred highlight in message N never causes a paint cost on messages 1..N-1.

## 10. Backend (Go) — Session Manager

A new package `internal/composer/` owns the subprocess lifecycle. One `Session` struct per active composer; sessions live as long as their pane is open or until the user explicitly clears.

### Responsibilities

- Spawn `claude` with the correct args (`--output-format stream-json --input-format stream-json --verbose --resume <id>` when resuming).
- Read stdout line-by-line, JSON-decode each event into a typed envelope, forward to frontend via Wails event channel.
- Read stderr separately into a structured error log; surface any decode failures as `error` events without killing the session.
- Buffer stdin writes (one JSON object per line) with a small queue; serialize sends so we never interleave partial JSON.
- Detect process death; auto-restart with `--resume <id>` once if the death wasn't user-initiated; surface as a `session_restarted` UI event.
- Persist the assigned session id, working directory, and last-known cursor in SQLite (existing `sessions` table, sqlc layer).

### Event envelope

All events flow over a single typed Wails channel. The envelope carries `{ sessionId, kind, ...payload }` where `kind` is the discriminant. The frontend reducer is one big switch over `kind`. Unknown kinds log a warning and are ignored — never throw, so a future Anthropic addition doesn't break the UI.

### Backpressure

Stdout is read in a goroutine that pushes events into a bounded channel (e.g. 1024 deep). The Wails event publisher drains it. If the channel saturates (extreme volume during a long subagent burst), we drop nothing — we just block the reader briefly, which naturally backpressures the subprocess via the OS pipe buffer. No per-event acks; ordering is the pipe's guarantee.

### Cancellation

`Stop` sends SIGINT to the CLI (matching its own keyboard interrupt semantics). The CLI emits a `cancelled` event mid-stream and returns to idle. We never `kill -9` unless the process is unresponsive after a 2 s grace.

## 11. Editor Integration

The composer knows the editor state, but the editor never knows about the composer's internals. Communication is one-way bindings on each side.

### What the composer reads from the editor

A read-only signal `editorFocus()` exposed by the existing open-file registry:

```
{
  filePath: string | null,
  selection: { start: Position, end: Position } | null,
  cursor: Position | null,
  language: string | null,
}
```

When the user sends a message, the composer reads this signal once, snapshots it into the user_input event as an `editor_context` block, and includes it in the prompt. The user sees a "context chip" above the input showing the file/selection that's about to be attached.

### How proposed edits get back to the editor

Anthropic's tool stream emits `Edit`/`Write` tool uses with the new file content. When the composer receives one, it:

1. Renders a `<DiffOverlay>` showing the proposed change with accept/reject controls.
2. On accept, applies the edit through the existing open-file registry, which dispatches to Monaco. If the file is open, it's modified in-place; if not, it's written to disk. Either way, the existing fsnotify watcher round-trip handles refresh.
3. Reports back to the CLI with the standard tool_result event.

### Slash commands and file mentions

- `/` triggers a slash command palette populated from the CLI's `/help` capability listing (cached at session start, refreshed on `slash_commands_changed` events).
- `@` triggers a file palette populated by Phantom AI's existing graph (`mcp__phantom-ai__phantom_graph_related`), so mentions are codebase-aware, not just filesystem-aware.

## 11.5 Phantom AI Engine Integration

The existing AI engine (file dependency graph, blast radius, related files, orchestrator strategies, decision history) stays — and integrates more cleanly in A1 than it does today. Three paths, all running in parallel:

### Path 1 — MCP server (Anthropic's tool channel)

Phantom AI is already exposed as an MCP server (`mcp__phantom-ai__*` tools). The `claude` CLI we spawn is configured to load it on startup. Result: the agent calls `phantom_graph_context`, `phantom_graph_blast_radius`, `phantom_graph_related`, `phantom_orchestrator_process`, `phantom_orchestrator_history`, and `phantom_evaluate_output` as native tool uses, end-to-end visible in the composer as `<ToolUseCard>` entries.

This is the default integration. No new code needed — the user's existing `~/.claude/config` MCP config carries forward; we just spawn `claude` with that config in scope.

**What this gives:** the agent itself decides when to consult the graph. Codebase-aware suggestions, blast-radius warnings before risky edits, related-files lookups all happen mid-conversation through the same tool-use loop as Read/Edit/Bash.

### Path 2 — Pre-injection at the IPC boundary (ambient context)

Before Go writes a `user_input` event to the CLI's stdin, the session manager runs a small ambient-context step against the AI engine:

1. Read the user's text + the current `editor_context` block.
2. Call `phantom_graph_related` for the focused file (or for any `@`-mentioned files).
3. Call `phantom_orchestrator_process` to ask the engine "given this goal, what strategy do you suggest?"
4. Prepend the engine's results to the `user_input` event's content as a system-tagged context block, so the agent sees them but the user doesn't have to type them.

This is the "agent always knows the codebase shape" property that today's pane gets through awkward post-hoc injection. In A1 it becomes a clean, single hook in `internal/composer/manager.go`.

Pre-injection is **opt-in per session** with a default toggle in Settings. Turning it off makes the composer a pure passthrough to `claude` — useful for debugging or when users want a vanilla session.

**Observability:** every pre-injection result attaches a small chip to the user bubble showing the outcome — `ambient context: 3 files (180 ms)` on success, `ambient context skipped (timeout 250 ms)` on miss, `ambient context: engine offline` on failure. Users see exactly what the agent received. We track timeout rate as a launch metric; if > 10% in dogfood, raise the budget or run pre-injection async with a "context arriving" indicator instead of dropping it.

### Path 3 — Post-stream learning (closed-loop training)

The session manager mirrors every event into the AI engine's history layer:

- Tool uses → `phantom_orchestrator_history` with outcome, duration, success/failure.
- Turn completions → outcome scored via `phantom_evaluate_output` for hallucinated path detection.
- Session-level patterns → fed back into the strategy ranker so future `phantom_orchestrator_process` calls converge faster.

This path is **observability + learning only**, never on the request path. Latency budget: 0 ms — runs in a goroutine, fire-and-forget.

### Compatibility matrix

| AI engine surface | Today (V1) | New composer (V2) |
|---|---|---|
| `phantom_graph_*` MCP tools | Indirectly via CLI | First-class via MCP, surfaced as ToolUseCards |
| `phantom_orchestrator_process` | Manual MCP calls | Auto-invoked at pre-injection |
| `phantom_orchestrator_history` | Best-effort | Mirrored from every stream event |
| `phantom_evaluate_output` | Optional | Run on every assistant turn completion |
| Phantom AI engine v2 (file graph, RAG, adaptive context, model routing, session learning) | Active | Active and tighter — all five hooks have a clean place to attach |

### Failure modes

- **AI engine offline** → all three paths degrade independently. MCP tool calls return errors that the agent handles naturally; pre-injection short-circuits to passthrough; post-stream learning silently drops. The composer never blocks on the engine.
- **AI engine slow** → pre-injection has a 250 ms wall-clock budget; on timeout, we send the user_input without ambient context and queue the engine response for the *next* turn (so the context gets there one turn late, not never).

### Where this lives in the file map

Add to Appendix A:

```
v2/internal/composer/
  ai_engine.go          MCP config registration + pre-injection + post-stream mirror
```

Frontend: no changes — AI engine activity flows through normal `tool_use` events and renders via existing `<ToolUseCard>`.

## 11.6 Multi-Composer Sub-Tabs

A worktree can host many concurrent composer sessions. The Composer pane is a single tab in the main pane bar; *inside* that pane there's a horizontal sub-tab strip, each tab a fully independent session.

### Why one outer tab + sub-tabs (not N pane tabs)

- Keeps the main pane bar uncluttered. A user with five composer sessions doesn't blow out their tab bar.
- The composer is one mental space ("the Claude work surface") with multiple parallel conversations inside it. Editor tabs follow the same pattern in most IDEs.
- Settings, agent sidebar, and permission modal can be shared chrome around the sub-tab content area — no duplication per session.

### Behavior

- **Open new session**: leader chord `Cmd-K T` (avoids collision with global `Cmd-T` for new pane), or a `+` button in the sub-tab strip. Spawns a new `claude` subprocess; the sub-tab name defaults to a short label derived from the first user message and is editable.
- **Switch sub-tabs**: keyboard arrows, click, or `Cmd-K 1..9` (leader chord — `Cmd-1..9` reserved for app-level pane navigation). Switching is instant — only swaps which store is bound to the message-list view; the underlying subprocess and store state are untouched.
- **Background streaming**: every sub-tab streams in parallel. The strip shows a small activity dot for tabs that are currently receiving tokens or have a pending permission request.
- **Close session**: leader chord `Cmd-K W` or X on the tab. Closes UI immediately; subprocess shutdown and state archival run async in Go. If close was accidental, an undo toast within 5 s restores the tab and reattaches to the still-running subprocess.
- **Reorder**: drag the tab. Order persists per worktree.

### State implication

The composer store goes from one global instance to a `Map<sessionId, ComposerState>`. The `ActiveSession` signal selects which store the UI binds to. All reducers take a `sessionId` and operate on that map entry. Cross-pane signals like `streamingMessageCount()` aggregate across all sessions, not just the active one — the activity dots need that.

### Per-session resource budget

Each session holds:
- One Go-side `Session` (subprocess, pipes, supervisor goroutine).
- One frontend store (~tens of KB to a few MB depending on message volume).
- One MCP server registration scope (shared underlying MCP servers, but isolated permission state).

A soft cap of 8 concurrent live sessions per worktree, configurable. Above the cap, opening a new session prompts to suspend an old one.

### Per-session permission state (multi-session correctness)

Permission requests are **per session**, not global. The store's permission field is `Record<sessionId, PermissionRequest | null>`, not a single value. This is critical for multi-session correctness: if session A and session B both request a permission concurrently, we cannot show one modal and freeze the other invisibly.

**Surfacing rules:**
- The active sub-tab's pending permission renders inline as a modal/inline approval card.
- Background sessions with pending permissions get a distinct "needs your input" color on their sub-tab activity dot (different from "streaming") and a count badge on the bottom-bar status pill.
- A "permissions tray" (`Cmd-Shift-P`) lists all pending permissions across all sessions with one-click jump-to-session for each.
- A pending permission older than 30 s emits a system notification (later) or a soft toast that doesn't steal focus.

**Acceptance:** opening session B with a pending permission while session A is also waiting on one shows two distinct dots, two tray entries, and approving one does not affect the other.

## 11.7 Session Continuity Across Worktree Switches

A running session must not terminate when the user switches worktree or pane. This is non-negotiable: the user expects their long-running agent task to keep going while they go check something else.

### Where state actually lives

- **Subprocess** — owned by the Go session manager, indexed by `sessionId`. Lives until explicit close, app shutdown, or crash.
- **Frontend store** — keyed by `sessionId` in the `Map<sessionId, ComposerState>`. The UI subscribes to whichever store the active sub-tab points at; *inactive* stores keep receiving events from Go and accumulate state in the background.
- **Persistence** — every event is appended to a per-session NDJSON file under `~/.phantom-os/sessions/<sessionId>/events.ndjson` (in addition to SQLite metadata). On reopen, the store rehydrates from this file in chunks.

### The switch flow

1. User clicks a different worktree in the sidebar.
2. Frontend swaps the active worktree in the workspace store; the Composer pane component unmounts (its parent does).
3. **Go side does nothing.** All composer subprocesses keep running, keep emitting events. The Wails event channel keeps publishing.
4. Frontend stores keep ingesting events into their respective `ComposerState` map entries — these stores are module-level, not component-local, so they survive unmount.
5. When user switches back, the Composer pane remounts, reads the existing store map for the worktree, and restores the sub-tab strip + active session view. No reload, no reinitialization.
6. If the user has been away for a long time, the message list scroll position is restored to wherever it was (we cache `lastViewedMessageId` per session).

### Crash & restart safety — FIFO-based detached subprocesses (V2.0 in scope)

This is the load-bearing differentiator. Promising "your sessions keep running while you do other things" then quietly killing them on app quit is a regression masquerading as a feature, so V2.0 ships full detach.

**Spawn topology:**
- Each `claude` subprocess is launched detached: `setsid` + process group leader on POSIX, no controlling terminal, survives Wails parent termination.
- stdin / stdout / stderr are bound to **named FIFOs** under `~/.phantom-os/sessions/<sessionId>/{stdin,stdout,stderr}.fifo`, not anonymous pipes. FIFOs persist across reader process restarts.
- A `pid.json` sidecar in the session dir records `{ pid, pgid, claudeVersion, startedAt, cmdlineHash }`.

**Reattach flow on app launch:**
1. Go scans `~/.phantom-os/sessions/` for `pid.json` files.
2. For each, verify the process is alive (`kill -0 pid`) and matches `cmdlineHash` (defense against PID reuse).
3. Open the FIFOs O_RDWR (so opening doesn't block waiting for a writer) and resume reading from `stdout.fifo`.
4. Replay events from `events.ndjson` since the last persisted offset to rebuild frontend state.
5. Surface as a "resumed N background sessions" toast with click-through to the global drawer.

**On app quit (no force-quit):**
- All sessions stay alive. A confirmation dialog "Phantom is closing — N sessions will continue running in the background" with a "stop them all" option for users who don't want orphan processes.
- On force-quit / crash: same as graceful — subprocesses are detached, they survive.

**On explicit session close:**
- SIGINT to the subprocess, drain stdout, write final `events.ndjson` entry, remove `pid.json`. If the subprocess hasn't exited within 2 s, escalate to SIGTERM, then SIGKILL after another 2 s.

**Failure modes:**
- FIFO file gone (user nuked `~/.phantom-os/`): session marked `detached_lost`, history readable, no further interaction; user can `--resume` from history into a new subprocess.
- Subprocess died while Phantom was closed: `pid.json` stale → session marked `crashed`, last events readable from `events.ndjson`, retry-button offers `--resume`.
- Two Phantom instances launching simultaneously (rare): file-lock on `~/.phantom-os/sessions.lock` ensures one app owns reattach; the other runs in read-only mode for the session list.

### Frontend store rehydration (specified)

Tens of MB of NDJSON cannot block the UI. Rehydration uses **tail-first lazy load** backed by a SQLite offset index.

**Tail-first:**
- On reopen, read the *last* 50 messages of the session by seeking to the bottom of `events.ndjson` (or by querying the SQLite index for the most-recent N message offsets).
- Build the store's `messages[]` and `toolUses{}` from those events, render immediately.
- Older messages render as a placeholder header: "▲ Load earlier history" — clicking pages back another 50.

**SQLite offset index:**
- A `composer_event_index` table stores `(session_id, message_id, file_offset, ts)` for every event written.
- Constructed incrementally as events are persisted; reading older history is `O(log n)` instead of streaming the whole file.
- On a long session (~50 MB NDJSON), opening goes from "blocks for seconds" to "renders in < 100 ms."

**Acceptance:** opening a session with 5000 messages renders the latest 50 within 100 ms; loading earlier pages is < 200 ms each.

### Worktree-scoped session lists

Sessions belong to a worktree. Switching to worktree B doesn't show worktree A's sessions in its sub-tab strip. Cross-worktree session listing is available via `Cmd-Shift-K` "session switcher" — a global picker that shows all live sessions across all worktrees.

## 11.7.5 Global Composer Surface (always accessible)

The Composer tab inside a worktree is **one** way to interact with sessions, not the only way. To deliver "session continues no matter what the user does," the composer also has a **global, app-level surface** reachable from anywhere — editor open, terminal focused, settings page, even with no project selected.

### Why global, not just worktree-scoped

The spec's §11.7 already keeps subprocesses alive across worktree switches; what was missing is **UI access** to those subprocesses while the user is doing other things. A user runs an agent task in worktree A, switches to worktree B to look at a file, and currently has to switch back to A just to type a follow-up. The global surface removes that friction.

### Two surfaces, one set of sessions

The session is the source of truth. Two views into it:

| Surface | Where | Use it for |
|---|---|---|
| **Composer pane (in-worktree)** | Inside a project pane bar, sub-tab strip | Focused session work, full message list, full agent sidebar, full diff overlay |
| **Global composer drawer** | Slides over from the right edge of the window via `Cmd-J`; accessible from any view, even with no worktree open | Quick interaction with any running session, monitor multiple in parallel, send a quick follow-up without changing context |

Both surfaces read from the same module-level `Map<sessionId, ComposerState>`. Whichever is open shows the same data; mutations (e.g. accepting a permission request) are reflected instantly in both.

### Drawer behavior

- `Cmd-J` toggles. When closed, an unobtrusive status pill in the bottom bar shows "3 sessions, 1 streaming" — clickable to open.
- The drawer is ~480 px wide on desktop, full-width on small windows.
- Top of drawer: a **session list** showing every running session app-wide — name, worktree-of-origin, status (idle / streaming / awaiting permission / error), elapsed-since-last-event.
- Click a session → drawer flips to that session's message list + composer input (compact layout).
- "Pop out to pane" button on each session → opens (or focuses) the in-worktree Composer pane for that session, with the sub-tab activated.
- "New session" button asks **which worktree** the new session should home in (defaults to the currently active worktree if any, or the last-used worktree if none).

### Where a session "lives"

Each session is locked to a single home worktree at spawn (the one whose CWD it was started in). This is non-negotiable because:

- The `claude` CLI is spawned with `cwd=worktreePath` and that's where its file ops resolve.
- Subagents and skills loaded at spawn read from `<worktree>/.claude/` and `~/.claude/`.
- Permission scoping is already worktree-shaped (agent can write to its CWD subtree by default).

So the session's *files* are always in its home worktree. What's global is the **UI access** — you can read, send to, and approve actions on any session from anywhere; the actions still apply to that session's home filesystem.

### Cross-project mentions (no, you can't move a session)

A user editing a file in worktree B can still ask the session running in worktree A about it via `@<absolute-path>` mention. The session reads the file (within Claude's own permission/path rules) and answers. The agent's *write* operations remain scoped to its home worktree — we won't open a tool-use that edits files outside its CWD without an explicit per-turn approval prompt that names the foreign path.

### Status bar pill — the always-on indicator

Bottom-right corner pill that's present in every view (editor, terminal, settings, no-worktree-selected). States:

- `0 sessions` — hidden.
- `N idle` — gray, count only.
- `N · 1 streaming` — accent color, tiny pulse.
- `! 1 awaiting permission` — warning color, click to jump straight to that session in the drawer.
- `× 1 error` — error color, click to see error.

### System integration (later)

A follow-up to the global drawer can extend to OS-level surfaces. Out of scope for V2 launch but designed-for:

- **macOS Notification Center** for permission requests when Phantom is in background.
- **Menubar mini-icon** with the same status states as the bottom pill.
- **Global hotkey** (configurable, default `Opt-Space`) to toggle the drawer even when Phantom is not the focused app — wakes Phantom, opens drawer, focuses input.

These are explicitly later. The V2 ship target is: in-app drawer + bottom pill, accessible from every Phantom view.

### Implications for the data model

- Add a `worktreeId` field to `Session` — already implicit, make it explicit. Used by both surfaces and by the global session list.
- The `Map<sessionId, ComposerState>` becomes truly global (one map for the whole app), not per-worktree. The in-worktree pane filters this map by `worktreeId === currentWorktree`; the global drawer doesn't filter.
- Cross-pane signals (`activeSessionId()`, `streamingSessionCount()`, `pendingPermissionCount()`) all become app-global. The bottom pill subscribes to these.

### Failure modes

- **No worktree selected, user opens drawer** → drawer works fine for existing sessions; "New session" disables with "open a worktree first" tooltip.
- **Home worktree deleted while session running** → session enters a `home_missing` state. Drawer shows the session with a banner: "this session's worktree no longer exists; only read-only history is available." Subprocess shut down gracefully.
- **Drawer open during fullscreen editor** → drawer overlays; closes on `Esc` or `Cmd-J` toggle. Editor work isn't disrupted.

### Why this is a path, not a rebuild

Most of this is UI surface + a `worktreeId` field on `Session`. The hard part — keeping subprocesses alive and having a single store map — is already in §11.6 / §11.7. The global drawer is a thin component that subscribes to the same store and mounts at the app root, outside any worktree pane.

## 11.8 Conversation Trim & Compaction (Haiku-powered) — DEFERRED to V2.1

> **Scope note (DA P0-4):** Trim-and-resume as originally specified is broken. The `--include-system-summary` flag is invented (not a real CLI arg), and mid-conversation `tool_use_id` references dangle when introducing turns are summarized away. A correct implementation requires (a) trimming only at clean turn boundaries where no later message references prior tool_use_ids, and (b) rewriting the on-disk transcript Anthropic reads from rather than relying on a non-existent flag. Both need validation against Anthropic's actual transcript format — work that's better done as its own feature spec, not folded into V2.0 launch.
>
> **V2.0:** ship without trim. Long sessions either hit context limits naturally (the CLI itself surfaces the limit) or get manually closed and re-`--resume`-d. Acceptable trade-off given the bigger wins shipping in V2.0.
> **V2.1:** dedicated spec for trim/compaction with proper boundary detection, transcript rewrite, and end-to-end validation.

The original §11.8 design (kept below for reference, not shipping in V2.0):

### When trim runs

- Manual: a "Compact conversation" command in the session menu.
- Automatic: when total message tokens exceed a configurable threshold (default 60% of the model's context window for that session).
- Background: a daily Haiku job archives sessions older than 30 days into summaries (per Decision §13 from the original spec).

### How trim works

1. Take the oldest contiguous block of messages that brings us under the target.
2. Send to `claude-haiku-4-5` (cheap, fast) with a structured prompt: "Summarize this conversation segment as a faithful set of facts, decisions, and remaining context the agent will need to continue. Preserve file paths, error messages, and decisions verbatim."
3. Replace those messages with one synthetic `system_summary` message in both the in-memory store and the on-disk NDJSON.
4. The original NDJSON is preserved with a `.pre-trim-<timestamp>` suffix so trim is reversible.
5. Re-resume the CLI session via `claude --resume <id> --include-system-summary` so the agent sees the new compact history on its next turn.

### Visible UI

A compact line in the message list: `▼ 47 messages summarized • Sun Apr 26` — clickable to expand back to full history (read-only, the underlying turns are archived).

### Failure modes

- Haiku call fails → trim aborts, no state change. Logged as WARN.
- User interrupts mid-trim → original NDJSON intact (we never write the new state until summary is fully received).
- Summary loses critical info → user can hit "expand" to see full history, then "rerun trim" to redo.

## 11.9 Settings — V2 Opt-in & Composer Controls

A new `Settings → Composer` page exposes:

| Setting | Default | Effect |
|---|---|---|
| Use Composer V2 | **off** during rollout, **on** after parity confirmed | Routes new sessions to V2; V1 sessions keep using V1 until closed |
| Auto-attach editor context | **on** | Always include `editor_context` block in user_input |
| Pre-injection (AI engine ambient context) | on | Run §11.5 path 2 before each user_input |
| Default mode | normal | normal / plan / auto-accept |
| Concurrent session cap (per worktree) | 8 | Soft cap; above this, open prompts to suspend |
| Auto-trim threshold | 60% of context window | Triggers Haiku-powered §11.8 trim |
| Verbose composer logs | off | Increases console + file log to DEBUG |
| MCP servers | (link to skill browser) | Deep-link to the existing skill browser MCP section |

The opt-in toggle is the migration safety valve. Until a user flips it on, they keep using V1 entirely.

## 11.10 Logging & Observability

Every meaningful event in the composer pipeline is logged. Two sinks:

1. **Structured NDJSON file** at `~/.phantom-os/logs/composer.ndjson` — one event per line, schema below. Rotated daily, kept 14 days.
2. **In-app console** (existing Phantom log viewer) at INFO and above; DEBUG when "Verbose composer logs" is on.

### Log schema

```
{
  "ts": "2026-05-03T18:42:11.123Z",
  "level": "INFO",                    // DEBUG | INFO | WARN | ERROR
  "category": "composer",             // composer | composer.session | composer.ipc | composer.ai-engine | composer.trim | composer.permission
  "sessionId": "01J...",
  "worktreeId": "phantom-os/main",
  "kind": "tool_use_start",           // event-specific discriminant
  "msg": "Edit tool started",
  "data": { ... }                     // event payload (file, params, etc.)
}
```

### Required log points

| Event | Level | Required fields |
|---|---|---|
| Session spawn | INFO | sessionId, worktreeId, claudeVersion, configPath |
| Send user_input | INFO | sessionId, byteCount, hasEditorContext |
| Receive any event | DEBUG | sessionId, kind, byteCount |
| Permission request | INFO | sessionId, tool, summary |
| Permission granted/denied | INFO | sessionId, tool, decision, source (user/auto-accept/timeout) |
| Tool use start/end | INFO | sessionId, tool, toolUseId, durationMs (on end) |
| AI engine pre-injection | DEBUG | sessionId, latencyMs, ambientByteCount |
| Trim run | INFO | sessionId, messagesRemoved, tokensRemoved, summaryTokens |
| Subprocess crash | ERROR | sessionId, exitCode, signal, stderrTail |
| Subprocess restart | WARN | sessionId, attempt, reason |
| Worktree switch | DEBUG | fromWorktreeId, toWorktreeId, sessionsKeptAlive |
| Worker highlight done | DEBUG | blockId, durationMs |
| Frame > 33 ms during streaming | WARN | sessionId, frameMs (sampled, not every frame) |
| MCP server load failure | ERROR | server, error |

### Enrichment integration

The existing rich-log system (project-wide enriched logging that we already have — keep it) gets a new "composer" category. All composer events flow through it as well, so the existing log viewer/filter UI works unchanged. The NDJSON file is the lower-level source of truth that the Phantom AI engine indexes for `phantom_orchestrator_history`.

### Privacy

User message content is logged at DEBUG only, never INFO+, and only when "Verbose composer logs" is on. INFO-level logs include byte counts and metadata, never content. This matches Phantom's existing logging policy.

## 11.11 CLI Version Contract & Protocol Drift Defense (DA P0-1)

The `claude --output-format stream-json` protocol is not a public stable contract. It evolves on minor CLI releases. We harden against drift on three axes.

### Version pin
- Phantom records a `MIN_CLI_VERSION` and `KNOWN_GOOD_CLI_VERSION` constant in Go. Updated per Phantom release after manual verification.
- On session spawn, Go invokes `claude --version`, parses, and refuses to start the session if version < `MIN_CLI_VERSION`. Surfaces an actionable error: "Update Claude Code to ≥ X.Y.Z (currently A.B.C). Run: `claude update`."

### Startup handshake
- Immediately after spawn, Go sends a no-op probe message and waits for a known shape of response (system_info or equivalent envelope). On unexpected shape: tear down, log structured error with full envelope sample, fall back to V1 with a non-blocking toast: "Composer V2 is incompatible with this Claude version — using V1 for this session."
- Handshake also collects the actual session_id assigned by the CLI; we stop guessing.

### Required events allowlist
- Go maintains a list of required event kinds (`assistant_message_delta`, `tool_use_start`, `tool_use_complete`, `permission_request`, `permission_response`, `assistant_message_complete`, `session_resumed`, etc.).
- During the first 60 s of a session or any test handshake, Go verifies that all required kinds either arrive or are documented as optional. Missing required kinds → fall back to V1.

### CI smoke test
- A `composer-protocol-smoke` job runs on every Phantom build:
  1. Install pinned `claude` version in CI.
  2. Spawn a session via the same code path Phantom uses.
  3. Send a canned prompt that exercises one tool use, one permission request, one assistant turn.
  4. Assert each expected event arrived in expected order with expected fields.
  5. Fail the build on any mismatch.

### Why this matters
Without this, the V2.0 ship is one upstream CLI patch away from silent breakage. Lenient envelope decoding is not a substitute for a contract.

## 11.12 Multi-Process Auth Coordination (DA P0-2)

The `claude` CLI stores OAuth tokens in `~/.claude/` and refreshes them assuming a single-writer pattern. Spawning N concurrent subprocesses that hit token expiry simultaneously is a race the CLI was not designed for.

### Spawn serialization
- Go's session manager owns a `spawnLock sync.Mutex`. Acquired before launching any new subprocess.
- Before releasing the lock, Go runs a token-validity probe (lightweight `claude --print --max-turns 0` or equivalent that exercises auth without consuming context).
- Probe failure → trigger a single coordinated refresh (see below) before unlock.

### Coordinated refresh
- When any session emits an `auth_refresh_required` event (or its CLI-emitted equivalent), Go transitions all active sessions to `paused-for-auth` state.
- A single shepherd subprocess (or an out-of-band `claude auth refresh` invocation) handles the refresh.
- On success, all paused sessions emit a `resume_after_refresh` event and continue. UI shows a brief "refreshing authentication…" banner across affected sessions.
- On failure (refresh token invalid, user logged out): all sessions transition to `auth_failed`, surface a "sign in again" CTA in each.

### Failure modes
- Two refreshes start before our serialization catches them: rare, the lock is held during the entire spawn-and-probe window. Audit log captures occurrences.
- User explicitly invokes `claude` outside Phantom mid-refresh: best-effort; we detect via probe failure on the next operation and re-coordinate.

### Acceptance
Stress test: spawn 10 sessions simultaneously while token has < 60 s remaining. Result: all sessions either successfully refresh and continue, or all fail in unison with a single sign-in CTA — no orphaned mid-refresh state.

## 11.13 CLI Binary Onboarding (DA P2-13)

`claude` may be missing, on PATH but stale, or installed in a non-default location. A first-class onboarding flow handles all three.

### Detection (app launch)
- Go probes for `claude` on PATH, in `~/.local/bin/`, in `~/.claude/bin/`, in common Homebrew locations.
- If found: invoke `--version`, parse, classify as `ok | stale | missing`.
- If missing or stale, the V2 toggle in Settings is greyed out with explanation tooltip: "Composer V2 requires Claude Code ≥ X.Y.Z. Install or update."

### Onboarding screen
- A first-launch banner offers one-click: "Install Claude Code" → opens the official install URL or runs the documented install command in the user's shell with confirmation.
- After install, a "Verify" button re-probes; on success, V2 toggle unlocks.

### Path override
- Power users can set `Settings → Composer → Claude binary path` to a custom location.
- Phantom validates the path on save (executable, version check) and stores it in prefs.

## 11.10.5 Privacy Hardening (DA P2-12)

Verbose composer logs at DEBUG include user-content. The 14-day NDJSON rotation + AI engine indexing is a privacy risk if a user toggles verbose to debug something and forgets.

### Hardening rules
- **Verbose logs auto-disable** after 4 hours, regardless of session activity. Settings shows a countdown when active. Re-enabling is one click.
- **Content logging is a separate toggle** from verbose. Default off even when verbose is on. Verbose-only logs metadata (event kinds, byte counts, timing) — never content.
- **AI engine indexing of composer logs is opt-in, off by default.** Off → `phantom_orchestrator_history` mirrors only metadata events (tool uses, durations, outcomes), never content. On → user sees an explicit prompt explaining what gets indexed.
- **Redaction filter** runs on any log line containing user content: API keys, OAuth tokens, and content matching common secret patterns (Anthropic keys, AWS, GitHub tokens) are replaced with `<REDACTED>` before write. Same filter applies to crash reports.

## 12. Migration / Coexistence

This is a meaningful rewrite, so we land it incrementally rather than swap atomically.

1. **Phase 0 — Spec + bench (this doc).** No code changes.
2. **Phase 1 — Backend skeleton.** New `internal/composer/` package with session manager + stream-JSON IPC. New Wails bindings. Old pane untouched. Smoke-test with a tiny throwaway `<ComposerPaneV2>` rendering raw events as `<pre>`.
3. **Phase 2 — Store + reducers.** Land `core/composer/store.ts` + reducers + types. Wire to the Phase 1 bindings. Still throwaway UI.
4. **Phase 3 — Component tree.** Build `<MessageList>`, `<MessageBubble>`, `<TextBlock>`, `<ToolUseCard>` as plain components, no perf rules yet. Visually parity with current pane.
5. **Phase 4 — Performance pass.** Apply §9 rules: incremental markdown, worker highlight, virtualization, stable cards, scroll discipline, layout containment.
6. **Phase 5 — Editor integration.** Wire `editorFocus()` signal, context chips, `<DiffOverlay>`, `/` and `@` palettes.
7. **Phase 6 — Migration.** Behind a pref toggle, route new sessions to V2. Keep V1 reachable for two releases. After parity confirmed, delete V1.

   **Parity gate (DA P1-10):** "parity confirmed" is a measurable checklist, not a vibe:
   - Every existing V1 feature has a passing V2 equivalent (line-itemed in `docs/superpowers/checklists/composer-v2-parity.md` — generated from V1 surface inventory).
   - Dogfood telemetry shows fallback-to-V1 rate < 5% across a continuous 7-day window.
   - Zero P0/P1 user-reported regressions open against V2.
   - V1 stays as a hidden feature flag (not deleted code) for one additional release after the user-facing toggle is removed. The hidden flag is removable via `phantom flags reset`.
   - One-way "Convert V1 session to V2 read-only view" tool exists so users with active V1 sessions at cutover have a non-destructive path.

Each phase is mergeable on its own and reverts cleanly.

## 13. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Anthropic changes stream-json schema | Medium | Use lenient envelope decoding; unknown events warn-and-drop, never throw. Pin the CLI version we ship configurations against; update on each `claude` upgrade. |
| Subprocess wedges on a tool call | Medium | 60 s wall-clock timeout per tool use enforced server-side; `Stop` always works via SIGINT then SIGTERM. |
| State store grows unbounded | Low | Cap `messages` at a configurable per-session limit (default 5000). Old turns are archived to SQLite and lazy-loaded. |
| Worker syntax highlight visibly lags | Low | Acceptable; code is readable as plain text during the gap. If users complain, add a simpler shiki-style two-color fallback during the gap. |
| Permission modal blocks input forever on lost event | Low | Modal has a 30 s soft timeout that surfaces a "denied (timeout)" with explicit retry. |
| Migration breaks pinned sessions | Medium | V1 stays available behind a pref for two releases; sessions persist their own version stamp; reading a V1 session in V2 falls back to a read-only view if needed. |
| CLI protocol drift on minor version bump (DA P0-1) | High | §11.11 — version pin, startup handshake, required-event allowlist, CI smoke test against pinned binary. |
| OAuth refresh race across N concurrent subprocesses (DA P0-2) | Medium | §11.12 — spawn mutex with token-validity probe, coordinated refresh on `auth_refresh_required`. |
| Solid store GC pressure at 200 events/sec (DA P1-7) | Medium | Profile in Phase 4; if measured, switch hot paths from path-style `setStore` to plain object mutation + manual signal triggers. Don't pre-emptively change architecture; measure first. |
| Verbose log + AI engine indexing leaks user content (DA P2-12) | Medium | §11.10.5 — verbose auto-disables after 4h, content logging is separate opt-in, AI engine indexes metadata only by default, redaction filter on write. |
| Missing or stale `claude` binary (DA P2-13) | High at install | §11.13 — detect on launch, V2 toggle gated, onboarding banner with one-click install/update. |

## 14. Out of Scope (revisit later)

- **Native PTY surface for the terminal pane.** Different problem, separate spec. Run the xterm.js benchmark first; only revisit if numbers demand it.
- **Multi-session orchestration in one pane** (parallel worktrees → parallel composers in tabs). Today each pane is one session. Cross-session orchestration is a future feature.
- **Server-side conversation history search.** Phantom already indexes via the AI graph; consider exposing a `Cmd-K` search across all transcripts as a follow-up.
- **Custom theme editor for composer surfaces.** Reuse the existing theme tokens; per-pane theming is a polish item.

## 15. Acceptance for "Done"

DA P0-3 noted that absolute frame-time targets are unrealistic in WebKit-inside-Wails. We replace absolute thresholds with **measured-against-V1 baselines** plus a small set of absolute correctness gates. Both must pass.

On a representative session of ~200 messages with mixed tool use, recorded traces compare V1 vs V2 on identical inputs:

**Relative (must beat V1):**
- p95 frame time during streaming: V2 measurably better than V1, no regressions.
- p95 input-to-paint for user echo: V2 ≤ 50% of V1.
- Scroll fps during streaming: V2 ≥ V1, ideally ≥ 55 fps on M-series.
- Time-to-first-render on session reopen (5000-message session): V2 ≤ 100 ms; V1 currently ≥ 2 s.

**Absolute correctness:**
- No call to `marked.parse` during streaming (one per finalized block only).
- All §9 rules verified by recorded traces (incremental markdown, off-thread highlight, virtualization, stable cards, scroll discipline, layout containment).
- Worker syntax highlighter pre-warmed on pane mount (P0-3 fix).
- Wails events coalesced server-side with 5 ms window during high-rate streaming (P0-3 fix).
- Feature parity with current pane: agent sidebar, memory panel, skill browser, diff cards, slash commands, MCP, subagents.
- All §11.5 paths (MCP, pre-injection, post-stream learning) functional with observable telemetry.
- All §11.6 multi-session correctness scenarios pass: per-session permissions, parallel streaming, sub-tab activity dots.
- All §11.7 continuity scenarios pass: worktree switch, pane unmount, app quit-and-relaunch, force-kill recovery.
- All §11.11 protocol drift defenses active: version pin, handshake, allowlist check, CI smoke test green.
- All §11.12 auth coordination scenarios pass: spawn-during-expiry stress test, simultaneous-refresh stress test.
- One full-day dogfood without falling back to V1, across at least 3 contributors.

---

## Appendix A — File Map (target)

```
v2/
  internal/
    composer/
      session.go            Session struct, lifecycle
      manager.go            SessionManager — registry, supervisor, multi-session per worktree
      events.go             Stream-JSON envelope types
      bindings.go           Wails bindings (Open, Send, Stop, Resume, List, Trim, Close)
      ai_engine.go          MCP config registration + pre-injection + post-stream mirror
      trim.go               Haiku-powered conversation compaction
      persist.go            NDJSON event log per session + SQLite metadata
      log.go                Structured composer.ndjson sink + enriched-log integration
  frontend/
    src/
      core/
        composer/
          store.ts          Map<sessionId, ComposerState> + active-session signal
          reducers.ts       event → patch (per-session)
          signals.ts        cross-pane signals (active session, streaming counts)
          markdown.ts       incremental markdown helpers
          highlight-worker.ts  hljs in a worker
          subtabs.ts        sub-tab strip state, ordering, activity dots
      components/
        composer/
          ComposerPane.tsx        outer pane shell, hosts sub-tab strip + content
          ComposerPane.css.ts
          ComposerSubTabs.tsx     horizontal tab strip with activity dots
          ComposerSession.tsx     content area for one active sub-tab
          ComposerDrawer.tsx      app-global drawer (Cmd-J), reads same store
          ComposerStatusPill.tsx  bottom-bar pill, mounts at app root
          MessageList.tsx
          MessageBubble.tsx
          blocks/
            TextBlock.tsx
            ThinkingBlock.tsx
            ToolUseCard.tsx
            ErrorBlock.tsx
            SystemSummaryBlock.tsx  (trimmed-conversation marker)
          input/
            ComposerInput.tsx
            ContextChips.tsx        always-on by default; per-turn dismissable
            SlashCommandMenu.tsx
            FileMentionMenu.tsx
            ModeToggle.tsx
          DiffOverlay.tsx
          PermissionModal.tsx
          AgentSidebar.tsx     (port from current ComposerAgentPanel)
      screens/
        settings/
          ComposerSettings.tsx  V2 toggle, auto-attach, trim threshold, etc.
```

## Appendix B — Decisions (resolved 2026-05-03)

1. **Concurrent sessions per worktree** — **many.** Single Composer pane in the main bar; sub-tab strip inside it for parallel sessions. See §11.6.
2. **Persistence boundary** — **verbatim** events to NDJSON + SQLite metadata. Periodic Haiku-powered trim job to keep things lean (manual trigger + automatic at 60% of context window + daily background pass for sessions older than 30 days). See §11.8.
3. **MCP server config UI** — **keep in skill browser.** Settings page deep-links to it. See §11.9.
4. **Editor-context auto-attach** — **always on by default.** User sees the attached context as a chip above the input and can dismiss it per-turn. Settings toggle to flip behavior off entirely. See §11.9.
