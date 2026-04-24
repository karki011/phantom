// Author: Subash Karki

import { createSignal, createEffect, onMount, onCleanup, Show, For } from 'solid-js';
import { playSound } from '@/core/audio/engine';
import { bootScript, type BootCeremonyLine } from './boot-script';
import * as styles from './boot-ceremony.css';

interface BootCeremonyProps {
  ready: () => boolean;
  onComplete: () => void;
}

type LineStyle = 'normal' | 'title' | 'subtitle' | 'accent' | 'success' | 'dim' | 'separator';

export function BootCeremony(props: BootCeremonyProps) {
  const [lines, setLines] = createSignal<{ text: string; style: LineStyle }[]>([]);
  const [typing, setTyping] = createSignal(false);
  const [scriptDone, setScriptDone] = createSignal(false);
  const [dismissing, setDismissing] = createSignal(false);
  let cancelled = false;

  const styleMap: Record<LineStyle, string> = {
    normal: styles.lineNormal,
    title: styles.lineTitle,
    subtitle: styles.lineSubtitle,
    accent: styles.lineAccent,
    success: styles.lineSuccess,
    dim: styles.lineDim,
    separator: styles.separator,
  };

  function sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  async function typewriterLine(text: string, charDelay = 20) {
    setTyping(true);
    let current = '';
    let charCount = 0;
    for (const char of text) {
      if (cancelled) return;
      current += char;
      charCount++;
      setLines((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], text: current };
        return copy;
      });
      if (charCount % 4 === 0) {
        try { playSound('typing'); } catch {}
      }
      await sleep(charDelay + Math.random() * 15);
    }
    setTyping(false);
  }

  async function addLine(line: BootCeremonyLine) {
    if (cancelled) return;
    if (line.delay) await sleep(line.delay);

    if (line.style === 'separator') {
      setLines((prev) => [...prev, { text: '', style: 'separator' }]);
      return;
    }

    setLines((prev) => [...prev, { text: '', style: line.style ?? 'normal' }]);
    if (line.sound) {
      try { playSound(line.sound); } catch {}
    }
    await typewriterLine(line.text, line.charDelay ?? 20);
  }

  async function dismiss() {
    setDismissing(true);
    try { playSound('reveal'); } catch {}
    await sleep(1200);
    if (!cancelled) props.onComplete();
  }

  function checkReady() {
    if (scriptDone() && props.ready() && !dismissing()) {
      dismiss();
    }
  }

  createEffect(() => {
    if (props.ready()) checkReady();
  });

  onMount(async () => {
    await sleep(350);

    try { playSound('hum_start'); } catch {}

    for (const line of bootScript) {
      if (cancelled) return;
      await addLine(line);
    }

    setScriptDone(true);
    checkReady();
  });

  onCleanup(() => {
    cancelled = true;
    try { playSound('hum_stop'); } catch {}
  });

  return (
    <div class={`${styles.bootScreen} ${dismissing() ? styles.bootScreenDismiss : ''}`}>
      <div class={styles.flickerOverlay} />
      <div class={styles.terminalContainer}>
        <For each={lines()}>
          {(line, i) => (
            <Show
              when={line.style !== 'separator'}
              fallback={<div class={styles.separator} />}
            >
              <div class={styles.line}>
                <span class={styleMap[line.style]}>{line.text}</span>
                <Show when={i() === lines().length - 1 && typing()}>
                  <span class={styles.cursor}>_</span>
                </Show>
              </div>
            </Show>
          )}
        </For>

        <Show when={scriptDone() && !props.ready()}>
          <div class={styles.line}>
            <span class={`${styles.lineAccent} ${styles.waitingPulse}`}>Awaiting connection...</span>
          </div>
        </Show>
      </div>

      <Show when={dismissing()}>
        <div class={styles.sweepLine} />
      </Show>
    </div>
  );
}
