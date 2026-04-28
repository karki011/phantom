// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { playSound } from '../../../core/audio/engine';
import { speakSystem, VOICE_TIMING } from '../config/voice';
import { setPref } from '../../../core/signals/preferences';
import { GlassPanel } from '../../../shared/GlassPanel/GlassPanel';
import { buttonRecipe } from '../../../styles/recipes.css';
import * as styles from '../styles/awakening.css';

interface AwakeningProps {
  data: Record<string, string>;
  onComplete: () => void;
}

type AuthorityPhase = 'hidden' | 'initializing' | 'granted';

const SUMMARY_LINES: Array<{ text: string; accent?: boolean }> = [
  { text: 'System bind successful.', accent: true },
  { text: 'Memory anchored.' },
  { text: 'Domain established.' },
  { text: 'Abilities unlocked.' },
];

export function Awakening(props: AwakeningProps) {
  const [summaryStep, setSummaryStep] = createSignal(0);
  const [authorityPhase, setAuthorityPhase] = createSignal<AuthorityPhase>('hidden');
  const [showHunterCard, setShowHunterCard] = createSignal(false);
  const [showCTA, setShowCTA] = createSignal(false);

  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  onCleanup(() => {
    cancelled = true;
    for (const id of timers) clearTimeout(id);
  });

  onMount(() => {

    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(id);
      return id;
    };

    const revealNextLine = () => {
      const step = summaryStep() + 1;
      setSummaryStep(step);
      if (step === 1) playSound('scan');

      if (step < SUMMARY_LINES.length) {
        schedule(revealNextLine, 500);
      } else {
        schedule(startAuthority, 1200);
      }
    };

    schedule(revealNextLine, 300);

    function startAuthority() {
      setAuthorityPhase('initializing');
      schedule(() => {
        setAuthorityPhase('granted');
        playSound('bass');
        speakSystem('Neural link. Synchronized.');

        schedule(() => {
          setShowHunterCard(true);
          schedule(() => {
            setShowCTA(true);
          }, 500);
        }, 1000);
      }, 1200);
    }
  });

  function handleEnter() {
    void setPref('onboarding_completed', 'true');
    playSound('ok');
    speakSystem('Your progression begins now.');
    const t = setTimeout(() => { if (!cancelled) props.onComplete(); }, 800);
    timers.push(t);
  }

  const operatorName = () => props.data.operator_name || 'Hunter';

  return (
    <div class={styles.awakeningContainer}>
      <div class={styles.summaryList}>
        <For each={SUMMARY_LINES}>
          {(line, index) => (
            <div
              class={styles.summaryLine}
              classList={{
                [styles.summaryLineVisible]: index() < summaryStep(),
                [styles.summaryLineAccent]: !!line.accent,
              }}
            >
              {line.text}
            </div>
          )}
        </For>
      </div>

      <Show when={authorityPhase() !== 'hidden'}>
        <div
          class={styles.authorityLine}
          classList={{ [styles.authorityGranted]: authorityPhase() === 'granted' }}
        >
          {authorityPhase() === 'initializing'
            ? 'Neural link: synchronizing...'
            : 'NEURAL LINK: SYNCHRONIZED'}
        </div>
      </Show>

      <div
        class={styles.hunterCard}
        classList={{ [styles.hunterCardVisible]: showHunterCard() }}
      >
        <div class={styles.hunterName}>{operatorName()}</div>
        <div class={styles.hunterStats}>
          <div class={styles.hunterStat}>
            <span class={styles.hunterStatLabel}>Level</span>
            <span class={styles.hunterStatValue}>1</span>
          </div>
          <div class={styles.hunterStat}>
            <span class={styles.hunterStatLabel}>XP</span>
            <span class={styles.hunterStatValue}>0 / 100</span>
          </div>
          <div class={styles.hunterStat}>
            <span class={styles.hunterStatLabel}>Streak</span>
            <span class={styles.hunterStatValue}>0 days</span>
          </div>
        </div>
        <div class={styles.hunterObjective}>
          Daily Objective: Complete your first agent session
        </div>
      </div>

      <Show when={showCTA()}>
        <div class={styles.continueRow}>
          <button class={styles.enterButton} onClick={handleEnter}>
            Enter System
          </button>
        </div>
      </Show>
    </div>
  );
}
