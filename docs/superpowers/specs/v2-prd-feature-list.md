# PhantomOS v2 — PRD Feature List

**Author:** Subash Karki
**Date:** 2026-04-18

---

## What PhantomOS Is

PhantomOS is an **AI-powered development command center** — a native desktop app that wraps AI coding assistants (Claude, GPT, Gemini, local models) with real-time session intelligence, parallel git operations, configurable safety guardrails, and a gamified developer experience. It transforms AI CLI tools from raw terminal output into a structured, controllable, multi-session development environment.

**One-liner:** The IDE for AI-assisted coding — see what your AI is doing, control how it works, keep it safe.

**Target:** Personal use + small circle of friends (macOS-focused).

---

## Tech Stack

- **Desktop:** Wails v2 (native macOS WebKit, ~15-20MB binary)
- **Backend:** Go (goroutines for true parallelism)
- **Frontend:** Solid.js + TypeScript (zero-rerender architecture)
- **Build:** Vite 8 (Rolldown — Rust-based unified bundler, 10-30x faster builds)
- **Styling:** Vanilla Extract (compile-time CSS, zero runtime)
- **Components:** Kobalte (headless, accessible)
- **Database:** SQLite (pure Go, WAL mode, sqlc for type-safe queries)
- **Terminal:** creack/pty (pure Go) + xterm.js WebGL
- **Editor:** Monaco with tree-sitter + LSP proxy
- **AI:** Provider-agnostic interface (Claude first, GPT/Gemini/local future)

---

## Feature Categories

### 1. CORE PLATFORM (28 features)

1. Native macOS desktop app (Wails v2, WebKit, ~15-20MB binary)
2. Go backend with goroutine-based true parallelism
3. Solid.js + TypeScript frontend with zero-rerender architecture
4. SQLite database with WAL mode (pure Go, no native modules)
5. Wails bindings for zero-overhead Go-JS communication
6. WebSocket streaming for real-time data (multiplexed by session)
7. Wails Events for lightweight state push notifications
8. Vanilla Extract compile-time CSS with type-safe design tokens
9. Kobalte headless accessible components
10. @tanstack/solid-virtual for virtualized lists (163+ projects)
11. solid-motionone for smooth animations
12. Command palette (Cmd+K) for all actions
13. Split-pane layout engine with drag-and-drop
14. Per-worktree state persistence (tabs, cursor, scroll to SQLite)
15. Hot-reloadable YAML configuration
16. Structured logging (charmbracelet/log)
17. Graceful shutdown with ceremony animation
18. Multi-phase onboarding flow with v1 data import
19. Solo Leveling "Shadow Monarch" dark theme
20. Multiple theme support via Vanilla Extract tokens
21. Auto-updater (Sparkle, native macOS) with delta updates
22. DMG packaging with code signing + notarization
23. GitHub Actions CI/CD (build, test, sign, release)
24. Universal binary (arm64 + amd64)
25. Auto-generated release notes from git history
26. Cross-platform structure ready (Linux/Windows, not built yet)
27. Crash recovery with final buffer snapshot
28. System metrics dashboard (CPU, memory, load, goroutine count)

### 2. AI PROVIDER SYSTEM (8 features)

29. Provider abstraction interface (AI-agnostic architecture)
30. Claude provider (first implementation — CLI, stream-json, JSONL discovery)
31. Normalized StreamEvent types (all downstream is provider-agnostic)
32. Config-driven provider switching
33. Per-session provider selection
34. Provider-agnostic cost tracking (each provider maps its pricing)
35. Future provider slots: GPT, Gemini, Codex, Ollama/local
36. Provider health check and connection status

### 3. TERMINAL (12 features)

37. creack/pty terminal (pure Go, no native modules)
38. Login shell spawn — all aliases, PATH, oh-my-zsh intact
39. Goroutine per session — zero contention between terminals
40. xterm.js WebGL-accelerated rendering
41. Hot persistence (PTY stays alive across pane/worktree switches)
42. Cold persistence (SQLite snapshots every 10s)
43. Crash recovery with restore banner
44. Output buffering during UI disconnect (no lost bytes)
45. Ring buffer for replay
46. Terminal link clicking
47. Multiple concurrent terminals per worktree
48. Graceful SIGHUP on close (not SIGKILL)

### 4. SMART VIEW (13 features)

49. Real-time stream-json parsing (Go goroutine per session)
50. Tool call cards — collapsible (Read, Edit, Bash, Write, etc.)
51. Syntax-highlighted diff viewer with Accept/Reject/Auto-accept
52. Test result badges (pass/fail/skip)
53. Thinking blocks (expandable sections)
54. Real-time cost tracker (tokens + dollars per session)
55. Clickable file paths that open in editor
56. Inline image rendering (screenshots, diagrams)
57. Session history search with structured filters
58. Smart View to Raw Terminal toggle (same PTY)
59. Stream event persistence (session_events SQLite table)
60. Component renderer registry (extensible for custom event types)
61. Virtualized event list for long sessions

### 5. GIT OPERATIONS (30 features)

62. Goroutine pool (configurable, default 8 concurrent)
63. Worktree create/remove/list/discover
64. Branch checkout/create/delete
65. Default branch detection
66. Clone with auth detection (SSH/HTTPS)
67. Git status (porcelain) with staged/modified/untracked
68. Fetch with prune
69. Stash/unstash
70. Discard changes (file-level + full)
71. AI-generated commit messages (provider-agnostic)
72. PR creation (via gh CLI)
73. Commit history with remote URL detection
74. Branch listing (local + remote)
75. Base branch detection
76. Auto-setup on worktree create (pnpm/bun/npm/cargo/go/pip)
77. Parallel status dashboard — all worktrees simultaneously
78. Background periodic fetch (goroutine, never blocks UI)
79. Git graph visualization (interactive branch topology)
80. Merge conflict resolution UI (ours/theirs/manual)
81. Interactive rebase viewer (reorder/squash/edit)
82. Inline blame (hover in editor, click for commit detail)
83. Stash manager (visual list with preview, apply, drop)
84. Cherry-pick UI (select commits, preview, apply)
85. Side-by-side + unified diff viewer
86. Tag management (create, list, push)
87. Submodule support (status, update, sync)
88. Bisect helper (visual good/bad marking)
89. Eagle Eye multi-worktree overview
90. fsnotify-based instant local change detection (no polling)
91. Gutter decorations (modified/added/deleted lines in editor)



### 7. AI ENGINE (27 features)

107. Tiered pipeline (skip / fast / standard / full)
108. Complexity classifier (auto-detect task tier)
109. Smart model routing (Opus plans, Sonnet implements, Haiku answers)
110. Direct strategy
111. Advisor strategy
112. Self-refine strategy
113. Tree-of-thought (parallel branch exploration via goroutines)
114. Debate strategy (parallel perspective goroutines)
115. Graph-of-thought
116. In-memory code graph with parallel build (goroutine pool)
117. Parallel file read + parse during graph build
118. Content hash caching (skip unchanged files)
119. Tree-sitter AST parsing (replaces regex, 40+ languages)
120. Persistent graph cache in SQLite (no cold start rebuild)
121. Batched incremental updates via fsnotify
122. Pre-computed reverse dependency index (O(1) blast radius)
123. Per-project graph sharding (only active shards in memory)
124. Mtime-based fast validation on startup
125. AST enricher (8+ languages)
126. Knowledge DB with decision/pattern/performance repositories
127. Multi-perspective evaluator
128. Task assessor
129. Compactor
130. Prior penalty (anti-repetition)
131. Strategy performance store
132. Enrichment queue (prioritized graph builds)
133. AI Playground UI (strategy debugger/visualizer)

### 8. SESSION CONTROLLER (13 features)

134. Session discovery — filesystem collectors for external sessions
135. Session watcher (fsnotify on ~/.claude/projects/)
136. JSONL scanner (parse external session files)
137. Activity poller, task watcher, todo watcher
138. Pause/resume (buffer PTY, suspend mid-thought)
139. Session branching (fork session, try both approaches)
140. Session rewinding (replay up to N tool calls ago)
141. Session policies (supervised / auto-accept / smart)
142. Multi-session orchestration (pipeline one into another)
143. Session timeline with visual rewind markers
144. Per-session real-time cost tracking (tokens + dollars)
145. Kill/restart per session (goroutine isolation)
146. Multi-session dashboard (all sessions, status, progress)

### 9. SAFETY RULES ENGINE (14 features)

147. Configurable YAML rule definitions
148. 4 behavior levels: block / warn / confirm / log
149. Dry-run mode (test rules without blocking)
150. PII/pattern scanner with allowlists
151. Sliding window rate limiting
152. User bypass with mandatory audit logging
153. Hot-reloadable rules (fsnotify + debounce)
154. YAML validation on load
155. Audit trail (safety_audit SQLite table, payload hash)
156. Admin dashboard (trigger counts, bypass rates)
157. Pattern detection (frequent bypassers, rule fatigue)
158. Rule editor (Monaco YAML with live validation)
159. Rule versioning (hash in audit records)
160. Config-based auth (OS username for identity)

### 10. EDITOR — MONACO (27 features)

161. Monaco editor with framework-agnostic Solid.js wrapper
162. Multi-tab editor with file tree integration
163. Split editor (side-by-side two files)
164. Claude file link opens in editor tab
165. Claude edit shown in Monaco DiffEditor with Accept/Reject/Auto-accept
166. Claude new file previewed inline before disk write
167. Cross-worktree file search (parallel goroutines + Monaco search)
168. Drag from Finder to add file as AI context
169. Inline git blame on hover
170. Gutter modified/added/deleted line indicators
171. Quick diff (click gutter for inline hunk diff)
172. Lazy loading (~2.5MB chunk, not in initial bundle)
173. Web Workers (5 types: editor, JSON, TS, CSS, HTML)
174. Tree-sitter syntax highlighting via Go (shared with AI engine)
175. LSP proxy (Go proxies gopls, tsserver, etc.)
176. Hover, go-to-definition, autocomplete via LSP
177. Semantic highlighting (LSP-driven)
178. Minimap (on by default, toggle in settings)
179. Bracket matching + rainbow brackets
180. Sticky scroll (current scope pinned at top)
181. Large file handling (>1MB: basic editor, no tokenization)
182. Font ligatures (Fira Code / JetBrains Mono)
183. Editor state persistence (tabs, cursor, scroll to SQLite)
184. Read-only mode for AI-proposed diffs
185. Inline AI completions (ghost text)
186. Monaco Cmd+Shift+P unified with PhantomOS Cmd+K
187. Theme sync (Solo Leveling tokens to Monaco theme)

### 11. CHAT (5 features)

188. Floating composer input
189. Per-worktree conversation context
190. Chat history persistence (SQLite)
191. Conversation management (new, list, delete)
192. Provider-agnostic (uses Provider.Chat() interface)

### 12. GAMIFICATION (8 features)

193. Hunter stats dashboard (Solo Leveling theme)
194. XP and leveling system
195. Achievements (unlockable badges)
196. Quests (trackable objectives)
197. Journal generation (daily AI-generated dev journal)
198. Activity heatmap
199. Model usage breakdown
200. CodeBurn cockpit dashboard (cost burn rate, token velocity)

### 13. MCP / INTEGRATION (6 features)

201. MCP server (phantom-ai) — stdio mode
202. graph_context MCP tool
203. graph_blast_radius MCP tool
204. orchestrator_process MCP tool
205. CLAUDE.md management
206. PreToolUse hooks integration

### 14. RECIPES / PROCESSES (5 features)

207. Process registry
208. Recipe launcher (dev server, test runner, build commands)
209. Running servers card with status
210. Port allocation pool
211. Server log viewer

### 15. EXTENSION SYSTEM (9 features)

212. Interface-driven Go backend (all systems are interfaces)
213. Explicit plugin registry (controlled order, not init())
214. hashicorp/go-plugin (gRPC, out-of-process)
215. Plugin discovery (~/.phantom-os/plugins/)
216. Plugin SDK (Go module + TypeScript package + template)
217. Plugin manifest (YAML: name, version, capabilities)
218. Frontend component registry (dynamic Smart View renderers)
219. Theme extensibility (Vanilla Extract token override)
220. Hot-reload for JS-only plugins

### 16. FEATURE FLAGS (4 features)

221. Every feature on by default, user-disableable
222. Hierarchical toggles (parent off leads to children off)
223. Settings UI with visual toggle tree
224. Hot-reload (no restart, zero cost when disabled)

### 17. DISCOVERY / UX (6 features)

225. Plans discovery (scan ~/.claude/plans/)
226. Slash command discovery (Cmd+K integration)
227. Onboarding flow (boot animation, setup phases, audio)
228. Shutdown ceremony (graceful close with animation)
229. Status bar (sessions, resources, safety status, hunter level)
230. Notifications (system tray alerts for safety rules, session events)

---

## Summary

| Category | Count |
|---|---|
| Core Platform | 28 |
| AI Provider System | 8 |
| Terminal | 12 |
| Smart View | 13 |
| Git Operations | 30 |
| Sidebar / Navigation | 15 |
| AI Engine | 27 |
| Session Controller | 13 |
| Safety Rules Engine | 14 |
| Editor (Monaco) | 27 |
| Chat | 5 |
| Gamification | 8 |
| MCP / Integration | 6 |
| Recipes / Processes | 5 |
| Extension System | 9 |
| Feature Flags | 4 |
| Discovery / UX | 6 |
| **Total** | **230** |

---

