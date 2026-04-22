// PhantomOS v2 — Tab bar strip
// Author: Subash Karki

import { For } from 'solid-js';
import { Tabs } from '@kobalte/core/tabs';
import * as styles from '@/styles/panes.css';
import { tabs, workspace, setActiveTab, addTab, removeTab } from '@/core/panes/signals';

export function TabBar() {
  return (
    <Tabs
      value={workspace.activeTabId}
      onChange={setActiveTab}
      activationMode="manual"
      class={styles.tabBar}
    >
      <Tabs.List class={styles.tabList}>
        <For each={tabs()}>
          {(tab) => (
            <Tabs.Trigger
              value={tab.id}
              class={styles.tab}
              title={tab.label}
            >
              <span class={styles.tabLabel}>{tab.label}</span>
              {tab.label !== 'Home' && (
                <span
                  class={styles.tabClose}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      removeTab(tab.id);
                    }
                  }}
                  aria-label={`Close ${tab.label}`}
                >
                  &#x2715;
                </span>
              )}
            </Tabs.Trigger>
          )}
        </For>
      </Tabs.List>

      <button
        class={styles.tabAdd}
        onClick={() => addTab('terminal')}
        type="button"
        title="New terminal tab"
        aria-label="Add tab"
      >
        +
      </button>
    </Tabs>
  );
}
