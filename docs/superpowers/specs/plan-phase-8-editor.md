# Phase 8: Rich Editor Integration (Monaco + Full Git Integration)

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Parent Spec:** `2026-04-18-phantomos-v2-design.md`

---

## Goal

Embed a full-featured Monaco editor inside PhantomOS v2 with deep integration into the Claude session pipeline and Go backend. When Claude reads a file, the user clicks to open it in-app. When Claude edits a file, the user sees a real diff with Accept/Reject controls. When Claude creates a file, the user previews it before it touches disk. Git blame, cross-worktree file search, Finder drag-drop, and Go language intelligence complete the picture -- PhantomOS becomes a self-contained development environment, not just a session viewer.

---

## Prerequisites

| Dependency | Phase | Required Feature |
|---|---|---|
| Wails v2 shell + Solid.js frontend | Phase 0 | Desktop window, Vite build, Wails bindings |
| SQLite + sqlc data layer | Phase 1 | Persistence for editor state (open tabs, cursor positions) |
| Terminal manager | Phase 1 | PTY sessions that emit stream-json events |
| Stream parser + WebSocket hub | Phase 3 | Parsed Claude events (file_read, file_edit, file_create) forwarded to editor |
| Git pool (goroutine-based) | Phase 2 | `git blame`, `git log`, `git diff` operations |
| Smart View component architecture | Phase 3 | Clickable file links, diff viewer cards, Accept/Reject flow |
| Sidebar file explorer (FileExplorer.tsx) | Phase 1 | File tree navigation that opens files in editor tabs |
| Vanilla Extract theme system | Phase 0 | Solo Leveling design tokens for editor chrome |

---

## Tasks

### 8.1 — Monaco Editor Core Wrapper (Framework-Agnostic)

**Goal:** Wrap Monaco in a Solid.js-compatible component that avoids framework coupling.

1. **Create `frontend/src/components/editor/MonacoLoader.ts`**
   - Lazy-load Monaco via dynamic `import('monaco-editor')` to avoid bloating the initial bundle (~2.5MB).
   - Configure Monaco web workers via Vite's `?worker` import syntax (`editor.worker`, `json.worker`, `ts.worker`, `css.worker`).
   - Export a `createMonacoEditor(container: HTMLElement, options: EditorOptions): MonacoInstance` factory function. No Solid.js signals inside this file -- pure DOM.
   - Set default options: `minimap: { enabled: false }`, `scrollBeyondLastLine: false`, `automaticLayout: true`, `fontFamily: 'JetBrains Mono'`, `fontSize: 14`.

2. **Create `frontend/src/components/editor/Editor.tsx`**
   - Solid.js wrapper component using `onMount` to call `createMonacoEditor` on a ref'd `<div>`.
   - Accept props: `filePath: string`, `content: string`, `language: string`, `readOnly?: boolean`, `theme?: string`.
   - Use `createEffect` to update editor content when `content` signal changes (for external updates like git checkout).
   - On `onCleanup`, dispose the Monaco instance to prevent memory leaks.
   - Emit `onChange(content: string)` callback for dirty-state tracking.

3. **Create `frontend/src/components/editor/EditorTheme.ts`**
   - Define `shadow-monarch` Monaco theme matching Solo Leveling palette:
     - Background: `#0a0a1a` (deep void).
     - Foreground: `#e0e0f0`.
     - Keywords: `#b794f6` (purple glow).
     - Strings: `#68d391` (phantom green).
     - Comments: `#4a5568` (muted gray).
     - Selection: `rgba(183, 148, 246, 0.2)`.
     - Line highlight: `rgba(183, 148, 246, 0.05)`.
   - Register theme via `monaco.editor.defineTheme('shadow-monarch', themeData)`.
   - Sync with app-wide theme signal from `signals/ui.ts` -- if user switches themes, editor follows.

4. **Create `frontend/src/components/editor/languages.ts`**
   - Map file extensions to Monaco language IDs (`.ts` -> `typescript`, `.go` -> `go`, `.py` -> `python`, `.rs` -> `rust`, `.yaml` -> `yaml`, etc.).
   - Fallback: `plaintext` for unknown extensions.

### 8.2 — Multi-Tab Editor with File Tree Integration

**Goal:** Tabbed editor pane that integrates with the sidebar file explorer and session-driven file opens.

5. **Create `frontend/src/signals/editor.ts`**
   - Define editor store:
     ```typescript
     interface EditorTab {
       id: string;              // unique tab ID
       filePath: string;
       worktreeId: string;
       content: string;
       originalContent: string; // for dirty detection
       language: string;
       isDirty: boolean;
       cursorPosition: { line: number; column: number };
       scrollPosition: number;
     }

     const [editorStore, setEditorStore] = createStore({
       tabs: [] as EditorTab[],
       activeTabId: string | null,
       recentFiles: [] as string[],  // MRU list for Cmd+P
     });
     ```
   - Export actions: `openFile(path, worktreeId)`, `closeTab(id)`, `setActiveTab(id)`, `markDirty(id)`, `markClean(id)`.
   - Persist open tabs + cursor positions to SQLite via Wails binding `SaveEditorState()` on tab change (debounced 2s).
   - Restore tabs on app launch via `LoadEditorState()` binding.

6. **Create `frontend/src/components/editor/EditorTabBar.tsx`**
   - Horizontal tab strip using Kobalte `Tabs` primitive.
   - Each tab shows: filename (not full path), dirty indicator (dot), close button.
   - Tooltip on hover: full file path.
   - Middle-click to close tab.
   - Drag tabs to reorder (use `@solid-primitives/sortable` or manual drag events).
   - Tab overflow: scroll with arrow buttons when tabs exceed container width.
   - Context menu (right-click): Close, Close Others, Close All, Close to the Right, Copy Path.

7. **Create `frontend/src/components/editor/EditorPane.tsx`**
   - Container component that renders `EditorTabBar` + active `Editor` instance.
   - Integrates with `PaneSystem.tsx` as a pane type (`type: 'editor'`).
   - Keyboard shortcuts:
     - `Cmd+W`: Close active tab.
     - `Cmd+Shift+T`: Reopen last closed tab.
     - `Cmd+Tab` / `Ctrl+Tab`: Cycle tabs.
     - `Cmd+P`: Quick file open (delegates to CommandPalette).
   - When no tabs are open, show a welcome/empty state with keyboard shortcut hints.

8. **Integrate with `FileExplorer.tsx`**
   - On file click in sidebar file tree, call `openFile(path, worktreeId)` from editor signals.
   - If tab for that file already exists, switch to it (do not duplicate).
   - Double-click opens in editor. Single-click shows preview (read-only, replaces previous preview tab -- VS Code "preview mode" behavior).

### 8.3 — Go Backend: File Operations Bindings

**Goal:** Provide Wails bindings for file read/write/search with goroutine-powered parallelism.

9. **Create `internal/editor/service.go`**
   - `ReadFile(worktreeId string, path string) (FileContent, error)` -- reads file, detects encoding (UTF-8/Latin-1), returns content + detected language + line count.
   - `WriteFile(worktreeId string, path string, content string) error` -- writes file with atomic write (write to `.tmp`, then `os.Rename`). Validates path is within worktree root (path traversal prevention).
   - `FileExists(worktreeId string, path string) bool`.
   - `GetFileMetadata(worktreeId string, path string) (FileMetadata, error)` -- size, modification time, permissions, git status (modified/staged/untracked).

10. **Create `internal/editor/search.go`**
    - `SearchFiles(query SearchQuery) ([]SearchResult, error)` -- full-text search across one or all worktrees.
    - `SearchQuery` struct: `Pattern string`, `WorktreeIDs []string` (empty = all), `FileGlob string`, `CaseSensitive bool`, `IsRegex bool`, `MaxResults int`.
    - `SearchResult` struct: `FilePath string`, `WorktreeID string`, `Line int`, `Column int`, `LineContent string`, `MatchLength int`.
    - Implementation: Use `sourcegraph/conc` pool to fan out search across worktrees. Each goroutine walks the worktree file tree (respecting `.gitignore` via `go-git` or shelling out to `git ls-files`), then uses `bytes.Index` or `regexp.FindAllIndex` for matching.
    - Stream results back via channel to avoid holding all results in memory. Wails binding returns first `MaxResults` hits.
    - Cancel in-flight search when user types new query (context cancellation).

11. **Create `internal/editor/state.go`**
    - `SaveEditorState(state EditorState) error` -- persists open tabs, cursor positions, scroll positions to `editor_state` SQLite table.
    - `LoadEditorState() (EditorState, error)` -- restores on launch.
    - SQLite table schema:
      ```sql
      CREATE TABLE editor_state (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        worktree_id TEXT NOT NULL,
        cursor_line INTEGER DEFAULT 1,
        cursor_column INTEGER DEFAULT 1,
        scroll_position INTEGER DEFAULT 0,
        is_pinned BOOLEAN DEFAULT FALSE,
        tab_order INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      ```

12. **Register bindings in `internal/app/bindings_editor.go`**
    - Expose all editor service methods as Wails bindings.
    - Methods: `ReadFile`, `WriteFile`, `SearchFiles`, `SaveEditorState`, `LoadEditorState`, `GetFileMetadata`, `GetBlameData`, `SearchFilenames`.

### 8.4 — Claude Session Integration: Clickable File Links

**Goal:** When Claude reads a file in Smart View, the file path is a clickable link that opens it in the editor.

13. **Update `frontend/src/components/smart-view/ToolCallCard.tsx`**
    - For `tool_call` events where `tool === 'Read'` or `tool === 'View'`:
      - Extract `file_path` from tool call arguments.
      - Render path as a clickable `<button>` styled as a link (not an `<a>` tag -- no navigation).
      - On click, call `openFile(filePath, sessionWorktreeId)` from editor signals.
      - Visual: file icon + path, underline on hover, `cursor: pointer`.
    - For `tool_call` events where `tool === 'Glob'` or `tool === 'Grep'`:
      - Parse result output for file paths.
      - Render each matched file path as clickable.

14. **Update `frontend/src/components/smart-view/SessionStream.tsx`**
    - Add a regex pass on assistant text content to detect file paths (patterns like `/path/to/file.ext`, `src/...`, `./...`).
    - Wrap detected paths in clickable spans that open in editor.
    - Use a heuristic: only linkify if the path exists in the current worktree (validate via `FileExists` Wails binding, debounced/cached).

### 8.5 — Claude Edit Integration: Real Diff Viewer with Accept/Reject

**Goal:** When Claude edits a file, show a side-by-side diff with syntax highlighting and Accept/Reject/Auto-accept controls.

15. **Create `frontend/src/components/editor/DiffEditor.tsx`**
    - Wrapper around Monaco's `createDiffEditor` API.
    - Props: `originalContent: string`, `modifiedContent: string`, `language: string`, `filePath: string`.
    - Display mode: side-by-side (default) or inline (toggle button).
    - Apply `shadow-monarch` theme.
    - Read-only -- user cannot edit in the diff view.

16. **Update `frontend/src/components/smart-view/DiffViewer.tsx`**
    - Replace the current text-based diff display with the Monaco `DiffEditor` component.
    - For `tool_call` events where `tool === 'Edit'`:
      - Extract `file_path`, `old_string`, `new_string` from tool call arguments.
      - Fetch full file content before and after edit from Go backend.
      - Render `DiffEditor` with original (before) and modified (after) content.
    - For `tool_call` events where `tool === 'Write'`:
      - If file existed: show diff between old content and new content.
      - If file is new: show the full new content with a "New File" badge (no original side).

17. **Create `frontend/src/components/editor/DiffActions.tsx`**
    - Action bar below each diff:
      - **Accept** (green button): Apply the change. Calls `WriteFile` Wails binding with the modified content. Updates editor tab if file is open. Emits `diff:accepted` Wails event.
      - **Reject** (red button): Discard the change. Calls `WriteFile` with the original content (revert). Emits `diff:rejected` Wails event.
      - **Auto-accept** (toggle): When enabled, all subsequent edits from this session are auto-accepted. Stored in session policy via `session/policy.go`.
    - Keyboard shortcuts: `Cmd+Enter` to accept, `Cmd+Backspace` to reject.
    - Visual state: After accept/reject, the diff collapses to a single-line summary ("Accepted edit to `src/foo.ts`" or "Rejected edit to `src/foo.ts`").

18. **Create `internal/editor/diff.go`**
    - `GetFileDiff(worktreeId string, path string, oldContent string, newContent string) (DiffResult, error)`.
    - `DiffResult`: `Hunks []DiffHunk`, `Stats DiffStats` (lines added, removed, changed).
    - Uses `sergi/go-diff` for unified diff generation.
    - `GetFileBeforeEdit(worktreeId string, path string) (string, error)` -- reads current file content before Claude's edit is applied (for diff comparison).

19. **Update stream parser `internal/stream/parser.go`**
    - When parsing an `Edit` tool call, capture the file content BEFORE the edit is applied (read from disk at that moment).
    - Store `before_content` in the `session_events` table alongside the event.
    - This enables diff reconstruction even after the session ends.

### 8.6 — Claude Create File: Preview Before Disk Write

**Goal:** When Claude creates a new file, show it inline for preview before it hits disk.

20. **Create `frontend/src/components/editor/FilePreview.tsx`**
    - Renders Monaco editor in read-only mode with the proposed file content.
    - Header bar: file path (with directory), language badge, line count.
    - Action buttons: **Create** (writes to disk), **Edit First** (opens in editable editor tab), **Discard**.
    - If the session policy is `auto-accept`, file is created immediately and a notification toast confirms it.

21. **Update `internal/stream/parser.go`**
    - For `Write` tool calls where the file does not exist, emit a `file_create_preview` event type (distinct from `file_edit`).
    - Include proposed content, target path, and detected language.

22. **Update `frontend/src/components/smart-view/SessionStream.tsx`**
    - Register `file_create_preview` event renderer that mounts `FilePreview` component inline in the session stream.

### 8.7 — Git Blame Integration (Go Backend)

**Goal:** Inline git blame on hover in the editor, powered by Go goroutines.

23. **Create `internal/editor/blame.go`**
    - `GetBlameData(worktreeId string, path string) ([]BlameLine, error)`.
    - `BlameLine` struct: `Line int`, `AuthorName string`, `AuthorEmail string`, `CommitHash string`, `CommitMessage string`, `Timestamp time.Time`.
    - Implementation: Shell out to `git blame --porcelain <path>` via the git pool (respects concurrency limits). Parse porcelain output.
    - Cache blame data per file+commit hash in memory (LRU cache, max 100 entries). Invalidate on file save or git status change.

24. **Create `frontend/src/components/editor/BlameGutter.tsx`**
    - Monaco decoration provider that adds blame annotations in the editor gutter.
    - On hover over a line number, show a tooltip with:
      - Author name + avatar (gravatar from email hash).
      - Commit hash (short, clickable -- opens commit in CommitHistory).
      - Commit message (first line).
      - Relative timestamp ("3 days ago").
    - Gutter text: author name + relative time, dimmed style (`opacity: 0.4`), visible only on the active line or on hover.
    - Toggle blame visibility via `Cmd+Shift+B` keyboard shortcut.
    - Fetch blame data lazily -- only when blame mode is activated, not on every file open.

25. **Update `frontend/src/components/editor/Editor.tsx`**
    - Integrate `BlameGutter` as an optional overlay.
    - Pass blame data from Wails binding `GetBlameData` into the gutter component.
    - Re-fetch blame data when file is saved (content changed on disk).

### 8.8 — Cross-Worktree File Search

**Goal:** Search file names and file contents across all worktrees with parallel goroutines.

26. **Create `internal/editor/filename_search.go`**
    - `SearchFilenames(query string, worktreeIDs []string, maxResults int) ([]FileEntry, error)`.
    - `FileEntry`: `Path string`, `WorktreeID string`, `WorktreeName string`, `Language string`.
    - Uses `git ls-files` per worktree (fast, respects gitignore).
    - Fuzzy match using a simple scoring algorithm: exact prefix > substring > character sequence match.
    - Fan out across worktrees with `conc.Pool`.

27. **Create `frontend/src/components/editor/FileSearchDialog.tsx`**
    - Modal triggered by `Cmd+P` (file name search) or `Cmd+Shift+F` (content search).
    - Two modes:
      - **File search** (`Cmd+P`): Type filename, see fuzzy-matched results across worktrees. Results show: filename, relative path, worktree badge. Select to open in editor tab.
      - **Content search** (`Cmd+Shift+F`): Type text/regex, see matching lines across worktrees. Results show: filename, line number, matching line with highlight. Select to open file at that line.
    - Virtualized result list via `@tanstack/solid-virtual` (could be thousands of results).
    - Debounce input: 150ms before firing search request.
    - Cancel previous search on new keystroke (Go context cancellation).
    - Scope filter: dropdown to limit search to current worktree or all worktrees.

28. **Integrate with `CommandPalette.tsx`**
    - Register "Open File" and "Search in Files" as command palette actions.
    - `Cmd+P` opens file search directly (bypass palette).
    - `Cmd+Shift+F` opens content search directly.

### 8.9 — Finder Drag-Drop Integration (macOS)

**Goal:** Drag a file from macOS Finder into the PhantomOS window and have Claude receive it as context.

29. **Create `frontend/src/components/editor/DropZone.tsx`**
    - App-level drop zone overlay that appears when a file is dragged over the window.
    - Visual: full-window semi-transparent overlay with "Drop file to add as context" message and a phantom glow animation.
    - Listen to `dragover` and `drop` DOM events on the root app container.
    - On drop, extract file paths from `DataTransfer.files` or `DataTransfer.items`.
    - For each dropped file:
      - If it is a text file: read content via `ReadFile` Wails binding, open in editor tab, and send file path + content to the active Claude session as context (via `AddContextToSession` Wails binding).
      - If it is an image (png, jpg, gif, svg): display inline preview in the active session stream and send as context.
      - If it is a binary/unsupported type: show toast "Unsupported file type."

30. **Create `internal/editor/drop.go`**
    - `HandleFileDrop(paths []string, sessionId string) ([]DropResult, error)`.
    - For each path:
      - Detect MIME type.
      - If text: read content, return `DropResult{Type: "text", Path, Content, Language}`.
      - If image: copy to a temp directory accessible by the app, return `DropResult{Type: "image", Path, TempPath}`.
      - If binary: return `DropResult{Type: "unsupported", Path}`.
    - `AddContextToSession(sessionId string, filePath string, content string) error` -- appends context to the active Claude session. Implementation: writes to the session's context buffer, which is prepended to the next Claude prompt.

31. **Update `internal/app/bindings_editor.go`**
    - Expose `HandleFileDrop` and `AddContextToSession` as Wails bindings.

### 8.10 — Font Size Controls and Theme Sync

**Goal:** User-configurable font size with keyboard shortcuts and full theme synchronization.

32. **Add font size controls to `frontend/src/signals/editor.ts`**
    - Add to editor store: `fontSize: number` (default 14), `fontFamily: string` (default `'JetBrains Mono'`).
    - Actions: `increaseFontSize()` (max 32), `decreaseFontSize()` (min 8), `resetFontSize()`.
    - Persist to user preferences via `SaveUserPreference` Wails binding.

33. **Update `frontend/src/components/editor/Editor.tsx`**
    - Bind `fontSize` and `fontFamily` from editor store to Monaco `updateOptions()`.
    - Keyboard shortcuts: `Cmd+=` to increase, `Cmd+-` to decrease, `Cmd+0` to reset.

34. **Create `frontend/src/components/editor/EditorStatusBar.tsx`**
    - Bottom bar inside editor pane showing:
      - Language mode (clickable to change).
      - Line/column indicator.
      - Encoding (UTF-8).
      - Indentation (spaces/tabs + size).
      - Font size selector.
      - Git branch for the active worktree.
      - Blame toggle button.

35. **Theme sync**
    - In `EditorTheme.ts`, listen to the app theme signal.
    - When the app theme changes (e.g., between `shadow-monarch` and a potential light mode), update Monaco theme via `monaco.editor.setTheme()`.
    - All editor chrome (tab bar, status bar, diff actions) uses Vanilla Extract tokens that inherit from the active theme.

### 8.11 — Go Language Server Integration

**Goal:** Code intelligence (hover info, go-to-definition, diagnostics) for Go files via `gopls`.

36. **Create `internal/editor/lsp.go`**
    - Manage `gopls` lifecycle: start on first `.go` file open, stop on app shutdown or last Go tab closed.
    - Spawn `gopls` as a child process with stdin/stdout LSP communication.
    - Multiplex LSP requests from multiple open Go files through a single `gopls` instance.
    - Use `context.Context` for lifecycle -- cancel on shutdown.
    - Configuration: detect `GOPATH` and `GOROOT` from the user's environment.

37. **Create `internal/editor/lsp_bridge.go`**
    - Bridge between Wails bindings and LSP:
      - `LspHover(worktreeId, path string, line, column int) (HoverResult, error)` -- sends `textDocument/hover` request to `gopls`.
      - `LspDefinition(worktreeId, path string, line, column int) (Location, error)` -- sends `textDocument/definition`.
      - `LspDiagnostics(worktreeId, path string) ([]Diagnostic, error)` -- fetches diagnostics.
      - `LspCompletion(worktreeId, path string, line, column int) ([]CompletionItem, error)` -- autocompletion.
    - `textDocument/didOpen` and `textDocument/didChange` notifications sent automatically when editor tabs are opened/modified.

38. **Create `frontend/src/components/editor/LspProvider.ts`**
    - Register Monaco language features for Go:
      - `monaco.languages.registerHoverProvider('go', ...)` -- calls `LspHover` binding.
      - `monaco.languages.registerDefinitionProvider('go', ...)` -- calls `LspDefinition` binding.
      - `monaco.languages.registerCompletionItemProvider('go', ...)` -- calls `LspCompletion` binding.
    - Map LSP diagnostics to Monaco markers via `monaco.editor.setModelMarkers`.
    - Notify Go backend of file open/change for LSP sync.

39. **Update `frontend/src/components/editor/Editor.tsx`**
    - On mount, if language is `go`, activate `LspProvider`.
    - Show hover info on `Cmd+hover`.
    - `F12` / `Cmd+click` for go-to-definition (opens target file in new tab).
    - Squiggly underlines for diagnostics (errors: red, warnings: yellow).

### 8.12 — SQLite Schema Migration

40. **Create migration file `internal/db/migrations/NNNN_add_editor_tables.up.sql`**
    ```sql
    CREATE TABLE IF NOT EXISTS editor_state (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      cursor_line INTEGER DEFAULT 1,
      cursor_column INTEGER DEFAULT 1,
      scroll_position INTEGER DEFAULT 0,
      is_pinned BOOLEAN DEFAULT FALSE,
      tab_order INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_editor_state_worktree ON editor_state(worktree_id);

    CREATE TABLE IF NOT EXISTS editor_recent_files (
      file_path TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      last_opened_at TEXT DEFAULT (datetime('now')),
      open_count INTEGER DEFAULT 1,
      PRIMARY KEY (file_path, worktree_id)
    );

    ALTER TABLE session_events ADD COLUMN before_content TEXT;
    ```

41. **Create sqlc queries `internal/db/queries/editor.sql`**
    - `SaveEditorTab`, `LoadEditorTabs`, `DeleteEditorTab`, `UpdateEditorTabOrder`.
    - `RecordRecentFile`, `GetRecentFiles` (ordered by `last_opened_at DESC`, limit 50).
    - `GetEventBeforeContent` (for diff reconstruction from session history).

### 8.13 — Vite Build Configuration for Monaco

42. **Update `frontend/vite.config.ts`**
    - Add `vite-plugin-monaco-editor` or configure manual worker setup:
      ```typescript
      import monacoEditorPlugin from 'vite-plugin-monaco-editor';

      export default defineConfig({
        plugins: [
          solidPlugin(),
          monacoEditorPlugin({
            languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css'],
          }),
        ],
        optimizeDeps: {
          include: ['monaco-editor'],
        },
      });
      ```
    - Ensure Monaco workers are correctly bundled for Wails WebKit runtime.
    - Test that Monaco loads without CORS issues in the Wails WebView (file:// protocol or localhost).

43. **Update `frontend/package.json`**
    - Add dependencies:
      - `monaco-editor` (latest)
      - `vite-plugin-monaco-editor` (latest)
      - `@solid-primitives/sortable` (for tab drag reorder)
    - Verify total bundle size increase. Target: Monaco adds no more than 3MB to the frontend assets (with tree-shaking and language subsetting).

---

## Acceptance Criteria

### Functional

- [ ] Monaco editor renders in a Solid.js pane with Solo Leveling theme applied.
- [ ] Multi-tab support: open, close, reorder, middle-click close, context menu actions.
- [ ] Clicking a file path in Smart View (Claude Read/Glob/Grep events) opens the file in an editor tab.
- [ ] Claude Edit tool calls display a side-by-side syntax-highlighted diff with Accept/Reject buttons.
- [ ] Accepting a diff writes the modified content to disk atomically.
- [ ] Rejecting a diff reverts the file to its original content.
- [ ] Auto-accept mode: toggling auto-accept on a session applies all subsequent edits without manual approval.
- [ ] Claude Write (new file) shows an inline preview before creating the file on disk.
- [ ] Git blame data appears on hover in the editor gutter with author, commit hash, message, and timestamp.
- [ ] Blame toggle via `Cmd+Shift+B`.
- [ ] File name search (`Cmd+P`) returns fuzzy-matched results across all worktrees in under 200ms for a typical codebase.
- [ ] Content search (`Cmd+Shift+F`) returns results from parallel goroutine search across worktrees.
- [ ] Dragging a file from macOS Finder into the PhantomOS window opens it in the editor and offers to add it as Claude context.
- [ ] Font size adjustable via `Cmd+=`/`Cmd+-`/`Cmd+0` with persistence across sessions.
- [ ] Go files get hover info, go-to-definition, and diagnostics from `gopls`.
- [ ] Editor tab state (open tabs, cursors, scroll positions) persists across app restarts.

### Performance

- [ ] Monaco lazy-loads: initial app startup is not impacted when no editor tab is open.
- [ ] File open latency: < 100ms for files under 1MB.
- [ ] File search (filename): < 200ms for 5 worktrees with ~50k files total.
- [ ] Content search: < 2s for full-text regex across 5 worktrees.
- [ ] Blame fetch: < 500ms per file (cached on subsequent requests).
- [ ] Diff rendering: < 200ms for diffs under 500 lines.
- [ ] No memory leaks: disposing Monaco instances on tab close releases all memory (verify with DevTools).

### Integration

- [ ] Editor pane works within the PaneSystem split-pane layout (resizable alongside terminal and Smart View).
- [ ] Theme changes propagate to all open editor instances within 100ms.
- [ ] File saves from the editor trigger git status updates in the sidebar.
- [ ] Diff accept/reject emits Wails events that update Smart View state (collapsed diff summary).

---

## Estimated Effort

| Sub-task | Effort | Notes |
|---|---|---|
| 8.1 Monaco core wrapper | 2 days | Framework-agnostic pattern, theme setup |
| 8.2 Multi-tab + file tree integration | 3 days | Tab management, state persistence, keyboard shortcuts |
| 8.3 Go backend file operations | 2 days | Read/write/search bindings, SQLite state |
| 8.4 Clickable file links in Smart View | 1 day | Path detection + editor signal wiring |
| 8.5 Diff viewer with Accept/Reject | 4 days | Monaco diff editor, action flow, stream parser updates, before-content capture |
| 8.6 File create preview | 1 day | Read-only Monaco + create/discard actions |
| 8.7 Git blame integration | 3 days | Go blame parser, gutter decorations, caching, hover tooltips |
| 8.8 Cross-worktree file search | 3 days | Go parallel search, fuzzy filename match, virtualized UI |
| 8.9 Finder drag-drop | 2 days | macOS drag events, MIME detection, context injection |
| 8.10 Font size + theme sync | 1 day | Signals, persistence, keyboard shortcuts |
| 8.11 Go language server (gopls) | 4 days | LSP lifecycle, bridge, Monaco provider registration |
| 8.12 SQLite migration + sqlc queries | 0.5 days | Schema + generated Go code |
| 8.13 Vite/build configuration | 0.5 days | Monaco workers, bundle optimization |
| **Integration testing + polish** | **3 days** | Cross-feature testing, edge cases, performance tuning |
| **Total** | **~30 days (6 weeks)** | Single developer, assumes Phase 0-3 complete |

---

## File Path Summary

### Frontend (New Files)

| File | Purpose |
|---|---|
| `frontend/src/components/editor/MonacoLoader.ts` | Lazy Monaco factory, worker config |
| `frontend/src/components/editor/Editor.tsx` | Solid.js Monaco wrapper component |
| `frontend/src/components/editor/EditorTheme.ts` | Shadow-monarch Monaco theme definition |
| `frontend/src/components/editor/languages.ts` | File extension to language mapping |
| `frontend/src/components/editor/EditorTabBar.tsx` | Tab strip with drag-reorder |
| `frontend/src/components/editor/EditorPane.tsx` | Container: tabs + active editor |
| `frontend/src/components/editor/DiffEditor.tsx` | Monaco diff editor wrapper |
| `frontend/src/components/editor/DiffActions.tsx` | Accept/Reject/Auto-accept controls |
| `frontend/src/components/editor/FilePreview.tsx` | New file preview before creation |
| `frontend/src/components/editor/BlameGutter.tsx` | Git blame gutter decorations |
| `frontend/src/components/editor/DropZone.tsx` | Finder drag-drop overlay |
| `frontend/src/components/editor/FileSearchDialog.tsx` | Cmd+P / Cmd+Shift+F search modal |
| `frontend/src/components/editor/EditorStatusBar.tsx` | Language, line/col, encoding bar |
| `frontend/src/components/editor/LspProvider.ts` | Go LSP bridge for Monaco |
| `frontend/src/signals/editor.ts` | Editor state (tabs, font, recent files) |

### Frontend (Modified Files)

| File | Change |
|---|---|
| `frontend/src/components/smart-view/ToolCallCard.tsx` | Clickable file paths |
| `frontend/src/components/smart-view/DiffViewer.tsx` | Monaco diff editor integration |
| `frontend/src/components/smart-view/SessionStream.tsx` | File path linkification, file_create_preview renderer |
| `frontend/src/components/layout/CommandPalette.tsx` | Register file search actions |
| `frontend/src/components/sidebar/FileExplorer.tsx` | Open-in-editor on click |
| `frontend/vite.config.ts` | Monaco worker plugin |
| `frontend/package.json` | New dependencies |

### Go Backend (New Files)

| File | Purpose |
|---|---|
| `internal/editor/service.go` | File read/write/metadata operations |
| `internal/editor/search.go` | Parallel cross-worktree content search |
| `internal/editor/filename_search.go` | Fuzzy filename search |
| `internal/editor/state.go` | Editor tab state persistence |
| `internal/editor/blame.go` | Git blame parser + cache |
| `internal/editor/diff.go` | Diff generation for Accept/Reject flow |
| `internal/editor/drop.go` | Finder drag-drop file handling |
| `internal/editor/lsp.go` | gopls lifecycle management |
| `internal/editor/lsp_bridge.go` | LSP request/response bridge to Wails |
| `internal/app/bindings_editor.go` | Wails binding registration |
| `internal/db/migrations/NNNN_add_editor_tables.up.sql` | Schema migration |
| `internal/db/queries/editor.sql` | sqlc query definitions |

### Go Backend (Modified Files)

| File | Change |
|---|---|
| `internal/stream/parser.go` | Capture before_content for edits, emit file_create_preview events |
| `internal/stream/events.go` | Add FileCreatePreview event type |
| `cmd/phantomos/main.go` | Register editor service + bindings |

---

**Author:** Subash Karki
