// PhantomOS v2 — Git activity panel: recent commits list
// Author: Subash Karki

import { For, Show } from 'solid-js';
import { GitCommit, Clock } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import { recentCommits, setRecentCommits, type CommitEntry } from '@/core/signals/files';

// ── Relative time helper ──────────────────────────────────────────────────────

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Commit row ────────────────────────────────────────────────────────────────

function CommitRow(props: { commit: CommitEntry }) {
  return (
    <div class={styles.activityItem}>
      <span class={styles.commitHash} title={props.commit.hash}>
        {props.commit.shortHash}
      </span>
      <span class={styles.commitMsg} title={props.commit.message}>
        {props.commit.message}
      </span>
      <span class={styles.commitMeta}>
        {props.commit.author} · {relativeTime(props.commit.timestamp)}
      </span>
    </div>
  );
}

// ── Activity panel ────────────────────────────────────────────────────────────

export function GitActivityPanel() {
  function loadActivity() {
    // Stub: real implementation will call git log binding and populate recentCommits
    // Example stub data for visual testing:
    setRecentCommits([
      {
        hash: 'abc123def456',
        shortHash: 'abc123d',
        message: 'feat: add right sidebar with files and changes tabs',
        author: 'Subash Karki',
        timestamp: Date.now() - 5 * 60_000,
      },
      {
        hash: 'def789abc012',
        shortHash: 'def789a',
        message: 'chore: scaffold PhantomOS v2 frontend',
        author: 'Subash Karki',
        timestamp: Date.now() - 60 * 60_000,
      },
    ]);
  }

  return (
    <Show
      when={recentCommits().length > 0}
      fallback={
        <div class={styles.activityEmpty}>
          <Clock size={24} />
          <span>No activity loaded</span>
          <button type="button" class={styles.loadButton} onClick={loadActivity}>
            <GitCommit size={12} />
            Load activity
          </button>
        </div>
      }
    >
      <div class={styles.activityList}>
        <For each={recentCommits()}>
          {(commit) => <CommitRow commit={commit} />}
        </For>
      </div>
    </Show>
  );
}
