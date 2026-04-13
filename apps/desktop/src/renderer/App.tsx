/**
 * PhantomOS App Shell
 * Two top-level tabs: Cockpit (gamification dashboard) and Worktree (editor/terminal/files).
 * Welcome page shown when Worktree tab is active but no worktree is selected.
 *
 * Layout:
 *   [Header]
 *   [TopTabBar: Cockpit | Worktree]
 *   Cockpit tab  -> full-width dashboard + sub-views (no sidebars)
 *   Worktree tab -> [LeftSidebar | Pane worktree or WelcomePage | RightSidebar]
 *   [Footer]
 *
 * @author Subash Karki
 */
import { AppShell, Group, Stack, Text } from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Flame, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { WorkspaceProvider, Workspace, switchWorkspaceAtom, activePaneAtom } from '@phantom-os/panes';
import { paneDefinitions, paneMenu } from './panes/registry';
import { unlockedCountAtom, refreshAchievementsAtom } from './atoms/achievements';
import { shutdownVisibleAtom } from './atoms/shutdown';
import { activeTopTabAtom, fontScaleAtom, sseConnectionAtom } from './atoms/system';
import { selectedFileAtom } from './atoms/fileExplorer';
import { activeWorktreeAtom, activeWorktreeIdAtom } from './atoms/worktrees';
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
import { HunterStatsView } from './components/hunter-stats/HunterStatsView';
import { SessionViewer } from './components/views/SessionViewer';
import { SystemPlayground } from './components/system/SystemPlayground';
import { WorktreeSidebar } from './components/sidebar/WorktreeSidebar';
import { RightSidebar } from './components/sidebar/RightSidebar';
import { useHunter } from './hooks/useHunter';
import { type Route, useRouter } from './hooks/useRouter';
import { useSessions } from './hooks/useSessions';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useSystemEvents } from './hooks/useSystemEvents';
import { SplashScreen } from './components/brand/SplashScreen';
import { ShutdownCeremony } from './components/brand/ShutdownCeremony';
import { QuickOpen } from './components/QuickOpen';
import { RecipeQuickLaunch } from './components/RecipeQuickLaunch';
import { generateMorningBrief } from './lib/api';

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
    case 'hunter-stats':
      return <HunterStatsView />;
    case 'session-viewer':
      return <SessionViewer />;
    case 'system':
      return <SystemPlayground />;
    default:
      return null;
  }
};

export const App = () => {
  // Establish SSE connection for live updates
  useSystemEvents();

  // Periodic backend health polling
  const { isConnected } = useHealthCheck();

  // Splash screen state
  const [splashDone, setSplashDone] = useState(false);
  const [splashStatus, setSplashStatus] = useState('Initializing The System...');
  const [bootSteps, setBootSteps] = useState<import('./components/brand/SplashScreen').BootStep[]>([
    { id: 'server', label: 'Starting server...', doneLabel: 'Server connected', status: 'running' },
    { id: 'workspace', label: 'Loading workspace...', doneLabel: 'Workspace loaded', status: 'pending' },
    { id: 'journal', label: 'Generating morning brief...', doneLabel: 'Morning brief ready', status: 'pending' },
  ]);

  const updateBootStep = (id: string, status: 'running' | 'done' | 'error') => {
    setBootSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  // Boot ceremony — step-by-step system checks
  useEffect(() => {
    if (isConnected && !splashDone) {
      let cancelled = false;

      // Ensure each step is visible for at least minMs before moving on
      const stepWithMinTime = async (fn: () => Promise<void>, minMs: number) => {
        const start = Date.now();
        await fn();
        const elapsed = Date.now() - start;
        if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
      };

      const runBoot = async () => {
        // Step 1: Server connected (already done — just show it)
        await stepWithMinTime(async () => {
          updateBootStep('server', 'done');
        }, 600);

        // Step 2: Load workspace
        updateBootStep('workspace', 'running');
        await stepWithMinTime(async () => {
          // Workspace loads via existing atoms — just a visual step
        }, 800);
        updateBootStep('workspace', 'done');

        // Step 3: Morning journal
        updateBootStep('journal', 'running');
        await stepWithMinTime(async () => {
          const today = new Date();
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          try {
            await generateMorningBrief(dateStr);
          } catch {
            // 409 or error — skip silently
          }
        }, 800);
        updateBootStep('journal', 'done');

        // All steps done — hold for a moment so user sees all ✓, then dismiss
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, 1000));
          setSplashStatus('Ready');
          setTimeout(() => setSplashDone(true), 500);
        }
      };

      // Safety timeout — don't block boot for more than 15s
      const safetyTimer = setTimeout(() => {
        if (!cancelled) {
          cancelled = true;
          setSplashStatus('Ready');
          setTimeout(() => setSplashDone(true), 400);
        }
      }, 15_000);

      runBoot().finally(() => clearTimeout(safetyTimer));

      return () => { cancelled = true; clearTimeout(safetyTimer); };
    }
  }, [isConnected, splashDone]);

  // Progressive status messages while loading
  useEffect(() => {
    if (splashDone) return;
    const t1 = setTimeout(() => {
      if (!isConnected) setSplashStatus('Starting server...');
    }, 2000);
    const t2 = setTimeout(() => {
      if (!isConnected) setSplashStatus('Almost ready...');
    }, 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isConnected, splashDone]);

  const { route, isCockpitSubRoute } = useRouter();
  const { profile } = useHunter();
  const { active } = useSessions();
  const fontScale = useAtomValue(fontScaleAtom);
  const sseState = useAtomValue(sseConnectionAtom);
  const activeTab = useAtomValue(activeTopTabAtom);
  const activeWorktree = useAtomValue(activeWorktreeAtom);
  const activeWsId = useAtomValue(activeWorktreeIdAtom);
  const achievementCount = useAtomValue(unlockedCountAtom);
  const refreshAchievements = useSetAtom(refreshAchievementsAtom);
  const [shutdownVisible, setShutdownVisible] = useAtom(shutdownVisibleAtom);

  // Listen for Cmd+Q intercept from Electron main process
  useEffect(() => {
    if (window.phantomOS?.on) {
      window.phantomOS.on('phantom:initiate-shutdown', () => {
        setShutdownVisible(true);
      });
    }
  }, [setShutdownVisible]);

  // Switch pane store when active worktree changes
  const switchWorkspace = useSetAtom(switchWorkspaceAtom);
  useEffect(() => {
    if (activeWsId) {
      switchWorkspace(activeWsId);
    }
  }, [activeWsId, switchWorkspace]);

  // Apply font scale to document root
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontScale}rem`;
  }, [fontScale]);

  // Initial achievements fetch
  useEffect(() => {
    refreshAchievements();
  }, [refreshAchievements]);

  // Sync active editor pane → file tree highlight (derive filePath to avoid excess re-renders)
  const activePane = useAtomValue(activePaneAtom);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const activePaneFilePath = (activePane?.kind === 'editor' || activePane?.kind === 'diff')
    ? ((activePane.data as Record<string, unknown>)?.filePath as string | undefined) ?? null
    : null;
  useEffect(() => {
    setSelectedFile(activePaneFilePath);
  }, [activePaneFilePath, setSelectedFile]);

  const isElectron = navigator.userAgent.includes('Electron');

  return (
    <WorkspaceProvider definitions={paneDefinitions}>
    <QuickOpen />
    <RecipeQuickLaunch />
    {shutdownVisible && (
      <ShutdownCeremony
        visible={shutdownVisible}
        onCancel={() => setShutdownVisible(false)}
        onQuit={() => { window.phantomOS?.invoke('phantom:quit'); }}
      />
    )}
    {!splashDone && (
      <SplashScreen visible={!splashDone} status={splashStatus} steps={bootSteps} />
    )}
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

        {/* SSE reconnecting banner */}
        {sseState === 'disconnected' && (
          <div style={{
            padding: '6px 16px',
            backgroundColor: 'var(--phantom-status-warning)',
            color: '#000',
            fontSize: '0.75rem',
            fontWeight: 600,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              backgroundColor: '#000',
              animation: 'pulse 1.5s infinite',
            }} />
            Reconnecting to The System...
          </div>
        )}

        <div style={{ height: `calc(100vh - 3.5rem - 2.5rem - 32px - ${sseState === 'disconnected' ? 28 : 0}px)`, overflow: 'hidden' }}>
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
            /* ── Worktree tab: sidebars + pane worktree or welcome page ── */
            <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
              <WorktreeSidebar />

              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                {activeWorktree ? (
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

              {activeWorktree && <RightSidebar />}
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
