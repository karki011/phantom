// Phantom — App shell (Wave 1: Worktree Workspace layout)
// Author: Subash Karki

import { createSignal, createEffect, onMount, onCleanup, Show, untrack } from 'solid-js';

window.addEventListener('error', (e) => {
  if (e.message?.includes('ResizeObserver')) e.stopImmediatePropagation();
});
import { shadowMonarchDarkTheme } from './styles/theme.css';
import * as styles from './styles/app.css';
import * as shellStyles from './styles/app-shell.css';
import { isFullscreen, initFullscreenDetection, stopFullscreenDetection } from './core/signals/fullscreen';
import { bootstrapSessions } from './core/signals/sessions';
import { bootstrapProjects } from './core/signals/projects';
import { bootstrapApp, activeTopTab, activeWorktreeId, restoreActiveTopTab } from './core/signals/app';
import { worktreeMap, bootstrapWorktrees } from './core/signals/worktrees';
import { loadPref, getPref } from './core/signals/preferences';
import { startTour } from './core/tour/tour';
import { initTheme, initFontStyle } from './core/signals/theme';
import { initTerminalTheme } from './core/terminal/theme-manager';
import { initTerminalPrefs } from './core/terminal/registry';
import { initZoom } from './core/signals/zoom';
import { initBrightness } from './core/signals/brightness';
import { loadComposerV2Pref, loadComposerPrefs } from './core/composer/preferences';
import { OnboardingFlow } from './screens/onboarding';
import { BootScreen } from './screens/boot';
import { ShutdownCeremony, ShutdownConfirmModal, type ShutdownStats } from './screens/shutdown';
import { playSound } from './core/audio/engine';
import { WindowDragStrip } from './components/layout/WindowDragStrip';
import { WorktreeSidebar, RightSidebar } from './components/sidebar';
import { Workspace } from './components/panes/Workspace';
import { switchWorkspace, bootstrapWorkspaceStates } from './core/panes/signals';
import { switchComposerWorkspace } from './core/composer/store';
import { registerKeyboardShortcuts } from './core/keyboard';
import { WelcomePage } from './components/WelcomePage';
import { waitForWails } from './core/bindings/ready';
import { ToastRegion } from './shared/Toast/Toast';
import { SettingsDialog } from './shared/SettingsDialog/SettingsDialog';
import { QuickOpen } from './shared/QuickOpen/QuickOpen';
import { SearchPanel } from './shared/SearchPanel/SearchPanel';
import { CommandPalette } from './shared/CommandPalette';
import { ShortcutSheet } from './shared/ShortcutSheet/ShortcutSheet';
import { WorktreeSwitcher } from './shared/WorktreeSwitcher';
import { RecipePicker } from './shared/RecipePicker';
import { AgentsOverlay } from './shared/AgentsOverlay';
import { McpManagerDialog } from './shared/McpManagerDialog';
import { PromptComposer } from './shared/PromptComposer';
import { composerVisible, closeComposer } from './core/signals/composer';
import { activeTab, activePaneId } from './core/panes/signals';
import { registerShutdownHandler, shutdownConfirmVisible } from './core/signals/shutdown';
import { generateMorningBrief } from './core/bindings/journal';
import { DocsScreen } from './screens/docs';
import { SystemCockpit } from './screens/system/SystemCockpit';
import { bootstrapMCPRegistrationListener } from './core/signals/mcp';
import { AICommandCenter } from './components/ai-command-center/AICommandCenter';
import ComposerDrawer from './components/composer/ComposerDrawer';
import ComposerStatusPill from './components/composer/ComposerStatusPill';
import { DigestDrawer } from './shared/DigestDrawer/DigestDrawer';
import { PerfOverlay } from './components/PerfOverlay/PerfOverlay';
import { bootstrapProjectNotes } from './core/signals/notes';

export function App() {
  const [ready, setReady] = createSignal(false);
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [bootingUp, setBootingUp] = createSignal(false);
  const [bootCeremonyDone, setBootCeremonyDone] = createSignal(false);
  const [shuttingDown, setShuttingDown] = createSignal(false);
  const [shutdownStats, setShutdownStats] = createSignal<ShutdownStats | undefined>();
  const [showPerf, setShowPerf] = createSignal(
    localStorage.getItem('phantom.perf') === '1' || new URLSearchParams(window.location.search).has('perf'),
  );

  // Listen for perf overlay toggle from Settings
  const perfToggleHandler = () => setShowPerf(localStorage.getItem('phantom.perf') === '1');
  window.addEventListener('phantom:perf-toggle', perfToggleHandler);
  onCleanup(() => window.removeEventListener('phantom:perf-toggle', perfToggleHandler));

  onMount(async () => {
    document.body.classList.add(shadowMonarchDarkTheme);

    await waitForWails();

    // Sync native-terminal feature flag so pane routing in signals.ts is
    // correct before any tab is created.
    try {
      const { nativeTerminalIsEnabled } = await import('@/core/bindings/native-terminal');
      const { setNativeTerminalFlagCached } = await import('@/core/panes/signals');
      setNativeTerminalFlagCached(await nativeTerminalIsEnabled());
    } catch {}

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
    bootstrapProjectNotes();

    // Restore persisted activeTopTab before first render
    await restoreActiveTopTab();

    // Toast surfaces for MCP self-heal failures (issue #10). Listener stays
    // active for the life of the app — registered before self-heal can fire
    // since the Go side's selfHealMCPRegistration runs in a goroutine kicked
    // off at Startup. Any race here is benign: the toast is informational and
    // self-heal also runs on every subsequent boot.
    bootstrapMCPRegistrationListener();

    // Pre-populate in-memory stateCache from DB so switching worktrees
    // is instant even for worktrees not yet visited this session.
    await bootstrapWorkspaceStates();

    // Restore the last-active worktree BEFORE flipping ready=true so the
    // initial render lands on the workspace instead of flashing WelcomePage.
    // Idempotent: WorktreeSidebar.onMount calls this again as a safety net.
    await bootstrapWorktrees();

    await loadComposerV2Pref();
    await loadComposerPrefs();

    // Load active provider config (for new session commands)
    const { loadActiveProvider } = await import('@/core/signals/active-provider');
    loadActiveProvider();

    // Fire morning brief generation in background so it's ready when user opens digest
    const today = new Date().toISOString().slice(0, 10);
    generateMorningBrief(today).catch(() => {});

    // Notify Go backend of window focus/blur so background pollers can throttle.
    // Use both window focus/blur (covers app-level) and visibilitychange (covers
    // WebView tab/minimize) for robustness in Wails WebKit.
    const handleFocus = () => window.go?.app?.App?.OnWindowFocused();
    const handleBlur = () => window.go?.app?.App?.OnWindowBlurred();
    const handleVisChange = () => {
      if (document.hidden) {
        window.go?.app?.App?.OnWindowBlurred();
      } else {
        window.go?.app?.App?.OnWindowFocused();
      }
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisChange);
    cleanupFocusListeners = () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisChange);
    };

    setReady(true);
  });

  // Register keyboard shortcuts synchronously so onCleanup works on HMR re-mount
  const cleanupShortcuts = registerKeyboardShortcuts();
  onCleanup(cleanupShortcuts);
  onCleanup(stopFullscreenDetection);

  // Window focus/blur listener cleanup — assigned inside onMount, called on teardown.
  let cleanupFocusListeners: (() => void) | undefined;
  onCleanup(() => cleanupFocusListeners?.());

  createEffect(() => {
    const wtId = activeWorktreeId();
    if (wtId) untrack(async () => {
      // bootstrapWorkspaceStates (called in onMount before bootstrapWorktrees)
      // pre-populates stateCache from DB so switchWorkspace restores the saved
      // layout automatically via the stateCache branch.
      //
      // switchWorkspace is always called so that previousWorktreeId / currentWorktreeId
      // bookkeeping stays correct. It will either restore from stateCache or
      // create the default Home tab when no state is saved.
      switchWorkspace(wtId);
      switchComposerWorkspace(wtId);
    });
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
      <SettingsDialog />
      <AICommandCenter />
      <QuickOpen />
      <SearchPanel />
      <CommandPalette />
      <AgentsOverlay />
      <ShortcutSheet />
      <WorktreeSwitcher />
      <RecipePicker />
      <McpManagerDialog />
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

      <DigestDrawer />
      <ComposerDrawer />
      <ComposerStatusPill />
      <Show when={showPerf()}>
        <PerfOverlay />
      </Show>
    </div>
  );
}
