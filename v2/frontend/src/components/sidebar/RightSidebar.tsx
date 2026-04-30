// Phantom — Right sidebar with Files, Changes, and Activity tabs
// Author: Subash Karki

import { Show, createEffect, on, onMount, createSignal } from 'solid-js';
import { Tabs } from '@kobalte/core/tabs';
import { ChevronsRight } from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import { activeWorktreeId } from '@/core/signals/app';
import {
  rightSidebarWidth,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  isRightResizing,
  rightSidebarTab,
  setRightSidebarTab,
  filesCount,
  changesCount,
  activityCount,
} from '@/core/signals/files';
import * as railStyles from '@/styles/sidebar-rail.css';
import * as containerStyles from '@/styles/sidebar-animated-container.css';
import {
  prStatus, setPrStatus,
  ciRuns, setCiRuns,
  isCreatingPr,
  ghAvailable, setGhAvailable,
} from '@/core/signals/activity';
import { getCiRuns, getPrStatus, isGhCliAvailable, watchWorktree } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import type { PrStatus, CiRun } from '@/core/types';
import { FilesView } from './FilesView';
import { ChangesView } from './ChangesView';
import { GitActivityPanel } from './GitActivityPanel';
import { RightResizeHandle } from './RightResizeHandle';
import { RightRail } from './RightRail';
import { WardAlerts } from '@/shared/WardAlerts/WardAlerts';
import { wardAlertCount } from '@/core/signals/wards';
import * as styles from '@/styles/right-sidebar.css';

function setIfChanged<T>(current: () => T, setter: (v: T) => void, next: T) {
  if (JSON.stringify(next) !== JSON.stringify(current())) setter(next);
}

let ghChecked = false;

export function RightSidebar() {
  // Gate the width transition until after the first frame so the initial
  // render doesn't animate from 0.
  const [mounted, setMounted] = createSignal(false);
  onMount(() => {
    requestAnimationFrame(() => setMounted(true));
  });

  // Tell the Go poller which worktree to watch whenever it changes.
  // Clear stale PR/CI data from the previous worktree so the panel doesn't
  // display the outgoing project's checks while waiting for the next push,
  // and kick off an immediate fetch so the Activity tab populates without
  // waiting for the next poll tick.
  createEffect(on(activeWorktreeId, (wtId) => {
    setPrStatus(null);
    setCiRuns(null);
    if (!wtId) return;
    watchWorktree(wtId);
    const requestedId = wtId;
    void Promise.all([getPrStatus(wtId), getCiRuns(wtId)]).then(([pr, runs]) => {
      if (activeWorktreeId() !== requestedId) return;
      setPrStatus(pr);
      setCiRuns(runs ?? []);
    }).catch(() => { /* poller will retry */ });
  }));

  // One-shot gh CLI availability check.
  if (!ghChecked) {
    ghChecked = true;
    isGhCliAvailable().then(setGhAvailable).catch(() => setGhAvailable(false));
  }

  // Backend pushes updates only when data changes.
  onWailsEvent<PrStatus | null>('pr:updated', (pr) => {
    setIfChanged(prStatus, setPrStatus, pr);
  });
  onWailsEvent<CiRun[]>('ci:updated', (runs) => {
    setIfChanged(ciRuns, setCiRuns, runs);
  });

  const collapsed = () => rightSidebarCollapsed();
  const containerWidth = () => (collapsed() ? 44 : rightSidebarWidth());

  return (
    <Show when={activeWorktreeId()}>
    <div
      class={containerStyles.animatedContainer}
      style={{ width: `${containerWidth()}px` }}
      data-mounted={mounted() ? 'true' : 'false'}
      data-resizing={isRightResizing() ? 'true' : 'false'}
    >
      {/* Rail layer (collapsed) — always mounted, fades in/out */}
      <div class={containerStyles.fadeLayer} data-active={collapsed() ? 'true' : 'false'} aria-hidden={!collapsed()}>
        <RightRail />
      </div>

      {/* Expanded layer — always mounted, fades in/out */}
      <div class={containerStyles.fadeLayer} data-active={!collapsed() ? 'true' : 'false'} aria-hidden={collapsed()}>
      <div
        class={styles.rightSidebar}
        style={{ width: '100%' }}
      >
        <RightResizeHandle />

        <Tabs
          class={styles.tabsRoot}
          value={rightSidebarTab()}
          onChange={setRightSidebarTab}
        >
          <Tabs.List class={styles.tabList} aria-label="Right sidebar">
            <Tabs.Trigger value="files" class={styles.tab}>
              Files
              <Show when={filesCount() > 0}>
                <span class={styles.tabBadge}>{filesCount()}</span>
              </Show>
            </Tabs.Trigger>
            <Tabs.Trigger value="changes" class={styles.tab}>
              Changes
              <Show when={changesCount() > 0}>
                <span class={styles.tabBadgeChanges}>{changesCount()}</span>
              </Show>
            </Tabs.Trigger>
            <Tabs.Trigger value="alerts" class={styles.tab}>
              Alerts
              <Show when={wardAlertCount() > 0}>
                <span class={styles.tabBadge}>{wardAlertCount()}</span>
              </Show>
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" class={styles.tab}>
              Activity
              <Show
                when={isCreatingPr()}
                fallback={
                  <Show
                    when={prStatus()?.state === 'OPEN'}
                    fallback={
                      <Show when={activityCount() > 0}>
                        <span class={styles.tabBadge}>{activityCount()}</span>
                      </Show>
                    }
                  >
                    <span
                      class={`${styles.activityDot} ${styles.statusDotActive}`}
                    />
                  </Show>
                }
              >
                <span
                  class={`${styles.activityDot} ${styles.activityDotPulse} ${styles.statusDotDefault}`}
                />
              </Show>
            </Tabs.Trigger>
            <Tip label="Collapse sidebar (Cmd+Shift+B)" placement="left">
              <button
                type="button"
                class={railStyles.railChevron}
                style={{ 'margin-left': 'auto', 'align-self': 'center' }}
                onClick={() => setRightSidebarCollapsed(true)}
                aria-label="Collapse sidebar"
              >
                <ChevronsRight size={14} />
              </button>
            </Tip>
          </Tabs.List>

          <Tabs.Content value="files" class={styles.tabPanel}>
            <FilesView />
          </Tabs.Content>

          <Tabs.Content value="changes" class={styles.tabPanel}>
            <ChangesView />
          </Tabs.Content>

          <Tabs.Content value="alerts" class={styles.tabPanel}>
            <WardAlerts />
          </Tabs.Content>

          <Tabs.Content value="activity" class={styles.tabPanel}>
            <GitActivityPanel />
          </Tabs.Content>
        </Tabs>
      </div>
      </div>
    </div>
    </Show>
  );
}
