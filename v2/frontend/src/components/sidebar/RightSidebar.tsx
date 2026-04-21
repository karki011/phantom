// PhantomOS v2 — Right sidebar with Files, Changes, and Activity tabs
// Author: Subash Karki

import { Show, For } from 'solid-js';
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

type RightTab = 'files' | 'changes' | 'activity';

const TABS: { value: RightTab; label: string }[] = [
  { value: 'files', label: 'Files' },
  { value: 'changes', label: 'Changes' },
  { value: 'activity', label: 'Activity' },
];

export function RightSidebar() {
  return (
    <Show when={activeWorktreeId() && !rightSidebarCollapsed()}>
      <div
        class={styles.rightSidebar}
        style={{ width: `${rightSidebarWidth()}px` }}
      >
        <RightResizeHandle />

        {/* Tab list */}
        <div class={styles.tabList} role="tablist" aria-label="Right sidebar">
          <For each={TABS}>
            {(tab) => (
              <button
                type="button"
                role="tab"
                aria-selected={rightSidebarTab() === tab.value}
                class={rightSidebarTab() === tab.value ? styles.tabActive : styles.tab}
                onClick={() => setRightSidebarTab(tab.value)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>

        {/* Tab panels */}
        <Show when={rightSidebarTab() === 'files'}>
          <div class={styles.tabPanel} role="tabpanel">
            <FilesView />
          </div>
        </Show>

        <Show when={rightSidebarTab() === 'changes'}>
          <div class={styles.tabPanel} role="tabpanel">
            <ChangesView />
          </div>
        </Show>

        <Show when={rightSidebarTab() === 'activity'}>
          <div class={styles.tabPanel} role="tabpanel">
            <GitActivityPanel />
          </div>
        </Show>
      </div>
    </Show>
  );
}
