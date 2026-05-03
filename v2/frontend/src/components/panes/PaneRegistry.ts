// Phantom — Pane type registry
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
  journal: lazy(() => import('./JournalPane')),
  // Chat was replaced by Composer. Saved tabs that still reference `chat`
  // render a small redirect tile that one-click migrates them. Remove
  // this entry once we're confident no persisted sessions still carry
  // `kind: 'chat'`.
  chat: lazy(() => import('./ChatRedirect')),
  composer: lazy(() => import('./ComposerPane')),
  'markdown-preview': lazy(() => import('./MarkdownPreviewPane')),
  playground: lazy(() => import('./PlaygroundPane')),
};

export function getPaneComponent(kind: string): Component<any> | undefined {
  return registry[kind as PaneType];
}
