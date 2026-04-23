// PhantomOS v2 — Commits section with Branch/All toggle
// Author: Subash Karki

import { For, Show, createEffect, createSignal, on } from 'solid-js';
import { GitCommit } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import { getBranchCommits } from '@/core/bindings';
import { openURL } from '@/core/bindings/shell';
import { relativeTime } from '@/utils/format';

interface CommitEntry {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  timestamp: number;
}

interface CommitsSectionProps {
  worktreeId: string;
  repoUrl?: string;
}

function CommitRow(props: { commit: CommitEntry; repoUrl?: string }) {
  return (
    <div
      class={styles.commitRow}
      title={`${props.commit.hash} — ${props.commit.message}`}
      onClick={() => props.repoUrl && openURL(`${props.repoUrl}/commit/${props.commit.hash}`)}
    >
      <span class={styles.commitHash}>{props.commit.shortHash}</span>
      <span class={styles.commitMessage}>{props.commit.message}</span>
      <span class={styles.commitTime}>{relativeTime(props.commit.timestamp)}</span>
    </div>
  );
}

// ── CommitsSection ────────────────────────────────────────────────────────────

export function CommitsSection(props: CommitsSectionProps) {
  const [scoped, setScoped] = createSignal<boolean>(true);
  const [commits, setCommits] = createSignal<CommitEntry[]>([]);

  createEffect(
    on(
      [() => props.worktreeId, scoped],
      async ([worktreeId, branchOnly]) => {
        if (!worktreeId) return;
        const raw = await getBranchCommits(worktreeId, branchOnly);
        setCommits(
          raw.map((c) => ({
            hash: c.hash,
            shortHash: c.short_hash,
            message: c.subject,
            author: c.author,
            timestamp: c.date * 1000,
          })),
        );
      },
    ),
  );

  const isEmpty = () => commits().length === 0;

  // When in "All" mode with no commits — hide section entirely
  return (
    <Show when={!(isEmpty() && !scoped())} fallback={null}>
      <div class={styles.commitsSection}>
        {/* Section header */}
        <div class={styles.commitsSectionHeader}>
          <GitCommit size={11} />
          <span class={styles.commitsSectionLabel}>Recent Commits</span>

          {/* Branch | All toggle */}
          <div class={styles.commitsToggle}>
            <span
              class={scoped() ? styles.commitsToggleItemActive : styles.commitsToggleItemInactive}
              onClick={() => setScoped(true)}
            >
              Branch
            </span>
            <span class={styles.commitsToggleSeparator}>|</span>
            <span
              class={!scoped() ? styles.commitsToggleItemActive : styles.commitsToggleItemInactive}
              onClick={() => setScoped(false)}
            >
              All
            </span>
          </div>
        </div>

        <Show when={!isEmpty()}>
          <div class={styles.commitsList}>
            <For each={commits()}>
              {(commit) => <CommitRow commit={commit} repoUrl={props.repoUrl} />}
            </For>
          </div>
        </Show>
        <Show when={isEmpty() && scoped()}>
          <span class={styles.commitsEmptyLabel}>No commits on this branch yet</span>
        </Show>
      </div>
    </Show>
  );
}
