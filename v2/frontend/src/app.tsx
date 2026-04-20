// PhantomOS v2 — App shell
// Author: Subash Karki

import { createSignal, onMount, Show, Switch, Match } from 'solid-js';
import { shadowMonarchDarkTheme } from './styles/theme.css';
import * as styles from './styles/app.css';
import { bootstrapSessions } from './core/signals/sessions';
import { loadPref } from './core/signals/preferences';
import { initTheme, initFontStyle } from './core/signals/theme';
import { activeScreen } from './core/signals/navigation';
import { healthCheck } from './core/bindings';
import { OnboardingFlow } from './screens/onboarding';
import { Settings } from './screens/settings';
import { StatusStrip, Dock, CommandPalette } from './chrome';
import { playSound } from './core/audio/engine';

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

    bootstrapSessions();
    setReady(true);
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
        <StatusStrip />

        <main class={styles.mainArea}>
          <Switch fallback={<div class={styles.screenPlaceholder}>Select a screen</div>}>
            <Match when={activeScreen() === 'command'}>
              <div class={styles.screenPlaceholder}>Command Center — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'settings'}>
              <Settings />
            </Match>
            <Match when={activeScreen() === 'smart-view'}>
              <div class={styles.screenPlaceholder}>Smart View — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'git-ops'}>
              <div class={styles.screenPlaceholder}>Git Ops — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'eagle-eye'}>
              <div class={styles.screenPlaceholder}>Eagle Eye — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'wards'}>
              <div class={styles.screenPlaceholder}>Wards — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'playground'}>
              <div class={styles.screenPlaceholder}>AI Playground — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'codeburn'}>
              <div class={styles.screenPlaceholder}>CodeBurn — coming soon</div>
            </Match>
            <Match when={activeScreen() === 'hunter'}>
              <div class={styles.screenPlaceholder}>Hunter Stats — coming soon</div>
            </Match>
          </Switch>
        </main>

        <Dock />
        <CommandPalette />
      </Show>
    </div>
  );
}
