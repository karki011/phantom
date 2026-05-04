# Devil's Advocate Review — Composer Rebuild Spec

**Date:** 2026-05-03
**Reviewer:** Adversarial pass against `2026-05-03-composer-rebuild-design.md`. Goal is to attack assumptions, not to balance them. The spec author asked for it.

---

## P0 — Ship-blockers

### 1. The `claude` CLI stream-json protocol is undocumented and unstable
The spec treats `--output-format stream-json --input-format stream-json --verbose` as a stable IPC contract Anthropic maintains. It is not. It is an implementation detail that the VS Code extension consumes via a tightly coupled Node bridge that ships in lockstep with the CLI. Field renames, new event kinds, and breaking envelope changes have happened on minor CLI releases. "Lenient envelope decoding + warn-and-drop" sounds nice until a permission_request shape changes silently and your modal stops appearing — you'll ship a broken build for a day before anyone notices, because warnings are not errors.
**Fix:** Pin the exact `claude` version Phantom ships against; add a startup handshake that sends a known-payload no-op and asserts the event kinds you depend on; on mismatch, fall back to V1 instead of V2 with a visible toast. Add a smoke test that runs against the pinned binary in CI on every Phantom release.

### 2. Pro/Max OAuth state is shared across N concurrent subprocesses with no isolation guarantee
Spec says "8 concurrent live sessions per worktree" and assumes the CLI handles its own auth. The CLI stores OAuth tokens in `~/.claude/` and refreshes them with a single-writer assumption. Spawning 8 subprocesses that all hit token expiry simultaneously is a race the CLI was never tested for. You'll see random session deaths during long-running multi-session work, and the supervisor's auto-restart will mask it as "subprocess wedged".
**Fix:** Serialize spawn through a Go-side mutex that confirms a valid token before letting the next session start. Detect the auth-refresh error event explicitly; pause all sessions during refresh; resume after. Don't pretend this is the CLI's problem — it becomes Phantom's the moment you spawn N of them.

### 3. p95 ≤ 16 ms during streaming is a lie inside macOS WebKit
The spec quotes 16 ms p95 frame time on M-series Macs as the acceptance criterion. WebKit inside Wails is not Chromium. Its main-thread scheduler, raster pipeline, and Web Worker startup cost are different — and worse — than what the VS Code Chromium-based extension benefits from. Two specific hits the spec ignores: (a) WebKit's `requestIdleCallback` is a polyfill stub, so any "do this when idle" assumption is actually "do this synchronously"; (b) Web Worker boot in WebKit is measured in tens of ms, not ones — `hljs` worker first-message will jank the first finalized code block. Solid fine-grained reactivity helps, but it doesn't help the per-event Wails IPC trip across the JS/Go boundary, which on Wails v2 has measurable serialization overhead at the rates token streaming hits (50–200 events/sec).
**Fix:** Drop "p95 ≤ 16 ms" as a launch gate and replace with a measured baseline against the existing Composer pane on real hardware. Set the goal as "consistently better than V1 on the same trace". Pre-warm the highlighter worker on pane mount, not on first code block. Batch Wails events on the Go side (5 ms coalesce window) so the JS bridge isn't paying serialization tax 200x/sec.

### 4. Trim-and-resume corrupts tool_use_id continuity
§11.8 says: send oldest contiguous block to Haiku, replace with one `system_summary`, then resume via `claude --resume <id> --include-system-summary`. Two breakers: (a) `--include-system-summary` is not a real CLI flag — invented by the spec; (b) even if it were, mid-conversation tool_use_ids referenced by later messages will dangle when the messages that introduced them are summarized away. The agent's next turn references an id the new history doesn't contain → CLI errors or hallucinates. You will lose conversations.
**Fix:** Trim only at clean boundaries — between fully-resolved turns where no later message references prior tool_use_ids. Encode that as a precondition. Drop the imaginary flag; the resume mechanism is to terminate the subprocess, rewrite the on-disk transcript Anthropic reads from, and `--resume` against that. Validate that approach with Anthropic's actual transcript format before promising users it works.

### 5. "Sessions survive worktree switches" is conflated with "sessions survive app crashes" — only one is actually delivered
§11.7 makes a strong promise then quietly downgrades it: "Default for V1: subprocess dies with the app, and on relaunch we replay events… any in-flight tool use is cancelled." That's not session continuity, that's "the transcript is saved." A user running an autonomous 30-minute refactor who quits Phantom expecting it to keep going (because the spec said sessions are non-negotiable continuous) will lose all progress and have an in-flight Edit half-applied. The deferred FIFO reattach is the actual feature; the default is a regression masquerading as the feature.
**Fix:** Either ship FIFO-based detached subprocesses in V1 (do the work), or rewrite §11.7 to say plainly: sessions survive worktree switches and pane unmounts, but not app quit. Don't oversell. If you ship the weaker version, add an explicit "app is closing — N sessions will be cancelled" confirmation dialog so users aren't surprised.

---

## P1 — Serious risk

### 6. AI engine pre-injection 250 ms timeout will silently degrade signal quality
§11.5 path 2: pre-injection has 250 ms wall-clock budget, on timeout queue for next turn. In practice, `phantom_graph_related` + `phantom_orchestrator_process` on a cold cache regularly exceed 250 ms on a moderately-sized repo. Result: the feature appears to "work" in dev, fails ~40% of turns in production, but never errors visibly. Users will perceive the agent as "sometimes codebase-aware, sometimes not" and have no way to diagnose.
**Fix:** Surface pre-injection timeouts as a small chip on the user message ("ambient context skipped") so users can correlate. Track timeout rate as a launch metric; if >10% in dogfood, raise the budget or run pre-injection async with a "context arriving" indicator instead of dropping it.

### 7. `setStore` path-style patches at 200 events/sec create hidden GC pressure
§8 leans heavily on Solid fine-grained reactivity. True at the leaf level. But every patch goes through `produce()`-like immutability semantics in Solid stores, which allocates wrappers on each path traversal. At 200 events/sec sustained for a 30-minute session, that's millions of short-lived objects. WebKit's GC will pause; the spec's "no jank" promise gets broken by a GC stop-the-world in the middle of a long stream.
**Fix:** Profile this explicitly before committing to "no external state library." Consider keeping `messages[]` and `toolUses[]` as plain objects mutated directly with manual signal triggers — the gain in zero-allocation streaming may matter more than the loss of automatic tracking. Measure first.

### 8. Multi-session permission state is implicitly racy
§11.6 says MCP servers are shared with isolated permission state. The CLI's permission system is per-process — each subprocess maintains its own permission cache. If a user grants `Bash(rm)` in one session, they don't grant it in another, fine. But the spec also implies permission_response is sent back over the same Wails channel — what happens if two sessions emit permission_request simultaneously? The spec's `state.permission` is a single field on a single store. The active sub-tab shows its own modal; the background sub-tab's request is invisible.
**Fix:** Make `permission` per-session in the store map and surface pending permissions on the sub-tab strip's activity dot with a distinct "needs your input" color. Add a cross-session pending-permissions tray. Otherwise users will hit "why is my session frozen" on background tabs constantly.

### 9. Optimistic echo + retroactive error state is a worse UX than a brief loading state
§9.1: render the user bubble synchronously, flip to error if backend fails. In practice, the backend almost never fails synchronously — what fails is the *first response token never arriving*. The bubble sits there, looking sent, with no feedback. Users assume the agent is thinking. Timeout discovery is on the order of 30 s.
**Fix:** Optimistic echo + a subtle 500 ms-delayed "waiting for agent…" state attached to the bubble. If first stream event hasn't arrived by N seconds, escalate to a visible warning. Don't conflate "rendered fast" with "good UX."

### 10. Migration §12 phase 6 deletes V1 with no rollback story
"After parity confirmed, delete V1." But session NDJSON written by V2 is a different shape than V1 transcripts. Users with active V1 sessions when V2 lands may have no clean migration path mid-conversation. Phase 6 also assumes "parity confirmed" is a binary — it never is.
**Fix:** Define parity as a checklist with measurable criteria (each agent panel feature, slash command behavior, etc.), and require dogfood telemetry showing fallback-to-V1 rate < 5% across a week before deletion. Keep V1 as a hidden feature flag (not just removed code) for one additional release after deletion. Add a one-way "convert V1 session to V2 read-only view" tool.

---

## P2 — Worth thinking about

### 11. `Cmd-T`, `Cmd-W`, `Cmd-1..9` collide with worktree-level shortcuts
Phantom already binds `Cmd-T`/`Cmd-W` for pane operations. Re-binding inside the Composer pane creates focus-context-dependent shortcuts that users won't predict.
**Fix:** Use a leader chord (`Cmd-K T`) or scope the bindings to the input only with an explicit visual hint.

### 12. Logging user messages at DEBUG with on-disk NDJSON is a privacy footgun
§11.10 says content logged at DEBUG only with verbose on. But the NDJSON file is 14-day rotated, world-readable on the user's disk, and Phantom AI indexes it for `phantom_orchestrator_history`. A user toggling verbose for 5 minutes to debug something has just persisted a fortnight of full conversation content into a searchable index they didn't realize existed.
**Fix:** Verbose logging auto-disables after N hours. NDJSON content logging is opt-in separately from verbose. AI engine indexing happens against metadata only unless the user explicitly opts in.

### 13. No story for when the `claude` binary is missing or wrong version
The spec assumes `claude` is on PATH. PhantomOS is a desktop app installed by users who may not have the CLI installed at all, or have a stale version pinned by a package manager.
**Fix:** Detect on app launch; if missing or version < pinned, surface a first-class onboarding step (download / upgrade) before any composer action is possible. V2 toggle should be greyed out with explanation when the CLI doesn't satisfy the contract.

### 14. Frontend store rehydration "in chunks" is hand-waved
§11.7 says the store rehydrates from NDJSON in chunks on reopen. For a long session that's tens of MB of JSON. Solid's `createStore` doesn't have a streaming-construction primitive — you'll either block the UI for seconds or build a custom progressive loader.
**Fix:** Spec the rehydration: render last 50 messages from a tail-read first, render older ones lazily as user scrolls up. SQLite metadata holds offset-by-message-id index for seek.

### 15. "Less is more" — the spec is doing too much in one rebuild
Multi-session sub-tabs, FIFO subprocess detach, Haiku trim, AI engine pre-injection, post-stream learning, full UI rewrite, V1 coexistence, phased migration — all in one design. Each carries its own correctness surface and its own failure mode. Phase 4 (perf pass) and phase 6 (migration) are the load-bearing wins; phases 11.5–11.8 each deserve their own follow-up spec.
**Fix:** Cut Haiku trim, post-stream learning, and FIFO reattach from V2's first ship. Get the IPC-and-render rewrite into users' hands; iterate the rest after. The spec's own §4 says the goal is "feel as fast as VS Code extension" — that's the customer-delighting promise. Everything else is engineer-delighting.

---

## Verdict

**Proceed with significant changes.** The core architectural choice (stream-json IPC, Go session manager, Solid render) is correct and the right direction. But the spec is over-scoped for a v1 ship and under-specified on three load-bearing claims: protocol stability, session continuity semantics, and trim-and-resume correctness. As written, it would ship a build that looks great in demos and falls over on day-3 long sessions, with logs that are simultaneously too noisy to triage and too sparse to debug protocol drift.

Recommended cuts before kickoff: drop FIFO reattach and Haiku trim from V2's launch scope (move to V2.1); replace the 16 ms acceptance criterion with a measured-against-V1 baseline; commit to a CLI version pin + smoke test before merging Phase 1. Recommended adds: explicit auth-refresh serialization, per-session permission state, pre-injection observability, V1-removal gating telemetry. Then ship.
