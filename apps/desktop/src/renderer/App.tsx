/**
 * PhantomOS App Shell
 * Main application layout with sidebars + cockpit + hash-routed detail views
 *
 * Layout:
 *   [Header]
 *   [LeftSidebar | Main Content (flex: 1) | RightSidebar]
 *   [Footer]
 *
 * @author Subash Karki
 */
import { AppShell, Group, Stack, Text } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { Flame, Trophy } from 'lucide-react';
import { useEffect } from 'react';

import { WorkspaceProvider, Workspace } from '@phantom-os/panes';
import { paneDefinitions, paneMenu } from './panes/registry';
import { unlockedCountAtom, refreshAchievementsAtom } from './atoms/achievements';
import { fontScaleAtom } from './atoms/system';
import { SystemHeader } from './components/layout/SystemHeader';
import { ActiveSessions } from './components/views/ActiveSessions';
import { QuestHistory } from './components/views/QuestHistory';
import { TokenAnalytics } from './components/views/TokenAnalytics';
import { HunterProfile } from './components/views/HunterProfile';
import { StreakView } from './components/views/StreakView';
import { TaskHistory } from './components/views/TaskHistory';
import { AchievementsView } from './components/views/AchievementsView';
import { DailyQuestsView } from './components/views/DailyQuestsView';
import { WorkspaceSidebar } from './components/sidebar/WorkspaceSidebar';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { useHunter } from './hooks/useHunter';
import { type Route, useRouter } from './hooks/useRouter';
import { useSessions } from './hooks/useSessions';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useSystemEvents } from './hooks/useSystemEvents';

/** Cockpit route renders the pane workspace (TabBar + PaneLayout) */
const CockpitPaneView = () => (
  <Workspace
    paneMenu={paneMenu}
    style={{
      '--pane-border': 'var(--phantom-border-subtle)',
      '--pane-header-bg': 'var(--phantom-surface-card)',
      '--tab-bar-bg': 'var(--phantom-surface-card)',
    }}
  />
);

const ViewContent = ({ route }: { route: Route }) => {
  switch (route) {
    case 'cockpit':
      return <CockpitPaneView />;
    case 'sessions':
      return <ActiveSessions />;
    case 'history':
      return <QuestHistory />;
    case 'tokens':
      return <TokenAnalytics />;
    case 'profile':
      return <HunterProfile />;
    case 'streak':
      return <StreakView />;
    case 'tasks':
      return <TaskHistory />;
    case 'achievements':
      return <AchievementsView />;
    case 'quests':
      return <DailyQuestsView />;
  }
};

export const App = () => {
  // Establish SSE connection for live updates
  useSystemEvents();

  // Periodic backend health polling
  const { isConnected } = useHealthCheck();

  const { route } = useRouter();
  const { profile } = useHunter();
  const { active } = useSessions();
  const fontScale = useAtomValue(fontScaleAtom);
  const achievementCount = useAtomValue(unlockedCountAtom);
  const refreshAchievements = useSetAtom(refreshAchievementsAtom);

  // Apply font scale to document root
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}rem`;
  }, [fontScale]);

  // Initial achievements fetch
  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements]);

  const isElectron = navigator.userAgent.includes('Electron');
  const isCockpit = route === 'cockpit';

  return (
    <WorkspaceProvider definitions={paneDefinitions}>
    <AppShell
      header={{ height: '3.5rem' }}
      footer={{ height: '2.5rem' }}
      bg="var(--phantom-surface-bg)"
      data-testid="phantom-os-root"
    >
      {/* Header — in Electron, acts as titlebar with drag region */}
      <AppShell.Header
        bg="var(--phantom-surface-card)"
        style={isElectron ? {
          WebkitAppRegion: 'drag',
          paddingLeft: '5rem',
        } as React.CSSProperties : undefined}
      >
        <SystemHeader activeSessions={active.length} isConnected={isConnected} />
      </AppShell.Header>

      {/* Main area — sidebars + content in flexbox row */}
      <AppShell.Main>
        <div
          style={{
            display: 'flex',
            height: 'calc(100vh - 3.5rem - 2.5rem)',
            overflow: 'hidden',
          }}
        >
          {/* Left Sidebar — workspace list */}
          <WorkspaceSidebar />

          {/* Center content — flex: 1 */}
          <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
            {isCockpit ? (
              <div style={{ height: '100%' }}>
                <ViewContent route={route} />
              </div>
            ) : (
              <Stack p="md" gap="lg">
                <ViewContent route={route} />
              </Stack>
            )}
          </div>

          {/* Right Sidebar — file explorer (only on cockpit route) */}
          {isCockpit && <RightSidebar />}
        </div>
      </AppShell.Main>

      {/* Footer */}
      <AppShell.Footer bg="var(--phantom-surface-card)" p="xs">
        <Group justify="space-between" px="md" h="100%">
          <Group gap="xs">
            <Trophy
              size={14}
              aria-hidden="true"
              style={{ color: 'var(--phantom-accent-gold)' }}
            />
            <Text fz="0.75rem" c="var(--phantom-text-secondary)">
              {achievementCount} Achievement{achievementCount !== 1 ? 's' : ''} Unlocked
            </Text>
          </Group>
          <Group gap="xs">
            <Flame
              size={14}
              aria-hidden="true"
              style={{ color: 'var(--phantom-status-warning)' }}
            />
            <Text fz="0.75rem" c="var(--phantom-text-secondary)">
              {profile?.streakCurrent ?? 0} Day Streak
            </Text>
          </Group>
        </Group>
      </AppShell.Footer>
    </AppShell>
    </WorkspaceProvider>
  );
};
