// Phantom — Documentation content
// Author: Subash Karki
// Updated: 2026-04-27

export interface DocSection {
  title: string;
  items: DocItem[];
}

export interface DocItem {
  id: string;
  label: string;
  content: DocContent;
}

export interface DocContent {
  title: string;
  sections: ContentSection[];
}

export interface ContentSection {
  type: 'paragraph' | 'heading' | 'h3' | 'code' | 'table' | 'list' | 'shortcuts' | 'divider';
  text?: string;
  rows?: string[][];
  headers?: string[];
  items?: string[];
  shortcuts?: { keys: string[]; action: string }[];
}

export const DOC_SECTIONS: DocSection[] = [
  // ─────────────────────────────────────────────
  // GETTING STARTED
  // ─────────────────────────────────────────────
  {
    title: 'Getting Started',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        content: {
          title: 'Overview',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS is a Wails v2 desktop application for AI-powered development. It manages AI coding sessions, git worktrees, and terminal workflows in a unified interface designed for speed and clarity.',
            },
            {
              type: 'paragraph',
              text: 'The application is built with a Go backend communicating over Wails IPC to a SolidJS frontend. Every screen, panel, and interaction is rendered with Vanilla Extract CSS and Kobalte primitives.',
            },
            {
              type: 'heading',
              text: 'Tech Stack',
            },
            {
              type: 'table',
              headers: ['Technology', 'Version', 'Role'],
              rows: [
                ['Go', '1.25', 'Backend services, SQLite, PTY management'],
                ['SolidJS', '1.9', 'Reactive frontend framework'],
                ['Kobalte', '0.13', 'Accessible UI primitives'],
                ['xterm.js', '6.0', 'Terminal emulation with WebGL rendering'],
                ['SQLite', '3.x', 'Local persistence (23 tables)'],
                ['Vanilla Extract', 'latest', 'Type-safe CSS-in-TS styling'],
                ['Wails', 'v2', 'Desktop app framework (Go + Web)'],
              ],
            },
            {
              type: 'divider',
            },
            {
              type: 'heading',
              text: 'Core Capabilities',
            },
            {
              type: 'list',
              items: [
                'Multi-tab, split-pane terminal with 497 themes and WebGL rendering',
                'Real-time AI session tracking with 5 parallel collectors',
                'Git worktree management with AI-powered commit and PR creation',
                'Rich prompt composer with drag-and-drop file/image support',
                'Boot ceremony animation with parallel backend initialization',
                'CI/CD integration showing GitHub PR status and check results',
              ],
            },
          ],
        },
      },
      {
        id: 'quick-start',
        label: 'Quick Start',
        content: {
          title: 'Quick Start',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS runs as a native desktop application via Wails. The development server provides instant hot-reload for both the Go backend and the SolidJS frontend.',
            },
            {
              type: 'heading',
              text: 'Running the App',
            },
            {
              type: 'code',
              text: '# Development mode with hot-reload\nwails dev\n\n# Production build\nwails build',
            },
            {
              type: 'paragraph',
              text: 'On first launch, PhantomOS runs a 7-phase onboarding flow (boot, ceremony, identity, abilities, domains, terminal, linking) before presenting the main workspace.',
            },
            {
              type: 'heading',
              text: 'Keyboard Shortcuts',
            },
            {
              type: 'paragraph',
              text: 'PhantomOS is keyboard-driven. These shortcuts are available globally:',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'T'], action: 'New terminal tab' },
                { keys: ['Cmd', '\\'], action: 'Split pane right' },
                { keys: ['Cmd', 'Shift', '\\'], action: 'Split pane down' },
                { keys: ['Cmd', 'B'], action: 'Toggle left sidebar' },
                { keys: ['Cmd', 'Shift', 'B'], action: 'Toggle right sidebar' },
                { keys: ['Cmd', 'P'], action: 'Quick open' },
                { keys: ['Cmd', 'I'], action: 'Prompt composer' },
                { keys: ['Cmd', 'K'], action: 'Command palette' },
                { keys: ['Cmd', 'Shift', 'R'], action: 'Open recipe picker' },
                { keys: ['Cmd', 'F'], action: 'Search in terminal' },
                { keys: ['Cmd', ','], action: 'Settings' },
                { keys: ['Cmd', '='], action: 'Zoom in' },
                { keys: ['Cmd', '-'], action: 'Zoom out' },
                { keys: ['Cmd', '1'], action: 'Switch to tab 1' },
                { keys: ['Cmd', '2'], action: 'Switch to tab 2' },
                { keys: ['Shift', 'Enter'], action: 'Newline in AI prompt' },
              ],
            },
          ],
        },
      },
      {
        id: 'architecture',
        label: 'Architecture',
        content: {
          title: 'Architecture',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS follows a 3-layer architecture: a Go backend handling services, collectors, and SQLite persistence; a Wails IPC bridge exposing type-safe bindings and bidirectional events; and a SolidJS frontend built on fine-grained signals, components, and Vanilla Extract styles.',
            },
            {
              type: 'heading',
              text: 'Go Backend',
            },
            {
              type: 'paragraph',
              text: 'The backend manages PTY processes, git operations, file system watching, and AI session tracking. All persistent state is stored in a local SQLite database with 23 tables.',
            },
            {
              type: 'h3',
              text: 'Collectors',
            },
            {
              type: 'paragraph',
              text: 'Five collectors run in parallel to provide real-time insight into AI coding sessions:',
            },
            {
              type: 'table',
              headers: ['Collector', 'Purpose'],
              rows: [
                ['SessionWatcher', 'Detects active AI coding sessions and their lifecycle state'],
                ['JSONLScanner', 'Parses session JSONL output for token counts, costs, and tool usage'],
                ['ActivityPoller', 'Polls session activity to determine active/paused/completed status'],
                ['TaskWatcher', 'Monitors task progress and completion events'],
                ['TodoWatcher', 'Tracks TODO items created during AI sessions'],
              ],
            },
            {
              type: 'divider',
            },
            {
              type: 'heading',
              text: 'Wails IPC Bridge',
            },
            {
              type: 'paragraph',
              text: 'Wails generates TypeScript bindings from Go structs and methods automatically. The frontend calls Go functions directly through these bindings. Bidirectional events allow the backend to push updates (git changes, session state, terminal output) to the frontend in real time.',
            },
            {
              type: 'divider',
            },
            {
              type: 'heading',
              text: 'SolidJS Frontend',
            },
            {
              type: 'paragraph',
              text: 'The frontend uses SolidJS signals for reactive state, Kobalte for accessible UI primitives (dialogs, menus, tooltips), and Vanilla Extract for type-safe CSS with CSS custom properties. All styling uses design tokens rather than inline values.',
            },
            {
              type: 'list',
              items: [
                'Signals and stores for fine-grained reactivity',
                'Kobalte primitives for accessibility (ARIA, keyboard navigation)',
                'Vanilla Extract + CSS custom properties for theming',
                'xterm.js with WebGL addon for GPU-accelerated terminal rendering',
              ],
            },
          ],
        },
      },
      {
        id: 'command-palette',
        label: 'Command Palette',
        content: {
          title: 'Command Palette',
          sections: [
            {
              type: 'paragraph',
              text: 'The command palette is the fastest way to access any action in PhantomOS. Open it with Cmd+K to search across 40+ actions organized into 8 categories.',
            },
            {
              type: 'heading',
              text: 'Categories',
            },
            {
              type: 'table',
              headers: ['Category', 'Examples'],
              rows: [
                ['Terminal', 'New tab, split pane, close tab, clear terminal'],
                ['Navigation', 'Toggle sidebars, open settings, switch screen'],
                ['Git', 'Fetch, pull, push, commit, switch branch, create worktree'],
                ['Session', 'Pause session, resume session, kill session'],
                ['Worktree', 'Create worktree, delete worktree, switch worktree'],
                ['Theme', 'Switch app theme, change terminal theme'],
                ['Zoom', 'Zoom in, zoom out, reset zoom'],
                ['System', 'Toggle git blame, open docs, reload window'],
              ],
            },
            {
              type: 'heading',
              text: 'Fuzzy Search',
            },
            {
              type: 'paragraph',
              text: 'Type any part of an action name to filter results. The palette uses fuzzy matching — you can type "split" to find "Split Pane Right" or "tb" to find "Toggle Git Blame". Results are ranked by relevance with the best match highlighted.',
            },
            {
              type: 'heading',
              text: 'Usage',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'K'], action: 'Open command palette' },
                { keys: ['↑', '↓'], action: 'Navigate results' },
                { keys: ['Enter'], action: 'Execute selected action' },
                { keys: ['Escape'], action: 'Close palette' },
              ],
            },
          ],
        },
      },
      {
        id: 'quick-open',
        label: 'Quick Open',
        content: {
          title: 'Quick Open',
          sections: [
            {
              type: 'paragraph',
              text: 'Quick Open provides fast file navigation across the active worktree. Press Cmd+P to open the file finder, then type any part of a filename to jump to it instantly.',
            },
            {
              type: 'heading',
              text: 'How It Works',
            },
            {
              type: 'list',
              items: [
                'Indexes all files in the active worktree (respects .gitignore)',
                'Fuzzy search by filename — type "app.ts" or just "apts" to match',
                'Results appear as you type with instant filtering',
                'Select a file to open it in the code editor',
                'Recent files are prioritized in the results',
              ],
            },
            {
              type: 'heading',
              text: 'Shortcuts',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'P'], action: 'Open Quick Open' },
                { keys: ['↑', '↓'], action: 'Navigate results' },
                { keys: ['Enter'], action: 'Open selected file' },
                { keys: ['Escape'], action: 'Close Quick Open' },
              ],
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // TERMINAL
  // ─────────────────────────────────────────────
  {
    title: 'Terminal',
    items: [
      {
        id: 'terminal-management',
        label: 'Terminal Management',
        content: {
          title: 'Terminal Management',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS provides a fully-featured terminal emulator powered by xterm.js 6.0 with WebGL rendering and canvas fallback. Terminals support multi-tab workflows, split panes, and persistent sessions.',
            },
            {
              type: 'heading',
              text: 'Tabs and Splits',
            },
            {
              type: 'paragraph',
              text: 'Create multiple terminal tabs with Cmd+T and split any tab into panes (up to 6 per tab). Split right with Cmd+\\ or down with Cmd+Shift+\\. Each pane runs its own PTY process and maintains independent scrollback.',
            },
            {
              type: 'heading',
              text: 'Rendering',
            },
            {
              type: 'paragraph',
              text: 'Terminals use the WebGL renderer for GPU-accelerated text rendering. If WebGL is unavailable, the canvas renderer is used as a fallback. Both renderers support ligatures, true color, and the full xterm.js feature set.',
            },
            {
              type: 'heading',
              text: 'Session Persistence',
            },
            {
              type: 'list',
              items: [
                'Hot persistence: PTY processes survive tab switches without interruption',
                'Crash recovery: if a terminal crashes, a restore banner appears offering to reconnect',
                'Ring buffer: scrollback history is stored in a ring buffer for efficient memory usage and replay',
                'Auto-resize: terminals resize automatically when the window or pane dimensions change',
              ],
            },
            {
              type: 'divider',
            },
            {
              type: 'heading',
              text: 'Theme Support',
            },
            {
              type: 'paragraph',
              text: 'PhantomOS includes 497 built-in terminal themes sourced from the community theme collection. Themes are applied per-terminal and persisted in user preferences. Switch themes from Settings or the command palette.',
            },
          ],
        },
      },
      {
        id: 'prompt-composer',
        label: 'Rich Prompt Composer',
        content: {
          title: 'Rich Prompt Composer',
          sections: [
            {
              type: 'paragraph',
              text: 'The prompt composer is a floating, draggable glass panel activated with Cmd+I. It provides a rich editing experience for crafting AI prompts with file and image attachments.',
            },
            {
              type: 'heading',
              text: 'Input',
            },
            {
              type: 'paragraph',
              text: 'Built on Kobalte TextArea with auto-resize. The text area grows as you type and supports multiline editing. Key bindings in the composer:',
            },
            {
              type: 'table',
              headers: ['Key', 'Action'],
              rows: [
                ['Enter', 'Insert newline'],
                ['Shift+Enter', 'Send prompt to terminal'],
                ['Cmd+Enter', 'Send prompt to terminal'],
              ],
            },
            {
              type: 'heading',
              text: 'Drag and Drop',
            },
            {
              type: 'paragraph',
              text: 'Drag files or images into the composer to attach them as chips. You can also drag items directly from the sidebar file tree or the worktree panel. Attached files are sent as context alongside your prompt text.',
            },
            {
              type: 'heading',
              text: 'Terminal Targeting',
            },
            {
              type: 'paragraph',
              text: 'A terminal selector dropdown lets you choose which terminal pane receives the prompt. The composer border and accent glow match the color of the target terminal, providing a visual link between the composer and its destination.',
            },
            {
              type: 'heading',
              text: 'Glass Panel Design',
            },
            {
              type: 'paragraph',
              text: 'The composer uses glassmorphism styling with backdrop blur and transparency. It floats above the terminal workspace and can be dragged to any position. The panel persists its position across sessions.',
            },
          ],
        },
      },
      {
        id: 'terminal-themes',
        label: 'Terminal Themes',
        content: {
          title: 'Terminal Themes',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS ships with 497 built-in terminal themes from the xterm.js community theme collection, plus 6 custom app themes designed to match the application visual identity.',
            },
            {
              type: 'heading',
              text: 'App Themes',
            },
            {
              type: 'table',
              headers: ['Theme', 'Variant'],
              rows: [
                ['System Core', 'Dark / Light'],
                ['Shadow Monarch', 'Dark / Light'],
                ['Hunter Rank', 'Dark / Light'],
                ['CZ (CloudZero)', 'Dark / Light'],
                ['Cyberpunk', 'Single'],
                ['Dracula', 'Single'],
                ['Nord', 'Dark / Light'],
              ],
            },
            {
              type: 'heading',
              text: 'Persistence',
            },
            {
              type: 'paragraph',
              text: 'The selected terminal theme is persisted in user preferences and restored on app launch. Each terminal tab can optionally use a different theme, though the default is to apply the selected theme globally.',
            },
            {
              type: 'heading',
              text: 'Applying Themes',
            },
            {
              type: 'list',
              items: [
                'Open Settings (Cmd+,) and navigate to the Terminal section',
                'Use the command palette (Cmd+K) and search for "theme"',
                'Themes apply instantly with no terminal restart required',
              ],
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // EDITOR
  // ─────────────────────────────────────────────
  {
    title: 'Editor',
    items: [
      {
        id: 'code-editor',
        label: 'Code Editor',
        content: {
          title: 'Code Editor',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS includes a built-in code editor powered by Monaco (the same engine behind VS Code). It supports multi-file editing with tabs, dirty state tracking, and language-aware syntax highlighting.',
            },
            {
              type: 'heading',
              text: 'Multi-File Tabs',
            },
            {
              type: 'paragraph',
              text: 'Open multiple files simultaneously in tabs. Each tab shows the filename and a dot indicator when the file has unsaved changes (dirty state). Tabs can be reordered by dragging and closed individually or in bulk via the context menu.',
            },
            {
              type: 'heading',
              text: 'Language Detection',
            },
            {
              type: 'paragraph',
              text: 'The editor auto-detects the programming language from the file extension and applies the appropriate syntax highlighting, bracket matching, and indentation rules. Supported languages include TypeScript, JavaScript, Go, Python, Rust, JSON, YAML, Markdown, and more.',
            },
            {
              type: 'heading',
              text: 'Editor Customization',
            },
            {
              type: 'paragraph',
              text: 'Customize the editor appearance in Settings > Editor:',
            },
            {
              type: 'list',
              items: [
                'Font size — adjust the code font size',
                'Line height — control spacing between lines',
                'Cursor position — displayed in the status bar (line:column)',
              ],
            },
            {
              type: 'heading',
              text: 'Key Bindings',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'S'], action: 'Save current file' },
                { keys: ['Cmd', 'P'], action: 'Quick open file' },
                { keys: ['Cmd', 'W'], action: 'Close current tab' },
              ],
            },
          ],
        },
      },
      {
        id: 'git-blame',
        label: 'Git Blame',
        content: {
          title: 'Git Blame',
          sections: [
            {
              type: 'paragraph',
              text: 'Toggle inline git blame annotations to see who last modified each line and when. This is useful for understanding code history and authorship without leaving the editor.',
            },
            {
              type: 'heading',
              text: 'Activation',
            },
            {
              type: 'paragraph',
              text: 'Open the command palette (Cmd+K) and search for "Toggle Git Blame". The blame annotations appear inline at the end of each line, showing the author name and relative date.',
            },
            {
              type: 'heading',
              text: 'Visual Design',
            },
            {
              type: 'list',
              items: [
                'Per-line author and date annotations in a muted color',
                'Alternating group backgrounds — consecutive lines by the same author share a background tint, making commit boundaries visible at a glance',
                'Annotations fade out when you start typing, reappearing when you stop',
              ],
            },
            {
              type: 'heading',
              text: 'Toggle',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'K'], action: 'Open command palette, then search "Toggle Git Blame"' },
              ],
            },
          ],
        },
      },
      {
        id: 'diff-review',
        label: 'Diff Review',
        content: {
          title: 'Diff Review',
          sections: [
            {
              type: 'paragraph',
              text: 'Review dirty (unsaved or uncommitted) files inline before committing. The diff viewer highlights additions, deletions, and modifications with familiar green/red coloring.',
            },
            {
              type: 'heading',
              text: 'Entering Diff Review',
            },
            {
              type: 'paragraph',
              text: 'Click the "Review Changes" button in the editor status bar when dirty files are detected. This opens the diff viewer for each modified file.',
            },
            {
              type: 'heading',
              text: 'Layout Modes',
            },
            {
              type: 'table',
              headers: ['Mode', 'Description'],
              rows: [
                ['Side-by-side', 'Original on the left, modified on the right. Best for wide screens.'],
                ['Inline', 'Changes shown in a single column with additions/deletions interleaved. Best for narrow views.'],
              ],
            },
            {
              type: 'heading',
              text: 'Actions',
            },
            {
              type: 'list',
              items: [
                'Accept — apply the change and move to the next diff hunk',
                'Reject — discard the change and revert to the original',
                'Toggle layout — switch between side-by-side and inline modes',
                'Navigate between hunks with keyboard arrows',
              ],
            },
          ],
        },
      },
      {
        id: 'file-tab-context-menu',
        label: 'File Tab Context Menu',
        content: {
          title: 'File Tab Context Menu',
          sections: [
            {
              type: 'paragraph',
              text: 'Right-click any editor tab to access a context menu with file management shortcuts. This provides quick access to common operations without using the terminal.',
            },
            {
              type: 'heading',
              text: 'Available Actions',
            },
            {
              type: 'table',
              headers: ['Action', 'Description'],
              rows: [
                ['Copy File Name', 'Copy just the filename (e.g., `app.tsx`) to the clipboard'],
                ['Copy Relative Path', 'Copy the path relative to the project root (e.g., `src/app.tsx`)'],
                ['Copy Absolute Path', 'Copy the full filesystem path (e.g., `/Users/.../src/app.tsx`)'],
                ['Close', 'Close this tab'],
                ['Close Others', 'Close all tabs except this one'],
              ],
            },
            {
              type: 'paragraph',
              text: 'Copied paths are useful for pasting into terminal commands, AI prompts, or the prompt composer. The relative path format matches what git commands expect.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // GIT INTEGRATION
  // ─────────────────────────────────────────────
  {
    title: 'Git Integration',
    items: [
      {
        id: 'worktree-management',
        label: 'Worktree Management',
        content: {
          title: 'Worktree Management',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS provides first-class git worktree support, allowing you to work on multiple branches simultaneously without stashing or switching. Each worktree gets its own terminal context and AI session detection.',
            },
            {
              type: 'heading',
              text: 'Operations',
            },
            {
              type: 'list',
              items: [
                'Create: scaffold a new worktree from any branch or commit',
                'Delete: remove a worktree and clean up its directory',
                'Switch: change the active worktree in the workspace',
                'Rename: update the worktree display name',
                'Star/Pin: mark frequently-used projects for quick access',
              ],
            },
            {
              type: 'heading',
              text: 'Session Detection',
            },
            {
              type: 'paragraph',
              text: 'AI coding sessions are automatically detected per worktree. When you switch worktrees, the session panel updates to show only the sessions associated with that worktree. This keeps your AI context organized across parallel workstreams.',
            },
            {
              type: 'heading',
              text: 'Sidebar Integration',
            },
            {
              type: 'paragraph',
              text: 'The left sidebar displays all worktrees with their branch name, status indicators, and star/pin state. Drag items from the worktree list into the prompt composer to attach file paths as context.',
            },
          ],
        },
      },
      {
        id: 'git-operations',
        label: 'Git Operations',
        content: {
          title: 'Git Operations',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS exposes common git operations through the UI, eliminating the need to switch to a terminal for routine version control tasks.',
            },
            {
              type: 'heading',
              text: 'Supported Operations',
            },
            {
              type: 'table',
              headers: ['Operation', 'Description'],
              rows: [
                ['Fetch', 'Download objects and refs from remote'],
                ['Pull', 'Fetch and integrate remote changes'],
                ['Push', 'Upload local commits to remote'],
                ['Switch Branch', 'Checkout a different branch'],
                ['Stage', 'Add files to the staging area'],
                ['Unstage', 'Remove files from the staging area'],
                ['Commit', 'Create a commit with a message'],
                ['Discard', 'Revert changes in working directory'],
              ],
            },
            {
              type: 'heading',
              text: 'AI-Powered Commit and PR',
            },
            {
              type: 'paragraph',
              text: 'PhantomOS can generate commit messages and pull request descriptions using your AI assistant. When creating a commit, the AI analyzes your staged changes and produces a conventional commit message. For PRs, it summarizes the full diff and generates a structured description with context.',
            },
          ],
        },
      },
      {
        id: 'git-watcher',
        label: 'Filesystem Watcher',
        content: {
          title: 'Git Filesystem Watcher',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS uses fsnotify to monitor the .git directory for changes in real time. This provides instant detection of branch switches, commits, staging changes, and remote fetches without polling.',
            },
            {
              type: 'heading',
              text: 'Debounce Timings',
            },
            {
              type: 'table',
              headers: ['Event', 'Debounce', 'Trigger'],
              rows: [
                ['HEAD change (branch switch)', '0ms', 'Immediate'],
                ['Index change (stage/unstage)', '1000ms', '.git/index modification'],
                ['Refs change (fetch/push)', '500ms', '.git/refs/ modification'],
              ],
            },
            {
              type: 'heading',
              text: 'Polling Fallback',
            },
            {
              type: 'paragraph',
              text: 'A 30-second polling fallback ensures state stays synchronized even if filesystem events are missed (for example, on network-mounted drives or certain macOS edge cases). The poller checks HEAD, index mtime, and ref counts.',
            },
            {
              type: 'heading',
              text: 'Event Flow',
            },
            {
              type: 'list',
              items: [
                'fsnotify detects .git directory change',
                'Event is classified (HEAD, index, refs) and debounced',
                'Go backend recomputes git status',
                'Updated status is pushed to frontend via Wails event',
                'UI reactively updates branch name, file status, and commit history',
              ],
            },
          ],
        },
      },
      {
        id: 'cicd-integration',
        label: 'CI/CD Integration',
        content: {
          title: 'CI/CD Integration',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS integrates with GitHub to display pull request status and CI check results directly in the workspace. No need to switch to a browser to monitor your pipeline.',
            },
            {
              type: 'heading',
              text: 'PR Status',
            },
            {
              type: 'paragraph',
              text: 'The right sidebar shows the current PR for the active branch, including review status, merge readiness, and check suite results. Status updates arrive in real time via GitHub API polling.',
            },
            {
              type: 'heading',
              text: 'CI Check Results',
            },
            {
              type: 'list',
              items: [
                'Check suite status (pending, success, failure) displayed with color indicators',
                'Expandable failure details showing step names and error logs',
                'Rich tooltips grouped by workflow for quick triage',
                'Direct links to the GitHub Actions run page for full logs',
              ],
            },
            {
              type: 'heading',
              text: 'Failure Details',
            },
            {
              type: 'paragraph',
              text: 'When a CI check fails, expanding the check reveals the failing step name and the relevant error output. This lets you diagnose build or test failures without leaving PhantomOS.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // AI FEATURES
  // ─────────────────────────────────────────────
  {
    title: 'AI Features',
    items: [
      {
        id: 'session-tracking',
        label: 'Session Tracking',
        content: {
          title: 'Session Tracking',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS provides real-time tracking of all active AI coding sessions. Five collectors run in parallel to gather session metadata, token usage, cost estimates, and task progress.',
            },
            {
              type: 'heading',
              text: 'Session Metrics',
            },
            {
              type: 'table',
              headers: ['Metric', 'Source', 'Description'],
              rows: [
                ['Status', 'ActivityPoller', 'Active, paused, or completed'],
                ['Context Usage', 'JSONLScanner', 'Percentage of context window consumed'],
                ['Token Count', 'JSONLScanner', 'Input and output tokens for the session'],
                ['Cost Estimate', 'JSONLScanner', 'Estimated cost based on token pricing'],
                ['Task Progress', 'TaskWatcher', 'Tasks created, in-progress, and completed'],
                ['TODO Items', 'TodoWatcher', 'TODO items generated during the session'],
              ],
            },
            {
              type: 'heading',
              text: 'Collector Architecture',
            },
            {
              type: 'paragraph',
              text: 'All five collectors (SessionWatcher, JSONLScanner, ActivityPoller, TaskWatcher, TodoWatcher) run as independent goroutines. They communicate results to the frontend through Wails events, ensuring the UI stays updated without polling from the JavaScript side.',
            },
            {
              type: 'heading',
              text: 'Session Lifecycle',
            },
            {
              type: 'list',
              items: [
                'SessionWatcher detects a new AI coding process',
                'JSONLScanner begins parsing the session JSONL output file',
                'ActivityPoller monitors for pauses and idle periods',
                'TaskWatcher and TodoWatcher track structured output',
                'On completion, final metrics are persisted to SQLite',
              ],
            },
          ],
        },
      },
      {
        id: 'session-controls',
        label: 'Session Controls',
        content: {
          title: 'Session Controls',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS allows you to manage AI coding sessions directly from the UI. Control session lifecycle and apply safety policies without touching the terminal.',
            },
            {
              type: 'heading',
              text: 'Lifecycle Controls',
            },
            {
              type: 'table',
              headers: ['Action', 'Description'],
              rows: [
                ['Pause', 'Temporarily suspend the AI session'],
                ['Resume', 'Continue a paused session from where it left off'],
                ['Kill', 'Terminate the AI coding process immediately'],
              ],
            },
            {
              type: 'heading',
              text: 'Ward Rules',
            },
            {
              type: 'paragraph',
              text: 'Ward rules define safety policies for AI sessions. Rules can restrict file access, prevent certain operations, or enforce review steps before dangerous actions. Ward rules are configured per-project or globally and are enforced by the Go backend.',
            },
            {
              type: 'heading',
              text: 'Session Panel',
            },
            {
              type: 'paragraph',
              text: 'The right sidebar session panel shows all active sessions with their status, metrics, and control buttons. Sessions are grouped by worktree for clarity when working across multiple branches.',
            },
          ],
        },
      },
      {
        id: 'ai-prompt-composer',
        label: 'Prompt Composer',
        content: {
          title: 'Prompt Composer',
          sections: [
            {
              type: 'paragraph',
              text: 'The prompt composer is PhantomOS\'s primary interface for sending instructions to your AI assistant. See the Terminal > Rich Prompt Composer section for full documentation.',
            },
            {
              type: 'heading',
              text: 'Key Features',
            },
            {
              type: 'list',
              items: [
                'Floating, draggable glass panel (Cmd+I to open)',
                'Auto-resizing text area with multiline support',
                'File and image drag-and-drop from sidebar or file system',
                'Terminal selector with color-linked targeting',
                'Enter for newline, Shift+Enter or Cmd+Enter to send',
              ],
            },
            {
              type: 'paragraph',
              text: 'The composer is designed to feel like a natural extension of the terminal. Its glassmorphism styling and color-linking to the target terminal keep your focus on the work while providing rich editing capabilities.',
            },
          ],
        },
      },
      {
        id: 'multi-provider',
        label: 'Multi-Provider System',
        content: {
          title: 'Multi-Provider System',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS supports multiple AI session providers, allowing you to choose the best tool for each task. Out of the box, it supports Claude Code, Codex, and Gemini as session backends.',
            },
            {
              type: 'heading',
              text: 'Supported Providers',
            },
            {
              type: 'table',
              headers: ['Provider', 'CLI', 'Description'],
              rows: [
                ['Claude Code', 'claude', 'Anthropic\'s Claude with full tool use and session management'],
                ['Codex', 'codex', 'OpenAI\'s Codex CLI for code generation and editing'],
                ['Gemini', 'gemini', 'Google\'s Gemini CLI for multi-modal AI coding'],
              ],
            },
            {
              type: 'heading',
              text: 'Configuration',
            },
            {
              type: 'list',
              items: [
                'Navigate to Settings > Providers to configure your default session provider',
                'PhantomOS auto-detects installed providers by checking for their CLI binaries on your PATH',
                'Each provider includes a health check that verifies the CLI is functional and authenticated',
                'Version detection ensures compatibility with the expected provider API',
              ],
            },
            {
              type: 'heading',
              text: 'Custom Providers',
            },
            {
              type: 'paragraph',
              text: 'Add custom AI providers via YAML definition files. A provider definition includes the CLI binary path, session discovery patterns, health check command, and version detection regex. Place YAML files in `~/.phantom-os/providers/` to register them.',
            },
            {
              type: 'heading',
              text: 'Session Discovery',
            },
            {
              type: 'paragraph',
              text: 'Each provider defines how its sessions are discovered (process name matching, JSONL output path, PID file location). PhantomOS uses these patterns to automatically detect and track sessions regardless of which provider started them.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // DAILY DIGEST
  // ─────────────────────────────────────────────
  {
    title: 'Daily Digest',
    items: [
      {
        id: 'daily-digest-overview',
        label: 'Overview',
        content: {
          title: 'Daily Digest',
          sections: [
            { type: 'paragraph', text: 'The Daily Digest is your productivity log — a daily summary of everything you worked on, auto-generated from git, sessions, PRs, and CI data.' },
            { type: 'paragraph', text: 'Open it from the calendar icon in the top-right header bar. Each day has four sections: Morning Brief, Work Log, End of Day, and Notes.' },
            { type: 'heading', text: 'Storage' },
            { type: 'paragraph', text: 'Journal entries are stored as markdown files at ~/.phantom-os/journal/YYYY-MM-DD.md. Project-filtered views use YYYY-MM-DD--project-name.md.' },
          ],
        },
      },
      {
        id: 'daily-digest-morning-brief',
        label: 'Morning Brief',
        content: {
          title: 'Morning Brief',
          sections: [
            { type: 'paragraph', text: 'Auto-generates when you first open the Daily Digest for today. Shows what happened since yesterday across all projects (or a single project when filtered).' },
            { type: 'heading', text: 'Data Sources' },
            { type: 'list', items: [
              'Git commits with messages (grouped by project)',
              'Lines added/removed per project',
              'Open PRs per project',
              'CI status (pass/fail) per project',
              'Stale branches (>1 week)',
              'Session count, cost, and token usage',
              'Per-session first prompt summaries',
              'Completed tasks',
              'Active worktrees',
            ] },
            { type: 'paragraph', text: 'Once generated, the Morning Brief is immutable (shown with a lock icon). This prevents data drift if you regenerate later in the day.' },
          ],
        },
      },
      {
        id: 'daily-digest-work-log',
        label: 'Work Log',
        content: {
          title: 'Work Log',
          sections: [
            { type: 'paragraph', text: 'Auto-populates throughout the day as events happen. No manual input needed.' },
            { type: 'heading', text: 'Events Captured' },
            { type: 'table', headers: ['Event', 'Format'], rows: [
              ['Session start', 'HH:MM [project] Session started'],
              ['Session end', 'HH:MM Session ended (id), Nk tokens, $X.XX'],
              ['Git commit', 'HH:MM [project] Committed: message'],
              ['Git push', 'HH:MM [project] Pushed to remote'],
              ['PR opened', 'HH:MM [project] PR #N opened: "title"'],
              ['PR merged', 'HH:MM [project] PR #N merged'],
              ['CI pass/fail', 'HH:MM [project] CI: ✓ passed / ✗ failed'],
              ['Branch switch', 'HH:MM Switched branch'],
              ['Ward alert', 'HH:MM ⚠️ Ward triggered: rule-name'],
              ['Worktree created', 'HH:MM Created worktree: branch'],
              ['Agent spawned', 'HH:MM Spawned agent: description'],
            ] },
            { type: 'paragraph', text: 'Deduplication: identical events within 30 seconds are skipped.' },
          ],
        },
      },
      {
        id: 'daily-digest-end-of-day',
        label: 'End of Day',
        content: {
          title: 'End of Day Recap',
          sections: [
            { type: 'paragraph', text: 'Auto-generates when the last active session ends. Can also be triggered manually.' },
            { type: 'heading', text: 'Contents' },
            { type: 'list', items: [
              'Total commits, files touched, lines added/removed',
              'Per-project commit breakdown with messages',
              'Session count, cost, tokens, tool calls',
              'Per-session first prompt summaries',
              'Merged + open PRs',
              'Tasks completed + pending count',
            ] },
            { type: 'paragraph', text: 'Like the Morning Brief, the End of Day is immutable once generated.' },
          ],
        },
      },
      {
        id: 'daily-digest-project-filter',
        label: 'Project Filter',
        content: {
          title: 'Project Filtering',
          sections: [
            { type: 'paragraph', text: 'Use the project dropdown in the date header to scope the Daily Digest to a single project. When filtered:' },
            { type: 'list', items: [
              'Morning Brief and End of Day only show data for that project',
              'Work Log only shows events tagged with [project-name]',
              'A separate journal file is created (YYYY-MM-DD--project.md)',
              'Select "All Projects" to return to the combined view',
            ] },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // COMPOSER
  // ─────────────────────────────────────────────
  {
    title: 'Composer',
    items: [
      {
        id: 'composer-overview',
        label: 'Overview',
        content: {
          title: 'Composer',
          sections: [
            {
              type: 'paragraph',
              text: 'Composer is the agentic edit pane that replaced Chat. It runs the `claude` CLI in turn-by-turn mode and surfaces every proposed file change as an inline edit card with Accept and Discard actions — no edit lands on disk until you click through.',
            },
            {
              type: 'paragraph',
              text: 'Open it from the QuickLaunch grid, the command palette, or by adding a new Composer tab. Each tab is bound to a `cwd` (the worktree it operates against) and one `claude` session — switching sessions inside the pane re-binds in place without spawning a new tab.',
            },
            {
              type: 'heading',
              text: 'Edit cards',
            },
            {
              type: 'paragraph',
              text: 'When the assistant proposes an edit, Composer renders a card showing the file, a unified diff, and Accept / Discard buttons. Accepted cards are written to disk and tracked alongside the conversation; discarded cards are dropped. The full assistant response text is persisted (migration 010) so re-opening a session shows the conversation, not just the user prompts.',
            },
          ],
        },
      },
      {
        id: 'composer-sidebar',
        label: 'Past Sessions Sidebar',
        content: {
          title: 'Past Sessions Sidebar',
          sections: [
            {
              type: 'paragraph',
              text: 'The left rail of Composer lists every past `claude` session for the current worktree, ordered most-recent-first. Click a row to swap the pane in place; the existing tab stays put and rebinds to the new session.',
            },
            {
              type: 'heading',
              text: 'Right-click actions',
            },
            {
              type: 'list',
              items: [
                'Open in new tab — Cmd+Click also works as a shortcut',
                'Delete session — hard delete with confirm; if the deleted session is the one currently bound, the pane resets to a fresh conversation',
              ],
            },
            {
              type: 'paragraph',
              text: 'The session row tooltip shows the first prompt, the session ID, and the available shortcuts. New conversations get a row as soon as the first prompt is sent.',
            },
          ],
        },
      },
      {
        id: 'composer-no-context',
        label: 'No Project Context Toggle',
        content: {
          title: 'No Project Context Toggle',
          sections: [
            {
              type: 'paragraph',
              text: 'The "No project context" toggle (the pill at the top of the prompt area) runs each turn in a fresh temp directory. The CLI never sees `CLAUDE.md`, `.claude/`, or any of the worktree files unless you explicitly attach them via @-mentions.',
            },
            {
              type: 'paragraph',
              text: 'Useful when you want a clean answer that is not biased by project conventions, or when you are debugging whether a behaviour is coming from project context. The choice is persisted as a user preference (`composer_no_context_default`) so it survives across sessions and tabs.',
            },
          ],
        },
      },
      {
        id: 'composer-byok',
        label: 'BYOK Anthropic API Key',
        content: {
          title: 'BYOK Anthropic API Key',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS can run Composer against your own Anthropic API key instead of the Claude subscription that the `claude` CLI normally uses. Open Settings → AI Provider and switch from Subscription to BYOK.',
            },
            {
              type: 'list',
              items: [
                'Paste your `sk-ant-...` key — stored in the macOS Keychain, never on disk in plaintext',
                'Test verifies the key against the Anthropic API before saving',
                'Clear removes the key from the Keychain and falls back to subscription mode',
                'Switch back to Subscription anytime; the key stays stored until you explicitly clear it',
              ],
            },
            {
              type: 'paragraph',
              text: 'BYOK is per-machine, not per-worktree. Once the key is saved, every Composer turn on this Mac uses it.',
            },
          ],
        },
      },
      {
        id: 'composer-defaults',
        label: 'Defaults & Models',
        content: {
          title: 'Defaults & Models',
          sections: [
            {
              type: 'paragraph',
              text: 'Composer defaults to the Opus model. The dropdown in the prompt header lets you switch per-turn; the choice does not stick across new conversations on purpose — Opus is the safe default for agentic edits and you opt down explicitly when you want speed.',
            },
            {
              type: 'heading',
              text: 'Send shortcuts',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'Enter'], action: 'Send prompt' },
                { keys: ['Ctrl', 'Enter'], action: 'Send prompt' },
                { keys: ['Enter'], action: 'Newline in the composer' },
              ],
            },
            {
              type: 'paragraph',
              text: 'New conversation clears the pane and starts a fresh `claude` session bound to the current `cwd`. Cancel stops the in-flight turn without losing the conversation.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // RECIPES
  // ─────────────────────────────────────────────
  {
    title: 'Recipes',
    items: [
      {
        id: 'recipe-overview',
        label: 'Recipe Overview',
        content: {
          title: 'Recipe Overview',
          sections: [
            {
              type: 'paragraph',
              text: 'Recipes are auto-detected commands extracted from your project\'s build files. PhantomOS scans common configuration files and presents all available commands in a searchable picker.',
            },
            {
              type: 'heading',
              text: 'Auto-Detection Sources',
            },
            {
              type: 'table',
              headers: ['Source', 'Commands Detected'],
              rows: [
                ['package.json', 'All `scripts` entries (npm/pnpm/yarn)'],
                ['Makefile', 'All named targets'],
                ['Go (go.mod)', 'Common go commands (build, test, run, vet, fmt)'],
                ['Rust (Cargo.toml)', 'Cargo commands (build, test, run, clippy, fmt)'],
                ['Python (pyproject.toml)', 'Poetry/pip commands, pytest, ruff, mypy'],
                ['Nx monorepo (nx.json)', 'Nx targets across all projects'],
              ],
            },
            {
              type: 'heading',
              text: 'Access',
            },
            {
              type: 'paragraph',
              text: 'Open the recipe picker with Cmd+Shift+R or from the Recipes card on the home page. Recipes are grouped by source file and searchable by name.',
            },
            {
              type: 'heading',
              text: 'Shortcut',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'Shift', 'R'], action: 'Open recipe picker' },
              ],
            },
          ],
        },
      },
      {
        id: 'recipe-favorites',
        label: 'Favorites & Custom',
        content: {
          title: 'Favorites & Custom Recipes',
          sections: [
            {
              type: 'paragraph',
              text: 'Star your most-used recipes for instant access from the home page. You can also create custom recipes for commands that aren\'t auto-detected.',
            },
            {
              type: 'heading',
              text: 'Favorites',
            },
            {
              type: 'list',
              items: [
                'Click the star icon on any recipe to favorite it',
                'Up to 3 favorites are displayed on the home page as quick-launch cards',
                'Favorites persist across sessions in the SQLite database',
                'Un-star a recipe to remove it from the home page',
              ],
            },
            {
              type: 'heading',
              text: 'Custom Recipes',
            },
            {
              type: 'paragraph',
              text: 'Create custom recipes when your workflow includes commands that aren\'t in a standard config file. Each custom recipe has a label (display name) and a command (the shell command to execute). Custom recipes appear alongside auto-detected ones in the picker.',
            },
            {
              type: 'list',
              items: [
                'Create: open the recipe picker and click "Add Custom Recipe"',
                'Edit: custom recipes can be renamed or have their command updated',
                'Delete: remove custom recipes you no longer need (auto-detected recipes cannot be deleted)',
              ],
            },
          ],
        },
      },
      {
        id: 'running-recipes',
        label: 'Running Recipes',
        content: {
          title: 'Running Recipes',
          sections: [
            {
              type: 'paragraph',
              text: 'Click any recipe in the picker to execute it immediately. The recipe runs in a new terminal tab, keeping your existing terminals undisturbed.',
            },
            {
              type: 'heading',
              text: 'Execution Flow',
            },
            {
              type: 'list',
              items: [
                'A new terminal tab is created with the recipe label as the tab name',
                'PhantomOS waits for the shell to signal readiness before sending the command',
                'The recipe command is typed into the terminal and executed',
                'Output streams in real time — you can interact with the terminal normally',
                'The tab persists after the command completes so you can review output',
              ],
            },
            {
              type: 'heading',
              text: 'Shell Readiness',
            },
            {
              type: 'paragraph',
              text: 'PhantomOS detects shell readiness by monitoring the PTY output for the shell prompt pattern. This prevents the recipe command from being sent before the shell has finished initializing (loading .zshrc, .bashrc, etc.), which avoids command-not-found errors in shells with slow startup.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // UI & DESIGN
  // ─────────────────────────────────────────────
  {
    title: 'UI & Design',
    items: [
      {
        id: 'boot-ceremony',
        label: 'Boot Ceremony',
        content: {
          title: 'Boot Ceremony',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS opens with an animated boot ceremony that runs in parallel with backend initialization. This creates a cinematic launch experience while the Go backend starts services, connects to SQLite, and initializes collectors.',
            },
            {
              type: 'heading',
              text: 'Animation Phases',
            },
            {
              type: 'list',
              items: [
                'Particle burst: an explosion of particles radiates from center screen',
                'Typewriter terminal: system boot messages appear character-by-character in a terminal-style display',
                'System health scans: animated progress bars show each subsystem initializing (database, collectors, git watcher, PTY manager)',
              ],
            },
            {
              type: 'heading',
              text: 'Parallel Initialization',
            },
            {
              type: 'paragraph',
              text: 'The boot animation is not blocking. While the visual ceremony plays, the Go backend is simultaneously starting all services. Once both the animation completes and the backend signals readiness, the main workspace appears. If the backend finishes first, the animation continues to its natural conclusion. If the animation finishes first, it waits for the backend ready signal.',
            },
          ],
        },
      },
      {
        id: 'theming',
        label: 'Theming',
        content: {
          title: 'Theming',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS uses Vanilla Extract with CSS custom properties for a fully theme-aware design system. All colors, spacing, and visual effects are driven by design tokens that change with the active theme.',
            },
            {
              type: 'heading',
              text: 'App Themes',
            },
            {
              type: 'table',
              headers: ['Theme', 'Description'],
              rows: [
                ['System Core Dark', 'Default dark theme with blue-gray tones'],
                ['System Core Light', 'Clean light theme for daytime use'],
                ['Shadow Monarch Dark', 'Deep purple-black with gold accents'],
                ['Shadow Monarch Light', 'Warm light variant with gold highlights'],
                ['Hunter Rank Dark', 'Green-tinted cyberpunk aesthetic'],
                ['Hunter Rank Light', 'Bright variant with green accents'],
                ['CZ Dark', 'CloudZero brand dark theme'],
                ['CZ Light', 'CloudZero brand light theme'],
                ['Cyberpunk', 'Neon pink and cyan with high contrast'],
                ['Dracula', 'Classic Dracula color palette'],
                ['Nord Dark', 'Arctic, north-bluish dark theme'],
                ['Nord Light', 'Arctic, clean light theme'],
              ],
            },
            {
              type: 'heading',
              text: 'Visual Effects',
            },
            {
              type: 'list',
              items: [
                'Glassmorphism: translucent panels with backdrop blur',
                'Accent glow: subtle colored glow effects on interactive elements',
                'CSS custom properties: all tokens swap instantly on theme change',
                'Light and dark mode support across all themes',
              ],
            },
          ],
        },
      },
      {
        id: 'onboarding',
        label: 'Onboarding',
        content: {
          title: 'Onboarding',
          sections: [
            {
              type: 'paragraph',
              text: 'First-time users experience a 7-phase guided onboarding flow that introduces PhantomOS features and collects initial configuration.',
            },
            {
              type: 'heading',
              text: 'Onboarding Phases',
            },
            {
              type: 'table',
              headers: ['Phase', 'Name', 'Purpose'],
              rows: [
                ['1', 'Boot', 'System boot animation and initialization'],
                ['2', 'Ceremony', 'Welcome sequence with visual introduction'],
                ['3', 'Identity', 'Set display name, avatar, and profile'],
                ['4', 'Abilities', 'Configure enabled features and tools'],
                ['5', 'Domains', 'Select project directories and worktrees'],
                ['6', 'Terminal', 'Choose terminal theme and shell preferences'],
                ['7', 'Linking', 'Connect GitHub, configure API keys, and link services'],
              ],
            },
            {
              type: 'paragraph',
              text: 'Each phase can be revisited from Settings after initial setup. The onboarding state is persisted in SQLite so it only runs once per installation.',
            },
          ],
        },
      },
      {
        id: 'pane-colors',
        label: 'Pane Colors',
        content: {
          title: 'Pane Colors',
          sections: [
            {
              type: 'paragraph',
              text: 'Each split terminal pane receives a unique border color to help you visually distinguish between panes at a glance. The prompt composer matches the border color of its target terminal.',
            },
            {
              type: 'heading',
              text: 'Color Assignments',
            },
            {
              type: 'table',
              headers: ['Pane', 'Color'],
              rows: [
                ['Pane 1', 'Cyan'],
                ['Pane 2', 'Green'],
                ['Pane 3', 'Amber'],
                ['Pane 4', 'Coral'],
                ['Pane 5', 'Purple'],
                ['Pane 6', 'Pink'],
              ],
            },
            {
              type: 'heading',
              text: 'Composer Color Linking',
            },
            {
              type: 'paragraph',
              text: 'When you select a target terminal in the prompt composer dropdown, the composer border and glow accent update to match that terminal\'s pane color. This creates an immediate visual connection between where you are typing and where the prompt will be sent.',
            },
            {
              type: 'paragraph',
              text: 'Pane colors are assigned sequentially as panes are created and are consistent within a tab. Closing a pane does not reassign colors to remaining panes.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // DATABASE
  // ─────────────────────────────────────────────
  {
    title: 'Database',
    items: [
      {
        id: 'schema',
        label: 'Schema',
        content: {
          title: 'Database Schema',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS uses a local SQLite database with 23 tables for persisting application state, session data, user preferences, and gamification progress.',
            },
            {
              type: 'heading',
              text: 'Tables',
            },
            {
              type: 'table',
              headers: ['Table', 'Purpose'],
              rows: [
                ['sessions', 'AI coding session metadata (status, start time, duration)'],
                ['terminal_sessions', 'Terminal PTY state (shell, cwd, environment)'],
                ['tasks', 'Task tracking for AI-generated tasks'],
                ['projects', 'Registered project directories and metadata'],
                ['worktrees', 'Git worktree entries and their branch associations'],
                ['activity_log', 'Timestamped log of user and system actions'],
                ['hunter_profile', 'User profile for the gamification (hunter rank) system'],
                ['hunter_stats', 'Accumulated statistics for rank progression'],
                ['achievements', 'Unlocked achievement records'],
                ['daily_quests', 'Daily challenge definitions and completion state'],
                ['chat_conversations', 'Conversation thread metadata'],
                ['chat_messages', 'Individual messages within conversations'],
                ['pane_states', 'Terminal pane layout and position persistence'],
                ['user_preferences', 'Key-value store for all user settings and theme choices'],
                ['session_events', 'Fine-grained events emitted during AI sessions'],
                ['session_policies', 'Ward rules and safety policies applied to sessions'],
                ['graph_nodes', 'Knowledge graph nodes for codebase understanding'],
                ['graph_edges', 'Relationships between knowledge graph nodes'],
                ['graph_meta', 'Metadata and statistics for the knowledge graph'],
                ['daily_stats', 'Aggregated daily productivity statistics (commits, tokens, cost)'],
                ['custom_recipes', 'User-defined recipe commands with label and shell command'],
                ['recipe_favorites', 'Starred recipes for home page quick-launch display'],
                ['workspace_sections', 'Collapsible sidebar section state (expanded/collapsed)'],
              ],
            },
            {
              type: 'divider',
            },
            {
              type: 'heading',
              text: 'Storage',
            },
            {
              type: 'paragraph',
              text: 'The SQLite database file is stored in the application data directory. It uses WAL (Write-Ahead Logging) mode for concurrent read/write performance. Migrations run automatically on app startup.',
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────
  {
    title: 'Keyboard Shortcuts',
    items: [
      {
        id: 'all-shortcuts',
        label: 'All Shortcuts',
        content: {
          title: 'Keyboard Shortcuts',
          sections: [
            {
              type: 'paragraph',
              text: 'PhantomOS is designed for keyboard-driven workflows. All primary actions are accessible via shortcuts.',
            },
            {
              type: 'heading',
              text: 'Terminal',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'T'], action: 'New terminal tab' },
                { keys: ['Cmd', '\\'], action: 'Split pane right' },
                { keys: ['Cmd', 'Shift', '\\'], action: 'Split pane down' },
                { keys: ['Cmd', 'F'], action: 'Search in terminal' },
                { keys: ['Cmd', '1'], action: 'Switch to tab 1' },
                { keys: ['Cmd', '2'], action: 'Switch to tab 2' },
              ],
            },
            {
              type: 'heading',
              text: 'Navigation',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'B'], action: 'Toggle left sidebar' },
                { keys: ['Cmd', 'Shift', 'B'], action: 'Toggle right sidebar' },
                { keys: ['Cmd', 'P'], action: 'Quick open (file finder)' },
                { keys: ['Cmd', 'K'], action: 'Command palette' },
                { keys: ['Cmd', 'Shift', 'R'], action: 'Open recipe picker' },
                { keys: ['Cmd', ','], action: 'Open settings' },
              ],
            },
            {
              type: 'heading',
              text: 'Editor',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'S'], action: 'Save current file' },
                { keys: ['Cmd', 'W'], action: 'Close current tab' },
              ],
            },
            {
              type: 'heading',
              text: 'AI & Composer',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', 'I'], action: 'Open/close prompt composer' },
                { keys: ['Enter'], action: 'Newline in composer' },
                { keys: ['Shift', 'Enter'], action: 'Send prompt from composer' },
                { keys: ['Cmd', 'Enter'], action: 'Send prompt from composer' },
              ],
            },
            {
              type: 'heading',
              text: 'View',
            },
            {
              type: 'shortcuts',
              shortcuts: [
                { keys: ['Cmd', '='], action: 'Zoom in' },
                { keys: ['Cmd', '-'], action: 'Zoom out' },
              ],
            },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────────────────────
  // SAFETY
  // ─────────────────────────────────────────────
  {
    title: 'Safety',
    items: [
      {
        id: 'ward-system',
        label: 'Ward System',
        content: {
          title: 'Ward System',
          sections: [
            {
              type: 'paragraph',
              text: 'Wards are safety rules that protect your AI sessions from unintended or dangerous actions. Create rules that block, warn about, or require confirmation for specific operations.',
            },
            {
              type: 'heading',
              text: 'Ward Levels',
            },
            {
              type: 'table',
              headers: ['Level', 'Behavior', 'Use Case'],
              rows: [
                ['Block', 'Prevents the action entirely. The AI session receives a rejection message.', 'Protect production files, prevent force pushes, block destructive commands.'],
                ['Warn', 'Shows a warning toast in the UI but allows the action to proceed.', 'Flag risky operations like deleting branches or modifying config files.'],
                ['Confirm', 'Shows a confirmation modal that requires explicit user approval before the action runs.', 'Approve deployments, database migrations, or large file deletions.'],
              ],
            },
            {
              type: 'heading',
              text: 'Managing Wards',
            },
            {
              type: 'list',
              items: [
                'Open the WardManager from the home page card or via Settings > Features',
                'Create rules by specifying a pattern (file path, command, or operation) and a level (block/warn/confirm)',
                'Rules can be scoped to a specific project or applied globally',
                'Enable or disable individual rules without deleting them',
                'Ward rules are stored in the `session_policies` SQLite table',
              ],
            },
            {
              type: 'heading',
              text: 'Ward Alerts',
            },
            {
              type: 'paragraph',
              text: 'When a ward rule triggers, an alert appears in the right sidebar Alerts tab. Alerts show the rule name, the action that was attempted, and the ward level. Block alerts include the rejection message sent to the AI. Confirm alerts show whether the user approved or denied the action.',
            },
            {
              type: 'heading',
              text: 'Example Rules',
            },
            {
              type: 'code',
              text: '# Block any attempt to modify .env files\nPattern: **/.env*\nLevel: Block\n\n# Warn when deleting git branches\nPattern: git branch -D *\nLevel: Warn\n\n# Require confirmation for database migrations\nPattern: *migrate*\nLevel: Confirm',
            },
          ],
        },
      },
    ],
  },
];
