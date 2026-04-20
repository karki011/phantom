// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import * as styles from '../styles/boot.css';
import { getSessions } from '../../../core/bindings';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buildBootScript } from '../config/phases';
import type { BootLine, LineStyle } from '../config/types';

interface BootTerminalProps {
  onBootComplete: () => void;
}

const styleMap: Record<LineStyle, string> = {
  normal: styles.lineNormal,
  title: styles.lineTitle,
  subtitle: styles.lineSubtitle,
  accent: styles.lineAccent,
  success: styles.lineSuccess,
  dim: styles.lineDim,
  dramatic: styles.lineDramatic,
  separator: styles.separator,
};

export function BootTerminal(props: BootTerminalProps) {
  const [lines, setLines] = createSignal<{ text: string; style: LineStyle }[]>([]);
  const [typing, setTyping] = createSignal(false);
  let cancelled = false;

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typewriterLine(text: string, charDelay = 25): Promise<void> {
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
      await sleep(charDelay + Math.random() * 20);
    }
    setTyping(false);
  }

  async function addLine(line: BootLine): Promise<void> {
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

    const speechPromise = line.speech
      ? speakSystem(line.speech, line.speechRate ?? 0.9)
      : Promise.resolve();

    await typewriterLine(line.text, line.charDelay ?? 25);

    if (line.waitForSpeech) {
      await speechPromise;
    }
  }

  onMount(async () => {
    try { playSound('hum_start'); } catch {}

    let sessionCount = 0;
    try {
      const sessions = await getSessions();
      sessionCount = sessions.length;
    } catch {}

    const bootScript = buildBootScript(sessionCount);

    for (const line of bootScript) {
      if (cancelled) return;
      await addLine(line);
    }

    await new Promise<void>((r) => setTimeout(r, 600));
    if (!cancelled) props.onBootComplete();
  });

  onCleanup(() => {
    cancelled = true;
  });

  return (
    <div class={styles.terminal}>
      <div class={styles.linesContainer}>
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
    </div>
  );
}
