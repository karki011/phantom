/**
 * PhantomOS App Shell
 * Main application layout with cockpit + hash-routed detail views
 *
 * @author Subash Karki
 */
import { AppShell, Group, Stack, Text } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { Flame, Trophy } from 'lucide-react';
import { useEffect } from 'react';

import { PaneRegistryProvider, TabBar, PaneLayout, usePanes } from '@phantom-os/panes';
import { paneDefinitions, paneMenu } from './pane-definitions';
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
import { useHunter } from './hooks/useHunter';
import { type Route, useRouter } from './hooks/useRouter';
import { useSessions } from './hooks/useSessions';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useSystemEvents } from './hooks/useSystemEvents';

/** Cockpit route renders the pane workspace (TabBar + PaneLayout) */
const CockpitPaneView = () => {
  const { getActiveTab, setSplitRatio } = usePanes();
  const tab = getActiveTab();

  if (!tab) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        // Map pane CSS custom properties to PhantomOS theme tokens
        '--pane-border': 'var(--phantom-border-subtle)',
        '--pane-header-bg': 'var(--phantom-surface-card)',
        '--tab-bar-bg': 'var(--phantom-surface-card)',
      } as React.CSSProperties}
    >
      <TabBar paneMenu={paneMenu} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PaneLayout
          layout={tab.layout}
          panes={tab.panes}
          onRatioChange={(node, ratio) => setSplitRatio(node, ratio)}
        />
      </div>
    </div>
  );
};

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

  return (
    <PaneRegistryProvider definitions={paneDefinitions}>
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

      {/* Main Content — hash-routed views */}
      <AppShell.Main>
        {route === 'cockpit' ? (
          <div style={{ height: 'calc(100vh - 3.5rem - 2.5rem)' }}>
            <ViewContent route={route} />
          </div>
        ) : (
          <Stack p="md" gap="lg">
            <ViewContent route={route} />
          </Stack>
        )}
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
    </PaneRegistryProvider>
  );
};
