// PhantomOS v2 — App shell (Wave 1: Worktree Workspace layout)
// Author: Subash Karki

import { createSignal, createEffect, onMount, onCleanup, Show, untrack } from 'solid-js';
import { shadowMonarchDarkTheme } from './styles/theme.css';
import * as styles from './styles/app.css';
import * as shellStyles from './styles/app-shell.css';
import { isFullscreen, initFullscreenDetection, stopFullscreenDetection } from './core/signals/fullscreen';
import { bootstrapSessions } from './core/signals/sessions';
import { bootstrapWards } from './core/signals/wards';
import { bootstrapProjects } from './core/signals/projects';
import { bootstrapApp, activeTopTab, activeWorktreeId } from './core/signals/app';
import { worktreeMap } from './core/signals/worktrees';
import { loadPref, getPref } from './core/signals/preferences';
import { startTour } from './core/tour/tour';
import { initTheme, initFontStyle } from './core/signals/theme';
import { initTerminalTheme } from './core/terminal/theme-manager';
import { initTerminalPrefs } from './core/terminal/registry';
import { initZoom } from './core/signals/zoom';
import { initBrightness } from './core/signals/brightness';
import { OnboardingFlow } from './screens/onboarding';
import { BootScreen } from './screens/boot';
import { ShutdownCeremony, ShutdownConfirmModal, type ShutdownStats } from './screens/shutdown';
import { playSound } from './core/audio/engine';
import { WindowDragStrip } from './components/layout/WindowDragStrip';
import { WorktreeSidebar, RightSidebar } from './components/sidebar';
import { Workspace } from './components/panes/Workspace';
import { switchWorkspace } from './core/panes/signals';
import { registerKeyboardShortcuts } from './core/keyboard';
import { WelcomePage } from './components/WelcomePage';
import { waitForWails } from './core/bindings/ready';
import { ToastRegion } from './shared/Toast/Toast';
import { SettingsDialog } from './shared/SettingsDialog/SettingsDialog';
import { QuickOpen } from './shared/QuickOpen/QuickOpen';
import { CommandPalette } from './shared/CommandPalette';
import { RecipePicker } from './shared/RecipePicker';
import { ApprovalModal } from './shared/ApprovalModal/ApprovalModal';
import { PromptComposer } from './shared/PromptComposer';
import { composerVisible, closeComposer } from './core/signals/composer';
import { activeTab, activePaneId } from './core/panes/signals';
import { registerShutdownHandler, shutdownConfirmVisible } from './core/signals/shutdown';
import { generateMorningBrief } from './core/bindings/journal';
import { DocsScreen } from './screens/docs';
import { SystemCockpit } from './screens/system/SystemCockpit';
import { XPGainFloat, LevelUpCelebration, RankUpCelebration, AchievementToastWatcher } from './shared/Gamification';
import { bootstrapGamification } from './core/signals/gamification';
import { AICommandCenter } from './components/ai-command-center/AICommandCenter';

export function App() {
  const [ready, setReady] = createSignal(false);
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [bootingUp, setBootingUp] = createSignal(false);
  const [bootCeremonyDone, setBootCeremonyDone] = createSignal(false);
  const [shuttingDown, setShuttingDown] = createSignal(false);
  const [shutdownStats, setShutdownStats] = createSignal<ShutdownStats | undefined>();

  onMount(async () => {
    document.body.classList.add(shadowMonarchDarkTheme);

    await waitForWails();

    const savedTheme = await loadPref('theme');
    if (savedTheme) initTheme(savedTheme);

    const savedFont = await loadPref('font_style');
    if (savedFont) initFontStyle(savedFont);

    await initTerminalPrefs();
    await initTerminalTheme();
    await initZoom();
    await initBrightness();

    // Detect macOS fullscreen state for traffic light inset padding
    initFullscreenDetection();

    const onboardingDone = await loadPref('onboarding_completed');
    if (!onboardingDone) setShowOnboarding(true);
    await loadPref('tour_completed');

    bootstrapApp();
    bootstrapSessions();
    bootstrapProjects();

    const wardsEnabled = await loadPref('wards_enabled');
    if (wardsEnabled === 'true') bootstrapWards();

    const gamEnabled = await loadPref('gamification_enabled');
    if (gamEnabled !== 'false') bootstrapGamification();

    // Load active provider config (for new session commands)
    const { loadActiveProvider } = await import('@/core/signals/active-provider');
    loadActiveProvider();

    // Fire morning brief generation in background so it's ready when user opens digest
    const today = new Date().toISOString().slice(0, 10);
    generateMorningBrief(today).catch(() => {});

    setReady(true);
  });

  // Register keyboard shortcuts synchronously so onCleanup works on HMR re-mount
  const cleanupShortcuts = registerKeyboardShortcuts();
  onCleanup(cleanupShortcuts);
  onCleanup(stopFullscreenDetection);

  createEffect(() => {
    const wtId = activeWorktreeId();
    if (wtId) untrack(() => switchWorkspace(wtId));
  });

  createEffect(() => {
    if (ready() && !showOnboarding() && bootCeremonyDone() && !getPref('tour_completed')) {
      setTimeout(() => startTour(), 800);
    }
  });


  async function handleShutdown() {
    if (shuttingDown()) return;
    setShuttingDown(true);

    try {
      const raw = await window.go?.app.App.GetShutdownStats();
      if (raw) {
        setShutdownStats({
          sessionCount: raw.session_count ?? 0,
          totalTokens: raw.total_tokens ?? 0,
          totalCost: raw.total_cost ?? 0,
          uptime: raw.uptime ?? '',
        });
      }
    } catch {}
  }

  function handleShutdownComplete() {
    setTimeout(() => {
      window.go?.app.App.QuitApp();
    }, 800);
  }

  registerShutdownHandler(handleShutdown);

  // Pre-fetch shutdown stats when confirm modal opens so session count is visible
  createEffect(() => {
    if (!shutdownConfirmVisible()) return;
    (async () => {
      try {
        const raw = await window.go?.app.App.GetShutdownStats();
        if (raw) {
          setShutdownStats({
            sessionCount: raw.session_count ?? 0,
            totalTokens: raw.total_tokens ?? 0,
            totalCost: raw.total_cost ?? 0,
            uptime: raw.uptime ?? '',
          });
        }
      } catch {}
    })();
  });

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    setBootCeremonyDone(true);
    setBootingUp(true);
    playSound('reveal');
    setTimeout(() => setBootingUp(false), 1500);
  }

  // When not fullscreen, apply the trafficLightInset class to push header/tabBar
  // content right, clearing the macOS traffic light buttons.
  const shellClass = () =>
    isFullscreen() ? styles.appShell : `${styles.appShell} ${shellStyles.trafficLightInset}`;

  // The prompt composer is a terminal-input affordance — only meaningful when
  // the user is looking at a terminal-shaped pane on the worktree top-tab.
  const composerAllowed = () => {
    if (activeTopTab() !== 'worktree') return false;
    const kind = activeTab()?.panes[activePaneId()]?.kind;
    return kind === 'terminal' || kind === 'tui';
  };

  createEffect(() => {
    if (!composerAllowed() && composerVisible()) closeComposer();
  });

  return (
    <div class={shellClass()}>
      <ToastRegion />
      <AchievementToastWatcher />
      <XPGainFloat />
      <LevelUpCelebration />
      <RankUpCelebration />
      <ApprovalModal />
      <SettingsDialog />
      <AICommandCenter />
      <QuickOpen />
      <CommandPalette />
      <RecipePicker />
      <DocsScreen />
      <Show when={composerAllowed()}>
        <PromptComposer visible={composerVisible()} onClose={closeComposer} />
      </Show>
      <ShutdownConfirmModal sessionCount={shutdownStats()?.sessionCount} />

      <Show when={shuttingDown()}>
        <ShutdownCeremony stats={shutdownStats()} onComplete={handleShutdownComplete} />
      </Show>

      <Show when={showOnboarding()}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Show>

      <Show when={bootingUp()}>
        <div class={styles.bootOverlay}>
          <div class={styles.bootSweepLine} />
        </div>
      </Show>

      <Show when={!showOnboarding() && !bootCeremonyDone()}>
        <BootScreen ready={ready} onComplete={() => setBootCeremonyDone(true)} />
      </Show>

      <Show when={ready() && !showOnboarding() && bootCeremonyDone()}>
        <WindowDragStrip />

        <div class={shellStyles.mainContent}>
          <Show when={activeTopTab() === 'system'}>
            <SystemCockpit />
          </Show>

          <Show when={activeTopTab() === 'worktree'}>
            <div class={shellStyles.threeColumnLayout}>
              <WorktreeSidebar />

              <div class={shellStyles.centerWorkspace}>
                <Show when={activeWorktreeId()} fallback={<WelcomePage />}>
                  <Workspace />
                </Show>
              </div>

              <Show when={activeWorktreeId()}>
                <RightSidebar />
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
