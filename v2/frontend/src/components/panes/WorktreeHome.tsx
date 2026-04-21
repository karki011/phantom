// PhantomOS v2 — Worktree home pane (Hunter's Terminal)
// Author: Subash Karki

import { createMemo } from 'solid-js';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { addTabWithData } from '@/core/panes/signals';
import * as styles from '@/styles/home.css';

export default function WorktreeHome() {
  const activeWorktree = createMemo(() => {
    const wtId = activeWorktreeId();
    if (!wtId) return null;
    for (const workspaces of Object.values(worktreeMap())) {
      const match = workspaces.find((w) => w.id === wtId);
      if (match) return match;
    }
    return null;
  });

  return (
    <div class={styles.homeContainer}>
      {/* Hunter Banner */}
      <div class={styles.hunterBanner}>
        <span class={styles.rankBadge}>E</span>
        <div class={styles.rankInfo}>
          <span class={styles.rankTitle}>Shadow Soldier</span>
          <span class={styles.rankLevel}>Level 1 · 0 XP</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <div class={styles.sectionTitle}>Quick Actions</div>
        <div class={styles.quickActions}>
          {/* Terminal */}
          <button class={styles.quickActionButton} type="button" title="Open a terminal in this worktree" onClick={() => addTabWithData('terminal', 'Terminal', { cwd: activeWorktree()?.worktree_path ?? '' })}>
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
              <path d="M4 6l2.5 2L4 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M8 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Terminal</span>
          </button>

          {/* Editor */}
          <button class={styles.quickActionButton} type="button" title="Open code editor (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="1.5" width="12" height="13" rx="1.5" stroke="currentColor" stroke-width="1.4" />
              <path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Editor</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>

          {/* Chat */}
          <button class={styles.quickActionButton} type="button" title="Chat with Claude (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h9A1.5 1.5 0 0114 3.5v7A1.5 1.5 0 0112.5 12H9l-3 2v-2H3.5A1.5 1.5 0 012 10.5v-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
              <path d="M5 6h6M5 8.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class={styles.quickActionLabel}>Chat</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>

          {/* Recipe / Run */}
          <button class={styles.quickActionButton} type="button" title="Run a project recipe (coming soon)">
            <svg class={styles.quickActionIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4" />
              <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="currentColor" />
            </svg>
            <span class={styles.quickActionLabel}>Recipe</span>
            <span class={styles.quickActionHint}>coming soon</span>
          </button>
        </div>
      </div>

      {/* Workspace Info */}
      <div class={styles.statusCard}>
        <div class={styles.statusGrid}>
          <div class={styles.statusCell}>
            <span class={styles.statusLabel}>
              {activeWorktree()?.type === 'branch' ? 'Local Branch' : 'Worktree'}
            </span>
            <span class={styles.statusValue}>{activeWorktree()?.branch ?? '—'}</span>
          </div>
          <div class={styles.statusCell}>
            <span class={styles.statusLabel}>Code Graph</span>
            <span class={styles.statusValue}>Ready</span>
          </div>
          <div class={styles.statusCell}>
            <span class={styles.statusLabel}>Path</span>
            <span class={styles.statusValue} title={activeWorktree()?.worktree_path ?? ''}>
              {activeWorktree()?.worktree_path ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div class={styles.statusCard}>
        <span class={styles.statusLabel}>Plans</span>
        <span class={styles.statusValue}>No plans discovered yet</span>
      </div>
    </div>
  );
}
