// Author: Subash Karki

import { Show, For, createSignal } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ChevronRight, Zap } from 'lucide-solid';
import * as styles from '@/styles/sidebar.css';
import { liveWorktrees } from '@/core/signals/live-sessions';
import { selectWorktree } from '@/core/signals/worktrees';
import { activeWorktreeId } from '@/core/signals/app';

export function LiveSessionSection() {
  const [collapsed, setCollapsed] = createSignal(false);

  return (
    <Show when={liveWorktrees().length > 0}>
      <Collapsible
        open={!collapsed()}
        onOpenChange={(open) => setCollapsed(!open)}
        class={styles.liveSessionSection}
      >
        <Collapsible.Trigger class={styles.liveSessionHeader}>
          <ChevronRight size={10} class={styles.sidebarChevron} />
          <Zap size={10} />
          <span>Live</span>
          <span class={styles.sectionCount}>{liveWorktrees().length}</span>
        </Collapsible.Trigger>
        <Collapsible.Content>
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
        </Collapsible.Content>
      </Collapsible>
    </Show>
  );
}
