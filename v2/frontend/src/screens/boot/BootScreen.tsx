import { createSignal, createEffect, onMount, Show } from 'solid-js';
import type { BootPhase } from './particle-math';
import type { ScanResult } from './scan-system';
import { runSystemScans } from './scan-system';
import { useBootAudio } from './use-boot-audio';
import { ParticleCanvas } from './ParticleCanvas';
import { ConfirmationPanel } from './ConfirmationPanel';
import {
  overlay,
  overlayDismiss,
  greetingLine,
  nominalLine,
} from './boot-screen.css';

interface BootScreenProps {
  ready: () => boolean;
  onComplete: () => void;
}

const GREETINGS_DAY = [
  'Systems primed. Ready for operations.',
  'An operator returns.',
  'All channels open. Standing by.',
  'Diagnostics clear. Awaiting command.',
  'Welcome back, Operator.',
];
const GREETINGS_NIGHT = [
  'Night ops protocol engaged.',
  'Running dark. All systems quiet.',
  'Late shift detected. Minimal lighting.',
  'Shadow mode active.',
  'The system never sleeps.',
];

function pickGreeting(): string {
  const hour = new Date().getHours();
  const pool = hour >= 6 && hour < 22 ? GREETINGS_DAY : GREETINGS_NIGHT;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function BootScreen(props: BootScreenProps) {
  const [phase, setPhase] = createSignal<BootPhase>('BURST');
  const [scanResults, setScanResults] = createSignal<ScanResult[]>([]);
  const [confirmsDone, setConfirmsDone] = createSignal(false);
  const [showNominal, setShowNominal] = createSignal(false);
  const [greeting] = createSignal(pickGreeting());
  const audio = useBootAudio();

  createEffect(() => {
    audio.onPhase(phase());
  });

  const confirmLines = (): ScanResult[] => [
    ...scanResults(),
    {
      label: 'System Core',
      detail: props.ready() ? '─── connected' : '─── reconnecting...',
      status: props.ready() ? 'success' : 'warning',
    },
  ];

  onMount(async () => {
    setTimeout(() => setPhase('CONVERGE'), 100);
    setTimeout(() => setPhase('CONFIRM'), 1000);

    const results = await runSystemScans();
    setScanResults(results);
  });

  createEffect(() => {
    if (phase() === 'CONFIRM' && confirmsDone() && props.ready()) {
      setShowNominal(true);
      audio.nominalChime();
      setTimeout(() => setPhase('DISMISS'), 800);
    }
  });

  createEffect(() => {
    if (phase() === 'DISMISS') {
      setTimeout(() => props.onComplete(), 500);
    }
  });

  return (
    <div class={phase() === 'DISMISS' ? overlayDismiss : overlay}>
      <ParticleCanvas phase={phase} />
      <Show when={phase() === 'CONFIRM' || phase() === 'DISMISS'}>
        <div class={greetingLine}>{greeting()}</div>
        <ConfirmationPanel
          lines={confirmLines}
          active={() => phase() === 'CONFIRM'}
          onAllShown={() => setConfirmsDone(true)}
          onLineShown={() => audio.scanBlip()}
        />
        <Show when={showNominal()}>
          <div class={nominalLine}>All systems nominal</div>
        </Show>
      </Show>
    </div>
  );
}
