/**
 * PhantomOS Pane Registry
 * @author Subash Karki
 *
 * Central registry mapping pane `kind` strings to their definitions.
 * Each pane type has: kind, title, icon, and a lazy-loaded component.
 */

import { lazy, Suspense, createElement } from 'react';
import type { PaneDefinition, Pane } from '@phantom-os/panes';
import { TerminalPane } from '@phantom-os/terminal';

// Lazy-load heavy pane types (terminal has its own loading overlay)
const EditorPane = lazy(() =>
  import('@phantom-os/editor').then((m) => ({ default: m.EditorPane })),
);
const WorktreeHome = lazy(() =>
  import('../components/WorktreeHome').then((m) => ({ default: m.WorktreeHome })),
);
const ChatPane = lazy(() =>
  import('../components/chat/ChatPane').then((m) => ({ default: m.ChatPane })),
);
const DiffPane = lazy(() =>
  import('@phantom-os/editor').then((m) => ({ default: m.DiffPane })),
);

const Loading = () =>
  createElement(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--phantom-text-muted)',
      },
    },
    'Loading...',
  );

// ---------------------------------------------------------------------------
// Pane definitions
// ---------------------------------------------------------------------------

export const paneDefinitions: Record<string, PaneDefinition> = {
  terminal: {
    kind: 'terminal',
    title: 'Terminal',
    icon: '▶',
    render: (pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(TerminalPane, {
          paneId: pane.id,
          cwd: pane.data?.cwd as string | undefined,
          initialCommand: pane.data?.initialCommand as string | undefined,
        }),
      ),
    defaultTitle: 'Terminal',
  },
  editor: {
    kind: 'editor',
    title: 'Editor',
    icon: '📝',
    render: (pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(EditorPane, { paneId: pane.id, ...pane.data }),
      ),
    defaultTitle: 'Editor',
  },
  chat: {
    kind: 'chat',
    title: 'Chat',
    icon: '💬',
    render: (pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(ChatPane, {
          paneId: pane.id,
          cwd: pane.data?.cwd as string | undefined,
        }),
      ),
    defaultTitle: 'Chat',
  },
  diff: {
    kind: 'diff',
    title: 'Diff',
    icon: '±',
    render: (pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(DiffPane, { paneId: pane.id, ...pane.data }),
      ),
    defaultTitle: 'Diff',
  },
  'workspace-home': {
    kind: 'workspace-home',
    title: 'Home',
    icon: '⬡',
    render: (_pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(WorktreeHome),
      ),
    defaultTitle: 'Home',
  },
};

// ---------------------------------------------------------------------------
// Pane menu items for the "+" dropdown
// ---------------------------------------------------------------------------

export const paneMenu = [
  { kind: 'terminal', label: 'Terminal', icon: '▶' },
  { kind: 'editor', label: 'Editor', icon: '📝' },
  { kind: 'chat', label: 'Chat', icon: '💬' },
];
