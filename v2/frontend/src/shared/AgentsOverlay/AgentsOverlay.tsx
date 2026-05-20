// Phantom — Agents overlay (Cmd+Shift+G)
// Author: Subash Karki

import { Show, For, createEffect, onCleanup } from 'solid-js';
import { gsap } from '@/core/animation/gsap-setup';
import { Portal } from 'solid-js/web';
import { Zap } from 'lucide-solid';
import { agentsOverlayVisible, closeAgentsOverlay } from '@/core/signals/agents-overlay';
import { liveWorktrees } from '@/core/signals/live-sessions';
import { selectWorktree } from '@/core/signals/worktrees';
import * as styles from './AgentsOverlay.css';

export const AgentsOverlay = () => {
  // Stagger-animate rows when overlay opens.
  createEffect(() => {
    if (agentsOverlayVisible()) {
      queueMicrotask(() => {
        const rows = document.querySelectorAll('[data-agent-row]');
        if (rows.length) {
          gsap.fromTo(rows,
            { opacity: 0, x: -10 },
            { opacity: 1, x: 0, stagger: 0.04, duration: 0.25, ease: 'power2.out' }
          );
        }
      });
    }
  });

  // Escape to close
  createEffect(() => {
    if (!agentsOverlayVisible()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeAgentsOverlay();
      }
    };
    document.addEventListener('keydown', handler, true);
    onCleanup(() => document.removeEventListener('keydown', handler, true));
  });

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) closeAgentsOverlay();
  };

  const selectAndFocus = (lw: ReturnType<typeof liveWorktrees>[number]) => {
    closeAgentsOverlay();
    queueMicrotask(() => selectWorktree(lw.worktreeId));
  };

  return (
    <Show when={agentsOverlayVisible()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Header */}
            <div class={styles.header}>
              <Zap size={14} class={styles.headerIcon} />
              <span class={styles.headerTitle}>Agents</span>
              <span class={styles.escBadge}>ESC</span>
            </div>

            {/* Agent list */}
            <div class={styles.list}>
              <Show
                when={liveWorktrees().length > 0}
                fallback={
                  <div class={styles.empty}>
                    No active agents. Start an AI session in a terminal.
                  </div>
                }
              >
                <For each={liveWorktrees()}>
                  {(lw) => (
                    <div class={styles.agentRow} data-agent-row onClick={() => selectAndFocus(lw)}>
                      <span
                        class={styles.dot}
                        data-live-state={lw.session?.live_state ?? 'running'}
                      />
                      <span class={styles.branch}>{lw.branch}</span>
                      <span class={styles.project}>{lw.projectName}</span>
                      <span class={styles.status}>
                        {lw.session?.status ?? 'active'}
                      </span>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            {/* Footer hints */}
            <div class={styles.footer}>
              <span>
                <span class={styles.footerKbd}>{'↑↓'}</span> navigate
              </span>
              <span>
                <span class={styles.footerKbd}>{'↵'}</span> focus
              </span>
              <span>
                <span class={styles.footerKbd}>esc</span> close
              </span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};
