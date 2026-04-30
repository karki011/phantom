// PhantomOS v2 — Command palette action registry
// Author: Subash Karki

import type { Component } from 'solid-js';
import {
  Terminal, SplitSquareHorizontal, SplitSquareVertical, X,
  Monitor, GitBranch, GitFork, Settings, FileSearch, BookOpen,
  Pause, Play, Square, Sun, Moon, ZoomIn, ZoomOut, RotateCcw,
  PenTool, Sidebar, PanelRight, LayoutGrid, Eye, Plug,
} from 'lucide-solid';

// === Pane signals ===
import { addTab, splitPane, activePaneId, switchWorkspace } from '@/core/panes/signals';

// === App signals ===
import { setActiveTopTab, activeWorktreeId } from '@/core/signals/app';

// === UI toggle signals ===
import { openSettings } from '@/core/signals/settings';
import { toggleQuickOpen } from '@/core/signals/quickopen';
import { toggleComposer } from '@/core/signals/composer';
import { toggleDocs } from '@/core/signals/docs';

// === Sidebar signals ===
import { leftSidebarCollapsed, setLeftSidebarCollapsed, worktreeMap, selectWorktree } from '@/core/signals/worktrees';
import { rightSidebarCollapsed, setRightSidebarCollapsed } from '@/core/signals/files';

// === Zoom signals ===
import { zoomIn, zoomOut, zoomReset, ZOOM_LEVELS, applyZoom } from '@/core/signals/zoom';

// === Theme signals ===
import { applyTheme, type ThemeId } from '@/core/signals/theme';

// === Session signals + bindings ===
import { activeSession, activeSessionId, forkSession } from '@/core/signals/sessions';
import { pauseSession, resumeSession, killSession } from '@/core/bindings/sessions';

// === MCP Manager ===
import { openMcpManager } from '@/core/signals/mcp';

// === Git bindings ===
import { gitFetch, gitPull, gitPush } from '@/core/bindings/git';

// === Projects ===
import { projects } from '@/core/signals/projects';

// ── Type Definitions ─────────────────────────────────────────────────────────

export type ActionCategory =
  | 'Terminal'
  | 'Navigation'
  | 'Git'
  | 'Session'
  | 'Worktree'
  | 'Theme'
  | 'Zoom'
  | 'System';

export interface CommandAction {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Category for grouping */
  category: ActionCategory;
  /** Lucide icon component */
  icon: Component<{ size?: number; class?: string }>;
  /** Keyboard shortcut hint (displayed as badge, e.g. "Cmd+T") */
  shortcut?: string;
  /** Execute this action */
  execute: () => void;
  /** Whether this action is currently available */
  enabled?: () => boolean;
  /** Search keywords (searched in addition to label) */
  keywords?: string[];
}

export type DynamicActionProvider = () => CommandAction[];

// ── Category Order ───────────────────────────────────────────────────────────

const CATEGORY_ORDER: ActionCategory[] = [
  'Terminal', 'Navigation', 'Git', 'Session', 'Worktree', 'Theme', 'Zoom', 'System',
];

// ── Static Actions ───────────────────────────────────────────────────────────

const TERMINAL_ACTIONS: CommandAction[] = [
  {
    id: 'terminal:new-tab',
    label: 'New Terminal Tab',
    category: 'Terminal',
    icon: Terminal,
    shortcut: '⌘T',
    execute: () => addTab('terminal'),
  },
  {
    id: 'terminal:split-right',
    label: 'Split Terminal Right',
    category: 'Terminal',
    icon: SplitSquareHorizontal,
    shortcut: '⌘\\',
    execute: () => {
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'vertical');
    },
  },
  {
    id: 'terminal:split-down',
    label: 'Split Terminal Down',
    category: 'Terminal',
    icon: SplitSquareVertical,
    shortcut: '⌘⇧\\',
    execute: () => {
      const paneId = activePaneId();
      if (paneId) splitPane(paneId, 'horizontal');
    },
  },
  {
    id: 'terminal:close-pane',
    label: 'Close Active Pane',
    category: 'Terminal',
    icon: X,
    execute: () => {
      const paneId = activePaneId();
      if (paneId) import('@/core/panes/signals').then((m) => m.closePane(paneId));
    },
  },
  {
    id: 'terminal:prompt-composer',
    label: 'Toggle Prompt Composer',
    category: 'Terminal',
    icon: PenTool,
    shortcut: '⌘I',
    execute: () => toggleComposer(),
  },
];

const NAVIGATION_ACTIONS: CommandAction[] = [
  {
    id: 'nav:system-tab',
    label: 'Switch to System Tab',
    category: 'Navigation',
    icon: Monitor,
    shortcut: '⌘1',
    execute: () => setActiveTopTab('system'),
  },
  {
    id: 'nav:worktree-tab',
    label: 'Switch to Worktree Tab',
    category: 'Navigation',
    icon: LayoutGrid,
    shortcut: '⌘2',
    execute: () => setActiveTopTab('worktree'),
  },
  {
    id: 'nav:open-settings',
    label: 'Open Settings',
    category: 'Navigation',
    icon: Settings,
    shortcut: '⌘,',
    execute: () => openSettings(),
  },
  {
    id: 'nav:quick-open',
    label: 'Quick Open File',
    category: 'Navigation',
    icon: FileSearch,
    shortcut: '⌘P',
    execute: () => toggleQuickOpen(),
  },
  {
    id: 'nav:open-docs',
    label: 'Open Documentation',
    category: 'Navigation',
    icon: BookOpen,
    execute: () => toggleDocs(),
  },
  {
    id: 'nav:toggle-left-sidebar',
    label: 'Toggle Left Sidebar',
    category: 'Navigation',
    icon: Sidebar,
    shortcut: '⌘B',
    execute: () => setLeftSidebarCollapsed(!leftSidebarCollapsed()),
  },
  {
    id: 'nav:toggle-right-sidebar',
    label: 'Toggle Right Sidebar',
    category: 'Navigation',
    icon: PanelRight,
    shortcut: '⌘⇧B',
    execute: () => setRightSidebarCollapsed(!rightSidebarCollapsed()),
  },
];

const GIT_ACTIONS: CommandAction[] = [
  {
    id: 'git:fetch',
    label: 'Git Fetch',
    category: 'Git',
    icon: GitBranch,
    keywords: ['git', 'fetch', 'remote', 'update'],
    enabled: () => !!activeWorktreeId(),
    execute: () => {
      const wtId = activeWorktreeId();
      if (wtId) void gitFetch(wtId);
    },
  },
  {
    id: 'git:pull',
    label: 'Git Pull',
    category: 'Git',
    icon: GitBranch,
    keywords: ['git', 'pull', 'merge', 'update'],
    enabled: () => !!activeWorktreeId(),
    execute: () => {
      const wtId = activeWorktreeId();
      if (wtId) void gitPull(wtId);
    },
  },
  {
    id: 'git:push',
    label: 'Git Push',
    category: 'Git',
    icon: GitBranch,
    keywords: ['git', 'push', 'remote', 'upload'],
    enabled: () => !!activeWorktreeId(),
    execute: () => {
      const wtId = activeWorktreeId();
      if (wtId) void gitPush(wtId);
    },
  },
  {
    id: 'git:toggle-blame',
    label: 'Toggle Git Blame',
    category: 'Git',
    icon: Eye,
    shortcut: '⌘⇧G',
    keywords: ['git', 'blame', 'annotate', 'author', 'history'],
    execute: () => {
      // Dispatch to the active Monaco editor's blame toggle action
      window.dispatchEvent(new CustomEvent('phantom:editor-toggle-blame'));
    },
  },
];

const SESSION_ACTIONS: CommandAction[] = [
  {
    id: 'session:pause',
    label: 'Pause Active Session',
    category: 'Session',
    icon: Pause,
    keywords: ['pause', 'session', 'stop', 'freeze'],
    enabled: () => activeSession()?.status === 'active',
    execute: () => {
      const id = activeSessionId();
      if (id) void pauseSession(id);
    },
  },
  {
    id: 'session:resume',
    label: 'Resume Session',
    category: 'Session',
    icon: Play,
    keywords: ['resume', 'session', 'continue', 'unpause'],
    enabled: () => activeSession()?.status === 'paused',
    execute: () => {
      const id = activeSessionId();
      if (id) void resumeSession(id);
    },
  },
  {
    id: 'session:kill',
    label: 'Kill Session',
    category: 'Session',
    icon: Square,
    keywords: ['kill', 'session', 'terminate', 'end'],
    enabled: () => {
      const s = activeSession();
      return s != null && s.status !== 'completed';
    },
    execute: () => {
      const id = activeSessionId();
      if (id) void killSession(id);
    },
  },
  {
    id: 'session:toggle-mcp-servers',
    label: 'Toggle MCP servers',
    category: 'Session',
    icon: Plug,
    keywords: ['mcp', 'model context protocol', 'servers', 'phantom-ai', 'integration', 'plugin'],
    execute: () => openMcpManager(),
  },
  {
    id: 'session:fork',
    label: 'Fork Session',
    category: 'Session',
    icon: GitFork,
    shortcut: '⌘⇧F',
    keywords: ['fork', 'session', 'clone', 'branch', 'duplicate'],
    enabled: () => activeSessionId() != null,
    execute: () => {
      const id = activeSessionId();
      if (id) void forkSession(id, '');
    },
  },
];

const ZOOM_ACTIONS: CommandAction[] = [
  {
    id: 'zoom:in',
    label: 'Zoom In',
    category: 'Zoom',
    icon: ZoomIn,
    shortcut: '⌘+',
    execute: () => zoomIn(),
  },
  {
    id: 'zoom:out',
    label: 'Zoom Out',
    category: 'Zoom',
    icon: ZoomOut,
    shortcut: '⌘-',
    execute: () => zoomOut(),
  },
  {
    id: 'zoom:reset',
    label: 'Reset Zoom',
    category: 'Zoom',
    icon: RotateCcw,
    shortcut: '⌘0',
    execute: () => zoomReset(),
  },
];

// ── Dynamic Action Providers ─────────────────────────────────────────────────

const THEME_LABELS: Record<ThemeId, string> = {
  'system-core-dark': 'System Core Dark',
  'system-core-light': 'System Core Light',
  'shadow-monarch-dark': 'Shadow Monarch Dark',
  'shadow-monarch-light': 'Shadow Monarch Light',
  'hunter-rank-dark': 'Hunter Rank Dark',
  'hunter-rank-light': 'Hunter Rank Light',
  'cz-dark': 'CloudZero Dark',
  'cz-light': 'CloudZero Light',
  'cyberpunk': 'Cyberpunk',
  'dracula': 'Dracula',
  'nord-dark': 'Nord Dark',
  'nord-light': 'Nord Light',
};

export const themeActions: DynamicActionProvider = (): CommandAction[] =>
  (Object.entries(THEME_LABELS) as [ThemeId, string][]).map(([id, label]) => ({
    id: `theme:${id}`,
    label: `Theme: ${label}`,
    category: 'Theme' as ActionCategory,
    icon: id.includes('light') ? Sun : Moon,
    keywords: ['theme', 'appearance', 'color', label.toLowerCase()],
    execute: () => applyTheme(id),
  }));

export const worktreeActions: DynamicActionProvider = (): CommandAction[] => {
  const allProjects = projects();
  const map = worktreeMap();
  const actions: CommandAction[] = [];

  for (const project of allProjects) {
    const worktrees = map[project.id] ?? [];
    for (const wt of worktrees) {
      actions.push({
        id: `worktree:${wt.id}`,
        label: `Switch to: ${project.name} / ${wt.branch}`,
        category: 'Worktree',
        icon: GitBranch,
        keywords: ['worktree', 'switch', project.name.toLowerCase(), wt.branch.toLowerCase()],
        execute: () => {
          selectWorktree(wt.id);
          switchWorkspace(wt.id);
          setActiveTopTab('worktree');
        },
      });
    }
  }

  return actions;
};

export const zoomLevelActions: DynamicActionProvider = (): CommandAction[] =>
  ZOOM_LEVELS.map((level) => ({
    id: `zoom:set-${level.id}`,
    label: `Zoom: ${level.label} (${Math.round(level.scale * 100)}%)`,
    category: 'Zoom' as ActionCategory,
    icon: ZoomIn,
    keywords: ['zoom', 'size', 'scale', level.label.toLowerCase()],
    execute: () => applyZoom(level.id),
  }));

// ── Sort Helper ──────────────────────────────────────────────────────────────

export const sortByCategory = (actions: CommandAction[]): CommandAction[] => {
  const order = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return [...actions].sort((a, b) => {
    const catDiff = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99);
    if (catDiff !== 0) return catDiff;
    return a.label.localeCompare(b.label);
  });
};

// ── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Returns all available actions: static + dynamic.
 * Called inside createMemo so dynamic providers are reactive.
 */
export const getAllActions = (): CommandAction[] => [
  ...TERMINAL_ACTIONS,
  ...NAVIGATION_ACTIONS,
  ...GIT_ACTIONS,
  ...SESSION_ACTIONS,
  ...ZOOM_ACTIONS,
  ...themeActions(),
  ...worktreeActions(),
  ...zoomLevelActions(),
];
