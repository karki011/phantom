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
} from '@/core/signals/files';
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
          value={rightSidebarTab()}
          onChange={setRightSidebarTab}
        >
          <Tabs.List class={styles.tabList} aria-label="Right sidebar">
            <Tabs.Trigger value="files" class={styles.tab}>Files</Tabs.Trigger>
            <Tabs.Trigger value="changes" class={styles.tab}>Changes</Tabs.Trigger>
            <Tabs.Trigger value="activity" class={styles.tab}>Activity</Tabs.Trigger>
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
