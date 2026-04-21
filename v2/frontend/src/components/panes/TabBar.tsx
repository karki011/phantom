// PhantomOS v2 — Tab bar strip
// Author: Subash Karki

import { For } from 'solid-js';
import * as styles from '@/styles/panes.css';
import { tabs, workspace, setActiveTab, addTab, removeTab } from '@/core/panes/signals';

export function TabBar() {
  return (
    <div class={styles.tabBar} role="tablist">
      <For each={tabs()}>
        {(tab) => {
          const isActive = () => workspace.activeTabId === tab.id;

          const handleTabClick = () => {
            setActiveTab(tab.id);
          };

          const handleClose = (e: MouseEvent) => {
            e.stopPropagation();
            removeTab(tab.id);
          };

          return (
            <button
              class={`${styles.tab} ${isActive() ? styles.tabActive : ''}`}
              role="tab"
              aria-selected={isActive()}
              onClick={handleTabClick}
              type="button"
              title={tab.label}
            >
              <span class={styles.tabLabel}>{tab.label}</span>
              <span
                class={styles.tabClose}
                onClick={handleClose}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleClose(e as any)}
                aria-label={`Close ${tab.label}`}
              >
                &#x2715;
              </span>
            </button>
          );
        }}
      </For>

      {/* Add tab button */}
      <button
        class={styles.tabAdd}
        onClick={() => addTab('terminal')}
        type="button"
        title="New terminal tab"
        aria-label="Add tab"
      >
        +
      </button>
    </div>
  );
}
