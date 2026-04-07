/**
 * PhantomOS Pane Definitions
 * Maps pane kinds to their render functions.
 * @author Subash Karki
 */
import { lazy, Suspense } from 'react';
import type { PaneDefinition, Pane } from '@phantom-os/panes';
import { Cockpit } from './components/cockpit/Cockpit';
import { ActiveSessions } from './components/views/ActiveSessions';
import { TokenAnalytics } from './components/views/TokenAnalytics';
import { HunterProfile } from './components/views/HunterProfile';
import { AchievementsView } from './components/views/AchievementsView';
import { TaskHistory } from './components/views/TaskHistory';

// Lazy-load heavy pane types
const TerminalPane = lazy(() => import('@phantom-os/terminal').then(m => ({ default: m.TerminalPane })));
const EditorPane = lazy(() => import('@phantom-os/editor').then(m => ({ default: m.EditorPane })));

const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--phantom-text-muted)' }}>
    Loading...
  </div>
);

export const paneDefinitions: Record<string, PaneDefinition> = {
  dashboard: {
    render: () => <Cockpit />,
    defaultTitle: 'Dashboard',
  },
  sessions: {
    render: () => <ActiveSessions />,
    defaultTitle: 'Sessions',
  },
  tokens: {
    render: () => <TokenAnalytics />,
    defaultTitle: 'Tokens',
  },
  profile: {
    render: () => <HunterProfile />,
    defaultTitle: 'Profile',
  },
  achievements: {
    render: () => <AchievementsView />,
    defaultTitle: 'Achievements',
  },
  tasks: {
    render: () => <TaskHistory />,
    defaultTitle: 'Tasks',
  },
  terminal: {
    render: (pane: Pane) => (
      <Suspense fallback={<Loading />}>
        <TerminalPane paneId={pane.id} />
      </Suspense>
    ),
    defaultTitle: 'Terminal',
  },
  editor: {
    render: (pane: Pane) => (
      <Suspense fallback={<Loading />}>
        <EditorPane paneId={pane.id} {...pane.data} />
      </Suspense>
    ),
    defaultTitle: 'Editor',
  },
};

/** Available pane types for the "new pane" menu */
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
