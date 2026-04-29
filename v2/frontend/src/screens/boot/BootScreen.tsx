// Author: Subash Karki

import { createSignal, onMount, onCleanup } from 'solid-js';
import { APP_NAME_SPACED } from '@/core/branding';
import { getGitUserName, getPreference } from '@/core/bindings';
import { useBootAudio } from './use-boot-audio';
import { BootRings } from './BootRings';
import { getGreeting } from './boot-greetings';
import { PhantomMark } from '@/shared/PhantomMark/PhantomMark';
import * as styles from './boot-screen.css';

const PHASE_SUBTITLE: Record<'greeting' | 'waiting' | 'done', string> = {
  greeting: 'Awakening Phantom Engine…',
  waiting: 'Initializing core services…',
  done: '',
};

interface BootScreenProps {
  ready: () => boolean;
  onComplete: () => void;
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

  const [greeting, setGreeting] = createSignal(getGreeting());

  onMount(async () => {
    audio.onPhase('BURST');

    const name = (await getPreference('operator_name')).trim()
      || (await getGitUserName()).trim();
    if (cancelled) return;
    setGreeting(getGreeting(name));

    await sleep(400);
    audio.ghostCall();
    await sleep(900);
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
      <div class={styles.inner}>
        <div class={styles.title}>{APP_NAME_SPACED}</div>

        <div class={styles.viz}>
          <BootRings progress={ringProgress()} total={3} />
          <div class={styles.markSlot}>
            <PhantomMark size={96} pulse active={phase() === 'done'} />
          </div>
        </div>

        <div
          class={styles.subtitle}
          classList={{ [styles.subtitleSuccess]: phase() === 'done' }}
        >
          {phase() === 'done' ? greeting() : PHASE_SUBTITLE[phase()]}
        </div>
      </div>
    </div>
  );
}
