# PhantomOS v2 — Design Specification

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft v2 — updated with Solid.js, validation fixes, corrected scope

---

## Overview

PhantomOS v2 is a ground-up rewrite: Go backend, Solid.js + TypeScript frontend, Wails v2 desktop shell. Solves four v1 problems: single-threaded Node bottlenecks, node-pty reliability, Electron distribution pain, and architectural sprawl.

**Target users:** Subash + friends (small circle, macOS-focused).

---

## Design Philosophy: Gaming System UI

**Core principle:** PhantomOS doesn't look or feel like a developer tool. It feels like a gaming operating system — inspired by Solo Leveling's "System" interface, sci-fi command centers, and RPG HUDs. Every interaction reinforces this identity.

### UI Language

| Standard Dev Tool | PhantomOS Equivalent | Visual Treatment |
|---|---|---|
| Toast notification | **System Alert** | Blue glow border, typewriter text, Solo Leveling alert sound |
| Session list | **Mission Select / Quest Board** | Cards with rank badges, difficulty indicators, reward preview |
| Terminal | **Command Interface** | Subtle scan lines, input glow, prompt with hunter rank prefix |
| Git status panel | **Skill Cooldowns / Ability Tree** | Branch = skill tree nodes, status = cooldown states, conflicts = debuffs |
| Safety alert | **Danger Warning** | Red pulse border, screen edge vignette, dramatic severity escalation |
| Status bar | **HUD Bar** | Token budget = mana bar, session progress = XP bar, active sessions = party count |
| Command palette (Cmd+K) | **Quick-Cast Menu** | Radial or floating panel with ability-style icons, keyboard shortcut badges |
| Loading states | **System Scan** | "Analyzing..." "Scanning..." "Processing..." with animated progress, not spinners |
| Settings | **System Configuration** | Dark panels with glowing toggles, section headers as system modules |
| File explorer | **Inventory / Dungeon Map** | File tree with status-colored icons, folder depth = dungeon levels |
| Diff viewer | **Battle Log** | Accept = green power-up, Reject = red cancel, changes highlighted as combat moves |
| Cost tracker | **Resource Monitor** | Token spend as burn rate gauge, budget as energy bar depleting |
| Onboarding | **System Boot Sequence** | Cinematic terminal typewriter, subsystem initialization, calibration phases |
| Shutdown | **System Offline** | Graceful ceremony animation, stats summary, "See you, Hunter" |
| Achievements | **Titles & Badges** | Unlockable with glow animations, rank-up ceremonies |
| Search | **Radar Scan** | Results appear as discovered targets, relevance = signal strength |

### Animation & Motion Principles

- **Entrances:** Elements fade-in from slight offset (2-4px), never just appear
- **Transitions:** Pane switches use directional slide (not instant swap)
- **State changes:** Glow pulse on update (status badge, cost counter, XP bar)
- **Alerts:** Critical = screen-edge red vignette + shake. Warning = amber pulse. Info = blue glow
- **Achievements:** Full-screen overlay with particle effects + rank-up sound
- **Idle state:** Subtle ambient animation (gentle glow pulse on active sessions, slow breathing effect on HUD)

### Sound Design (Optional, User-Disableable)

- System boot: cinematic initialization sequence
- Achievement unlock: power-up chime
- Safety alert: warning tone (severity-scaled)
- Session complete: quest-complete sound
- Level up: rank-up fanfare
- All sounds off by default — opt-in via Settings > Audio

### Semantic Token System — MANDATORY

**Rule: No raw hex colors anywhere in components.** All UI uses semantic tokens via Vanilla Extract `createThemeContract`. Themes swap the entire palette by providing different token values. Components never know which theme is active.

#### Token Architecture

```typescript
// frontend/src/styles/theme.css.ts

import { createThemeContract, createTheme } from '@vanilla-extract/css';

// --- Semantic Token Contract (theme-agnostic) ---
// Every component references ONLY these tokens. Never raw colors.
export const vars = createThemeContract({
  color: {
    // Backgrounds
    bgPrimary: '',          // main app background
    bgSecondary: '',        // elevated surfaces, cards, panels
    bgTertiary: '',         // nested surfaces, inputs, wells
    bgOverlay: '',          // modal/dialog backdrop
    bgHover: '',            // hover state for interactive elements
    bgActive: '',           // active/pressed state
    bgSelected: '',         // selected item in list

    // Text
    textPrimary: '',        // main body text
    textSecondary: '',      // muted/helper text
    textDisabled: '',       // disabled state
    textInverse: '',        // text on accent backgrounds
    textLink: '',           // clickable text

    // Accent / Brand
    accent: '',             // primary brand color, active states
    accentHover: '',        // accent hover
    accentMuted: '',        // subtle accent (borders, badges)
    accentGlow: '',         // glow/shadow color for accent elements

    // Semantic States
    success: '',            // pass, accept, health, online
    successMuted: '',       // success backgrounds
    warning: '',            // caution, attention needed
    warningMuted: '',       // warning backgrounds
    danger: '',             // error, critical, block, offline
    dangerMuted: '',        // danger backgrounds
    info: '',               // system alerts, scan effects, info
    infoMuted: '',          // info backgrounds

    // Gaming-specific
    xp: '',                 // XP, rewards, achievements, gold rank
    xpMuted: '',            // XP backgrounds
    mana: '',               // token budget, resource indicators
    manaMuted: '',          // mana backgrounds
    rankGlow: '',           // rank-up ceremony glow

    // Surfaces
    border: '',             // default border
    borderHover: '',        // border on hover
    borderFocus: '',        // border on focus (keyboard)
    divider: '',            // subtle separators

    // Terminal
    terminalBg: '',         // terminal background
    terminalText: '',       // terminal foreground
    terminalCursor: '',     // cursor color
    terminalSelection: '',  // selection highlight

    // Editor
    editorBg: '',           // editor background
    editorGutter: '',       // line number gutter
    editorActiveLine: '',   // current line highlight
    editorSelection: '',    // selection
    editorDiffAdd: '',      // diff added
    editorDiffRemove: '',   // diff removed
  },
  font: {
    body: '',               // UI text
    mono: '',               // code, terminal, system
    display: '',            // ceremony titles, headings
  },
  fontSize: {
    xs: '', sm: '', md: '', lg: '', xl: '', xxl: '',
  },
  space: {
    xs: '', sm: '', md: '', lg: '', xl: '', xxl: '',
  },
  radius: {
    sm: '', md: '', lg: '', full: '',
  },
  shadow: {
    sm: '', md: '', lg: '',
    glow: '',               // accent glow for gaming effects
    dangerGlow: '',         // danger glow pulse
    successGlow: '',        // success glow
  },
  animation: {
    fast: '',               // 150ms — micro-interactions
    normal: '',             // 300ms — transitions
    slow: '',               // 500ms — ceremonies, reveals
  },
});
```

#### Theme Implementations

```typescript
// --- Shadow Monarch (Dark — Default) ---
export const shadowMonarchTheme = createTheme(vars, {
  color: {
    bgPrimary: '#0a0a0f',
    bgSecondary: '#1a0a2e',
    bgTertiary: '#150820',
    bgOverlay: 'rgba(10, 10, 15, 0.85)',
    bgHover: 'rgba(124, 58, 237, 0.08)',
    bgActive: 'rgba(124, 58, 237, 0.15)',
    bgSelected: 'rgba(124, 58, 237, 0.12)',
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textDisabled: '#475569',
    textInverse: '#0a0a0f',
    textLink: '#7c3aed',
    accent: '#7c3aed',
    accentHover: '#8b5cf6',
    accentMuted: 'rgba(124, 58, 237, 0.2)',
    accentGlow: 'rgba(124, 58, 237, 0.4)',
    success: '#22c55e',
    successMuted: 'rgba(34, 197, 94, 0.15)',
    warning: '#f97316',
    warningMuted: 'rgba(249, 115, 22, 0.15)',
    danger: '#ef4444',
    dangerMuted: 'rgba(239, 68, 68, 0.15)',
    info: '#38bdf8',
    infoMuted: 'rgba(56, 189, 248, 0.15)',
    xp: '#eab308',
    xpMuted: 'rgba(234, 179, 8, 0.15)',
    mana: '#38bdf8',
    manaMuted: 'rgba(56, 189, 248, 0.15)',
    rankGlow: 'rgba(234, 179, 8, 0.6)',
    border: '#1e293b',
    borderHover: '#334155',
    borderFocus: '#7c3aed',
    divider: '#1e293b',
    terminalBg: '#0a0a0f',
    terminalText: '#e2e8f0',
    terminalCursor: '#7c3aed',
    terminalSelection: 'rgba(124, 58, 237, 0.3)',
    editorBg: '#0a0a1a',
    editorGutter: '#1a0a2e',
    editorActiveLine: 'rgba(124, 58, 237, 0.06)',
    editorSelection: 'rgba(124, 58, 237, 0.25)',
    editorDiffAdd: 'rgba(34, 197, 94, 0.2)',
    editorDiffRemove: 'rgba(239, 68, 68, 0.2)',
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"Orbitron", "SF Pro Display", system-ui, sans-serif',
  },
  fontSize: { xs: '11px', sm: '12px', md: '14px', lg: '16px', xl: '20px', xxl: '28px' },
  space: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' },
  radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.4)',
    md: '0 4px 12px rgba(0,0,0,0.5)',
    lg: '0 8px 24px rgba(0,0,0,0.6)',
    glow: '0 0 20px rgba(124, 58, 237, 0.4)',
    dangerGlow: '0 0 20px rgba(239, 68, 68, 0.4)',
    successGlow: '0 0 20px rgba(34, 197, 94, 0.4)',
  },
  animation: { fast: '150ms', normal: '300ms', slow: '500ms' },
});

// --- Frost Light (Light Theme) ---
export const frostLightTheme = createTheme(vars, {
  color: {
    bgPrimary: '#f8fafc',
    bgSecondary: '#ffffff',
    bgTertiary: '#f1f5f9',
    bgOverlay: 'rgba(248, 250, 252, 0.85)',
    bgHover: 'rgba(99, 102, 241, 0.06)',
    bgActive: 'rgba(99, 102, 241, 0.12)',
    bgSelected: 'rgba(99, 102, 241, 0.08)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textDisabled: '#94a3b8',
    textInverse: '#f8fafc',
    textLink: '#6366f1',
    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentMuted: 'rgba(99, 102, 241, 0.15)',
    accentGlow: 'rgba(99, 102, 241, 0.3)',
    success: '#16a34a',
    successMuted: 'rgba(22, 163, 74, 0.1)',
    warning: '#ea580c',
    warningMuted: 'rgba(234, 88, 12, 0.1)',
    danger: '#dc2626',
    dangerMuted: 'rgba(220, 38, 38, 0.1)',
    info: '#0284c7',
    infoMuted: 'rgba(2, 132, 199, 0.1)',
    xp: '#ca8a04',
    xpMuted: 'rgba(202, 138, 4, 0.1)',
    mana: '#0284c7',
    manaMuted: 'rgba(2, 132, 199, 0.1)',
    rankGlow: 'rgba(202, 138, 4, 0.4)',
    border: '#e2e8f0',
    borderHover: '#cbd5e1',
    borderFocus: '#6366f1',
    divider: '#e2e8f0',
    terminalBg: '#1e293b',
    terminalText: '#e2e8f0',
    terminalCursor: '#6366f1',
    terminalSelection: 'rgba(99, 102, 241, 0.3)',
    editorBg: '#ffffff',
    editorGutter: '#f8fafc',
    editorActiveLine: 'rgba(99, 102, 241, 0.04)',
    editorSelection: 'rgba(99, 102, 241, 0.2)',
    editorDiffAdd: 'rgba(22, 163, 74, 0.15)',
    editorDiffRemove: 'rgba(220, 38, 38, 0.15)',
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    display: '"Orbitron", "SF Pro Display", system-ui, sans-serif',
  },
  fontSize: { xs: '11px', sm: '12px', md: '14px', lg: '16px', xl: '20px', xxl: '28px' },
  space: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px', xxl: '32px' },
  radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 12px rgba(0,0,0,0.08)',
    lg: '0 8px 24px rgba(0,0,0,0.12)',
    glow: '0 0 20px rgba(99, 102, 241, 0.3)',
    dangerGlow: '0 0 20px rgba(220, 38, 38, 0.3)',
    successGlow: '0 0 20px rgba(22, 163, 74, 0.3)',
  },
  animation: { fast: '150ms', normal: '300ms', slow: '500ms' },
});
```

#### Usage in Components — The Only Way

```typescript
// CORRECT — always use semantic tokens
import { vars } from '../styles/theme.css.ts';

export const card = style({
  background: vars.color.bgSecondary,
  color: vars.color.textPrimary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.md,
  ':hover': {
    borderColor: vars.color.borderHover,
    background: vars.color.bgHover,
  },
});

export const dangerAlert = style({
  background: vars.color.dangerMuted,
  color: vars.color.danger,
  boxShadow: vars.shadow.dangerGlow,
});

export const xpBadge = style({
  background: vars.color.xpMuted,
  color: vars.color.xp,
});

// WRONG — never do this
// background: '#0a0a0f'        ← hardcoded hex
// color: 'rgba(124, 58, 237)'  ← raw rgba
// border: '1px solid #1e293b'  ← raw hex in border
```

#### Theme Switching

```typescript
// frontend/src/signals/ui.ts
const [theme, setTheme] = createSignal<'shadow-monarch' | 'frost-light'>('shadow-monarch');

// Root component applies theme class to body
<body class={theme() === 'shadow-monarch' ? shadowMonarchTheme : frostLightTheme}>
```

Themes swap instantly — Vanilla Extract applies a different CSS class with all token values overridden. Zero JS runtime cost.

#### Adding a New Theme

1. Create a new `createTheme(vars, { ... })` with all token values filled
2. Add to theme picker in Settings
3. Done — every component automatically uses the new colors

**No component changes needed. Ever.**

### Typography

- **`vars.font.body`:** UI text — system font stack (SF Pro on macOS) for readability
- **`vars.font.mono`:** Code, terminal, system text — JetBrains Mono or Fira Code with ligatures
- **`vars.font.display`:** Ceremony titles, onboarding headings — Orbitron for "System" feel
- **System alerts/headings:** Slightly tracked (letter-spacing: 0.05em) for gaming aesthetic
- **Numbers/stats:** Tabular numerals for alignment in dashboards

### The Rule

> If a UI element could exist in a generic IDE, it's not done yet. Every surface should remind the user they're inside PhantomOS — a system built for hunters.
>
> If a component uses a raw hex color instead of a semantic token, it's broken. Fix it before shipping.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Wails v2 Desktop Shell (native macOS WebKit)            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Solid.js + TypeScript UI                          │  │
│  │  Smart View | Raw Terminal | Editor | Dashboard     │  │
│  │  Signals + Store (Go-driven state, minimal client) │  │
│  └──────────┬───────────────────────┬─────────────────┘  │
│             │ Wails Bindings        │ WebSocket           │
│             │ (request/response)    │ (streaming)         │
│  ┌──────────▼───────────────────────▼─────────────────┐  │
│  │  Go Backend (single binary, single process)        │  │
│  │                                                     │  │
│  │  ┌───────────┐ ┌────────────┐ ┌─────────────────┐ │  │
│  │  │ Stream    │ │ Terminal   │ │ Session         │ │  │
│  │  │ Parser    │ │ Manager    │ │ Collectors      │ │  │
│  │  └─────┬─────┘ └─────┬──────┘ └───────┬─────────┘ │  │
│  │        │              │                │            │  │
│  │  ┌─────▼──────────────▼────────────────▼─────────┐ │  │
│  │  │  Core Services                                │ │  │
│  │  │  - Git Pool (goroutine-per-op)                │ │  │
│  │  │  - AI Engine (tiered pipeline)                │ │  │
│  │  │  - Safety Rules Engine                        │ │  │
│  │  │  - Session Controller                         │ │  │
│  │  │  - Project Detector                           │ │  │
│  │  │  - Worktree Manager                           │ │  │
│  │  │  - Process Registry (recipes)                 │ │  │
│  │  │  - Gamification Engine                        │ │  │
│  │  │  - MCP Server (phantom-ai)                    │ │  │
│  │  │  - Claude Integration (CLAUDE.md, hooks)      │ │  │
│  │  └───────────────────┬───────────────────────────┘ │  │
│  │                      │                              │  │
│  │  ┌───────────────────▼───────────────────────────┐ │  │
│  │  │  SQLite (modernc.org/sqlite, WAL mode)        │ │  │
│  │  │  ~/.phantom-os/phantom.db                     │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Communication Channels

- **Wails Bindings:** Request/response from Solid → Go. CRUD, config, project management. No HTTP router — Wails bindings are the sole RPC mechanism.
- **WebSocket:** Streaming from Go → Solid. Terminal output, stream-json events, safety alerts, real-time session updates. Single WebSocket per app, multiplexed by session ID.
- **Wails Events:** Lightweight Go → Solid push notifications (session state changes, git status updates). Solid signals subscribe directly.

### Key Technology Choices

| Component | v1 | v2 | Why |
|---|---|---|---|
| Desktop shell | Electron (~150MB) | Wails v2 (~15-20MB binary, ~30-40MB with assets) | Native WebKit, single binary, no Chromium |
| Backend | Hono/tsx (single-threaded) | Go (goroutines) | True parallelism across all CPU cores |
| Frontend framework | React + Mantine v9 | **Solid.js + TypeScript** | Components run once, never rerender. Fine-grained reactivity via signals. ~2KB runtime vs React's 45KB |
| State management | Jotai + TanStack Query | **Solid Signals + Solid Store** | Go holds real state, pushes via events. No polling, no atom graphs, no virtual DOM diffing |
| Component library | Mantine v9 | **Kobalte (headless) + custom styling** | Accessible, unstyled primitives. Full design control for Solo Leveling theme |
| Styling | Mantine theme | **Vanilla Extract (compile-time CSS)** | Zero runtime CSS cost. Type-safe tokens |
| Terminal PTY | node-pty (native module) | creack/pty (pure Go) | No CGo, no native module packaging |
| Database | better-sqlite3 + Drizzle ORM | modernc.org/sqlite + **sqlc** (type-safe SQL) | Pure Go, no CGo. sqlc generates Go from SQL — type-safe, no ORM overhead |
| Git operations | git-pool.ts (1 worker thread) | Goroutine pool (default: 8 concurrent) | Parallel git across all worktrees |
| AI Engine | TypeScript orchestrator | Go orchestrator | Parallel strategy execution, concurrent graph queries |
| Session discovery | Filesystem watchers (TS) | **Filesystem collectors (Go)** | Discovers externally-started Claude sessions — core value prop retained |

---

## Frontend: Solid.js + TypeScript

### Why Solid.js

PhantomOS renders high-frequency streaming data (terminal output, parsed Claude events, git status). Solid's execution model is fundamentally better for this:

- **Components execute once.** No rerenders. Signal changes update only the specific DOM node affected.
- **No virtual DOM.** Solid compiles JSX to direct DOM operations. For 5 concurrent Claude sessions streaming events, this means zero reconciliation overhead.
- **Fine-grained reactivity.** Updating a session's token count doesn't touch the terminal pane, the sidebar, or any other component.
- **Go-driven state fits naturally.** Go pushes events → Solid signals update → DOM nodes change. No intermediate state layer needed.

### State Architecture

```
Go (source of truth for all app state)
  │
  ├─ Wails Event: "session:event"    → createSignal → Smart View card updates
  ├─ Wails Event: "git:status"       → createSignal → sidebar badge updates
  ├─ Wails Event: "safety:alert"     → createSignal → alert modal appears
  ├─ Wails Event: "terminal:data"    → Direct to xterm.js (bypasses Solid)
  │
  No TanStack Query. No polling. No atom graphs.
```

**Solid Store** for complex nested state (local UI state only):

```typescript
const [uiStore, setUiStore] = createStore({
  activePane: 'smart-view',
  commandPalette: { open: false, query: '' },
  sidebarCollapsed: false,
  theme: 'shadow-monarch',
});

// Updating nested state — only the changed leaf updates the DOM
setUiStore('commandPalette', 'open', true);
```

**Wails binding wrapper pattern:**

```typescript
// src/wails/bindings.ts — auto-generated types from Go structs
import { GetSessions, CreateWorktree } from '../../wailsjs/go/main/App';

// Thin wrapper that feeds Wails responses into Solid signals
export function useSessions() {
  const [sessions, setSessions] = createSignal<Session[]>([]);

  onMount(async () => {
    setSessions(await GetSessions());
  });

  // Go pushes updates — no polling
  EventsOn('sessions:updated', (data: Session[]) => {
    setSessions(data);
  });

  return sessions;
}
```

### Component Architecture

```
frontend/
├── src/
│   ├── app.tsx                      # Root component, layout shell
│   ├── components/
│   │   ├── smart-view/              # Parsed Claude session viewer
│   │   │   ├── SessionStream.tsx    # Event list with For loop
│   │   │   ├── ToolCallCard.tsx     # Collapsible tool call
│   │   │   ├── DiffViewer.tsx       # Syntax-highlighted diff
│   │   │   ├── ThinkingBlock.tsx    # Expandable thinking
│   │   │   ├── TestResults.tsx      # Pass/fail badges
│   │   │   └── CostTracker.tsx      # Token count per session
│   │   ├── terminal/
│   │   │   └── Terminal.tsx         # xterm.js wrapper (framework-agnostic)
│   │   ├── editor/
│   │   │   └── Editor.tsx           # Monaco wrapper (framework-agnostic)
│   │   ├── git/
│   │   │   ├── EagleEye.tsx         # Multi-worktree overview (center pane)
│   │   │   ├── GitStatus.tsx        # Per-worktree staged/modified/untracked
│   │   │   ├── ChangedFiles.tsx     # Files changed vs base branch with diff links
│   │   │   ├── GitActivity.tsx      # Recent commits on current branch
│   │   │   ├── BranchSwitcher.tsx   # Branch picker
│   │   │   ├── CommitHistory.tsx    # Full log with AI commit messages
│   │   │   ├── DiffViewer.tsx       # Side-by-side + unified diff viewer
│   │   │   ├── GitGraph.tsx         # Branch topology visualization
│   │   │   ├── ConflictResolver.tsx # Merge conflict UI
│   │   │   ├── StashManager.tsx     # Visual stash list with preview
│   │   │   └── RebaseViewer.tsx     # Interactive rebase UI
│   │   ├── safety/
│   │   │   ├── AlertModal.tsx       # Rule triggered — acknowledge/cancel
│   │   │   ├── AuditLog.tsx         # Safety audit trail viewer
│   │   │   ├── RuleEditor.tsx       # YAML editor with validation
│   │   │   └── AdminDashboard.tsx   # Rule metrics, bypass patterns
│   │   ├── sidebar/
│   │   │   ├── ProjectTree.tsx      # Smart project tree (pinned/active/recent/all)
│   │   │   ├── WorktreeContext.tsx   # Per-worktree: git status + changed files + activity
│   │   │   ├── FileExplorer.tsx     # Gitignore-aware file tree with git indicators
│   │   │   ├── SessionList.tsx      # Active/recent sessions
│   │   │   └── SearchFilter.tsx     # Global sidebar search
│   │   ├── cockpit/
│   │   │   └── Dashboard.tsx        # CodeBurn cockpit
│   │   ├── hunter-stats/
│   │   │   └── HunterDashboard.tsx  # Solo Leveling stats
│   │   ├── chat/
│   │   │   ├── ChatComposer.tsx     # Floating Claude chat input
│   │   │   └── ChatHistory.tsx      # Conversation history
│   │   ├── layout/
│   │   │   ├── PaneSystem.tsx       # Split-pane layout engine
│   │   │   ├── CommandPalette.tsx   # Cmd+K quick actions
│   │   │   └── StatusBar.tsx        # Active sessions, resources, safety
│   │   ├── onboarding/
│   │   │   └── OnboardingFlow.tsx   # Boot animation, setup phases
│   │   └── system/
│   │       ├── AIPlayground.tsx     # Strategy debugger/visualizer
│   │       └── SystemMetrics.tsx    # CPU, memory, load
│   ├── signals/                     # Shared reactive state
│   │   ├── sessions.ts
│   │   ├── worktrees.ts
│   │   ├── git.ts
│   │   ├── safety.ts
│   │   └── ui.ts
│   ├── wails/                       # Wails binding wrappers
│   │   ├── bindings.ts             # Auto-generated from Go
│   │   └── events.ts              # Event subscription helpers
│   ├── styles/                      # Vanilla Extract theme
│   │   ├── theme.css.ts            # Design tokens
│   │   ├── recipes.css.ts          # Component recipes
│   │   └── sprinkles.css.ts        # Utility classes
│   └── index.tsx                    # Entry point
├── package.json
├── tsconfig.json
└── vite.config.ts                   # Vite + vite-plugin-solid
```

### Rendering Strategy for High-Frequency Data

| Data type | Update frequency | Rendering approach |
|---|---|---|
| Terminal bytes | 60+ events/sec | **Bypass Solid entirely** — bytes go straight to xterm.js WebGL canvas |
| Claude stream events | 5-20 events/sec | Solid `<For>` with keyed items — only new items render, existing items untouched |
| Git status | On-demand + background poll | Wails Event → signal update → only status badges rerender |
| Session metadata | 1-2 updates/sec | Signal update → only the affected session card updates |
| Safety alerts | Rare (< 1/min) | Signal triggers → modal mount (no existing DOM affected) |

---

## Feature Specifications

### 1. Terminal Management (Go PTY)

- `creack/pty` spawns user's login shell (`/bin/zsh --login`) — all aliases, PATH, oh-my-zsh intact
- Each terminal session is a goroutine with dedicated PTY fd + `context.Context` for lifecycle
- Output multiplexed to WebSocket (UI) and ring buffer (cold restore)
- Hot persistence: goroutine keeps PTY alive across pane/worktree switches
- Cold persistence: snapshots to SQLite `terminal_sessions` table (every 10s)
- Graceful shutdown: SIGHUP to PTY on session close
- **Crash recovery:** on unexpected exit, Go writes final buffer snapshot. On restart, cold restore recovers last known state with banner "Previous session restored"

### 2. Session Collectors (CRITICAL — from validation)

**Port from v1.** These discover Claude sessions started outside PhantomOS (iTerm, VS Code, etc.):

- **Session Watcher:** Watches `~/.claude/projects/<dir>/` for new `.jsonl` session files via `fsnotify`
- **JSONL Scanner:** Parses Claude session JSONL files, extracts tool calls, token usage, model info
- **Activity Poller:** Periodic scan for session activity, updates DB
- **Task Watcher:** Tracks Claude task/todo state changes
- **Todo Watcher:** Monitors todo files for completion

Each collector runs as a dedicated goroutine with `context.Context` cancellation. Discovered sessions appear in the UI alongside PTY-spawned sessions.

```
Session Sources:
  ├─ PTY-spawned (PhantomOS terminal) → Go stream parser → Smart View
  └─ Externally-started (iTerm, VS Code) → Filesystem collectors → DB → Session list
```

### 3. Smart View + Raw Terminal Toggle

Claude CLI `stream-json` output parsed in real-time by Go (dedicated goroutine per session):

**Smart View (default):**
- Tool calls as collapsible cards (Read, Edit, Bash, etc.)
- File edits as syntax-highlighted diffs with Accept/Reject/Auto-accept
- Test results with pass/fail badges
- Thinking blocks as expandable sections
- Cost tracking (token counts) per session in real-time
- Clickable file paths open in editor
- Image outputs rendered inline
- Session history search with structured filters

**Raw Terminal:** Full xterm.js PTY — vim, htop, ncurses. Toggle anytime. Same underlying PTY.

**Data flow:**
```
Claude CLI → stream-json → Go Parser (goroutine per session)
                              │
                              ├─→ Structured events → WebSocket → Solid Smart View
                              ├─→ Raw bytes → WebSocket → xterm.js (Raw Terminal)
                              ├─→ Safety Rules Engine (parallel goroutine)
                              └─→ session_events table → SQLite
```

### 4. Parallel Git Operations

Goroutine pool with configurable concurrency (default: 8).

**Ported from v1:**
- Worktree create/remove/list/discover
- Branch checkout/create, default branch detection
- Clone with auth detection
- Git status (porcelain), uncommitted change detection
- Fetch with prune, stash/unstash, discard changes
- AI-generated commit messages (Claude CLI)
- PR creation (via `gh` CLI)
- Commit history with remote URL detection
- Branch listing (local + remote), base branch detection

**New in v2 (launch):**
- Parallel status dashboard — all worktrees update simultaneously
- Background periodic fetch (goroutine, never blocks UI)
- Side-by-side diff viewer with syntax highlighting

**Deferred to v2.x:**
- Merge conflict resolution UI
- Interactive rebase viewer
- Git graph visualization
- Blame integration
- Stash manager, cherry-pick UI, tag management, submodule support, bisect helper

### 5. AI Engine (Go Rewrite)

**Tiered Pipeline:**

| Tier | Trigger | Pipeline | Model | Latency |
|---|---|---|---|---|
| Skip | Trivial (ls, git status) | None | None / Haiku | 0ms |
| Fast | Simple task | Direct strategy only, no graph | Sonnet | <50ms (local classification only) |
| Standard | Moderate task | Context + assess + direct | Sonnet | <200ms |
| Full | Complex task | All strategies compete | Opus plans, Sonnet executes | <500ms |

**Ported from v1:** All 6 strategies (direct, advisor, self-refine, tree-of-thought, debate, graph-of-thought), graph context, knowledge DB, multi-perspective evaluator, task assessor, compactor, decision query, performance store.

**New:** Tiered pipeline, smart model routing, parallel strategy execution (debate perspectives as goroutines).

**Port approach:** Exact feature parity first (Phase 4a), then add tiering + model routing (Phase 4b).

#### 5.1 Enhanced Graph Build System (v2)

The v2 graph builder is a ground-up redesign for speed, leveraging Go's concurrency and tree-sitter for accurate multi-language AST parsing. Ten key improvements over the v1 TypeScript graph builder:

1. **Parallel directory walking** — Goroutine pool via `sourcegraph/conc` fans out across directories. No single-threaded `readdir` bottleneck.
2. **Parallel file read + parse** — Files are read and parsed concurrently using a bounded worker pool. I/O and CPU overlap naturally.
3. **Content hash caching** — MD5 content hash per file; unchanged files are skipped entirely on rebuild. Zero wasted work.
4. **Tree-sitter AST parsing** — Replaces all regex-based language parsers with `go-tree-sitter` grammars. Accurate function/class/type extraction across all supported languages (TS, JS, Python, Go, Rust, Java, C, C++). Single parser engine, multiple grammars.
5. **Persistent graph cache in SQLite** — Full graph serialized to `graph_nodes`/`graph_edges` tables. No cold-start rebuild — load from cache, validate, done.
6. **Batched incremental updates via fsnotify** — File changes debounced at 200ms, then processed as a single batch. Avoids per-keystroke rebuilds during active editing.
7. **Pre-computed reverse dependency index** — `reverseAdjacency` map maintained on every edge mutation. Blast radius queries are O(1) direct lookup, no graph traversal needed.
8. **Per-project graph sharding** — Each project gets its own isolated graph shard. Only active project shards are loaded into memory. Switching projects loads the shard from SQLite cache.
9. **Mtime-based fast validation on startup** — On launch, compare file mtimes against cached timestamps. Only re-parse files where mtime differs. Skips content hashing for the common case (no changes since last session).
10. **Tree-sitter shared with Monaco editor** — The Go backend runs `go-tree-sitter` for both graph AST extraction and Monaco syntax highlighting. Single tree-sitter instance, dual use — no duplicate parsing.

**Performance targets:**

| Operation | v1 (measured) | v2 (target) |
|---|---|---|
| Full build (2k files) | 2-5s | **<500ms** |
| Incremental update (1 file) | 50-200ms | **<20ms** |
| Startup (cached graph) | 2-5s (full rebuild) | **<200ms** |
| Blast radius query | 5-50ms (graph traversal) | **<1ms** (pre-computed index) |

### 6. Session Controller

- **Pause/Resume:** Buffer PTY output, suspend Claude mid-thought
- **Cost tracking:** Real-time token counts from stream-json
- **Multi-session dashboard:** All active sessions with status, tokens, progress
- **Kill/Restart:** Per-session goroutine isolation
- **Session policies:** Supervised / Auto-accept / Smart (confidence-gated)

**Deferred to v2.x:** Session branching, session rewinding.

### 6a. Session Attention System (Audio + Voice Notifications)

Sessions running in the background can call you when they need attention. Configurable per session — terminal, Claude, or any AI provider session.

**How it works:**

```
Go Session Goroutine monitors StreamEvents
    │
    ├─ Detects attention trigger (see table below)
    │
    ├─ Builds notification payload:
    │   { sessionId, triggerType, summary, urgency }
    │
    ├─ Emits Wails Event: "session:attention"
    │
    └─ Solid.js Notification Handler:
        ├─ Audio chime (Web Audio API, urgency-scaled)
        ├─ Voice announcement (Web Speech API):
        │   "Session 'feature-auth' needs your input —
        │    Claude is asking about database schema"
        ├─ In-app notification banner with [Go to Session] link
        └─ macOS native notification (optional, via Wails)
```

**Attention Triggers:**

| Trigger | Description | Default Urgency |
|---|---|---|
| `needs_input` | Claude/AI is waiting for user input (permission prompt, question) | high |
| `safety_alert` | Safety rule triggered (block/warn) | critical |
| `error` | Session hit an error, process crashed | high |
| `task_complete` | Session finished its work | medium |
| `cost_threshold` | Token spend exceeded configured budget | medium |
| `idle_timeout` | Session idle for N minutes (configurable) | low |
| `test_failure` | Test run detected failures | medium |
| `long_running` | Session running longer than configured max | low |
| `custom_pattern` | User-defined regex match on stream output | configurable |

**Per-Session Configuration:**

```yaml
# ~/.phantom-os/config.yaml
notifications:
  enabled: true
  
  audio:
    enabled: true
    volume: 0.7                    # 0.0 - 1.0
    style: electronic              # electronic | minimal | warm | retro
  
  voice:
    enabled: true
    voice: samantha                # system voice name
    pitch: 0.85                    # pitch-shifted for "System" feel
    rate: 0.95
    prefix: "Hunter"              # "Hunter, session X needs attention"
  
  native_notifications: true       # macOS Notification Center
  
  # Per-session overrides (also configurable via UI)
  defaults:
    needs_input: { audio: true, voice: true, urgency: high }
    safety_alert: { audio: true, voice: true, urgency: critical }
    error: { audio: true, voice: true, urgency: high }
    task_complete: { audio: true, voice: false, urgency: medium }
    cost_threshold: { audio: true, voice: false, urgency: medium }
    idle_timeout: { audio: false, voice: false, urgency: low }
    test_failure: { audio: true, voice: true, urgency: medium }
    long_running: { audio: false, voice: false, urgency: low }
    custom_pattern: { audio: true, voice: false, urgency: medium }
  
  # Budget alert thresholds
  cost_threshold_usd: 5.00        # notify when session exceeds this
  idle_timeout_minutes: 10
  long_running_minutes: 30
```

**Per-Session UI Override:**

Each session card in the dashboard has a notification bell icon. Click to configure:

```
┌─ Session: feature-auth ──────────────────────────┐
│                                                    │
│  🔔 Notifications for this session                │
│                                                    │
│  Needs Input         [■ Audio] [■ Voice] [■ macOS]│
│  Safety Alert        [■ Audio] [■ Voice] [■ macOS]│
│  Error               [■ Audio] [■ Voice] [□ macOS]│
│  Task Complete       [■ Audio] [□ Voice] [□ macOS]│
│  Cost Threshold ($)  [■ Audio] [□ Voice] [$5.00  ]│
│  Test Failure        [■ Audio] [■ Voice] [□ macOS]│
│  Custom Pattern      [□ ─────] [regex:          ] │
│                                                    │
│  [Mute All]  [Reset to Defaults]                  │
└────────────────────────────────────────────────────┘
```

**Voice Announcement Examples:**

- `needs_input`: "Hunter, session feature-auth needs your input. Claude is asking about the database migration strategy."
- `safety_alert`: "Warning. Session feature-auth triggered a safety rule. Cross-org context write detected."
- `error`: "Hunter, session feature-auth hit an error. Process exited with code 1."
- `task_complete`: "Session feature-auth completed. 3 files changed, 247 tokens used."
- `test_failure`: "Hunter, tests failed in session feature-auth. 2 of 15 tests failing."

**Go Backend:**

```go
// internal/session/notifier.go
type AttentionTrigger string

const (
    TriggerNeedsInput    AttentionTrigger = "needs_input"
    TriggerSafetyAlert   AttentionTrigger = "safety_alert"
    TriggerError         AttentionTrigger = "error"
    TriggerTaskComplete  AttentionTrigger = "task_complete"
    TriggerCostThreshold AttentionTrigger = "cost_threshold"
    TriggerIdleTimeout   AttentionTrigger = "idle_timeout"
    TriggerTestFailure   AttentionTrigger = "test_failure"
    TriggerLongRunning   AttentionTrigger = "long_running"
    TriggerCustomPattern AttentionTrigger = "custom_pattern"
)

type SessionNotifier interface {
    ID() string
    ShouldNotify(ctx context.Context, trigger AttentionTrigger, event StreamEvent, session *Session) (bool, error)
    BuildMessage(ctx context.Context, trigger AttentionTrigger, event StreamEvent, session *Session) (NotificationPayload, error)
}

type NotificationPayload struct {
    SessionID   string           `json:"session_id"`
    SessionName string           `json:"session_name"`
    Trigger     AttentionTrigger `json:"trigger"`
    Urgency     string           `json:"urgency"`
    Summary     string           `json:"summary"`
    VoiceText   string           `json:"voice_text"`
    DeepLink    string           `json:"deep_link"`   // phantom://session/{id}
    Timestamp   time.Time        `json:"timestamp"`
}
```

**Solid.js Frontend:**

```typescript
// frontend/src/components/notifications/SessionAttention.tsx
// Listens for session:attention events, plays audio + voice + shows banner

// frontend/src/components/notifications/NotificationBanner.tsx
// Slide-down banner: "[Session Name] needs input" + [Go to Session] button
// Auto-dismiss after 10s for medium/low, stays for high/critical

// frontend/src/components/notifications/NotificationConfig.tsx
// Per-session notification configuration panel

// frontend/src/audio/attention.ts
// Web Audio API chimes (urgency-scaled):
//   critical = alarm (dissonant, repeating)
//   high = alert chime (clear, attention-grabbing)
//   medium = soft chime (ambient)
//   low = subtle ping

// frontend/src/audio/voice.ts
// Web Speech API announcements using configured voice + pitch
```

**Deep Linking:** Clicking the notification (in-app banner or macOS native) navigates directly to that session's Smart View or terminal. `phantom://session/{id}` URL scheme registered with macOS for native notification clicks.

### 7. Configurable Safety Rules Engine

Admin-defined rules intercepting stream-json in real-time.

**Rule definition (YAML):**
```yaml
rules:
  - name: "Cross-org context write"
    trigger:
      tool: "set_org_context"
      action: "write"
    check:
      payload_field: "org_id"
      must_match: session.org_id
    severity: critical
    behavior: block

  - name: "PII in outbound payload"
    trigger:
      any_tool: true
    check:
      scan_for: [email, ssn, api_key, phone]
      allowlist: ["*@company.com"]
    severity: high
    behavior: warn

  - name: "Bulk writes in short window"
    trigger:
      any_tool: true
      action: "write"
    check:
      rate: "> 5 writes in 60s"
    severity: medium
    behavior: warn
```

**Behavior levels:**

| Behavior | Action | Bypass? | Audit? |
|---|---|---|---|
| block | Hard stop | No — config-only override | Yes |
| warn | Modal, must acknowledge | Yes — logged | Yes |
| confirm | Inline prompt | Yes — logged | Yes |
| log | Silent pass-through | N/A | Yes |

**Implementation details:**
- Rate-limiting rules maintain sliding window counters per session (in-memory, goroutine-safe)
- YAML validated on load — malformed rules rejected with error log
- Hot-reload via `fsnotify` with debounce (500ms) to avoid partial-write reads
- Audit trail: `safety_audit` table stores session_id, timestamp, rule_name, severity, tool_call, payload_hash (not full payload — avoids storing secrets), action_taken, acknowledged_by
- **Dry-run mode:** New rules can be added with `behavior: dry_run` — logs what would have been blocked without actually blocking. Validate before promoting to real behavior.

**Auth model (v2.0):** Config file-based. Whoever can edit `~/.phantom-os/safety-rules.yaml` is "admin." Fine for target audience. User identity for audit trail = OS username.

### 8. MCP Server (phantom-ai) — Ported from v1

Go implementation of the MCP server exposing:
- `graph_context` — codebase graph context for a file
- `graph_blast_radius` — impact analysis
- `orchestrator_process` — AI strategy pipeline

Runs as stdio MCP server, registered in Claude's config. Same interface as v1.

### 9. Chat with Claude — Ported from v1

Direct Claude chat via `claude -p` pipe (not via terminal session):
- Floating composer input (ChatComposer component)
- Per-worktree conversation context
- Chat history persistence in SQLite
- Conversation management (new, list, delete)

### 10. Rich Editor Integration

Monaco editor enhanced with Go backend:

**Core features:**
- Claude reads file → clickable link opens in editor
- Claude edits file → Monaco DiffEditor with Accept/Reject/Auto-accept (read-only until accepted)
- Claude creates file → preview inline before disk write
- File search across all worktrees (parallel goroutines + Monaco search UI)
- Multi-tab editor with per-worktree state persistence (open tabs, cursor, scroll → SQLite)
- Split editor (side-by-side two files)
- Drag from Finder → file becomes Claude context

**Monaco optimizations:**
- Lazy loading: Monaco loaded only when editor tab opens (~2.5MB chunk, not in initial bundle)
- Web Workers: 5 worker types (editor, JSON, TS, CSS, HTML) for tokenization/IntelliSense — explicit setup for WebKit
- Tree-sitter via Go: Go runs tree-sitter natively (go-tree-sitter), pushes AST to frontend for faster syntax highlighting than Monaco's built-in TextMate grammars. Supports all 8 AI engine languages + more
- LSP proxy: Go backend proxies Language Server Protocol servers (gopls, typescript-language-server, etc.) — hover, go-to-definition, autocomplete, semantic highlighting
- Minimap: on by default, toggle in settings
- Bracket matching + rainbow brackets: on by default
- Sticky scroll: current scope header pinned at top
- Large file handling: files >1MB use basic editor (no tokenization) to avoid freezing
- Font ligatures: Fira Code / JetBrains Mono support
- Inline AI completions: ghost text suggestions from provider
- Command palette: Monaco Cmd+Shift+P unified with PhantomOS Cmd+K

**Git integration in editor:**
- Inline blame on hover (Go provides blame data via goroutine)
- Gutter decorations: modified/added/deleted line indicators
- Quick diff: click gutter to see inline diff for that hunk

### 11. AI Provider Abstraction (AI-Agnostic)

PhantomOS is not locked to Claude. A `Provider` interface abstracts all AI interactions so the entire app (Smart View, safety rules, session controller, cost tracking) works with any AI CLI/API.

```go
// internal/provider/provider.go
type Provider interface {
    Name() string
    StartSession(ctx context.Context, cfg SessionConfig) (*Session, error)
    ParseStream(ctx context.Context, r io.Reader) <-chan StreamEvent
    Chat(ctx context.Context, prompt string, opts ChatOpts) (<-chan StreamEvent, error)
    ListModels(ctx context.Context) ([]Model, error)
    DetectSessions(ctx context.Context) ([]DiscoveredSession, error)
    SessionDir() string  // e.g. ~/.claude/ for Claude, ~/.codex/ for Codex
}

// internal/provider/types.go — normalized event types
type StreamEvent struct {
    Type      EventType  // tool_call, thinking, text, error, cost
    Provider  string     // "claude", "gpt", "gemini", "local"
    SessionID string
    Timestamp time.Time
    Raw       json.RawMessage  // original provider payload
    ToolCall  *ToolCallEvent   // normalized (nil if not a tool call)
    Text      *TextEvent       // normalized
    Cost      *CostEvent       // normalized
    Thinking  *ThinkingEvent   // normalized (nil if provider doesn't support)
}
```

**Provider implementations:**

| Provider | CLI | Stream format | Session discovery |
|---|---|---|---|
| `ClaudeProvider` (v2.0) | `claude` CLI | stream-json | `~/.claude/projects/` JSONL files |
| `GPTProvider` (future) | `gpt` / OpenAI API | SSE | TBD |
| `GeminiProvider` (future) | `gemini` CLI | streaming JSON | TBD |
| `CodexProvider` (future) | `codex` CLI | SSE | TBD |
| `LocalProvider` (future) | `ollama` / `llama.cpp` | streaming JSON | local process scan |

**Everything downstream works with normalized `StreamEvent`:**
- Smart View renders `ToolCallEvent` → doesn't care if it came from Claude or GPT
- Safety Rules scan `StreamEvent` → provider-agnostic pattern matching
- Cost Tracker reads `CostEvent` → each provider maps its pricing
- Session Controller manages `Session` → provider just spawns the process

**Config:**
```yaml
providers:
  default: claude
  claude:
    binary: claude
    flags: ["--output-format", "stream-json", "--verbose"]
  gpt:
    binary: gpt
    flags: ["--stream"]
  local:
    binary: ollama
    model: llama3.3
```

### 12. Extension System

**Design Principle:** Every feature area is built as a pluggable module with a Go interface + Solid.js component registry. Adding new capabilities = implement interface + register. No core modifications needed. Each subsystem ships with a minimal v2.0 feature set but is architecturally ready for unlimited growth.

**Go Backend — Interface-driven (all feature areas):**

```go
// --- AI Engine ---
type Strategy interface {
    ID() string
    Role() string
    Score(ctx TaskContext) StrategyScore
    Execute(ctx context.Context, input StrategyInput) (StrategyOutput, error)
}

// --- Safety ---
type RuleChecker interface {
    Name() string
    Check(ctx context.Context, event StreamEvent, session *Session) (RuleResult, error)
}

// --- Smart View / Stream Processing ---
type StreamHandler interface {
    EventTypes() []string
    Handle(ctx context.Context, event StreamEvent) error
}

// --- Session Discovery ---
type Collector interface {
    Name() string
    Start(ctx context.Context) error
    Stop() error
}

// --- Editor Actions ---
type EditorAction interface {
    ID() string
    Label() string
    Keybinding() string
    IsAvailable(ctx EditorContext) bool
    Execute(ctx context.Context, editor EditorContext) error
}

// --- Editor Language Support ---
type LanguageProvider interface {
    ID() string
    Extensions() []string
    Highlight(ctx context.Context, source []byte) ([]Token, error)
    Symbols(ctx context.Context, source []byte) ([]Symbol, error)
}

// --- Terminal Addons ---
type TerminalAddon interface {
    ID() string
    OnData(ctx context.Context, session *TerminalSession, data []byte) error
    OnResize(ctx context.Context, cols, rows int) error
    Cleanup() error
}

// --- Session Modes ---
type SessionPolicy interface {
    ID() string
    Label() string
    ShouldApprove(ctx context.Context, event StreamEvent, session *Session) (PolicyDecision, error)
}

// --- Provider (AI-agnostic) ---
type Provider interface {
    Name() string
    StartSession(ctx context.Context, cfg SessionConfig) (*Session, error)
    ParseStream(ctx context.Context, r io.Reader) <-chan StreamEvent
    Chat(ctx context.Context, prompt string, opts ChatOpts) (<-chan StreamEvent, error)
    ListModels(ctx context.Context) ([]Model, error)
    DetectSessions(ctx context.Context) ([]DiscoveredSession, error)
    SessionDir() string
}

// --- Gamification ---
type AchievementChecker interface {
    ID() string
    Check(ctx context.Context, event ActivityEvent, stats *HunterStats) (bool, error)
}

type QuestGenerator interface {
    ID() string
    Generate(ctx context.Context, stats *HunterStats) ([]Quest, error)
}

// --- Git Operations ---
type GitHook interface {
    ID() string
    Phase() string // "pre-commit", "post-merge", "pre-push", etc.
    Execute(ctx context.Context, repo *GitRepo, args GitHookArgs) error
}

// --- Dashboard Panels ---
type DashboardPanel interface {
    ID() string
    Label() string
    RefreshInterval() time.Duration
    Data(ctx context.Context) (any, error)
}

// --- Recipes ---
type RecipeProvider interface {
    ID() string
    Detect(ctx context.Context, project *Project) ([]Recipe, error)
    Execute(ctx context.Context, recipe Recipe) (*Process, error)
}
```

**Solid.js Frontend — Component registries (all feature areas):**

```typescript
// --- Smart View: new event types ---
const eventRenderers = new Registry<Component<EventProps>>();
eventRenderers.register('tool_call', ToolCallCard);
eventRenderers.register('thinking', ThinkingBlock);
eventRenderers.register('custom:deploy', DeployStatusCard);  // future

// --- Editor: new actions, panels, gutter decorations ---
const editorActions = new Registry<EditorActionDef>();
editorActions.register('blame-toggle', { label: 'Toggle Blame', keybinding: 'Cmd+Shift+B', component: BlameGutter });
editorActions.register('ai-explain', { label: 'AI Explain Selection', component: AIExplainPanel });  // future

// --- Terminal: new addons ---
const terminalAddons = new Registry<TerminalAddonDef>();
terminalAddons.register('search', TerminalSearch);
terminalAddons.register('link-handler', TerminalLinks);
// future: terminalAddons.register('image-protocol', SixelRenderer);

// --- Session: new policy UIs ---
const policyRenderers = new Registry<Component<PolicyProps>>();
policyRenderers.register('supervised', SupervisedUI);
policyRenderers.register('auto-accept', AutoAcceptUI);
policyRenderers.register('smart', SmartPolicyUI);

// --- Sidebar: new panels ---
const sidebarPanels = new Registry<SidebarPanelDef>();
sidebarPanels.register('projects', ProjectTree);
sidebarPanels.register('sessions', SessionList);
sidebarPanels.register('file-explorer', FileExplorer);
// future: sidebarPanels.register('docker', DockerPanel);

// --- Dashboard: new widgets ---
const dashboardWidgets = new Registry<Component<WidgetProps>>();
dashboardWidgets.register('cost-tracker', CostTracker);
dashboardWidgets.register('hunter-stats', HunterStats);
dashboardWidgets.register('system-metrics', SystemMetrics);
// future: dashboardWidgets.register('github-prs', GitHubPRWidget);

// --- Command Palette: new commands ---
const commands = new Registry<CommandDef>();
commands.register('file:open', { label: 'Open File', keybinding: 'Cmd+P', handler: openFileDialog });
commands.register('session:pause', { label: 'Pause Session', keybinding: 'Cmd+Shift+P', handler: pauseSession });
// all features self-register their commands — palette auto-discovers
```

**Growth contract — every feature area follows this pattern:**

| Feature Area | Go Interface | Solid.js Registry | v2.0 Ships With | Room to Grow |
|---|---|---|---|---|
| Smart View | `StreamHandler` | `eventRenderers` | 7 event types | Custom event cards, markdown extensions, chart blocks |
| Editor | `EditorAction` + `LanguageProvider` | `editorActions` | Blame, diff, LSP | AI explain, refactor actions, custom decorators |
| Terminal | `TerminalAddon` | `terminalAddons` | Search, links | Sixel images, audio bell, custom keymaps |
| Session | `SessionPolicy` | `policyRenderers` | 3 policies | Custom approval logic, team policies, cost gates |
| AI Engine | `Strategy` | `AIPlayground` | 6 strategies | New strategies without touching orchestrator |
| Safety | `RuleChecker` | `AlertModal` variants | YAML rules + 6 scanners | Custom scanners (secrets, compliance patterns) |
| Git | `GitHook` | git component registry | Core ops + graph | Custom workflows, CI triggers, review tools |
| Collectors | `Collector` | session list | Claude, filesystem | GPT, Gemini, Codex, local model discovery |
| Gamification | `AchievementChecker` + `QuestGenerator` | widget registry | 13 achievements, 10 quests | Community achievements, team quests |
| Dashboard | `DashboardPanel` | `dashboardWidgets` | Cost, stats, system | GitHub PRs, Jira, custom metrics |
| Sidebar | — | `sidebarPanels` | Projects, sessions, files | Docker, cloud resources, bookmarks |
| Recipes | `RecipeProvider` | recipe launcher | Auto-detect Node/Go/Python | Custom recipes, team playbooks |
| Commands | — | `commands` | Core commands | Every feature self-registers to Cmd+K |
| Providers | `Provider` | provider picker | Claude | GPT, Gemini, Codex, Ollama/local |

**Rule: implement interface + register = feature exists. No core file touched.**

**Configuration via `~/.phantom-os/config.yaml`:**
```yaml
features:
  smart_view: true
  safety_engine: true
  gamification: true
ai:
  default_tier: auto
  confidence_threshold: 0.8
  model_routing:
    planning: opus
    implementation: sonnet
    quick: haiku
```

### 13. Feature Flags — Everything On by Default, User-Disableable

**Design principle:** Every feature ships enabled. Users can disable anything via Settings UI or config.yaml. No feature requires another feature to function — graceful degradation when dependencies are off.

**`~/.phantom-os/config.yaml` — full feature flag surface:**
```yaml
features:
  # Core
  smart_view: true              # false = raw terminal only, no parsed events
  raw_terminal: true            # false = hide raw terminal toggle
  
  # AI
  ai_engine: true               # false = skip all AI pipeline, pure passthrough
  ai_tiered_pipeline: true      # false = always use full pipeline (v1 behavior)
  model_routing: true           # false = use single model for everything
  ai_auto_refine: true          # false = never auto-refine strategy output
  
  # Safety
  safety_engine: true           # false = no rule scanning, no audit trail
  safety_audit_trail: true      # false = rules still fire but nothing logged
  safety_admin_dashboard: true  # false = hide admin dashboard UI
  
  # Git
  git_parallel_status: true     # false = sequential status (v1 behavior)
  git_background_fetch: true    # false = no automatic background fetches
  git_graph: true               # false = hide branch graph visualization
  git_blame: true               # false = hide inline blame in editor
  git_conflict_ui: true         # false = use external tool for conflicts
  git_rebase_viewer: true       # false = hide interactive rebase UI
  
  # Session
  session_cost_tracking: true   # false = don't parse/display token costs
  session_policies: true        # false = all changes applied immediately (no review)
  session_pause_resume: true    # false = hide pause/resume controls
  session_branching: true       # false = hide session branching
  session_rewind: true          # false = hide rewind controls
  session_orchestration: true   # false = no multi-session pipelines
  
  # Editor
  editor_inline: true           # false = always open files in external editor
  editor_diff_viewer: true      # false = no inline diff, accept all changes
  editor_blame: true            # false = no inline blame
  editor_drag_drop: true        # false = disable Finder drag-drop
  
  # Experience
  gamification: true            # false = hide hunter stats, achievements, quests, XP
  onboarding: true              # false = skip onboarding flow on first run
  shutdown_ceremony: true       # false = instant close, no animation
  journal: true                 # false = don't generate daily journals
  cockpit: true                 # false = hide CodeBurn cockpit dashboard
  recipes: true                 # false = hide recipe/process launcher
  chat: true                    # false = hide floating Claude chat composer
  
  # System
  system_metrics: true          # false = don't collect/display CPU/memory/load
  mcp_server: true              # false = don't start phantom-ai MCP server
  plugins: true                 # false = don't load any plugins
```

**Go implementation:**

```go
// internal/features/flags.go
type FeatureFlags struct {
    SmartView          bool `yaml:"smart_view" default:"true"`
    AIEngine           bool `yaml:"ai_engine" default:"true"`
    SafetyEngine       bool `yaml:"safety_engine" default:"true"`
    Gamification       bool `yaml:"gamification" default:"true"`
    // ... all flags with default:true
}

// Check before executing any feature path
func (f *FeatureFlags) IsEnabled(feature string) bool { ... }

// Hot-reloadable — config change → flag update → Wails event to UI
```

**Solid.js Settings UI:**

```
┌─ Settings ──────────────────────────────────────┐
│                                                  │
│  ⚙️ Features                                     │
│                                                  │
│  AI Engine                              [■ ON ]  │
│  ├─ Tiered Pipeline                     [■ ON ]  │
│  ├─ Model Routing (Opus/Sonnet/Haiku)   [■ ON ]  │
│  └─ Auto-Refine                         [■ ON ]  │
│                                                  │
│  Safety Rules                           [■ ON ]  │
│  ├─ Audit Trail                         [■ ON ]  │
│  └─ Admin Dashboard                     [■ ON ]  │
│                                                  │
│  Smart View                             [■ ON ]  │
│  Session Controls                       [■ ON ]  │
│  ├─ Cost Tracking                       [■ ON ]  │
│  ├─ Pause/Resume                        [■ ON ]  │
│  ├─ Branching                           [■ ON ]  │
│  └─ Rewind                              [■ ON ]  │
│                                                  │
│  Gamification                           [■ ON ]  │
│  Journal                                [■ ON ]  │
│  Cockpit Dashboard                      [■ ON ]  │
│                                                  │
│  [Reset to Defaults]                             │
└──────────────────────────────────────────────────┘
```

**Rules:**
- Parent toggle disables all children (AI Engine off → tiered pipeline, model routing, auto-refine all off)
- Child toggles are independent when parent is on
- Changes take effect immediately (hot-reload, no restart)
- Wails event pushes new flags to Solid → UI components use `Show` with feature check
- Disabled features don't run their goroutines — zero resource cost when off

### 14. Gamification — Ported from v1

All features retained: Hunter stats, achievements, quests, journal, XP, leveling, CodeBurn cockpit. Computed in background goroutines. **Enabled by default, disableable in Settings.**

---

## Data Model

### SQLite Schema

**Ported from v1** (column names preserved for migration):
- `projects`, `worktrees`, `pane_states`, `terminal_sessions`
- `chat_conversations`, `chat_messages`
- `user_preferences`
- `achievements`, `quests`, `hunter_stats`, `activity_log`
- `tasks` (with blocking/blocked-by)
- `worktree_sections`
- `graph_nodes`, `graph_edges`, `graph_meta` (graph persistence)

**New in v2:**
- `safety_rules` — rule definitions (cached from YAML)
- `safety_audit` — triggered rules + user responses
- `session_events` — parsed stream-json events (structured)
- `session_policies` — per-session policy config
- `model_routing_log` — model selection decisions
- `strategy_performance` — enhanced with model info

**DB layer:** `sqlc` — write SQL, generate type-safe Go code. No ORM. v1 column names preserved exactly for migration compatibility.

**Migration:** `golang-migrate/migrate` with versioned SQL files. v1 phantom.db imported on first v2 launch.

---

## Go Project Structure

```
phantom-os-v2/
├── cmd/
│   └── phantomos/
│       └── main.go                  # Wails app entry, bindings registration
├── internal/
│   ├── app/
│   │   ├── bindings_sessions.go     # Wails bindings: sessions (split by domain)
│   │   ├── bindings_git.go          # Wails bindings: git operations
│   │   ├── bindings_projects.go     # Wails bindings: project management
│   │   ├── bindings_safety.go       # Wails bindings: safety rules
│   │   ├── bindings_ai.go           # Wails bindings: AI engine
│   │   └── events.go               # Wails event emission helpers
│   ├── terminal/
│   │   ├── manager.go               # PTY lifecycle (creack/pty)
│   │   ├── session.go               # Per-session goroutine + context.Context
│   │   └── restore.go               # Cold restore from SQLite
│   ├── collector/                   # Session discovery (filesystem watchers)
│   │   ├── session_watcher.go       # Watches ~/.claude/projects/ for JSONL
│   │   ├── jsonl_scanner.go         # Parses Claude session JSONL files
│   │   ├── activity_poller.go       # Periodic activity scan
│   │   ├── task_watcher.go          # Task state changes
│   │   └── todo_watcher.go          # Todo file monitoring
│   ├── git/
│   │   ├── pool.go                  # Goroutine pool (configurable concurrency)
│   │   ├── worktree.go              # Worktree CRUD
│   │   ├── status.go                # Parallel status across worktrees
│   │   └── operations.go            # Checkout, merge, branch, etc.
│   ├── ai/
│   │   ├── engine.go                # Tiered orchestrator
│   │   ├── tier.go                  # Complexity classifier
│   │   ├── router.go                # Model routing (Opus/Sonnet/Haiku)
│   │   ├── strategies/              # All 6 strategies
│   │   ├── graph/                   # In-memory code graph + persistence
│   │   ├── knowledge/               # Knowledge DB + repositories
│   │   └── evaluator/               # Single + multi-perspective evaluator
│   ├── stream/
│   │   ├── parser.go                # Claude stream-json parser
│   │   ├── events.go                # Typed event structs
│   │   └── hub.go                   # WebSocket broadcast hub (multiplexed)
│   ├── safety/
│   │   ├── engine.go                # Rule evaluation engine
│   │   ├── rules.go                 # YAML loading + hot-reload + validation
│   │   ├── scanner.go               # PII/pattern detection + allowlists
│   │   ├── ratelimit.go             # Sliding window counters
│   │   └── audit.go                 # Audit trail writer
│   ├── session/
│   │   ├── controller.go            # Pause, resume, kill
│   │   ├── policy.go                # Supervised/auto-accept/smart
│   │   └── cost.go                  # Token counting from stream
│   ├── mcp/
│   │   ├── server.go                # MCP stdio server
│   │   └── handlers.go              # graph_context, blast_radius, orchestrator
│   ├── chat/
│   │   ├── manager.go               # Chat via provider.Chat() — provider-agnostic
│   │   └── history.go               # Conversation persistence
│   ├── db/
│   │   ├── sqlite.go                # Connection setup (WAL mode)
│   │   ├── migrations/              # Versioned SQL files
│   │   ├── queries/                 # sqlc SQL files
│   │   └── models.go                # sqlc-generated Go types
│   ├── project/
│   │   ├── detector.go              # Project type detection (goroutine)
│   │   ├── registry.go              # Process registry (recipes)
│   │   └── enrichment.go            # Graph build queue
│   ├── gamification/
│   │   ├── hunter.go
│   │   ├── achievements.go
│   │   ├── quests.go
│   │   └── journal.go
│   ├── provider/
│   │   ├── provider.go              # Provider interface + normalized types
│   │   ├── registry.go              # Provider registration + switching
│   │   ├── claude/
│   │   │   ├── claude.go            # Claude CLI provider implementation
│   │   │   ├── parser.go            # stream-json → StreamEvent
│   │   │   ├── discovery.go         # ~/.claude/ session JSONL scanner
│   │   │   └── integration.go       # CLAUDE.md management, PreToolUse hooks
│   │   └── local/
│   │       └── ollama.go            # Local model provider (future)
│   └── plugin/
│       ├── registry.go              # Explicit registration (not init())
│       └── interfaces.go            # All extension point interfaces
├── frontend/                        # Solid.js + TypeScript
│   ├── src/                         # (see component architecture above)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── build/                           # Wails build config
├── wails.json
├── go.mod
├── go.sum
├── sqlc.yaml                        # sqlc configuration
└── Makefile
```

**Key fixes from validation:**
- `internal/collector/` added — session discovery is core
- `internal/mcp/` added — phantom-ai MCP server
- `internal/chat/` added — Claude chat feature
- `internal/claude/` added — CLAUDE.md integration
- `internal/project/enrichment.go` added — graph build queue
- Bindings split by domain (not a single god file)
- Plugin registration is explicit (not fragile `init()` ordering)
- All goroutines use `context.Context` for lifecycle management

---

## Performance Targets

| Metric | v1 (measured) | v2 (target) |
|---|---|---|
| Startup time | 3-5s | <1s |
| Git status (5 worktrees) | ~2.5s sequential | <500ms parallel |
| Terminal input latency | ~15ms | <5ms |
| Memory (idle) | ~400MB (Electron + Node) | **<100MB** (Wails WebKit + Go) |
| Binary size (Go only) | N/A | ~15-20MB |
| Total app bundle | ~150MB (Electron) | ~30-40MB (Go + frontend assets) |
| Concurrent sessions | 2-3 before lag | 10+ without degradation |
| AI engine (fast path) | ~200ms full pipeline | <50ms (local classification only, no LLM RTT) |
| Stream parse latency | N/A (raw bytes) | <10ms per event |
| Solid.js rerender | N/A | **~0 rerenders** — signals update DOM directly |

---

## Tech Stack (Latest — April 2026)

### Go Backend

| Package | Version | Purpose |
|---|---|---|
| `github.com/wailsapp/wails/v2` | v2.9+ | Desktop shell + JS bindings |
| `github.com/creack/pty` | v1.1+ | Terminal PTY management |
| `modernc.org/sqlite` | latest | SQLite (pure Go, no CGo). Fallback: `mattn/go-sqlite3` if perf needed |
| `nhooyr.io/websocket` | v1.8+ | WebSocket — **replaces gorilla/websocket** (archived). Modern, `context.Context`-native, smaller API |
| `github.com/fsnotify/fsnotify` | v1.8+ | File watching (collectors, safety rules hot-reload) |
| `github.com/charmbracelet/log` | latest | Structured logging with color |
| `github.com/knadh/koanf/v2` | latest | Config management — **replaces viper** (lighter, no global state, better for testing) |
| `github.com/golang-migrate/migrate/v4` | v4 | Database schema migrations |
| `github.com/sqlc-dev/sqlc` | latest | Generate type-safe Go from SQL (build-time tool) |
| `github.com/hashicorp/go-plugin` | latest | Out-of-process plugin system (Phase 9) |
| `connectrpc.com/connect` | latest | Optional: typed RPC if Wails bindings hit limits |
| `github.com/sourcegraph/conc` | latest | Structured concurrency — goroutine pool, fan-out, error groups. Safer than raw goroutines |
| `github.com/smacker/go-tree-sitter` | latest | Multi-language AST parsing — shared between graph builder and Monaco syntax highlighting. Replaces regex parsers |

### Solid.js Frontend

| Package | Version | Purpose |
|---|---|---|
| `solid-js` | 1.9+ | UI framework (~2KB runtime, fine-grained reactivity) |
| `@solidjs/router` | latest | Client-side routing (pane navigation) |
| `@kobalte/core` | latest | Headless accessible components (dialog, popover, menu, etc.) |
| `@vanilla-extract/css` | latest | Compile-time CSS, type-safe design tokens, zero runtime |
| `@xterm/xterm` + `@xterm/addon-webgl` | 5.x | Terminal emulator (WebGL-accelerated, framework-agnostic) |
| `monaco-editor` | latest | Code editor (framework-agnostic) |
| `vite` | 8.x | Build tooling (Rolldown — Rust-based unified bundler, 10-30x faster builds) |
| `vite-plugin-solid` | latest | Solid.js Vite integration |
| `@solidjs/testing-library` | latest | Component testing |
| `vitest` | latest | Test runner |
| `@tanstack/solid-virtual` | latest | Virtualized lists (session history, file explorer) |
| `solid-motionone` | latest | Animations (pane transitions, Solo Leveling effects) |
| `@solid-primitives/event-listener` | latest | Wails event subscription helpers |
| `@solid-primitives/storage` | latest | Persistent local storage signals |

---

## Migration Strategy

```
Phase 0 ─→ Phase 1 ─→ Phase 2 (parallel with 3)
                   ├─→ Phase 3 ─→ Phase 4a ─→ Phase 4b
                   │                            │
                   └─→ Phase 5 (after Phase 3) ─┘
                                                 │
                                           Phase 6 ─→ Phase 7
```

| Phase | Scope | Effort | Dependencies |
|---|---|---|---|
| **0: Shell** | Wails v2 + Solid.js + Vite. Empty desktop window renders "Hello Phantom." | 2-3 days | None |
| **1: Core** | SQLite (sqlc), project detector, worktree manager, terminal manager (creack/pty), **session collectors** (filesystem watchers). Frontend: basic session list + terminal pane. | 2-3 weeks | Phase 0 |
| **2: Git** | Goroutine pool, port all v1 git operations, parallel status dashboard. Frontend: sidebar git status, branch switcher, changes view. | 1-2 weeks | Phase 1 (worktree manager) |
| **3: Stream Parser + Smart View** | Go stream-json parser, WebSocket hub, Smart View components (tool call cards, diff viewer, thinking blocks, cost tracker). | 3-4 weeks | Phase 1 (terminal manager) |
| **4a: AI Engine (parity)** | Port all 6 strategies, graph, knowledge DB, evaluators exactly as v1. No new features. | 3-4 weeks | Phase 1 (SQLite) |
| **4b: AI Engine (enhance)** | Add tiered pipeline, model routing, parallel strategy execution. | 1-2 weeks | Phase 4a |
| **5: Safety Rules** | Rule engine, YAML loader, scanner, audit trail, hot-reload, dry-run mode. Frontend: alert modal, audit log viewer. | 2-3 weeks | Phase 3 (stream parser) |
| **6: Remaining** | 6a: Gamification (hunter, achievements, quests, journal). 6b: Chat (composer, history). 6c: Cockpit/stats. 6d: MCP server. 6e: Claude integration. 6f: Recipes/process registry. 6g: Plans discovery, slash commands. 6h: Onboarding flow. | 3-4 weeks | All above |
| **7: Distribution** | `go build`, DMG packaging (via Wails), code signing, auto-updater (Sparkle or custom). | 1-2 weeks | Phase 6 |

**Total (reduced scope): 17-25 weeks (4-6 months).**

**Frontend migration note:** Each phase includes the corresponding Solid.js components. Not a separate phase — Go feature + Solid UI ship together.

---

## Scope: Full Rewrite

**Nothing deferred.** All features included across phases. See individual plan docs for detailed breakdown:

- `plan-phase-0-shell.md` — Wails + Solid.js shell
- `plan-phase-1-core.md` — SQLite, terminal, collectors, project detection
- `plan-phase-2-git.md` — Parallel git operations + all new git features
- `plan-phase-3-smart-view.md` — Stream parser + Smart View UI
- `plan-phase-4-ai-engine.md` — Full AI engine with tiering + model routing
- `plan-phase-5-safety.md` — Safety rules engine + admin dashboard
- `plan-phase-6-session.md` — Session controller (pause, branch, rewind, orchestration)
- `plan-phase-7-features.md` — Gamification, chat, MCP, cockpit, recipes, onboarding
- `plan-phase-8-editor.md` — Rich editor (Monaco + inline blame + drag-drop)
- `plan-phase-9-plugins.md` — Extension system + go-plugin
- `plan-phase-10-distribution.md` — DMG, code signing, auto-updater

---

## Open Questions

1. **Wails v2 vs v3:** Start with v2. Keep thin adapter layer for future v3 migration.
2. **modernc.org/sqlite performance:** Pure Go is 2-5x slower than CGo. Benchmark AI engine graph queries early. Fallback: switch to `mattn/go-sqlite3` if needed (requires CGo).
3. **Shared types (Go ↔ Solid):** Wails auto-generates TS types from Go structs for bindings. WebSocket event types need manual sync — generate from shared schema or use `typeshare`.
4. **Testing strategy:** Go table-driven tests for core services. Solid component tests via `@solidjs/testing-library`. Minimum 80% coverage on safety rules engine.
5. **Error handling pattern:** All errors wrapped with context: `fmt.Errorf("terminal.Start: %w", err)`. Logged at service boundaries. Propagated to frontend as typed error events.
