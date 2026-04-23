// PhantomOS v2 — Git activity panel: PR, commits, and CI sections
// Author: Subash Karki

import { Show, createSignal, createEffect, on, onCleanup, createMemo } from 'solid-js';
import { activeWorktreeId } from '@/core/signals/app';
import {
  prStatus,
  setPrStatus,
  ciRuns,
  setCiRuns,
  setGhAvailable,
} from '@/core/signals/activity';
import { getPrStatus, getCiRuns, isGhCliAvailable } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import PrSection from './PrSection';
import { CommitsSection } from './CommitsSection';
import { CiSection } from './CiSection';
import * as styles from '@/styles/right-sidebar.css';

// ── Activity skeleton ─────────────────────────────────────────────────────────

function ActivitySkeleton() {
  return (
    <div class={styles.activitySkeleton}>
      {/* PR skeleton */}
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '60px', height: '8px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '100%', height: '48px' }} />
      </div>

      {/* Commits skeleton */}
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '80px', height: '8px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '100%', height: '18px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '85%', height: '18px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '70%', height: '18px' }} />
      </div>

      {/* CI skeleton */}
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '70px', height: '8px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '100%', height: '22px' }} />
        <div class={`${styles.skeletonBar} ${styles.skeletonPulse}`} style={{ width: '90%', height: '22px' }} />
      </div>
    </div>
  );
}

// ── GitActivityPanel ──────────────────────────────────────────────────────────

let ghAvailableChecked = false;

export function GitActivityPanel() {
  const [initialLoading, setInitialLoading] = createSignal(true);

  // Derived: is the active workspace on the default branch?
  const isDefaultBranch = createMemo(() => {
    const wtId = activeWorktreeId();
    if (!wtId) return false;

    const allWorktrees = worktreeMap();
    const allProjects = projects();

    for (const project of allProjects) {
      const wts = allWorktrees[project.id] ?? [];
      const workspace = wts.find((w) => w.id === wtId);
      if (workspace) {
        const defaultBranch = project.default_branch ?? 'main';
        return workspace.branch === defaultBranch;
      }
    }
    return false;
  });

  function setIfChanged<T>(current: () => T, setter: (v: T) => void, next: T) {
    if (JSON.stringify(next) !== JSON.stringify(current())) setter(next);
  }

  function ciPollInterval(): number {
    const runs = ciRuns();
    if (!runs) return 30_000;
    return runs.some((r) => !r.conclusion || r.conclusion === '') ? 10_000 : 30_000;
  }

  createEffect(
    on(activeWorktreeId, (wtId) => {
      if (!wtId) return;

      let cancelled = false;

      setPrStatus(null);
      setCiRuns(null);

      if (!ghAvailableChecked) {
        ghAvailableChecked = true;
        isGhCliAvailable()
          .then(setGhAvailable)
          .catch(() => setGhAvailable(false));
      }

      Promise.all([
        getPrStatus(wtId).then((v) => { if (!cancelled) setIfChanged(prStatus, setPrStatus, v); }).catch(() => { if (!cancelled) setPrStatus(null); }),
        getCiRuns(wtId).then((v) => { if (!cancelled) setIfChanged(ciRuns, setCiRuns, v); }).catch(() => { if (!cancelled) setCiRuns(null); }),
      ]).then(() => { if (!cancelled) setInitialLoading(false); });

      const prTimer = setInterval(() => {
        if (cancelled) return;
        getPrStatus(wtId).then((v) => { if (!cancelled) setIfChanged(prStatus, setPrStatus, v); }).catch(() => {});
      }, 60_000);

      let ciTimer: ReturnType<typeof setTimeout> | null = null;
      function scheduleCi() {
        if (cancelled) return;
        ciTimer = setTimeout(() => {
          if (cancelled) return;
          getCiRuns(wtId).then((v) => { if (!cancelled) setIfChanged(ciRuns, setCiRuns, v); }).catch(() => {});
          scheduleCi();
        }, ciPollInterval());
      }
      scheduleCi();

      onWailsEvent('pr:created', () => {
        if (cancelled) return;
        getPrStatus(wtId).then((v) => { if (!cancelled) setIfChanged(prStatus, setPrStatus, v); }).catch(() => {});
      });

      onCleanup(() => {
        cancelled = true;
        clearInterval(prTimer);
        if (ciTimer !== null) clearTimeout(ciTimer);
      });
    }),
  );

  return (
    <Show when={!initialLoading()} fallback={<ActivitySkeleton />}>
      <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%' }}>
        <div style={{ flex: '1', 'overflow-y': 'auto' }}>
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
    </Show>
  );
}
