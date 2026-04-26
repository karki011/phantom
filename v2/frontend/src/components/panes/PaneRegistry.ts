// PhantomOS v2 — Pane type registry
// Author: Subash Karki

import { lazy, type Component } from 'solid-js';
import type { PaneType } from '@/core/panes/types';

const registry: Partial<Record<PaneType, Component<any>>> = {
  terminal: lazy(() => import('./TerminalPane')),
  // TUI programs (Bubbletea) render inside xterm.js — same component as terminal
  tui: lazy(() => import('./TerminalPane')),
  home: lazy(() => import('./WorktreeHome')),
  editor: lazy(() => import('./EditorPane')),
  diff: lazy(() => import('./DiffPane')),
};

export function getPaneComponent(kind: string): Component<any> | undefined {
  return registry[kind as PaneType];
}
