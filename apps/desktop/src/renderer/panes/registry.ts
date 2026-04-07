/**
 * PhantomOS Pane Registry
 * @author Subash Karki
 *
 * Central registry mapping pane `kind` strings to their definitions.
 * Each pane type has: kind, title, icon, and a lazy-loaded component.
 */

import { lazy, Suspense, createElement } from 'react';
import type { PaneDefinition, Pane } from '@phantom-os/panes';
import { Cockpit } from '../components/cockpit/Cockpit';
import { ActiveSessions } from '../components/views/ActiveSessions';
import { TokenAnalytics } from '../components/views/TokenAnalytics';
import { HunterProfile } from '../components/views/HunterProfile';
import { AchievementsView } from '../components/views/AchievementsView';
import { TaskHistory } from '../components/views/TaskHistory';

// Lazy-load heavy pane types
const TerminalPane = lazy(() =>
  import('@phantom-os/terminal').then((m) => ({ default: m.TerminalPane })),
);
const EditorPane = lazy(() =>
  import('@phantom-os/editor').then((m) => ({ default: m.EditorPane })),
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
  dashboard: {
    kind: 'dashboard',
    title: 'Dashboard',
    icon: '📊',
    render: () => createElement(Cockpit),
    defaultTitle: 'Dashboard',
    component: () => createElement(Cockpit),
  },
  sessions: {
    kind: 'sessions',
    title: 'Sessions',
    icon: '⚡',
    render: () => createElement(ActiveSessions),
    defaultTitle: 'Sessions',
    component: () => createElement(ActiveSessions),
  },
  tokens: {
    kind: 'tokens',
    title: 'Tokens',
    icon: '🪙',
    render: () => createElement(TokenAnalytics),
    defaultTitle: 'Tokens',
    component: () => createElement(TokenAnalytics),
  },
  profile: {
    kind: 'profile',
    title: 'Profile',
    icon: '🏆',
    render: () => createElement(HunterProfile),
    defaultTitle: 'Profile',
    component: () => createElement(HunterProfile),
  },
  achievements: {
    kind: 'achievements',
    title: 'Achievements',
    icon: '🎖',
    render: () => createElement(AchievementsView),
    defaultTitle: 'Achievements',
    component: () => createElement(AchievementsView),
  },
  tasks: {
    kind: 'tasks',
    title: 'Tasks',
    icon: '✅',
    render: () => createElement(TaskHistory),
    defaultTitle: 'Tasks',
    component: () => createElement(TaskHistory),
  },
  terminal: {
    kind: 'terminal',
    title: 'Terminal',
    icon: '▶',
    render: (pane: Pane) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(TerminalPane, { paneId: pane.id }),
      ),
    defaultTitle: 'Terminal',
    component: ({ pane }: { pane: Pane }) =>
      createElement(Suspense, { fallback: createElement(Loading) },
        createElement(TerminalPane, { paneId: pane.id }),
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
};

// ---------------------------------------------------------------------------
// Pane menu items for the "+" dropdown
// ---------------------------------------------------------------------------

export const paneMenu = [
  { kind: 'dashboard', label: 'Dashboard', icon: '📊' },
  { kind: 'sessions', label: 'Sessions', icon: '⚡' },
  { kind: 'tokens', label: 'Tokens', icon: '🪙' },
  { kind: 'tasks', label: 'Tasks', icon: '✅' },
  { kind: 'profile', label: 'Profile', icon: '🏆' },
  { kind: 'achievements', label: 'Achievements', icon: '🎖' },
  { kind: 'terminal', label: 'Terminal', icon: '▶' },
  { kind: 'editor', label: 'Editor', icon: '📝' },
];
