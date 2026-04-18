# PhantomOS v2 Design Specification -- Validation Report

**Reviewer:** Architecture Review (automated)
**Date:** 2026-04-18
**Spec under review:** `2026-04-18-phantomos-v2-design.md`
**Verdict:** Spec is architecturally sound but scope is dangerously large. Must cut or defer ~40% to ship in a reasonable timeframe.

---

## 1. Feasibility Check

### Performance Targets

| Target | Assessment | Severity |
|---|---|---|
| Startup <1s | **Realistic.** Wails v2 launches native WebKit, not Chromium. Go binary cold start is fast. SQLite WAL open is <10ms. The main risk is frontend bundle size -- if the React bundle is large, WebKit first-paint could exceed 1s. | LOW |
| Git status 5 worktrees <500ms parallel | **Realistic.** `git status` on a reasonably-sized repo takes 50-200ms. 5 in parallel via goroutines should land under 500ms. Large monorepos (100k+ files) could exceed this. | LOW |
| Terminal input latency <5ms | **Aggressive but plausible for direct Wails bindings.** The Wails JS bridge adds ~1-2ms overhead. `creack/pty` write is essentially a syscall. The bottleneck will be the React re-render on the xterm.js side, not the Go PTY. Real-world will be 3-8ms. | LOW |
| Memory idle <50MB | **CRITICAL -- Likely unrealistic.** Wails v2 uses macOS WebKit (WKWebView). WebKit alone consumes 40-80MB at idle with a non-trivial React app. Add Go runtime (8-15MB), SQLite in-memory caches, and the in-memory code graph, and 80-120MB idle is more realistic. **Recommendation:** Adjust target to <100MB. | HIGH |
| Binary size ~15-20MB | **Realistic with caveats.** Pure Go binary with `modernc.org/sqlite` typically lands at 15-25MB. Wails adds 2-3MB. However, the frontend assets (React bundle, Monaco editor, xterm.js) are embedded and could push total to 30-40MB. The spec compares against Electron 150MB, so even 40MB is a massive win. **Recommendation:** Clarify that 15-20MB refers to Go binary only; total app bundle will be larger. | MEDIUM |
| 10+ concurrent sessions | **Realistic.** Goroutines are cheap (~4KB each). 10 PTY sessions + 10 parser goroutines + 10 safety rule goroutines = ~30 goroutines. Trivial for Go. | LOW |
| AI engine simple task <50ms | **Depends entirely on what "fast path" does.** If it skips all graph queries and makes no LLM API call, 50ms is achievable for local classification + routing. If it includes even one HTTP round-trip to an LLM, 50ms is impossible (network RTT alone is 20-100ms). **Recommendation:** Clarify that <50ms is for local classification only; actual LLM response time is additive. | HIGH |
| Stream parse latency <10ms per event | **Realistic.** JSON parsing in Go is fast. A stream-json event is typically <10KB. | LOW |

### Wails v2 Limitations

| Limitation | Impact | Severity |
|---|---|---|
| **No native menu bar customization on macOS** (limited compared to Electron) | Minor -- PhantomOS uses a command palette (Cmd+K) as primary navigation. Native menus are secondary. | LOW |
| **WebSocket from frontend to backend within Wails** | The spec uses both Wails bindings AND WebSocket. Wails v2 does support running a local HTTP/WS server alongside the app, but this means the Go backend needs two communication channels. This is viable but adds complexity. | MEDIUM |
| **No multi-window support in Wails v2** | If the spec ever needs detachable panes or pop-out windows (e.g., a detached terminal), Wails v2 cannot do this. Wails v3 adds multi-window. | MEDIUM |
| **macOS-only focus** | Wails v2 supports Linux and Windows too, but WebKit behavior varies. Since target is macOS-only for now, this is fine. | LOW |
| **Wails v2 auto-updater** | Wails v2 has no built-in auto-updater. Phase 8 mentions auto-updater but does not specify how. Will need `sparkle-project/Sparkle` or a custom solution. | MEDIUM |

---

## 2. Gap Analysis: v1 Features Missing from v2 Spec

### CRITICAL Gaps (v1 features not mentioned in v2)

| v1 Feature | v1 Location | Status in v2 | Severity |
|---|---|---|---|
| **SSE (Server-Sent Events) broadcast system** | `server/src/index.ts` (sseClients, broadcast) | Replaced by WebSocket -- good. But the spec does not detail the event schema or how frontend migrates from SSE polling to WS subscription. | HIGH |
| **Session collectors: session-watcher, task-watcher, todo-watcher, activity-poller, jsonl-scanner** | `server/src/collectors/` | Not mentioned at all. These poll the filesystem for Claude session JSONL files, detect new sessions, parse tool usage, and update the DB. This is the backbone of how PhantomOS discovers Claude sessions. The v2 spec's "stream parser" handles only active PTY-spawned sessions. **Who discovers externally-started Claude sessions?** | CRITICAL |
| **MCP server (phantom-ai)** | `server/src/mcp/` (stdio-entry, handlers, server) | Not mentioned in v2. The MCP server exposes graph_context, graph_blast_radius, orchestrator_process as MCP tools for Claude to call. This is a core feature. Will v2 ship without it? | HIGH |
| **Claude integration service** | `server/src/services/claude-integration.ts` | Manages CLAUDE.md instructions and PreToolUse hooks for phantom-ai integration. Not mentioned in v2. | HIGH |
| **Chat with Claude (claude -p pipe)** | `server/src/routes/chat.ts` | Direct Claude chat functionality (not via terminal session). Not mentioned in v2. The v2 focus is on session management, but the inline chat feature is heavily used. | HIGH |
| **Plans discovery** | `server/src/routes/plans.ts` | Scans `~/.claude/plans/` for plan files matching worktrees. Not mentioned in v2. | MEDIUM |
| **Recipe system (process runner)** | `server/src/process-registry.ts`, `RecipeFormModal.tsx`, `RecipeQuickLaunch.tsx` | Recipe buttons that spawn processes (dev servers, test runners). Not in v2 spec. | MEDIUM |
| **Enrichment queue** | `server/src/enrichment-queue.ts` | Manages concurrent graph builds with priority queue. Not mentioned -- the v2 spec just says "graph queries" without describing how graphs get built for multiple projects. | MEDIUM |
| **Project detection pool (worker threads)** | `server/src/detect-pool.ts`, `detect-worker.ts` | Worker thread for off-main-thread project type detection. In Go this would be a goroutine (simpler), but the spec does not mention project profile detection (tech stack, package manager, frameworks). | MEDIUM |
| **Terminal daemon architecture** | `packages/terminal/src/daemon/` | v1 has a separate terminal daemon process with IPC. v2 spec inlines PTY into the Go process. This is fine, but the daemon provided cross-restart persistence. How does v2 handle app crashes where the Go process dies? All PTYs die with it. | MEDIUM |
| **Panes system (layout engine)** | `packages/panes/src/` (LayoutRenderer, PaneContainer, etc.) | Sophisticated drag-and-drop pane layout system. v2 mentions "tabbed panes" but does not address whether the split-pane layout engine is retained, rewritten, or dropped. | MEDIUM |
| **Onboarding flow** | `desktop/src/renderer/components/onboarding/` | Boot terminal animation, audio, multi-phase onboarding. Not mentioned in v2. | LOW |
| **Claude slash-command discovery** | `server/src/routes/claude-commands.ts` | Scans skills and commands directories for Cmd+K palette. Not mentioned. | MEDIUM |
| **File explorer (gitignore-aware)** | `worktree-files.ts`, `services/gitignore-matcher.ts` | Full file tree with gitignore filtering, file CRUD, search. Spec mentions "file search across worktrees" but not the full file explorer. | MEDIUM |
| **Shutdown ceremony** | `ShutdownCeremony.tsx`, `useShutdownOrchestrator.ts` | Graceful shutdown with animation. Part of the brand identity. Not mentioned. | LOW |

### v1 UI Components Not Addressed in v2

| Component | v1 Location | Notes |
|---|---|---|
| `FloatingClaudeComposer` | `components/chat/` | Floating chat input -- integral UX element |
| `EnrichmentWidget` | `components/` | Shows graph build progress |
| `SystemBlastRadius`, `SystemContextExplorer`, `SystemPipeline`, `SystemStrategySelector`, `SystemPlayground` | `components/system/` | AI engine debugging/visualization UI. Critical for developer experience. |
| `BranchSwitcher`, `ChangesView`, `GitActivityPanel` | `components/sidebar/` | Git UI in sidebar -- spec mentions git features but not these specific components |
| `SessionViewer`, `TokenAnalytics` | `components/views/` | Session replay and token analysis views |
| `RunningServersCard`, `ServerLogModal` | `components/` | Recipe/server management UI |
| `PlansCard` | `components/` | Plans discovery card |
| `JournalPane` | `components/` | Daily journal view |

### v1 Database Tables Not in v2

| Table | v1 Schema | Status in v2 |
|---|---|---|
| `tasks` | Full task tracking with blocking/blocked-by | Not mentioned in v2 schema section |
| `activity_log` | Timestamped activity events with XP | Not mentioned |
| `worktree_sections` | Section grouping for worktrees | Not mentioned |
| `graph_nodes`, `graph_edges`, `graph_meta` | Codebase graph persistence | Spec says "in-memory graph" -- are persisted graph tables dropped? |
| `chat_conversations`, `chat_messages` | Chat history | Mentioned in "retained" list but chat feature itself not described |

---

## 3. Contradictions

| # | Contradiction | Location | Severity |
|---|---|---|---|
| 1 | **Wails bindings for CRUD + WebSocket for streaming** -- The architecture diagram shows both channels, but the project structure has `internal/server/router.go` (HTTP/WebSocket router). Why does a Wails app need an HTTP router? Wails bindings call Go functions directly. Having both an HTTP API and Wails bindings means duplicated endpoint logic or an unused router. | Architecture diagram vs project structure | HIGH |
| 2 | **"React UI retained initially" vs "New UI layer"** -- Phase 1 says keep Mantine/Jotai, but Phase 2 considers Shadcn or Ark UI. The spec also says "Solo Leveling theme retained (it's the identity)" but the component library is deferred. Mantine has its own design system; switching to Shadcn means rewriting every component. This is essentially two UI rewrites (backend in Phase 1-6, then frontend in Phase 7). | Section 9 | HIGH |
| 3 | **Git pool "unbounded" goroutines vs "configurable concurrency (default: 8)"** -- The technology comparison table says "unbounded" but section 3 says "configurable concurrency (default: 8)". These conflict. | Technology table vs Section 3 | LOW |
| 4 | **"Stream parser" for Smart View vs how v1 discovers sessions** -- v2 assumes Claude sessions are PTY-managed by PhantomOS. But v1 discovers Claude sessions by scanning `~/.claude/projects/<dir>/<id>.jsonl` files on the filesystem. Users start Claude independently, and PhantomOS finds those sessions. The v2 stream parser only works for sessions spawned through PhantomOS. This fundamentally changes the user model. | Section 2 (Smart View) vs v1 session-watcher | CRITICAL |
| 5 | **Phase 1 "port core" includes SQLite but v2 uses different SQLite library** -- v1 uses `better-sqlite3` via Drizzle ORM. v2 uses `modernc.org/sqlite` with raw SQL or a Go ORM. The migration must also port the Drizzle schema definitions, which are not trivial (especially the query patterns in routes). | Migration Strategy Phase 1 | MEDIUM |
| 6 | **"Goroutine pool for git ops" but worktree-manager also runs git** -- The spec has `internal/git/pool.go` for git operations, but worktree operations (create, remove, list) also run git commands. v1's worktree-manager calls `runGitTask` from git-pool. The v2 spec puts worktrees under `internal/git/worktree.go` inside the same package, which is correct, but the boundary between pool.go and worktree.go could cause confusion. | Section 3 vs project structure | LOW |

---

## 4. Risk Assessment: Top 5 Technical Risks

### Risk 1: Session Discovery Model Change (CRITICAL)

**Risk:** v1 passively discovers Claude sessions by filesystem scanning. v2 assumes sessions are PTY-spawned by PhantomOS. This means v2 would NOT see Claude sessions started from external terminals (iTerm, VS Code integrated terminal, etc.). This breaks the core value proposition -- PhantomOS as a dashboard for ALL Claude activity.

**Impact:** Users who start Claude from their normal terminal get zero value from PhantomOS v2.

**Mitigation:** v2 MUST retain the filesystem-based session watcher from v1. The stream parser should be an enhancement for PhantomOS-spawned sessions, not a replacement for passive discovery. Add a `collectors/` package to the Go project structure.

### Risk 2: Scope Creep from "New Git Features" (HIGH)

**Risk:** Section 3 lists 12 new git features (merge conflict resolution UI, interactive rebase viewer, git graph visualization, blame integration, stash manager, cherry-pick UI, diff viewer, tag management, submodule support, bisect helper). Each of these is a substantial feature. Together they represent 3-6 months of work. They are not core to the v1->v2 migration and could delay the entire rewrite.

**Impact:** Project never ships because it keeps growing.

**Mitigation:** Defer ALL new git features to post-v2-launch. Port only the v1 git features first (the "carried forward" list is already substantial). Add the new features as a v2.x milestone.

### Risk 3: AI Engine Port Complexity (HIGH)

**Risk:** The v1 AI engine is the most complex subsystem: 6 strategies, graph-backed context, knowledge DB with decision/pattern/performance repositories, multi-perspective evaluator, task assessor, compactor, anti-repetition, performance store. Porting all of this to Go while simultaneously adding tiered pipeline and model routing is extremely risky. The Go and TypeScript type systems have fundamentally different approaches to polymorphism.

**Impact:** AI engine quality regresses during port. Features that work in v1 break in v2.

**Mitigation:** Consider keeping the AI engine as a TypeScript subprocess initially (invoked via stdin/stdout IPC from Go) and porting it last, after everything else is stable. Alternatively, port it with exact feature parity first (no tiered pipeline), then enhance.

### Risk 4: Wails v2 vs v3 Migration Tax (MEDIUM)

**Risk:** The spec acknowledges Wails v3 is in development. Wails v3 has breaking API changes (new binding system, new lifecycle hooks, multi-window support). Starting with v2 means a potential forced migration mid-project if v3 stabilizes and is needed (e.g., for multi-window).

**Impact:** 2-4 weeks of rework if migration to v3 is needed.

**Mitigation:** The spec's recommendation to start with v2 is correct. v3 is not stable enough. But minimize Wails-specific code by keeping a thin adapter layer between Wails bindings and core Go services. This makes v2->v3 migration a binding-layer-only change.

### Risk 5: Frontend Migration Pain (MEDIUM)

**Risk:** The React frontend currently talks to a Hono HTTP API with SSE. v2 replaces this with Wails bindings (synchronous function calls) and WebSocket (streaming). EVERY frontend data-fetching hook must be rewritten. The spec's Phase 1 claim that you can "swap backend from Hono to Go via Wails bindings" understates the effort -- the data layer is fundamentally different (HTTP fetch vs JS bridge calls).

**Impact:** Frontend regressions. Features break silently because the data contract changed.

**Mitigation:** Define the Wails binding types as a TypeScript interface file first (auto-generated from Go struct tags). Write adapter functions that match the current hook signatures so components do not need to change. The adapters translate from "Wails binding call" to the existing hook return type.

---

## 5. Scope Check

### Effort Estimate (1 developer)

| Phase | Estimated Effort | Notes |
|---|---|---|
| Phase 0: Wails + React shell | 1-2 days | Wails init + embed existing React build |
| Phase 1: Core port (SQLite, project detector, worktree, terminal) | 2-3 weeks | Terminal manager is complex; daemon architecture decisions needed |
| Phase 2: Git operations | 1-2 weeks | Port v1 features; goroutine pool is simpler than worker threads |
| Phase 3: Stream parser + Smart View | 3-4 weeks | New feature; stream-json parser + new React UI components |
| Phase 4: AI engine port | 4-6 weeks | Most complex subsystem; 6 strategies + graph + knowledge DB |
| Phase 5: Safety rules engine | 2-3 weeks | New feature; rule DSL, scanner, audit trail |
| Phase 6: Remaining features | 2-3 weeks | Gamification, chat, sessions, stats |
| Phase 7: New UI layer | 4-8 weeks | Component library decision + full redesign |
| Phase 8: Distribution | 1-2 weeks | DMG packaging, code signing, auto-updater |
| New git features (12 items) | 6-12 weeks | Each feature is 0.5-1 week |

**Total: 26-52 weeks (6-12 months) for one developer.**

### What to Cut or Defer

**MUST CUT (defer to v2.x):** [HIGH severity]

1. All 12 new git features (Section 3, "New git features in v2") -- 6-12 weeks saved
2. Interactive rebase viewer, git graph visualization, bisect helper -- these are not core
3. Phase 7 "New UI layer" complete redesign -- keep Mantine, enhance incrementally
4. Safety rules engine admin dashboard with pattern detection ("user X bypassed 12 times") -- overkill for target audience of "Subash + friends"
5. Plugin system / `hashicorp/go-plugin` -- premature; interface-driven design is sufficient

**SHOULD CUT (defer to v2.1):** [MEDIUM severity]

1. Merge conflict resolution UI -- use external tools (VS Code, git mergetool)
2. Session branching and rewinding (Section 5) -- novel but complex; ship pause/resume first
3. Monaco editor integration with inline git blame -- use external editor for now
4. Drag file from Finder -- macOS integration adds complexity
5. Multi-session orchestration (pipeline one session's output to another)

**Reduced scope total: 16-24 weeks (4-6 months).** This is achievable for one focused developer.

---

## 6. Architecture Review

### Go Project Structure: Assessment

The proposed `internal/` layout follows Go conventions well. Using `internal/` prevents external imports, which is correct for a desktop app. Packages are organized by domain (terminal, git, ai, safety, session, db, project, gamification).

**Strengths:**
- Interface-driven design with `GitOperation`, `Strategy`, `RuleChecker`, `StreamHandler` interfaces is excellent Go practice
- Plugin registry pattern via `init()` functions is idiomatic Go
- Separation of stream parsing (events/parser) from broadcasting (hub) is clean
- Using channels for goroutine communication is the Go way

**Issues:**

| Issue | Location | Severity |
|---|---|---|
| **`init()` for plugin registration is fragile** -- Go `init()` functions run in undefined order across packages. If strategy A depends on strategy B being registered first, this breaks silently. | Extension System | MEDIUM |
| **`internal/server/router.go` is unnecessary** -- In a Wails app, Go functions are exposed directly as JS bindings. Having an HTTP router creates two API surfaces. Either use Wails bindings exclusively (for CRUD) + WebSocket (for streaming), or use HTTP exclusively (defeating the purpose of Wails). | Project structure | HIGH |
| **`internal/server/bindings.go` will become a god file** -- Every Wails-exposed function must be a method on a struct that's registered with Wails. If all bindings are in one file, it will grow to thousands of lines. | Project structure | MEDIUM |
| **Missing `internal/collector/` package** -- The spec has no equivalent of v1's session-watcher, task-watcher, activity-poller. These are essential (see Risk 1). | Project structure | CRITICAL |
| **`modernc.org/sqlite` is pure Go but 2-5x slower than CGo `mattn/go-sqlite3`** -- For a desktop app this is fine for most queries, but the AI engine graph queries (which can touch thousands of nodes) may notice. Benchmark before committing. | Go Dependencies | MEDIUM |
| **No error handling pattern defined** -- Go's explicit error handling means consistent patterns matter. The spec does not define whether errors are wrapped (e.g., `fmt.Errorf("terminal.Start: %w", err)`), logged at boundaries, or propagated raw. | Architecture-wide | MEDIUM |

### Anti-Patterns Detected

1. **Kitchen-sink interface risk:** The `Strategy` interface is well-scoped, but `GitOperation` having just `Name()` and `Execute()` is too generic. A "cherry-pick" and a "status check" have radically different signatures. Forcing both through `(Result, error)` means `Result` becomes an untyped grab-bag.

2. **Goroutine leak risk:** The spec mentions "dedicated goroutine per session" for terminal, stream parsing, and safety rules. That is 3+ goroutines per session. With no mention of context cancellation or lifecycle management, goroutine leaks are likely when sessions end abnormally.

**Recommendation:** Define a `SessionLifecycle` interface or use `context.Context` with cancellation consistently. Each session goroutine must select on `<-ctx.Done()`.

---

## 7. Migration Path Review

### Phase Dependencies

```
Phase 0 (Wails shell)
  |
  v
Phase 1 (Core: SQLite, terminal, project, worktree)
  |
  +---> Phase 2 (Git ops -- depends on: worktree manager from Phase 1)
  |       |
  +---> Phase 3 (Stream parser -- depends on: terminal manager from Phase 1)
  |       |
  |       v
  +---> Phase 4 (AI engine -- depends on: SQLite from Phase 1, could run parallel with Phase 3)
  |
  v
Phase 5 (Safety rules -- depends on: stream parser from Phase 3)
  |
  v
Phase 6 (Remaining features -- depends on: all above)
  |
  v
Phase 7 (New UI -- depends on: all features working)
  |
  v
Phase 8 (Distribution)
```

### Issues with the Migration Plan

| Issue | Severity |
|---|---|
| **Phase 1-2 can run in parallel but are listed sequentially.** Git operations (Phase 2) depend on worktree manager but NOT on terminal manager. You could start git pool work while terminal is being ported. | MEDIUM |
| **No Phase for "session collectors" (filesystem watchers).** This is the CRITICAL gap. Without session-watcher and activity-poller, PhantomOS cannot discover Claude sessions. This must be in Phase 1 or early Phase 2. | CRITICAL |
| **Phase 4 (AI engine) is underspecified.** The v1 AI engine has: graph builder, AST enricher, file watcher, incremental updater, persistence layer, 8 language parsers (JS, TS, Python, Go, Rust, Java), knowledge DB with 3 repositories, event bus, document builder, query engine, decision query, assessor, evaluator, multi-evaluator, compactor, knowledge writer, and 6 strategies. Porting all of this is Phase 4 alone could take 6 weeks. Break it into sub-phases. | HIGH |
| **Phase 6 is a grab-bag.** "Remaining features (gamification, chat, sessions, stats)" lumps together 5+ subsystems. Each has its own routes, services, and UI. Break it into: 6a (gamification), 6b (chat), 6c (cockpit/stats), 6d (system metrics). | MEDIUM |
| **No mention of frontend migration phasing.** Every Phase that ports a backend feature also requires updating the corresponding frontend hooks. The spec treats frontend as a Phase 7 activity, but you cannot ship Phase 1 without updating `useSessions`, `useQuests`, `useHunter`, etc. to use Wails bindings instead of HTTP fetch. | HIGH |
| **v1 data migration not detailed.** "v1 data imported on first v2 launch" -- but v1 uses Drizzle ORM with specific column naming conventions (`started_at` vs `startedAt`). The Go models must match v1's column names exactly to read the existing DB. This constraint is not documented. | MEDIUM |

---

## 8. Security Review: Safety Rules Engine

### Strengths

- Four-tier severity model (block, warn, confirm, log) is well-designed
- Audit trail with full context (session_id, timestamp, rule_name, payload_summary) is good
- Hot-reloadable rules via file watcher is excellent for operational agility
- "Admin-only override" for block-level rules prevents bypass

### Gaps and Concerns

| Issue | Severity |
|---|---|
| **No authentication model.** Who is "admin"? For "Subash + friends" target, everyone is admin. But the spec describes admin-only overrides and admin dashboards. Without user identity, any user can modify rules. | HIGH |
| **YAML rule DSL is powerful but unvalidated.** The `check.scan_for: [email, ssn, api_key, phone]` syntax implies regex-based PII scanning. False positive rate will be high (e.g., any email address in code comments triggers the rule). No mention of allowlists or pattern refinement. | MEDIUM |
| **Rate-limiting rule (`> 5 writes in 60s`) needs state.** The safety engine must maintain a sliding window counter per session. This is not a stateless check -- the `scanner.go` must have session-scoped state or query the `safety_audit` table on every event. Neither approach is mentioned. | MEDIUM |
| **`payload_summary` in audit trail is vague.** How much of the tool call payload is stored? Storing full payloads could include secrets. Storing truncated summaries may lose forensic value. Define a policy. | MEDIUM |
| **No rule testing/dry-run mode.** New rules could accidentally block legitimate operations. There should be a "dry-run" mode that logs what would have been blocked without actually blocking. | MEDIUM |
| **File watcher goroutine for hot-reload has a TOCTOU race.** If the rules file is partially written when the watcher fires, the engine loads corrupt YAML. Use atomic writes (write to temp file, then rename) or add a debounce/validation step. | MEDIUM |
| **No rule versioning.** If rules are edited, old audit trail entries reference rule names that may have changed. Add a rule version or hash to the audit record. | LOW |

---

## 9. Open Questions -- Responses and New Questions

### Spec's Open Questions

**Q1: Wails v2 vs v3?**
**Agreement: Yes, start with v2.** v3 is not stable (last checked: alpha/beta status). The recommendation is correct. Add a thin Wails adapter layer to minimize migration cost later.

**Q2: Component library for Phase 2 UI?**
**Recommendation: Do not change component libraries during a backend rewrite.** Keep Mantine. Changing the component library is a separate project that should happen only after v2 backend is stable. Mixing a Go rewrite with a UI framework migration is a recipe for never shipping.

**Q3: Graph database for AI engine?**
**Agreement: Keep in-memory for now.** An embedded graph DB adds dependency weight for marginal benefit at this scale. The v1 approach (in-memory with SQLite persistence) works. Re-evaluate only if graph queries become a bottleneck with measured data.

**Q4: MCP server integration?**
**This should be higher priority than "later phase."** The MCP server is a shipping v1 feature, not a future exploration. It must be ported. See gap analysis above.

### New Questions

| # | Question | Priority |
|---|---|---|
| NQ1 | **How does v2 discover externally-started Claude sessions?** The v1 filesystem scanner (`session-watcher.ts`, `jsonl-scanner.ts`) is the primary session discovery mechanism. v2's stream parser only handles PTY-spawned sessions. What about sessions started from iTerm, VS Code, or other terminals? | CRITICAL |
| NQ2 | **What is the frontend migration strategy?** Every React hook (`useSessions`, `useHunter`, `useQuests`, etc.) currently fetches from `http://localhost:<port>/api/...`. These must change to Wails binding calls. Is this a big-bang change or incremental? Can an adapter layer simulate the old API using Wails bindings? | HIGH |
| NQ3 | **What happens to the terminal daemon?** v1 has a separate daemon process (`packages/terminal/src/daemon/`) that survives app restarts. v2 inlines PTY into the Go process. If the app crashes, all terminal sessions are lost. Is this acceptable? | HIGH |
| NQ4 | **How are Go struct types shared with TypeScript?** Wails auto-generates TS types from Go structs, but only for bound methods. The WebSocket event payloads are not auto-generated. Who maintains the TS type definitions for stream events? | MEDIUM |
| NQ5 | **What is the testing strategy?** v1 has tests for the AI engine, process registry, project detector, and MCP handlers. The v2 spec mentions no testing approach. Go has excellent built-in testing -- define a minimum coverage target and testing patterns (table-driven tests, interface mocks). | MEDIUM |
| NQ6 | **What about the `@phantom-os/shared` package?** v1 has shared types and constants used by both server and frontend. In v2, the Go backend cannot import TypeScript types. Who is the source of truth for shared types? | MEDIUM |
| NQ7 | **Is Drizzle ORM dropped?** v1 uses Drizzle with `better-sqlite3`. v2 uses `modernc.org/sqlite` directly or with a Go ORM (not specified). What Go DB layer is used? Raw SQL? GORM? sqlc? This affects the entire data access layer. | MEDIUM |

---

## Summary of Findings by Severity

### CRITICAL (must fix before starting)

1. **Session discovery gap:** v2 has no equivalent of v1's filesystem-based session watchers. Without this, PhantomOS cannot discover Claude sessions started outside the app. Add `internal/collector/` to the project structure.
2. **Session model contradiction:** The spec assumes PTY-spawned sessions but v1's core value is passive session discovery. Resolve this architectural question first.
3. **Missing `internal/collector/` package** in the project structure.

### HIGH (should fix)

1. Memory target of <50MB is unrealistic. Adjust to <100MB.
2. AI engine <50ms target needs clarification (local-only vs including LLM call).
3. MCP server (phantom-ai) not mentioned -- must be ported.
4. Claude integration service not mentioned -- must be ported.
5. Chat feature not mentioned -- must be ported.
6. HTTP router in Wails app creates dual API surface -- pick one pattern.
7. Mantine-to-Shadcn migration within a backend rewrite doubles risk.
8. Frontend migration strategy undefined.
9. No authentication model for safety rules "admin" concept.
10. AI engine Phase 4 is underspecified for its complexity.

### MEDIUM (consider)

1. Binary size target should clarify Go-only vs total bundle.
2. Wails v2 has no multi-window or built-in auto-updater.
3. `init()` registration ordering is fragile.
4. `bindings.go` will become a god file.
5. `modernc.org/sqlite` is slower than CGo alternative -- benchmark.
6. Safety rules rate-limiting needs state management.
7. YAML rule DSL needs validation and allowlists.
8. No rule testing/dry-run mode.
9. v1 data migration column naming constraints.
10. Multiple v1 features missing (plans, recipes, enrichment, onboarding, slash commands).

### LOW (nice to have)

1. Git pool "unbounded" vs "configurable" wording conflict.
2. Shutdown ceremony not mentioned.
3. Safety rule versioning for audit trail.
4. Startup <1s may depend on React bundle size.
