// PhantomOS v2 — Right sidebar with Files, Changes, and Activity tabs
// Author: Subash Karki

import { Show, createEffect, on, onCleanup } from 'solid-js';
import { Tabs } from '@kobalte/core/tabs';
import { activeWorktreeId } from '@/core/signals/app';
import {
  rightSidebarWidth,
  rightSidebarCollapsed,
  rightSidebarTab,
  setRightSidebarTab,
  filesCount,
  changesCount,
  activityCount,
} from '@/core/signals/files';
import {
  prStatus, setPrStatus,
  ciRuns, setCiRuns,
  isCreatingPr,
  ghAvailable, setGhAvailable,
} from '@/core/signals/activity';
import { getPrStatus, getCiRuns, isGhCliAvailable } from '@/core/bindings';
import { onWailsEvent } from '@/core/events';
import { FilesView } from './FilesView';
import { ChangesView } from './ChangesView';
import { GitActivityPanel } from './GitActivityPanel';
import { RightResizeHandle } from './RightResizeHandle';
import * as styles from '@/styles/right-sidebar.css';

function setIfChanged<T>(current: () => T, setter: (v: T) => void, next: T) {
  if (JSON.stringify(next) !== JSON.stringify(current())) setter(next);
}

let ghChecked = false;

export function RightSidebar() {
  createEffect(
    on(activeWorktreeId, (wtId) => {
      if (!wtId) return;

      let cancelled = false;

      setPrStatus(null);
      setCiRuns(null);

      if (!ghChecked) {
        ghChecked = true;
        isGhCliAvailable().then(setGhAvailable).catch(() => setGhAvailable(false));
      }

      function fetchPr() {
        if (cancelled) return;
        getPrStatus(wtId).then((v) => { if (!cancelled) setIfChanged(prStatus, setPrStatus, v); }).catch(() => {});
      }

      function fetchCi() {
        if (cancelled) return;
        getCiRuns(wtId).then((v) => { if (!cancelled) setIfChanged(ciRuns, setCiRuns, v); }).catch(() => {});
      }

      fetchPr();
      fetchCi();

      const prTimer = setInterval(fetchPr, 60_000);

      let ciTimer: ReturnType<typeof setTimeout> | null = null;
      function scheduleCi() {
        if (cancelled) return;
        const interval = ciRuns()?.some((r) => !r.conclusion || r.conclusion === '') ? 10_000 : 30_000;
        ciTimer = setTimeout(() => { fetchCi(); scheduleCi(); }, interval);
      }
      scheduleCi();

      onWailsEvent('pr:created', fetchPr);

      onCleanup(() => {
        cancelled = true;
        clearInterval(prTimer);
        if (ciTimer !== null) clearTimeout(ciTimer);
      });
    }),
  );

  return (
    <Show when={activeWorktreeId() && !rightSidebarCollapsed()}>
      <div
        class={styles.rightSidebar}
        style={{ width: `${rightSidebarWidth()}px` }}
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
                      class={styles.activityDot}
                      style={{ 'background-color': 'var(--color-success, #22c55e)' }}
                    />
                  </Show>
                }
              >
                <span
                  class={`${styles.activityDot} ${styles.activityDotPulse}`}
                  style={{ 'background-color': 'var(--color-accent, #06b6d4)' }}
                />
              </Show>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="files" class={styles.tabPanel}>
            <FilesView />
          </Tabs.Content>

          <Tabs.Content value="changes" class={styles.tabPanel}>
            <ChangesView />
          </Tabs.Content>

          <Tabs.Content value="activity" class={styles.tabPanel}>
            <GitActivityPanel />
          </Tabs.Content>
        </Tabs>
      </div>
    </Show>
  );
}
