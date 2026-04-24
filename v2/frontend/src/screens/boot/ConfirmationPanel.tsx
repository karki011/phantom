import { createSignal, createEffect, onCleanup, For, untrack } from 'solid-js';
import type { ScanResult } from './scan-system';
import {
  confirmationPanel,
  scanLine,
  scanLabel,
  scanDetail,
  statusDotSuccess,
  statusDotWarning,
  statusDotOffline,
  pulsing,
} from './boot-screen.css';

interface ConfirmationPanelProps {
  lines: () => ScanResult[];
  active: () => boolean;
  onAllShown: () => void;
  onLineShown?: () => void;
}

function dotClass(status: ScanResult['status']): string {
  switch (status) {
    case 'success':
      return statusDotSuccess;
    case 'warning':
      return statusDotWarning;
    default:
      return statusDotOffline;
  }
}

export function ConfirmationPanel(props: ConfirmationPanelProps) {
  const [visibleCount, setVisibleCount] = createSignal(0);

  createEffect(() => {
    if (!props.active()) return;
    const total = untrack(() => props.lines().length);
    if (total === 0) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      props.onLineShown?.();
      if (count >= total) {
        clearInterval(interval);
        props.onAllShown();
      }
    }, 300);

    onCleanup(() => clearInterval(interval));
  });

  const visibleLines = () => props.lines().slice(0, visibleCount());

  return (
    <div class={confirmationPanel}>
      <For each={visibleLines()}>
        {(line) => (
          <div class={scanLine}>
            <span class={dotClass(line.status)}>●</span>
            <span class={scanLabel}>{line.label}</span>
            <span
              class={`${scanDetail}${line.status === 'warning' ? ` ${pulsing}` : ''}`}
            >
              {line.detail}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
