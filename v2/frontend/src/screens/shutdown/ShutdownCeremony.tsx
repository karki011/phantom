// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import { playSound } from '@/core/audio/engine';
import { buildShutdownScript, type ShutdownLine, type ShutdownStats } from './shutdown-script';
import * as styles from './shutdown-ceremony.css';

type LineStyle = 'normal' | 'title' | 'subtitle' | 'accent' | 'success' | 'dim' | 'separator';

interface ShutdownCeremonyProps {
  stats?: ShutdownStats;
  onComplete: () => void;
}

export function ShutdownCeremony(props: ShutdownCeremonyProps) {
  const [lines, setLines] = createSignal<{ text: string; style: LineStyle }[]>([]);
  const [typing, setTyping] = createSignal(false);
  const [dismissing, setDismissing] = createSignal(false);
  const [black, setBlack] = createSignal(false);
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
    if (!text.length) return;
    setTyping(true);
    const avgDelay = charDelay + 8;

    return new Promise<void>((resolve) => {
      const start = Date.now();
      let rendered = 0;

      const tick = () => {
        if (cancelled) { setTyping(false); resolve(); return; }

        const target = Math.min(text.length, Math.floor((Date.now() - start) / avgDelay) + 1);
        if (target > rendered) {
          rendered = target;
          setLines((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], text: text.slice(0, rendered) };
            return copy;
          });
          try { playSound('typing'); } catch {}
        }

        if (rendered >= text.length) {
          setTyping(false);
          resolve();
        } else {
          setTimeout(tick, avgDelay);
        }
      };

      tick();
    });
  }

  async function addLine(line: ShutdownLine) {
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
    try { playSound('hum_stop'); } catch {}
    await sleep(1800);
    setBlack(true);
    await sleep(200);
    if (!cancelled) props.onComplete();
  }

  onMount(async () => {
    await sleep(350);
    try { playSound('hum_start'); } catch {}

    const script = buildShutdownScript(props.stats);
    for (const line of script) {
      if (cancelled) return;
      await addLine(line);
    }

    await sleep(600);
    dismiss();
  });

  onCleanup(() => {
    cancelled = true;
  });

  return (
    <Show when={!black()} fallback={<div class={styles.blackScreen} />}>
      <div class={`${styles.shutdownScreen} ${dismissing() ? styles.shutdownScreenDismiss : ''}`}>
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
        </div>

        <Show when={dismissing()}>
          <div class={styles.sweepLine} />
        </Show>
      </div>
    </Show>
  );
}
