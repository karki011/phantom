// Phantom — Pane type registry
// Author: Subash Karki

import { lazy, type Component } from 'solid-js';
import type { PaneType } from '@/core/panes/types';

const registry: Partial<Record<PaneType, Component<any>>> = {
  terminal: lazy(() => import('./TerminalPane')),
  // TUI programs (Bubbletea) render inside xterm.js — same component as terminal
  tui: lazy(() => import('./TerminalPane')),
  'native-terminal': lazy(() => import('./NativeTerminalPane')),
  home: lazy(() => import('./WorktreeHome')),
  editor: lazy(() => import('./FileViewer')),
  'composer': lazy(() => import('../composer/ComposerPaneV2')),
  notes: lazy(() => import('./NotesPane')),
  'port-killer': lazy(() => import('./PortKillerPane')),
};

export function getPaneComponent(kind: string): Component<any> | undefined {
  return registry[kind as PaneType];
}
