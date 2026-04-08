/**
 * PhantomOS Pane Registry
 * @author Subash Karki
 *
 * Central registry mapping pane `kind` strings to their definitions.
 * Each pane type has: kind, title, icon, and a lazy-loaded component.
 */

import { lazy, Suspense, createElement } from 'react';
import type { PaneDefinition, Pane } from '@phantom-os/panes';

// Lazy-load heavy pane types
const TerminalPane = lazy(() =>
  import('@phantom-os/terminal').then((m) => ({ default: m.TerminalPane })),
);
const EditorPane = lazy(() =>
  import('@phantom-os/editor').then((m) => ({ default: m.EditorPane })),
);
const WorkspaceHome = lazy(() =>
  import('../components/WorkspaceHome').then((m) => ({ default: m.WorkspaceHome })),
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
        createElement(TerminalPane, { paneId: pane.id, cwd: pane.data?.cwd as string | undefined }),
      ),
    defaultTitle: 'Terminal',
    component: ({ pane }: { pane: Pane }) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(TerminalPane, { paneId: pane.id, cwd: pane.data?.cwd as string | undefined }),
      ),
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
    component: ({ pane }: { pane: Pane }) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(EditorPane, { paneId: pane.id, ...pane.data }),
      ),
  },
  'workspace-home': {
    kind: 'workspace-home',
    title: 'Home',
    icon: '⬡',
    render: (_pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(WorkspaceHome),
      ),
    defaultTitle: 'Home',
    component: () =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(WorkspaceHome),
      ),
  },
};

// ---------------------------------------------------------------------------
// Pane menu items for the "+" dropdown
// ---------------------------------------------------------------------------

export const paneMenu = [
  { kind: 'terminal', label: 'Terminal', icon: '▶' },
  { kind: 'editor', label: 'Editor', icon: '📝' },
];
