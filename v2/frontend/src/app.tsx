// PhantomOS v2 — App shell (Wave 1: Worktree Workspace layout)
// Author: Subash Karki

import { createSignal, createEffect, onMount, onCleanup, Show, untrack } from 'solid-js';
import { shadowMonarchDarkTheme } from './styles/theme.css';
import * as styles from './styles/app.css';
import * as shellStyles from './styles/app-shell.css';
import { bootstrapSessions } from './core/signals/sessions';
import { bootstrapWards } from './core/signals/wards';
import { bootstrapProjects } from './core/signals/projects';
import { bootstrapApp, activeTopTab, activeWorktreeId } from './core/signals/app';
import { worktreeMap } from './core/signals/worktrees';
import { loadPref } from './core/signals/preferences';
import { initTheme, initFontStyle } from './core/signals/theme';
import { initTerminalTheme } from './core/terminal/theme-manager';
import { initTerminalPrefs } from './core/terminal/registry';
import { initZoom } from './core/signals/zoom';
import { OnboardingFlow } from './screens/onboarding';
import { BootScreen } from './screens/boot';
import { ShutdownCeremony, type ShutdownStats } from './screens/shutdown';
import { playSound } from './core/audio/engine';
import { SystemHeader } from './components/layout/SystemHeader';
import { TopTabBar } from './components/layout/TopTabBar';
import { StatusBar } from './components/layout/StatusBar';
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
import { registerShutdownHandler } from './core/signals/shutdown';
import { generateEndOfDay, generateMorningBrief } from './core/bindings/journal';
import { DocsScreen } from './screens/docs';
import { SystemCockpit } from './screens/system/SystemCockpit';

export function App() {
  const [ready, setReady] = createSignal(false);
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [bootingUp, setBootingUp] = createSignal(false);
  const [bootCeremonyDone, setBootCeremonyDone] = createSignal(false);
  const [shuttingDown, setShuttingDown] = createSignal(false);
  const [shutdownStats, setShutdownStats] = createSignal<ShutdownStats | undefined>();

  onMount(async () => {
    document.body.classList.add(shadowMonarchDarkTheme);

    const savedTheme = await loadPref('theme');
    if (savedTheme) initTheme(savedTheme);

    const savedFont = await loadPref('font_style');
    if (savedFont) initFontStyle(savedFont);

    await initTerminalPrefs();
    await initTerminalTheme();
    await initZoom();

    const onboardingDone = await loadPref('onboarding_completed');
    if (!onboardingDone) setShowOnboarding(true);

    await waitForWails();
    bootstrapApp();
    bootstrapSessions();
    bootstrapProjects();

    const wardsEnabled = await loadPref('wards_enabled');
    if (wardsEnabled === 'true') bootstrapWards();

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

  createEffect(() => {
    const wtId = activeWorktreeId();
    if (wtId) untrack(() => switchWorkspace(wtId));
  });


  async function handleShutdown() {
    if (shuttingDown()) return;
    // Fire EOD generation in background while ceremony plays
    const today = new Date().toISOString().slice(0, 10);
    generateEndOfDay(today).catch(() => {});

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
    setShuttingDown(true);
  }

  function handleShutdownComplete() {
    window.go?.app.App.QuitApp();
  }

  registerShutdownHandler(handleShutdown);

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    setBootCeremonyDone(true);
    setBootingUp(true);
    playSound('reveal');
    setTimeout(() => setBootingUp(false), 1500);
  }

  return (
    <div class={styles.appShell}>
      <ToastRegion />
      <ApprovalModal />
      <SettingsDialog />
      <QuickOpen />
      <CommandPalette />
      <RecipePicker />
      <DocsScreen />
      <PromptComposer visible={composerVisible()} onClose={closeComposer} />
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
        <SystemHeader />
        <TopTabBar />

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

        <StatusBar />
      </Show>
    </div>
  );
}
