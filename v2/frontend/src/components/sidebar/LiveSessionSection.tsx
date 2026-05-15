// Author: Subash Karki

import { Show, For } from 'solid-js';
import { Zap } from 'lucide-solid';
import * as styles from '@/styles/sidebar.css';
import { liveWorktrees } from '@/core/signals/live-sessions';
import { selectWorktree } from '@/core/signals/worktrees';
import { activeWorktreeId } from '@/core/signals/app';

export function LiveSessionSection() {
  return (
    <Show when={liveWorktrees().length > 0}>
      <div class={styles.liveSessionSection}>
        <div class={styles.liveSessionHeader}>
          <Zap size={10} />
          Live
        </div>
        <For each={liveWorktrees()}>
          {(lw) => (
            <div
              class={styles.liveSessionItem}
              style={activeWorktreeId() === lw.worktreeId ? { background: `var(--phantom-bg-active, rgba(255,255,255,0.06))` } : undefined}
              onClick={() => selectWorktree(lw.worktreeId)}
              title={`${lw.branch} — ${lw.projectName}`}
            >
              <span class={styles.sessionDot} data-live-state={lw.session?.live_state ?? 'running'} />
              <span class={styles.liveSessionBranch}>{lw.branch}</span>
              <span class={styles.liveSessionProject}>{lw.projectName}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
