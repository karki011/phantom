// PhantomOS v2 — Right sidebar with Files, Changes, and Activity tabs
// Author: Subash Karki

import { Show } from 'solid-js';
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
import { prStatus, isCreatingPr } from '@/core/signals/activity';
import { FilesView } from './FilesView';
import { ChangesView } from './ChangesView';
import { GitActivityPanel } from './GitActivityPanel';
import { RightResizeHandle } from './RightResizeHandle';
import * as styles from '@/styles/right-sidebar.css';

export function RightSidebar() {
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
