// PhantomOS v2 — Workspace root component (tab bar + active layout)
// Author: Subash Karki

import { Show } from 'solid-js';
import * as styles from '@/styles/panes.css';
import { activeTab } from '@/core/panes/signals';
import { TabBar } from './TabBar';
import { LayoutRenderer } from './LayoutRenderer';

export function Workspace() {
  return (
    <div class={styles.workspace}>
      <TabBar />
      <div class={styles.tabContent}>
        <Show when={activeTab()}>
          {(tab) => <LayoutRenderer layout={tab().layout} path={[]} />}
        </Show>
      </div>
    </div>
  );
}
