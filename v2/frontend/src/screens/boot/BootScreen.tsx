// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { APP_NAME_SPACED } from '@/core/branding';
import { speak } from '@/core/audio/engine';
import { useBootAudio } from './use-boot-audio';
import { BootRings } from './BootRings';
import * as styles from './boot-screen.css';

interface BootScreenProps {
  ready: () => boolean;
  onComplete: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  if (hour >= 5 && hour < 8) return pick([
    'Early start. The best hunters rise before the world wakes.',
    'Dawn detected. Neural pathways sharpening.',
    'The early operator catches the cleanest builds.',
  ]);
  if (hour >= 8 && hour < 12) return pick([
    'Morning protocols engaged. Ready to hunt.',
    'A fresh cycle begins. What will you build today?',
    'Systems warm. Coffee recommended.',
  ]);
  if (hour >= 12 && hour < 14) return pick([
    'Midday checkpoint. Energy reserves holding.',
    'Afternoon shift initiated. Momentum is everything.',
  ]);
  if (hour >= 14 && hour < 17) return pick([
    'Deep focus window detected. Distractions suppressed.',
    'The afternoon push. Ship something great.',
    'Peak operational hours. All systems at your command.',
  ]);
  if (hour >= 17 && hour < 21) return pick([
    'Evening session. The quiet hours produce the best code.',
    'Night approaches. Some operators do their best work in the dark.',
    'Golden hour. The system is yours.',
  ]);
  return pick([
    'Late night detected. Respect the grind, Operator.',
    'The world sleeps. We do not.',
    'Night ops. Running dark. All systems quiet.',
    'Burning the midnight oil. The system stands with you.',
  ]);
}

export function BootScreen(props: BootScreenProps) {
  const [phase, setPhase] = createSignal<'greeting' | 'waiting' | 'done'>('greeting');
  const [dismissing, setDismissing] = createSignal(false);
  const [ringProgress, setRingProgress] = createSignal(0);
  const audio = useBootAudio();
  let cancelled = false;

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  const greeting = getGreeting();

  onMount(async () => {
    audio.onPhase('BURST');
    await sleep(400);
    await speak(greeting, 0.88, 0.8);
    setRingProgress(1);

    setPhase('waiting');

    while (!props.ready()) {
      if (cancelled) return;
      await sleep(100);
    }

    setRingProgress(2);
    await sleep(300);
    setRingProgress(3);

    setPhase('done');
    audio.nominalChime();

    await sleep(1500);
    if (cancelled) return;

    setDismissing(true);
    audio.onPhase('DISMISS');
    await sleep(500);
    if (!cancelled) props.onComplete();
  });

  onCleanup(() => {
    cancelled = true;
  });

  return (
    <div class={dismissing() ? styles.overlayDismiss : styles.overlay}>
      <BootRings progress={ringProgress()} total={3} />

      <div class={styles.title}>{APP_NAME_SPACED}</div>

      <div
        class={styles.subtitle}
        classList={{ [styles.subtitleSuccess]: phase() === 'done' }}
      >
        {phase() === 'done' ? greeting : 'Initializing...'}
      </div>
    </div>
  );
}
