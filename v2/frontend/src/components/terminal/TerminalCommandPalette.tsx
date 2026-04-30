// Author: Subash Karki
// PhantomOS v2 — Per-pane terminal command palette (Cmd+P).
//
// Lists the last 50 OSC 633-tracked commands for a session and lets the
// user jump the terminal viewport to any of them via keyboard navigation.
// Does NOT re-run commands — it only scrolls the cursor.

import type { Terminal } from '@xterm/xterm';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { getCommands, type TerminalCommand } from '../../core/terminal/addons/shellIntegration';
import * as styles from '../../styles/commandPalette.css';

interface Props {
  /** Reactive accessor — palette is mounted only when this returns true. */
  open: () => boolean;
  onClose: () => void;
  sessionId: string;
  terminal: Terminal;
}

const MAX_ITEMS = 50;

/** Trim a cwd to a short relative-ish label. Best-effort, no IO. */
function cwdLabel(cwd: string | undefined): string {
  if (!cwd) return '';
  // Drop the user's home prefix to keep labels compact.
  const home = '/Users/';
  const idx = cwd.indexOf(home);
  if (idx === 0) {
    const rest = cwd.slice(home.length);
    const slash = rest.indexOf('/');
    return slash === -1 ? `~/${rest}` : `~/${rest.slice(slash + 1)}`;
  }
  return cwd;
}

export function TerminalCommandPalette(props: Props) {
  // We keep a local snapshot of the command list. getCommands() is read at
  // open-time and on every re-open — there's no live subscription here
  // because the user-perceived window is short-lived (open → pick → close).
  const [items, setItems] = createSignal<TerminalCommand[]>([]);
  const [activeIdx, setActiveIdx] = createSignal(0);

  // Refresh items whenever the palette transitions from closed → open.
  createEffect(() => {
    if (!props.open()) return;
    const all = getCommands(props.sessionId);
    // Newest first; cap to MAX_ITEMS.
    const trimmed = all.slice(-MAX_ITEMS).reverse();
    setItems(trimmed);
    setActiveIdx(0);
  });

  const visible = createMemo(() => props.open());

  const jumpToIndex = (idx: number): void => {
    const cmd = items()[idx];
    if (!cmd) return;
    if (cmd.promptStartMarker.isDisposed) return;
    props.terminal.scrollToLine(cmd.promptStartMarker.line);
    props.onClose();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!visible()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIdx((i) => Math.min(items().length - 1, i + 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      jumpToIndex(activeIdx());
    }
  };

  onMount(() => {
    // Capture phase so we win against xterm's own listeners.
    window.addEventListener('keydown', onKeyDown, { capture: true });
  });

  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions);
  });

  // Auto-scroll the active row into view. Each render the active row gets
  // data-active="true"; we look it up by attribute instead of holding refs.
  let listEl: HTMLUListElement | undefined;
  createEffect(() => {
    // depend on activeIdx + visible
    activeIdx();
    if (!visible() || !listEl) return;
    const active = listEl.querySelector<HTMLLIElement>('li[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  });

  const statusClass = (cmd: TerminalCommand): string => {
    if (cmd.exitCode === undefined) return `${styles.status} ${styles.statusUnknown}`;
    return cmd.exitCode === 0
      ? `${styles.status} ${styles.statusOk}`
      : `${styles.status} ${styles.statusFail}`;
  };

  return (
    <Show when={visible()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop close is a click affordance */}
      <div
        class={styles.overlay}
        onMouseDown={(e) => {
          // Close only when the click is on the overlay itself, not on a child.
          if (e.target === e.currentTarget) props.onClose();
        }}
      />
      <div class={styles.popover} role="dialog" aria-label="Terminal command palette">
        <div class={styles.header}>
          <span>Command History</span>
          <span class={styles.headerHint}>↑↓ navigate · ↵ jump · esc close</span>
        </div>
        <Show
          when={items().length > 0}
          fallback={<div class={styles.empty}>No commands yet in this session.</div>}
        >
          <ul class={styles.list} ref={listEl}>
            <For each={items()}>
              {(cmd, i) => (
                <li
                  data-active={i() === activeIdx() ? 'true' : 'false'}
                  class={`${styles.item} ${i() === activeIdx() ? styles.itemActive : ''}`}
                  onMouseEnter={() => setActiveIdx(i())}
                  onClick={() => jumpToIndex(i())}
                >
                  <span class={statusClass(cmd)} aria-hidden="true" />
                  <span class={styles.command}>
                    <span class={styles.prompt}>$</span>
                    {cmd.command}
                  </span>
                  <Show when={cmd.cwd}>
                    <span class={styles.cwd} title={cmd.cwd}>
                      {cwdLabel(cmd.cwd)}
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
