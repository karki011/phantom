# Workspace Home — "Hunter's Terminal"

**Date:** 2026-04-08
**Author:** Subash Karki
**Status:** Approved

## Problem

When a workspace is active in PhantomOS, the center area is an empty black void. Three issues compound this:
1. No creative default content — just an empty terminal pane (which itself fails due to WebSocket bug)
2. Last selected workspace is not persisted — app always opens to WelcomePage
3. Clicking files in the right sidebar does nothing (Monaco worker bug, now fixed)

## Scope

### 1. Auto-Restore Last Workspace

Persist `activeWorkspaceId` to localStorage. On app mount, restore it so the user lands in their last workspace instead of the WelcomePage.

**Files:**
- `apps/desktop/src/renderer/atoms/workspace.ts` — add localStorage persistence to `activeWorkspaceIdAtom`

### 2. Fix File Click -> Monaco Editor

With the `worker: { format: 'es' }` fix already in `electron.vite.config.ts`, verify that clicking files in `FilesView.tsx` now opens them in Monaco editor panes. If additional fixes are needed, address them.

**Files:**
- `apps/desktop/src/renderer/components/sidebar/FilesView.tsx` — verify click handler
- `packages/editor/src/LazyMonaco.tsx` — verify editor renders
- `packages/panes/src/core/store.ts` — verify `addPane('editor', ...)` works

### 3. WorkspaceHome Component

A new component shown as the default content of a workspace tab, replacing the auto-created empty terminal.

#### Layout

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│              [S]  S-RANK                             │
│           Shadow Monarch · Lv.100                   │
│           ═══════════ XP Progress ══════════        │
│                                                     │
│     ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│     │  Terminal  │  │  Editor   │  │  Recent   │    │
│     │   Ctrl+`  │  │  Ctrl+N   │  │  Files    │    │
│     └───────────┘  └───────────┘  └───────────┘    │
│                                                     │
│  ┌──── Git Status ───────────┐ ┌── Daily Quests ─┐ │
│  │ main  · 11 ahead          │ │ 3/4 complete    │ │
│  │ 0 staged · 0 modified     │ │ +45 XP avail    │ │
│  └───────────────────────────┘ └─────────────────┘ │
│                                                     │
│          "I alone level up."                        │
└─────────────────────────────────────────────────────┘
```

#### Section Details

**Rank Header**
- Rank letter (S, A, B, etc.) in Orbitron font with teal glow (`text-shadow` using `--phantom-accent-glow`)
- Title + Level on second line in JetBrains Mono, muted text
- XP progress bar: Mantine `Progress` component, teal fill, shows `xp / xpToNext`
- Data source: `useHunter()` hook -> `profile.rank`, `profile.level`, `profile.title`, `profile.xp`, `profile.xpToNext`

**Quick Actions**
- 3 cards in a `SimpleGrid cols={3}` (responsive: 1 col on narrow)
- Each card: Mantine `Paper` with icon (Lucide), label, keyboard shortcut in `Kbd`
- Click handler: `store.addPane(kind)` where kind = 'terminal' | 'editor'
- "Recent Files" card opens a dropdown/popover listing last 5 opened files (stored in localStorage per workspace)
- Hover: border glow effect using `--phantom-accent-glow`
- Cards use `--phantom-surface-card` background

**Info Cards**
- Two cards side by side in `SimpleGrid cols={2}`
- **Git Status Card:**
  - Branch name with colored dot (green = clean, orange = dirty)
  - Ahead/behind count
  - Staged + modified file counts
  - Data source: New IPC handler `phantom:git-status` that runs `git status --porcelain -b` on the workspace path
- **Daily Quests Card:**
  - Progress ring or bar showing completed/total
  - Available XP amount in gold (`--phantom-accent-gold`)
  - Data source: `useQuests()` hook

**Quote Footer**
- Random Solo Leveling quote from a static array
- Muted text (`--phantom-text-muted`), italic, centered
- Rotates on each component mount
- Examples: "I alone level up.", "Arise.", "The weak have no right to choose how they die.", "Every day I get stronger."

#### Integration

The `WorkspaceHome` component replaces the auto-created Terminal pane as the default content. Two approaches:

**Chosen approach:** Register `workspace-home` as a new pane kind in the pane registry. The initial state creates a tab with a `workspace-home` pane instead of a `terminal` pane. Users can close it and it won't come back — it's a one-time welcome.

**Files:**
- `apps/desktop/src/renderer/components/WorkspaceHome.tsx` — new component
- `apps/desktop/src/renderer/panes/registry.ts` — register `workspace-home` pane kind
- `packages/panes/src/core/store.ts` — change initial pane kind from `terminal` to `workspace-home`
- `apps/desktop/src/renderer/atoms/hunter.ts` — existing (read-only)
- `apps/desktop/src/renderer/lib/api.ts` — existing (read-only)
- `apps/desktop/src/main/ipc-handlers.ts` — add `phantom:git-status` IPC handler
- `apps/desktop/src/preload/api.ts` — expose `gitStatus(path)` method

#### Theme Compatibility

All colors use CSS custom properties. Works across CZ Dark, Cyberpunk, Nord, Dracula without any theme-specific code.

#### Solo Leveling Quotes

```ts
const QUOTES = [
  "I alone level up.",
  "Arise.",
  "The weak have no right to choose how they die.",
  "Every day I get stronger.",
  "I am the Shadow Monarch.",
  "The System has awakened.",
  "This is just the beginning.",
  "I will not run away anymore.",
];
```

## Non-Goals

- No animated particle effects (keep it clean and fast)
- No persistent "Recent Files" backend — localStorage only
- No drag-and-drop in the quick actions grid
- Git status does not auto-refresh (manual refresh or on focus)
