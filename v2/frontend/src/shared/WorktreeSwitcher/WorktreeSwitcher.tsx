// Author: Subash Karki
// Phantom — Ctrl+Tab worktree switcher overlay (macOS app-switcher style, premium)

import { Show, For, createMemo, createSignal, createEffect, on } from 'solid-js';
import { gsap } from '@/core/animation/gsap-setup';
import { Portal } from 'solid-js/web';
import { liveWorktrees } from '@/core/signals/live-sessions';
import { switcherVisible, switcherSelectedIndex, commitSwitcherAt } from '@/core/signals/worktree-switcher';
import { activeWorktreeId } from '@/core/signals/app';
import { projectGlyph } from '@/core/sidebar/glyph';
import * as css from './WorktreeSwitcher.css';

interface SwitcherItem {
  id: string;
  branch: string;
  projectName: string;
  glyph: string;
  /** Last 2 path segments of worktree_path, e.g. "phantom-os/feat-x" */
  shortPath: string;
}

/** Returns the last N path segments of an absolute path. */
function lastPathSegments(path: string, n: number): string {
  if (!path) return '';
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
  return parts.slice(-n).join('/');
}

const WorktreeSwitcher = () => {
  // Snapshot items when the switcher opens — prevents flicker from live-session polling
  const [snapshotItems, setSnapshotItems] = createSignal<SwitcherItem[]>([]);

  createEffect(on(switcherVisible, (visible) => {
    if (visible) {
      queueMicrotask(() => {
        const rows = document.querySelectorAll('[data-switcher-row]');
        if (rows.length) {
          gsap.fromTo(rows,
            { opacity: 0, y: 6 },
            { opacity: 1, y: 0, stagger: 0.03, duration: 0.2, ease: 'power2.out' }
          );
        }
      });
      setSnapshotItems(liveWorktrees().map((lw) => ({
        id: lw.worktreeId,
        branch: lw.branch,
        projectName: lw.projectName,
        glyph: projectGlyph(lw.projectName),
        shortPath: lastPathSegments(lw.worktreePath, 2),
      })));
    }
  }));

  const items = snapshotItems;

  return (
    <Show when={switcherVisible()}>
      <Portal>
        <div class={css.backdrop}>
          <div class={css.container}>
            <For each={items()}>
              {(item, index) => {
                const isActive = () => item.id === activeWorktreeId();
                const isSelected = () => index() === switcherSelectedIndex();

                return (
                  <div
                    class={`${css.row} ${isSelected() ? css.rowSelected : ''} ${isActive() ? css.rowActive : ''}`}
                    data-switcher-row
                    onClick={() => commitSwitcherAt(index())}
                  >
                    <span class={css.rowGlyph}>{item.glyph}</span>
                    <span class={css.rowBranch}>{item.branch}</span>
                    <span class={css.rowProject}>{item.projectName}</span>
                  </div>
                );
              }}
            </For>

            <div class={css.footer}>
              <span class={css.footerKbd}>⌃Tab</span>
              <span>cycle</span>
              <span>·</span>
              <span>release to switch</span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default WorktreeSwitcher;
