// Author: Subash Karki
// Phantom — Ctrl+Tab worktree switcher overlay (macOS app-switcher style, premium)

import { Show, For, createMemo } from 'solid-js';
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
  const items = createMemo<SwitcherItem[]>(() => {
    return liveWorktrees().map((lw) => ({
      id: lw.worktreeId,
      branch: lw.branch,
      projectName: lw.projectName,
      glyph: projectGlyph(lw.projectName),
      shortPath: lastPathSegments(lw.worktreePath, 2),
    }));
  });

  return (
    <Show when={switcherVisible()}>
      <Portal>
        <div class={css.backdrop}>
          <div class={css.container}>
            {/* Card row — horizontally scrollable */}
            <div class={css.cardRow}>
              <For each={items()}>
                {(item, index) => {
                  const isActive = () => item.id === activeWorktreeId();
                  const isSelected = () => index() === switcherSelectedIndex();

                  const cardClass = () => {
                    const classes = [css.card];
                    // cardActive and cardSelected can stack (active + selected)
                    if (isActive()) classes.push(css.cardActive);
                    if (isSelected()) classes.push(css.cardSelected);
                    return classes.join(' ');
                  };

                  // Stagger entrance animation delay per card index
                  const entranceStyle = () => ({
                    'animation-delay': `${index() * 20}ms`,
                  });

                  return (
                    <div
                      class={cardClass()}
                      style={entranceStyle()}
                      onClick={() => commitSwitcherAt(index())}
                      title={`${item.branch} · ${item.projectName}`}
                    >
                      {/* Glyph */}
                      <div class={css.glyphCircle}>{item.glyph}</div>

                      {/* Branch name row with ⎇ icon */}
                      <div class={css.branchRow}>
                        <span class={css.branchIcon} aria-hidden="true">⎇</span>
                        <span class={css.branchLabel} title={item.branch}>
                          {item.branch}
                        </span>
                      </div>

                      {/* Project name */}
                      <div class={css.projectLabel} title={item.projectName}>
                        {item.projectName}
                      </div>

                      {/* Short path (last 2 segments) */}
                      <Show when={item.shortPath}>
                        <div class={css.pathLabel} title={item.shortPath}>
                          {item.shortPath}
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Footer keyboard hint */}
            <div class={css.footer}>
              <span class={css.footerKbd}>⌃Tab</span>
              <span>to cycle</span>
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
