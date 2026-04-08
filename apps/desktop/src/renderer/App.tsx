/**
 * PhantomOS App Shell
 * Two top-level tabs: Cockpit (gamification dashboard) and Workspace (editor/terminal/files).
 * Welcome page shown when Workspace tab is active but no workspace is selected.
 *
 * Layout:
 *   [Header]
 *   [TopTabBar: Cockpit | Workspace]
 *   Cockpit tab  -> full-width dashboard + sub-views (no sidebars)
 *   Workspace tab -> [LeftSidebar | Pane workspace or WelcomePage | RightSidebar]
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
import { activeTopTabAtom, fontScaleAtom } from './atoms/system';
import { activeWorkspaceAtom } from './atoms/workspaces';
import { Cockpit } from './components/cockpit/Cockpit';
import { TopTabBar } from './components/layout/TopTabBar';
import { SystemHeader } from './components/layout/SystemHeader';
import { WelcomePage } from './components/WelcomePage';
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

/** Render cockpit sub-route content (sessions, tokens, profile, etc.) */
const ViewContent = ({ route }: { route: Route }) => {
  switch (route) {
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
    default:
      return null;
  }
};

export const App = () => {
  // Establish SSE connection for live updates
  useSystemEvents();

  // Periodic backend health polling
  const { isConnected } = useHealthCheck();

  const { route, isCockpitSubRoute } = useRouter();
  const { profile } = useHunter();
  const { active } = useSessions();
  const fontScale = useAtomValue(fontScaleAtom);
  const activeTab = useAtomValue(activeTopTabAtom);
  const activeWorkspace = useAtomValue(activeWorkspaceAtom);
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

      {/* Main area — top tab bar + content */}
      <AppShell.Main>
        {/* Top-level tab bar */}
        <TopTabBar />

        <div style={{ height: 'calc(100vh - 3.5rem - 2.5rem - 32px)', overflow: 'hidden' }}>
          {activeTab === 'cockpit' ? (
            /* ── Cockpit tab: full-width, no sidebars ── */
            <div style={{ height: '100%', overflow: 'auto' }}>
              {isCockpitSubRoute ? (
                <Stack p="md" gap="lg">
                  <ViewContent route={route} />
                </Stack>
              ) : (
                <Stack p="md" gap="lg">
                  <Cockpit />
                </Stack>
              )}
            </div>
          ) : (
            /* ── Workspace tab: sidebars + pane workspace or welcome page ── */
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
              <WorkspaceSidebar />

              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                {activeWorkspace ? (
                  <Workspace
                    paneMenu={paneMenu}
                    style={{
                      '--pane-border': 'var(--phantom-border-subtle)',
                      '--pane-header-bg': 'var(--phantom-surface-card)',
                      '--tab-bar-bg': 'var(--phantom-surface-card)',
                    } as React.CSSProperties}
                  />
                ) : (
                  <WelcomePage />
                )}
              </div>

              {activeWorkspace && <RightSidebar />}
            </div>
          )}
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
