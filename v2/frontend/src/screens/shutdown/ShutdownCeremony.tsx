// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { APP_NAME_SPACED } from '@/core/branding';
import { playSound } from '@/core/audio/engine';
import { hideConfirmModal } from '@/core/signals/shutdown';
import { generateEndOfDay } from '@/core/bindings/journal';
import { getActiveSessions, killSession } from '@/core/bindings';
import type { ShutdownStats } from './shutdown-script';
import * as styles from './shutdown-ceremony.css';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface Step {
  id: string;
  label: string;
  doneLabel: string;
  status: StepStatus;
}

interface ShutdownCeremonyProps {
  stats?: ShutdownStats;
  onComplete: () => void;
}

const INITIAL_STEPS: Step[] = [
  { id: 'sessions', label: 'Closing active sessions...', doneLabel: 'Sessions closed', status: 'pending' },
  { id: 'journal', label: 'Generating end-of-day journal...', doneLabel: 'Journal generated', status: 'pending' },
  { id: 'services', label: 'Releasing core services...', doneLabel: 'Services released', status: 'pending' },
];

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '◉',
  done: '✓',
  error: '✗',
};

export function ShutdownCeremony(props: ShutdownCeremonyProps) {
  const [steps, setSteps] = createSignal<Step[]>(INITIAL_STEPS);
  const [phase, setPhase] = createSignal<'running' | 'done' | 'crt'>('running');
  const [crtPhase, setCrtPhase] = createSignal<'idle' | 'scan' | 'shrink' | 'dot' | 'fade'>('idle');
  const [black, setBlack] = createSignal(false);
  let cancelled = false;

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  function updateStep(id: string, status: StepStatus) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
  }

  async function runStep(id: string, fn: () => Promise<void>) {
    if (cancelled) return;
    updateStep(id, 'running');
    try {
      await fn();
      updateStep(id, 'done');
      try { playSound('droplet'); } catch {}
    } catch {
      updateStep(id, 'error');
    }
  }

  async function runCrt() {
    setPhase('crt');
    await sleep(300);

    setCrtPhase('scan');
    await sleep(400);

    setCrtPhase('shrink');
    await sleep(450);

    setCrtPhase('dot');
    await sleep(300);

    setCrtPhase('fade');
    await sleep(350);

    setBlack(true);
    await sleep(1000);
    if (!cancelled) props.onComplete();
  }

  onMount(async () => {
    hideConfirmModal();
    await sleep(300);

    const today = new Date().toISOString().slice(0, 10);

    await runStep('sessions', async () => {
      try {
        const active = await getActiveSessions();
        for (const session of active) {
          await killSession(session.id);
        }
      } catch {}
    });

    await runStep('journal', async () => {
      try { await generateEndOfDay(today); } catch {}
    });

    await runStep('services', () => sleep(400));

    setPhase('done');
    await sleep(800);
    runCrt();
  });

  onCleanup(() => {
    cancelled = true;
  });

  const subtitle = () =>
    phase() === 'done' ? 'Powering off...'
    : phase() === 'running' ? 'Shutting down...'
    : '';

  const screenClass = () => {
    const classes = [styles.shutdownScreen];
    const crt = crtPhase();
    if (crt === 'shrink') classes.push(styles.crtPowerOff);
    else if (crt === 'dot') classes.push(styles.crtCollapseToDot);
    else if (crt === 'fade') classes.push(styles.crtCollapseToDot, styles.crtDotFadeOut);
    return classes.join(' ');
  };

  return (
    <Show when={!black()} fallback={<div class={styles.blackScreen} />}>
      <div class={screenClass()}>
        <div class={styles.flickerOverlay} />

        <Show when={crtPhase() === 'scan' || crtPhase() === 'shrink'}>
          <div class={styles.crtScanOverlay} />
        </Show>

        <Show when={crtPhase() === 'shrink' || crtPhase() === 'dot' || crtPhase() === 'fade'}>
          <div class={`${styles.crtGlowLine} ${styles.crtGlowLineVisible}`} />
        </Show>

        <div class={styles.terminalContainer}>
          <div class={styles.lineTitle}>{APP_NAME_SPACED}</div>

          <div class={styles.lineDim} style={{ 'margin-bottom': '20px', 'letter-spacing': '0.1em' }}>
            {subtitle()}
          </div>

          <For each={steps()}>
            {(step) => (
              <div class={styles.stepRow}>
                <span
                  class={styles.stepIcon}
                  classList={{
                    [styles.stepIconDone]: step.status === 'done',
                    [styles.stepIconRunning]: step.status === 'running',
                    [styles.stepIconError]: step.status === 'error',
                  }}
                >
                  {STEP_ICONS[step.status]}
                </span>
                <span
                  class={styles.stepLabel}
                  classList={{
                    [styles.stepLabelDone]: step.status === 'done',
                    [styles.stepLabelError]: step.status === 'error',
                  }}
                >
                  {step.status === 'done' ? step.doneLabel : step.label}
                </span>
              </div>
            )}
          </For>

          <Show when={props.stats && (props.stats.sessionCount > 0 || props.stats.totalTokens > 0)}>
            <div class={styles.separator} style={{ 'margin-top': '16px' }} />
            <div class={styles.lineDim} style={{ 'margin-top': '8px' }}>
              {[
                props.stats?.uptime ? `uptime ${props.stats.uptime}` : null,
                props.stats?.sessionCount ? `${props.stats.sessionCount} session${props.stats.sessionCount === 1 ? '' : 's'}` : null,
                props.stats?.totalTokens ? (
                  props.stats.totalTokens >= 1_000_000
                    ? `${(props.stats.totalTokens / 1_000_000).toFixed(1)}M tokens`
                    : props.stats.totalTokens >= 1_000
                      ? `${Math.round(props.stats.totalTokens / 1_000)}K tokens`
                      : `${props.stats.totalTokens} tokens`
                ) : null,
                props.stats?.totalCost ? `$${props.stats.totalCost.toFixed(2)}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
