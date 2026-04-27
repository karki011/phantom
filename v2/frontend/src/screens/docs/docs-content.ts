// PhantomOS v2 — Documentation content
// Author: Subash Karki

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
              text: 'PhantomOS is a Wails v2 desktop application for AI-powered development. It manages Claude Code sessions, git worktrees, and terminal workflows in a unified interface designed for speed and clarity.',
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
                ['SQLite', '3.x', 'Local persistence (17 tables)'],
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
                'Real-time Claude Code session tracking with 5 parallel collectors',
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
                { keys: ['Cmd', 'F'], action: 'Search in terminal' },
                { keys: ['Cmd', ','], action: 'Settings' },
                { keys: ['Cmd', '='], action: 'Zoom in' },
                { keys: ['Cmd', '-'], action: 'Zoom out' },
                { keys: ['Cmd', '1'], action: 'Switch to tab 1' },
                { keys: ['Cmd', '2'], action: 'Switch to tab 2' },
                { keys: ['Shift', 'Enter'], action: 'Newline in Claude prompt' },
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
              text: 'The backend manages PTY processes, git operations, file system watching, and Claude session tracking. All persistent state is stored in a local SQLite database with 17 tables.',
            },
            {
              type: 'h3',
              text: 'Collectors',
            },
            {
              type: 'paragraph',
              text: 'Five collectors run in parallel to provide real-time insight into Claude Code sessions:',
            },
            {
              type: 'table',
              headers: ['Collector', 'Purpose'],
              rows: [
                ['SessionWatcher', 'Detects active Claude Code sessions and their lifecycle state'],
                ['JSONLScanner', 'Parses Claude JSONL output for token counts, costs, and tool usage'],
                ['ActivityPoller', 'Polls session activity to determine active/paused/completed status'],
                ['TaskWatcher', 'Monitors task progress and completion events'],
                ['TodoWatcher', 'Tracks TODO items created during Claude sessions'],
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
              text: 'The prompt composer is a floating, draggable glass panel activated with Cmd+I. It provides a rich editing experience for crafting Claude Code prompts with file and image attachments.',
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
              text: 'PhantomOS provides first-class git worktree support, allowing you to work on multiple branches simultaneously without stashing or switching. Each worktree gets its own terminal context and Claude session detection.',
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
              text: 'Claude Code sessions are automatically detected per worktree. When you switch worktrees, the session panel updates to show only the sessions associated with that worktree. This keeps your AI context organized across parallel workstreams.',
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
              text: 'PhantomOS can generate commit messages and pull request descriptions using Claude. When creating a commit, the AI analyzes your staged changes and produces a conventional commit message. For PRs, it summarizes the full diff and generates a structured description with context.',
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
              text: 'PhantomOS provides real-time tracking of all active Claude Code sessions. Five collectors run in parallel to gather session metadata, token usage, cost estimates, and task progress.',
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
                'SessionWatcher detects a new Claude Code process',
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
              text: 'PhantomOS allows you to manage Claude Code sessions directly from the UI. Control session lifecycle and apply safety policies without touching the terminal.',
            },
            {
              type: 'heading',
              text: 'Lifecycle Controls',
            },
            {
              type: 'table',
              headers: ['Action', 'Description'],
              rows: [
                ['Pause', 'Temporarily suspend the Claude session'],
                ['Resume', 'Continue a paused session from where it left off'],
                ['Kill', 'Terminate the Claude Code process immediately'],
              ],
            },
            {
              type: 'heading',
              text: 'Ward Rules',
            },
            {
              type: 'paragraph',
              text: 'Ward rules define safety policies for Claude sessions. Rules can restrict file access, prevent certain operations, or enforce review steps before dangerous actions. Ward rules are configured per-project or globally and are enforced by the Go backend.',
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
              text: 'The prompt composer is PhantomOS\'s primary interface for sending instructions to Claude Code. See the Terminal > Rich Prompt Composer section for full documentation.',
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
              text: 'PhantomOS uses a local SQLite database with 17 tables for persisting application state, session data, user preferences, and gamification progress.',
            },
            {
              type: 'heading',
              text: 'Tables',
            },
            {
              type: 'table',
              headers: ['Table', 'Purpose'],
              rows: [
                ['sessions', 'Claude Code session metadata (status, start time, duration)'],
                ['terminal_sessions', 'Terminal PTY state (shell, cwd, environment)'],
                ['tasks', 'Task tracking for Claude-generated tasks'],
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
                ['session_events', 'Fine-grained events emitted during Claude sessions'],
                ['session_policies', 'Ward rules and safety policies applied to sessions'],
                ['graph_nodes', 'Knowledge graph nodes for codebase understanding'],
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
                { keys: ['Cmd', ','], action: 'Open settings' },
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
];
