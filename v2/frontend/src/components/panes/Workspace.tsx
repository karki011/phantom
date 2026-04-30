// Phantom — Workspace root component (tab bar + active layout)
// Author: Subash Karki

import { For, createEffect, on } from 'solid-js';
import * as styles from '@/styles/panes.css';
import { activeTab, tabs } from '@/core/panes/signals';
import { getAllSessions, safeFit } from '@/core/terminal/registry';
import { TabBar } from './TabBar';
import { LayoutRenderer } from './LayoutRenderer';

export function Workspace() {
  createEffect(on(() => activeTab()?.id, () => {
    const refitAll = () => {
      for (const session of getAllSessions()) {
        if (session.attached) safeFit(session);
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(refitAll);
    });
    setTimeout(refitAll, 150);
  }));

  return (
    <div class={styles.workspace}>
      <TabBar />
      <div class={styles.tabContent}>
        <For each={tabs()}>
          {(tab) => (
            <div style={{
              width: '100%',
              height: '100%',
              display: tab.id === activeTab()?.id ? 'flex' : 'none',
            }}>
              <LayoutRenderer layout={tab.layout} path={[]} />
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
