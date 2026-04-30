// Author: Subash Karki

import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import * as styles from '../styles/boot.css';
import { getSessions } from '../../../core/bindings';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buildBootScript } from '../config/phases';
import type { BootLine, LineStyle, BootScanData } from '../config/types';
import { BootRings } from './BootRings';
import { PhantomMark } from '../../../shared/PhantomMark/PhantomMark';

const App = () => (window as any).go?.['app']?.App;

interface BootTerminalProps {
  onBootComplete: (operator?: string) => void;
}

interface DisplayLine {
  text: string;
  style: LineStyle;
  prompt?: string;
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
  const [lines, setLines] = createSignal<DisplayLine[]>([]);
  const [typing, setTyping] = createSignal(false);
  const [bootProgress, setBootProgress] = createSignal(0);
  let cancelled = false;
  let totalLines = 0;

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function typewriterLine(text: string, charDelay = 25): Promise<void> {
    if (!text.length) return;
    setTyping(true);
    const avgDelay = charDelay + 10;

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

  async function addLine(line: BootLine): Promise<void> {
    if (cancelled) return;
    if (line.delay) await sleep(line.delay);

    if (line.style === 'separator') {
      setLines((prev) => [...prev, { text: '', style: 'separator' }]);
      return;
    }

    setLines((prev) => [...prev, { text: '', style: line.style ?? 'normal', prompt: line.prompt }]);
    setBootProgress((p) => p + 1);

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
    let scan: BootScanData | undefined;
    let detectedOperator: string | undefined;
    try {
      const sessions = await getSessions();
      sessionCount = sessions.length;
    } catch {}
    try {
      const app = App();
      if (app?.BootScan) {
        const raw = await app.BootScan();
        if (raw) {
          detectedOperator = raw.operator || undefined;
          scan = {
            gitInstalled: raw.gitInstalled ?? false,
            gitVersion: raw.gitVersion,
            operator: detectedOperator,
            agents: raw.agents ?? [],
          };
        }
      }
    } catch {}

    const bootScript = buildBootScript(sessionCount, scan);
    totalLines = bootScript.filter((l) => l.style !== 'separator').length;

    for (const line of bootScript) {
      if (cancelled) return;
      await addLine(line);
    }

    await new Promise<void>((r) => setTimeout(r, 600));
    if (!cancelled) props.onBootComplete(detectedOperator);
  });

  onCleanup(() => {
    cancelled = true;
  });

  return (
    <div class={styles.terminal}>
      <BootRings progress={bootProgress()} total={totalLines} />
      <PhantomMark size={88} pulse class={styles.bootMark} />
      <div class={styles.linesContainer}>
        <For each={lines()}>
          {(line, i) => (
            <Show
              when={line.style !== 'separator'}
              fallback={<div class={styles.separator} />}
            >
              <div class={styles.line}>
                <Show when={line.prompt}>
                  <span class={styles.promptSymbol}>{line.prompt}</span>
                </Show>
                <span class={styleMap[line.style]}>{line.text}</span>
                <Show when={i() === lines().length - 1 && typing()}>
                  <span class={styles.cursor} />
                </Show>
              </div>
            </Show>
          )}
        </For>
      </div>
    </div>
  );
}
