// PhantomOS v2 — System header bar
// Author: Subash Karki

import { createMemo, onCleanup, onMount, Show } from 'solid-js';
import { sessions } from '@/core/signals/sessions';
import {
  systemStats,
  startSystemStatsPoll,
  stopSystemStatsPoll,
} from '@/core/signals/system-stats';
import { openSettings } from '@/core/signals/settings';
import { toggleDocs } from '@/core/signals/docs';
import { focusOrCreateTab } from '@/core/panes/signals';
import { Tip } from '@/shared/Tip/Tip';
import * as shellStyles from '@/styles/app-shell.css';

// Inline SVG icons — no icon library dependency

function BookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2V3ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7V3Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M13.3 9.8a1.2 1.2 0 0 0 .24 1.32l.04.04a1.46 1.46 0 1 1-2.06 2.06l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.73 1.1V14a1.46 1.46 0 0 1-2.92 0v-.06a1.2 1.2 0 0 0-.78-1.1 1.2 1.2 0 0 0-1.32.24l-.04.04a1.46 1.46 0 1 1-2.06-2.06l.04-.04A1.2 1.2 0 0 0 2.6 9.7a1.2 1.2 0 0 0-1.1-.73H1.46a1.46 1.46 0 0 1 0-2.92h.06A1.2 1.2 0 0 0 2.62 5.3a1.2 1.2 0 0 0-.24-1.32l-.04-.04a1.46 1.46 0 1 1 2.06-2.06l.04.04A1.2 1.2 0 0 0 5.76 2.2a1.2 1.2 0 0 0 .73-1.1V1a1.46 1.46 0 0 1 2.92 0v.06a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.46 1.46 0 1 1 2.06 2.06l-.04.04A1.2 1.2 0 0 0 13.3 5.3a1.2 1.2 0 0 0 1.1.73H15a1.46 1.46 0 0 1 0 2.92h-.06a1.2 1.2 0 0 0-1.1.73l-.04.13Z"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 3a2 2 0 1 0 0 4h6a2 2 0 1 0 0-4H5ZM5 9a2 2 0 1 0 0 4h6a2 2 0 1 0 0-4H5Z"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M5 5h6M5 11h6"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M16 2v4M8 2v4M3 10h18"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="2"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <path
        d="M4 6l2.5 2L4 10"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M8 10h4"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </svg>
  );
}

export function SystemHeader() {
  onMount(() => {
    startSystemStatsPoll();
  });
  onCleanup(() => {
    stopSystemStatsPoll();
  });

  const activeCount = createMemo(() =>
    sessions().filter((s) => s.status === 'active' || s.status === 'running').length
  );

  const sessionLabel = createMemo(() => {
    const count = activeCount();
    return count === 1 ? '1 session active' : `${count} sessions active`;
  });

  const stats = systemStats;

  return (
    <header class={shellStyles.header}>
      {/* Left: Logo */}
      <button class={shellStyles.headerLogo} type="button" aria-label="PhantomOS home">
        PhantomOS
      </button>

      {/* Center: System stats bar */}
      <div class={shellStyles.headerCenter}>
        <span class={shellStyles.sessionIndicator}>
          <span class={shellStyles.sessionDot} />
          {sessionLabel()}
        </span>
        <span class={shellStyles.statDivider}>|</span>
        <span class={shellStyles.statItem}>
          CPU {Math.round(stats().cpu_percent)}%
        </span>
        <span class={shellStyles.statDivider}>|</span>
        <span class={shellStyles.statItem}>
          RAM {stats().mem_used_gb.toFixed(1)}/{stats().mem_total_gb.toFixed(1)} GB
        </span>
        <Show when={stats().battery_percent >= 0}>
          <span class={shellStyles.statDivider}>|</span>
          <span class={shellStyles.statItem}>
            {stats().battery_charging ? '⚡' : '🔋'} {stats().battery_percent}%
          </span>
        </Show>
      </div>

      {/* Right: Action buttons */}
      <div class={shellStyles.headerActions}>
        <Tip label="Terminal" placement="bottom">
          <button class={shellStyles.headerIconButton} type="button" aria-label="Open terminal">
            <TerminalIcon />
          </button>
        </Tip>
        <Tip label="Command Palette" placement="bottom">
          <button class={shellStyles.headerIconButton} type="button" aria-label="Open command palette">
            <CommandIcon />
          </button>
        </Tip>
        <Tip label="Docs" placement="bottom">
          <button class={shellStyles.headerIconButton} type="button" aria-label="Open documentation" onClick={() => toggleDocs()}>
            <BookIcon />
          </button>
        </Tip>
        <Tip label="Daily Digest" placement="bottom">
          <button class={shellStyles.headerIconButton} type="button" aria-label="Open daily digest" onClick={() => focusOrCreateTab('journal', 'Daily Digest')}>
            <JournalIcon />
          </button>
        </Tip>
        <Tip label="Settings" placement="bottom">
          <button class={shellStyles.headerIconButton} type="button" aria-label="Open settings" onClick={() => openSettings()}>
            <GearIcon />
          </button>
        </Tip>
      </div>
    </header>
  );
}
