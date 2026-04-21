// PhantomOS v2 — App shell (Wave 1: Worktree Workspace layout)
// Author: Subash Karki

import { createSignal, createEffect, onMount, onCleanup, Show, untrack } from 'solid-js';
import { shadowMonarchDarkTheme } from './styles/theme.css';
import * as styles from './styles/app.css';
import * as shellStyles from './styles/app-shell.css';
import { bootstrapSessions } from './core/signals/sessions';
import { bootstrapProjects } from './core/signals/projects';
import { bootstrapApp, activeTopTab, activeWorktreeId } from './core/signals/app';
import { loadPref } from './core/signals/preferences';
import { initTheme, initFontStyle } from './core/signals/theme';
import { OnboardingFlow } from './screens/onboarding';
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

export function App() {
  const [ready, setReady] = createSignal(false);
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [bootingUp, setBootingUp] = createSignal(false);

  onMount(async () => {
    document.body.classList.add(shadowMonarchDarkTheme);

    const savedTheme = await loadPref('theme');
    if (savedTheme) initTheme(savedTheme);

    const savedFont = await loadPref('font_style');
    if (savedFont) initFontStyle(savedFont);

    const onboardingDone = await loadPref('onboarding_completed');
    if (!onboardingDone) setShowOnboarding(true);

    await waitForWails();
    bootstrapApp();
    bootstrapSessions();
    bootstrapProjects();
    setReady(true);

    const cleanupShortcuts = registerKeyboardShortcuts();
    onCleanup(cleanupShortcuts);
  });

  createEffect(() => {
    const wtId = activeWorktreeId();
    if (wtId) untrack(() => switchWorkspace(wtId));
  });

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    setBootingUp(true);
    playSound('reveal');
    setTimeout(() => setBootingUp(false), 1500);
  }

  return (
    <div class={styles.appShell}>
      <Show when={showOnboarding()}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Show>

      <Show when={bootingUp()}>
        <div class={styles.bootOverlay}>
          <div class={styles.bootSweepLine} />
        </div>
      </Show>

      <Show when={ready() && !showOnboarding()}>
        <SystemHeader />
        <TopTabBar />

        <div class={shellStyles.mainContent}>
          <Show when={activeTopTab() === 'system'}>
            <div class={shellStyles.systemPlaceholder}>
              System / Cockpit — coming soon
            </div>
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
