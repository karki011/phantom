# PhantomOS v2 — Complete Feature List

Generated: 2026-04-18

## I. ARCHITECTURE & CORE INFRASTRUCTURE

### A. Technology Stack
1. Frontend Framework: Solid.js + TypeScript
2. Desktop Shell: Wails v2 (Electron alternative)
3. Backend Language: Go (monolithic service)
4. Database: SQLite with sqlc (type-safe queries)
5. Terminal: Go PTY (pseudo-terminal management)
6. Build Tool: Vite 8 (Rolldown — Rust-based unified bundler, 10-30x faster builds)
7. Styling: Tailwind CSS
8. Component Animations: solid-motionone

### B. Architecture Patterns
9. Component-driven UI (Solid.js signals)
10. Type-safe database queries (sqlc)
11. Framework-agnostic editor wrapper
12. Session collector filesystem pattern
13. Project detector via .git, package.json, go.mod
14. Configurable safety rules engine
15. Tiered AI pipeline (fast → standard → advanced)
16. MCP plugin system (Model Context Protocol)
17. Multi-user authentication (future: OAuth2)

---

## II. TERMINAL & SESSION MANAGEMENT

### A. Terminal Management
18. Go PTY initialization and lifecycle management
19. Terminal I/O streaming (real-time output)
20. Shell detection (bash, zsh, fish, powershell)
21. Working directory tracking per session
22. Environment variable inheritance
23. Session pause capability
24. Session resume capability
25. Session kill/force-kill
26. Terminal auto-restart on crash
27. Command history persistence

### B. Session Collectors (Filesystem-based)
28. Claude CLI session discovery (.claude/sessions)
29. External session import
30. Session metadata extraction (model, provider, tokens)
31. Session filtering and search
32. Orphaned session cleanup
33. Session grouping by workspace
34. Session tagging system

### C. Session Controller
35. Pause/Resume orchestration
36. Branch management (snapshot current state)
37. Rewind capability (restore previous branch)
38. Session timeout policies
39. Resource limit enforcement
40. Concurrent session limits

---

## III. GIT OPERATIONS

### A. Parallel Git Operations
41. Parallel status check across repos
42. Parallel pull/push operations
43. Parallel branch creation
44. Parallel diff generation
45. Non-blocking async git pool
46. Connection pooling (5-10 workers)
47. Git operation prioritization queue
48. Stale operation timeout detection

### B. Git Worktree Management
49. Worktree creation from branch
50. Worktree listing
51. Worktree cleanup (prune)
52. Worktree branch association
53. Worktree auto-prune on stale timeout

### C. Git Blame & History
54. Inline blame gutter in editor (per line)
55. Git commit history browser
56. Author contact info display
57. Commit time annotation

### D. Git Dashboard
58. Parallel status dashboard (visual repo tree)
59. Repo health indicators (dirty, ahead/behind)
60. Branch picker dropdown
61. Quick stash/unstash actions
62. Merge conflict detection (visual)
63. Rebase progress indicator

### E. Git Actions (Advanced)
64. Interactive rebase UI
65. Cherry-pick support
66. Squash commit UI
67. Revert commit
68. Force push warning (safety)
69. Stash with message
70. Untracked file cleanup

---

## IV. SMART VIEW & STREAMING

### A. Stream Parser
71. Claude markdown parsing (code blocks, results)
72. ANSI color code detection
73. Shell command execution context extraction
74. Nested code block parsing
75. Diff hunk parsing
76. Error message formatting
77. Table markdown rendering
78. Inline math KaTeX support
79. Syntax highlighting per language

### B. Smart View Components
80. Raw terminal view toggle
81. Smart/parsed output toggle
82. Inline code execution (run button)
83. Copy code block button
84. Diff hunk accept/reject
85. File preview (new files before creation)
86. Nested command history display
87. Breadcrumb navigation (Claude output blocks)

### C. Stream Rendering
88. Real-time streaming (SSE or WebSocket)
89. Incremental DOM updates (Solid.js reactivity)
90. Scroll-to-latest on new content
91. Search within stream output
92. Export stream to file
93. Clear stream buffer

---

## V. EDITOR (MONACO INTEGRATION)

### A. Monaco Editor Core
94. Lazy-load Monaco (avoid 2.5MB bundle bloat)
95. Web worker configuration (editor, json, ts, css, html workers)
96. Framework-agnostic factory pattern (MonacoLoader.ts)
97. Default theme: shadow-monarch (Solo Leveling palette)
98. Minimap disabled by default
99. Automatic layout on resize
100. Font: JetBrains Mono, size 14

### B. Monaco Features
101. Multi-tab editor (EditorTabBar)
102. Tab drag-to-reorder
103. Tab close (with unsaved indicator)
104. Language auto-detection by extension
105. Syntax highlighting (50+ languages)
106. Code folding
107. Breadcrumb navigation (file hierarchy)
108. EditorStatusBar (language, line/col, encoding)

### C. Monaco Advanced
109. Diff editor view (side-by-side)
110. Diff accept hunk button
111. Diff reject hunk button
112. Diff auto-accept (bulk apply)
113. Blame gutter (inline git blame decorations)
114. Go LSP bridge for Monaco (intellisense)
115. File search dialog (Cmd+P / Cmd+Shift+F)
116. Find-and-replace
117. Go-to-definition
118. Go-to-line
119. Bracket matching and auto-pair
120. Comment toggle (Cmd+/)
121. Format code (Cmd+Shift+F)
122. Read-only mode toggle
123. Drag-drop files from Finder (DropZone)
124. File preview before creation

### D. Editor Integration
125. Dirty state tracking
126. Auto-save on timer (configurable)
127. Unsaved file indicator (tab badge)
128. Recent files list
129. File encoding detection
130. Line ending auto-detection (CRLF vs LF)

---

## VI. AI ENGINE

### A. AI Pipeline (Tiered)
131. Fast tier (Haiku model for simple tasks)
132. Standard tier (Sonnet model for balanced)
133. Advanced tier (Opus model for complex reasoning)
134. Model routing logic (auto-select based on complexity)
135. Token usage tracking
136. Cost calculation per request
137. Per-model rate limiting
138. Backoff retry logic

### B. AI Features
139. Claude API integration
140. Vision/image analysis support
141. File context injection
142. Prompt caching (for repeated queries)
143. Temperature tuning per request
144. Max tokens parameter override
145. System prompt injection
146. Tool use (function calling)

### C. AI Safety
147. Input validation (prompt injection detection)
148. Output filtering (PII redaction optional)
149. Usage audit trail
150. Rate limit enforcement
151. Model availability fallback

---

## VII. SAFETY & SECURITY

### A. Safety Rules Engine
152. Configurable command whitelist
153. Dangerous command blocklist (rm -rf, etc.)
154. Command pattern matching
155. File path protection (system directories)
156. Destructive operation warnings
157. Confirmation dialogs for risky operations
158. Audit trail logging (all operations)
159. Admin dashboard for rule management
160. Rule versioning (rollback capability)
161. Per-user rule overrides

### B. Session Safety
162. Max execution time per command
163. Memory limit enforcement
164. CPU throttling (optional)
165. Disk I/O limiting
166. Network isolation (if enabled)
167. Environment variable sandboxing

### C. Audit & Compliance
168. Operation audit trail (JSON logs)
169. User action tracking
170. Model usage tracking
171. Cost attribution per user
172. Session history export
173. GDPR data deletion
174. Compliance report generation

---

## VIII. GAMIFICATION

### A. Hunter Profile
175. Hunter name customization
176. Profile avatar (generated or uploaded)
177. Rank system (Beginner → Master)
178. Experience points (XP) tracking
179. Level progression (1-100)
180. Prestige system (reset + bonus multiplier)

### B. Hunter Stats
181. Total sessions count
182. Total tokens consumed
183. Total cost (USD)
184. Streak counter (consecutive days)
185. Active days (lifetime)
186. Peak activity hour
187. Stat radar (STR/INT/AGI/VIT/PER/SEN attributes)
188. Session timeline (scrollable, virtualized)
189. Activity heatmap (365-day grid)
190. Model breakdown (pie/bar chart)
191. Lifetime stats cards

### C. Achievements
192. Achievement system (50+ unlockable)
193. Achievement categories (Mastery, Combat, Exploration)
194. Locked/unlocked states
195. Achievement unlock animations (Solo Leveling glow)
196. Achievement progress tracking
197. Achievement leaderboard (optional)

### D. Daily Quests
198. Quest board UI
199. Daily quest generation
200. Quest categories (Exploration, Tool Mastery, Speed)
201. Quest progress tracking
202. Quest rewards (XP, coins)
203. Completed quest history
204. Quest retry mechanism

### E. Journal & Logging
205. Day journal entry creation
206. Morning brief generation (AI-powered)
207. End-of-day summary generation
208. Journal search
209. Journal export (Markdown)
210. Calendar view of journal entries

### F. CodeBurn Cockpit
211. Dashboard overview (daily, weekly, monthly stats)
212. Daily cost breakdown
213. Project-specific cost tracking
214. Model breakdown (Haiku vs Sonnet vs Opus spend)
215. Tool usage breakdown
216. Time-series cost chart
217. Cost per model comparison

---

## IX. CHAT & COLLABORATION

### A. Chat Interface
218. Chat sidebar with session history
219. Message threading
220. User message styling (distinct from AI)
221. AI response streaming
222. Code block detection in chat
223. Rich markdown rendering in chat
224. Copy message button
225. Edit message capability (re-run)

### B. Chat Features
226. Chat history persistence
227. Search chat history
228. Export chat as Markdown
229. Multi-turn conversation support
230. Clear history option
231. Message reactions (emoji)
232. @mention support (for file references)

### C. Collaboration (Future)
233. Share session link
234. Collaborative editing (optional)
235. User presence indicators

---

## X. MCP (MODEL CONTEXT PROTOCOL)

### A. MCP Server Support
236. MCP server discovery
237. MCP server registry
238. MCP server connection
239. MCP tool integration
240. MCP resource exposure
241. MCP server lifecycle (start/stop)
242. MCP server error handling

### B. Built-in MCP Servers
243. Filesystem MCP (file read/write/search)
244. Git MCP (git operations)
245. Database MCP (SQLite queries)
246. Process MCP (shell execution)
247. Web MCP (HTTP requests)

---

## XI. PLUGINS & EXTENSIONS

### A. Plugin System
248. go-plugin architecture
249. Plugin discovery (filesystem + registry)
250. Plugin loading and lifecycle
251. Plugin versioning
252. Plugin compatibility checking
253. Plugin sandboxing
254. Plugin hot-reload (optional)
255. Plugin API documentation

### B. Plugin Types
256. Command plugins (custom CLI extensions)
257. Middleware plugins (request/response hooks)
258. View plugins (custom UI components)
259. AI agent plugins (custom reasoning strategies)

---

## XII. COCKPIT & OBSERVABILITY

### A. System Cockpit
260. CPU usage real-time graph
261. Memory usage real-time graph
262. Disk I/O graph
263. Network I/O graph
264. Process list with resource breakdown
265. GPU usage (if available)

### B. Claude Metrics
266. Token usage per session
267. Cost per session
268. Model usage distribution
269. Request latency p50/p95/p99
270. Error rate tracking
271. Uptime monitoring

### C. Alerts & Notifications
272. High cost alert (daily threshold)
273. Rate limit warning
274. Session crash notification
275. Long-running session warning
276. Low disk space alert

---

## XIII. RECIPES & TEMPLATES

### A. Recipe System
277. Recipe discovery (builtin + community)
278. Recipe execution with parameter prompts
279. Recipe versioning
280. Recipe testing environment
281. Recipe publish to registry

### B. Built-in Recipes
282. Debug timeout issue recipe
283. Optimize database query recipe
284. Generate test suite recipe
285. Refactor function recipe
286. Write documentation recipe
287. Performance profiling recipe
288. Security audit recipe

---

## XIV. ONBOARDING

### A. First-Run Experience
289. Welcome screen
290. Shell setup wizard
291. Project detection walkthrough
292. Claude API key entry
293. Preferences configuration
294. Keyboard shortcuts tutorial
295. Feature tour (interactive)

### B. Help & Docs
296. In-app documentation
297. Searchable help system
298. Keyboard shortcuts reference (Cmd+?)
299. Feature tips (contextual)
300. FAQ section

---

## XV. SETTINGS & CONFIGURATION

### A. Editor Settings
301. Font family selector
302. Font size adjustment
303. Theme picker (dark/light, custom)
304. Tab size setting
305. Line wrap toggle
306. Minimap toggle
307. Bracket guide visibility

### B. Terminal Settings
308. Terminal font family
309. Terminal font size
310. Shell preference (bash/zsh/fish)
311. Shell startup command
312. Working directory default

### C. AI Settings
313. Default model selection
314. Temperature tuning
315. Max tokens limit
316. Cost budget (daily/monthly)
317. Rate limit configuration
318. Prompt cache toggle

### D. Safety Settings
319. Safety rules level (strict/standard/relaxed)
320. Dangerous command blocklist override
321. Confirmation dialog settings
322. Audit logging level

### E. Gamification Settings
323. Gamification toggle (on/off)
324. XP multiplier setting
325. Streak reset policy
326. Public profile toggle

---

## XVI. KEYBOARD SHORTCUTS

### A. Editor Shortcuts
327. Cmd+S - Save file
328. Cmd+Z - Undo
329. Cmd+Shift+Z - Redo
330. Cmd+F - Find
331. Cmd+H - Find & Replace
332. Cmd+G - Go to Line
333. Cmd+D - Go to Definition
334. Cmd+/ - Comment Line
335. Cmd+Shift+F - Format Code
336. Cmd+P - Quick File Open
337. Cmd+Shift+P - Command Palette

### B. Terminal Shortcuts
338. Cmd+T - New Terminal Tab
339. Cmd+W - Close Terminal Tab
340. Cmd+` - Focus Terminal
341. Cmd+Shift+` - New Terminal Window

### C. Navigation Shortcuts
342. Cmd+1 - Focus Editor
343. Cmd+2 - Focus Terminal
344. Cmd+3 - Focus Chat
345. Cmd+Backslash - Toggle Sidebar
346. Cmd+J - Toggle Debug Panel

### D. Session Shortcuts
347. Cmd+S - Save Session
348. Cmd+E - Export Session
349. Cmd+Q - Pause Session
350. Cmd+R - Resume Session

---

## XVII. PREFERENCES & STATE PERSISTENCE

### A. User Preferences
351. Theme preference (persisted)
352. Font preferences (persisted)
353. Terminal preferences (persisted)
354. Sidebar width
355. Editor/Terminal split ratio
356. Recent projects list
357. Recent files list
358. Pinned sessions

### B. Session State
359. Active tab index
360. Scroll position in terminal
361. Scroll position in editor
362. Cursor position in editor
363. Folded code blocks
364. Dirty file state

### C. Database Persistence
365. All gamification data (Hunter profile, stats, achievements, quests)
366. Session metadata
367. Git worktree state
368. Audit trail
369. User preferences

---

## XVIII. DEPLOYMENT & DISTRIBUTION

### A. Build & Packaging
370. Electron-alternative bundling (Wails)
371. Code signing (Apple Developer certificate)
372. DMG creation (macOS installer)
373. Windows MSI installer
374. Linux AppImage/Snap
375. Auto-updater implementation
376. Staged rollout capability
377. Version pinning for dependencies

### B. Release Management
378. Semantic versioning
379. Changelog generation
380. Release notes creation
381. Beta channel support
382. Canary releases

---

## XIX. DATABASE SCHEMA & PERSISTENCE

### A. Core Tables
383. users (id, email, name, created_at)
384. sessions (id, user_id, shell, cwd, status, created_at, updated_at)
385. terminals (session_id, pty_id, output_buffer, status)
386. projects (id, user_id, path, git_root, detected_at)
387. worktrees (id, project_id, name, branch, path, created_at)

### B. Git Tables
388. git_operations (id, project_id, operation, status, started_at, completed_at)
389. git_history (id, project_id, commit_hash, author, message, timestamp)
390. git_blame (file_path, line_no, commit_hash, author, timestamp)

### C. AI Tables
391. ai_requests (id, session_id, model, input_tokens, output_tokens, cost, created_at)
392. ai_cache (prompt_hash, response, model, created_at, expires_at)
393. ai_errors (id, model, error_msg, created_at)

### D. Gamification Tables
394. hunter_profile (user_id, name, rank, xp, level, prestige, created_at, updated_at)
395. hunter_stats (user_id, sessions, tokens, cost, streak, active_days, peak_hour, created_at)
396. achievements (id, user_id, name, category, unlocked_at, progress)
397. daily_quests (id, user_id, quest_type, progress, completed_at)
398. journal_entries (id, user_id, date, content, brief, eod_summary, created_at)

### E. Safety Tables
399. safety_rules (id, rule_pattern, action, severity, created_at, created_by)
400. audit_trail (id, user_id, action, details, timestamp, ip_address)
401. cost_limits (user_id, daily_limit, monthly_limit, current_usage, reset_at)

---

## XX. PERFORMANCE & OPTIMIZATION

### A. Frontend Performance
402. Lazy-load editor (Monaco) - avoid initial bundle bloat
403. Code splitting per route (Vite)
404. Solid.js signals - fine-grained reactivity
405. Virtual scrolling for long lists (@tanstack/solid-virtual)
406. Web worker usage (Monaco workers)
407. Memory cleanup on component destroy
408. Efficient DOM updates (Solid reconciliation)

### B. Backend Performance
409. SQLite connection pooling
410. Git operation worker pool (5-10 workers)
411. Async I/O throughout (Go concurrency)
412. Query result caching
413. Batch operations for bulk updates
414. Index optimization on frequently-queried columns

### C. Network Performance
415. SSE (Server-Sent Events) or WebSocket for streaming
416. HTTP/2 support
417. Gzip compression
418. CDN support (future)

---

## XXI. TESTING

### A. Unit Tests
419. Editor component tests
420. Terminal manager tests
421. Git operation tests
422. AI pipeline tests
423. Safety rules engine tests
424. Gamification logic tests

### B. Integration Tests
425. Session collector integration
426. Database query tests
427. API endpoint tests
428. MCP server integration tests

### C. E2E Tests
429. User onboarding flow
430. Terminal creation and interaction
431. Git operation flow
432. Editor usage flow
433. Chat interaction flow

---

## XXII. DOCUMENTATION

### A. User Documentation
434. Getting Started guide
435. Feature overview pages
436. Keyboard shortcuts reference
437. FAQ section
438. Troubleshooting guide
439. Video tutorials (optional)

### B. Developer Documentation
440. Architecture overview
441. API reference (Wails bindings)
442. Plugin development guide
443. MCP server integration guide
444. Database schema documentation
445. Contribution guidelines

---

## XXIII. NATIVE INTEGRATIONS

### A. System Integration
446. macOS Spotlight search integration
447. macOS context menu (Open with PhantomOS)
448. Finder drag-drop support
449. Desktop notification support
450. Native file dialogs
451. System tray icon with quick actions

### B. Code Editor Integration
452. VS Code theme import
453. VS Code extension compatibility (future)
454. JetBrains IDE integration (future)

---

## XXIV. ADVANCED FEATURES

### A. Code Analysis
455. AST parsing (tree-sitter backend)
456. Complexity analysis
457. Dependency graph visualization
458. Unused code detection
459. Code smell detection

### B. Refactoring Support
460. Rename variable (across files)
461. Extract function
462. Inline function
463. Move method
464. Change signature

### C. Debugging
465. Breakpoint management
466. Step through code
467. Variable inspection
468. Call stack visualization
469. Debug console

---

## XXV. MONACO EDITOR-SPECIFIC OPTIMIZATIONS

### A. Performance Optimizations
470. Lazy-loading Monaco - Separate chunk (2.5MB), loaded on-demand
471. Web Workers - Offload syntax highlighting, language features to background threads:
    - editor.worker - Core editor operations
    - json.worker - JSON schema validation
    - ts.worker - TypeScript/JavaScript intellisense
    - css.worker - CSS validation
    - html.worker - HTML validation
472. Minimap disabled by default - Reduces memory footprint
473. Automatic layout - Responds to container resize without polling
474. JetBrains Mono font - Monospace rendering optimized for code

### B. Advanced Features (Missing in v1)
475. Bracket matching - Auto-highlight matching brackets/parens
476. Bracket auto-pairing - Auto-close brackets/quotes
477. Find & Replace - Cmd+H with regex support
478. Go-to-Definition - Cmd+D navigation
479. Go-to-Line - Cmd+G quick navigation
480. Code folding - Hide code blocks by region
481. Breadcrumb navigation - File hierarchy display
482. Language Server Protocol (LSP) - Go LSP bridge for intellisense

### C. Additional Optimizations (Not Yet Mentioned)
483. Tree-sitter integration - Faster, more accurate syntax parsing
484. Language-specific features - Different rules per language
485. Custom theme system - Shadow-Monarch (Solo Leveling palette)
486. Read-only mode - Toggle for preview/diff display
487. Syntax highlighting caching - Avoid re-parsing unchanged sections

---

## XXVI. GAPS & MISSING FEATURES FROM V1 -> V2

### Features in v1 NOT explicitly mentioned in v2 specs:
488. Real-time code collaboration (might be deferred)
489. Historical performance metrics (v1 had this in cockpit)
490. Custom color themes (v1 had theme manager)
491. Context-awareness shortcuts (v1 had auto-suggest based on file)
492. Advanced debugging (breakpoints, step-through - might be Phase 9+)
493. Refactoring tools (advanced rename, extract, move) - mentioned but not deeply spec'd
494. Workspace sync (v1 had cross-device sync) - appears deferred
495. Multi-session chat history (v1 had unified search) - possibly in v2 but not emphasized
496. Voice commands (v1 experimented) - not mentioned in v2
497. Extension marketplace (v1 had plugin registry) - mentioned but minimal detail

---

## XXVII. ARCHITECTURE DECISION RECORDS (ADRs)

### A. Key Technology Choices
498. Solid.js instead of React - Fine-grained reactivity, smaller bundle
499. Wails instead of Electron - Smaller binary, native performance
500. Go instead of Node.js backend - Type safety, performance, concurrency
501. SQLite instead of PostgreSQL - Embedded, zero setup, offline-first
502. Monaco instead of CodeMirror - VS Code compatibility, broader language support

---

**TOTAL: 502 Features & Capabilities**

---

## NOTES

- **Monaco Optimizations Summary:**
  - CHECKMARK Lazy loading (separate ~2.5MB chunk)
  - CHECKMARK Web workers (editor, json, ts, css, html)
  - X Tree-sitter integration (not mentioned, should add)
  - CHECKMARK Language Server Protocol (Go LSP bridge)
  - CHECKMARK Minimap (disabled by default)
  - CHECKMARK Bracket matching & auto-pairing
  - CHECKMARK Find & Replace with regex
  - X Performance profiling tools (not mentioned)
  - CHECKMARK Custom theme system (Shadow-Monarch)

- **Features in v1 NOT covered:** Real-time collaboration, historical metrics, voice commands, workspace sync, extension marketplace (minimal detail)

- **Cross-cutting Concerns:**
  - All features backed by SQLite persistence
  - All operations subject to safety rules engine
  - All AI usage tracked and audited
  - All gamification integrated across modules

---

## FILE LOCATIONS

Master spec: `/Users/subash.karki/phantom-os/docs/superpowers/specs/2026-04-18-phantomos-v2-design.md`

Phase plans: `/Users/subash.karki/phantom-os/docs/superpowers/specs/plan-phase-*.md` (0-10)

V1 codebase: 
- Routes: `/Users/subash.karki/phantom-os/packages/server/src/routes/`
- Components: `/Users/subash.karki/phantom-os/apps/desktop/src/renderer/components/`
