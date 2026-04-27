// PhantomOS v2 — Git activity panel: PR, commits, and CI sections (pure render)
// Polling lives in RightSidebar which is always mounted.
// Author: Subash Karki

import { Show, createMemo } from 'solid-js';
import { activeWorktreeId } from '@/core/signals/app';
import { prStatus } from '@/core/signals/activity';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import PrSection from './PrSection';
import { CommitsSection } from './CommitsSection';
import { CiSection } from './CiSection';
import * as styles from '@/styles/right-sidebar.css';

export function GitActivityPanel() {
  const isDefaultBranch = createMemo(() => {
    const wtId = activeWorktreeId();
    if (!wtId) return false;
    for (const project of projects()) {
      const wts = worktreeMap()[project.id] ?? [];
      const workspace = wts.find((w) => w.id === wtId);
      if (workspace) return workspace.branch === (project.default_branch ?? 'main');
    }
    return false;
  });

  return (
    <div class={styles.gitActivityPanel}>
      <div class={styles.gitActivityScroll}>
        <Show when={activeWorktreeId()}>
          {(wtId) => (
            <>
              <PrSection worktreeId={wtId()} isDefaultBranch={isDefaultBranch()} />
              <div class={styles.activityDivider} />
              <CommitsSection worktreeId={wtId()} repoUrl={prStatus()?.url?.replace(/\/pull\/\d+$/, '') ?? undefined} />
              <div class={styles.activityDivider} />
              <CiSection worktreeId={wtId()} />
            </>
          )}
        </Show>
      </div>
    </div>
  );
}
