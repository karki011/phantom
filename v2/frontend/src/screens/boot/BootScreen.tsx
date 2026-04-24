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
  nominalLine,
} from './boot-screen.css';

interface BootScreenProps {
  ready: () => boolean;
  onComplete: () => void;
}

export function BootScreen(props: BootScreenProps) {
  const [phase, setPhase] = createSignal<BootPhase>('BURST');
  const [scanResults, setScanResults] = createSignal<ScanResult[]>([]);
  const [confirmsDone, setConfirmsDone] = createSignal(false);
  const [showNominal, setShowNominal] = createSignal(false);
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
        <ConfirmationPanel
          lines={confirmLines}
          active={() => phase() === 'CONFIRM'}
          onAllShown={() => setConfirmsDone(true)}
        />
        <Show when={showNominal()}>
          <div class={nominalLine}>All systems nominal</div>
        </Show>
      </Show>
    </div>
  );
}
