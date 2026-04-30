// Phantom — Right Identity Rail (44px collapsed sidebar)
// Author: Subash Karki

import { Show, For } from 'solid-js';
import { Files, GitCompare, ShieldAlert, Activity, ChevronsLeft } from 'lucide-solid';
import type { Component, JSX } from 'solid-js';
import { Tip } from '@/shared/Tip/Tip';
import {
  rightSidebarTab,
  setRightSidebarTab,
  setRightSidebarCollapsed,
  filesCount,
  changesCount,
  activityCount,
} from '@/core/signals/files';
import { wardAlertCount } from '@/core/signals/wards';
import { prStatus, isCreatingPr } from '@/core/signals/activity';
import * as styles from '@/styles/sidebar-rail.css';
import * as rightStyles from '@/styles/right-sidebar.css';

type TabId = 'files' | 'changes' | 'alerts' | 'activity';

interface TabSpec {
  id: TabId;
  label: string;
  icon: Component<{ size?: number }>;
  count: () => number;
}

const TABS: TabSpec[] = [
  { id: 'files', label: 'Files', icon: Files, count: filesCount },
  { id: 'changes', label: 'Changes', icon: GitCompare, count: changesCount },
  { id: 'alerts', label: 'Alerts', icon: ShieldAlert, count: wardAlertCount },
  { id: 'activity', label: 'Activity', icon: Activity, count: activityCount },
];

export function RightRail() {
  function handleClick(id: TabId) {
    setRightSidebarTab(id);
    setRightSidebarCollapsed(false);
  }

  function tooltipFor(spec: TabSpec): string {
    const c = spec.count();
    return c > 0 ? `${spec.label} · ${c}` : spec.label;
  }

  function renderActivityBadge(): JSX.Element {
    if (isCreatingPr()) {
      return (
        <span class={styles.activityDotWrapper}>
          <span class={`${rightStyles.activityDot} ${rightStyles.activityDotPulse} ${rightStyles.statusDotDefault}`} />
        </span>
      );
    }
    if (prStatus()?.state === 'OPEN') {
      return (
        <span class={styles.activityDotWrapper}>
          <span class={`${rightStyles.activityDot} ${rightStyles.statusDotActive}`} />
        </span>
      );
    }
    if (activityCount() > 0) {
      return <span class={styles.iconBadge}>{activityCount()}</span>;
    }
    return null;
  }

  function expandSidebar() {
    setRightSidebarCollapsed(false);
  }

  return (
    <aside class={styles.rightRail} aria-label="Collapsed activity rail">
      <Tip label="Expand sidebar" placement="left">
        <button
          type="button"
          class={styles.railChevron}
          onClick={expandSidebar}
          aria-label="Expand sidebar"
        >
          <ChevronsLeft size={14} />
        </button>
      </Tip>
      <For each={TABS}>
        {(spec) => {
          const Icon = spec.icon;
          const isActive = () => rightSidebarTab() === spec.id;
          return (
            <Tip label={tooltipFor(spec)} placement="left">
              <button
                type="button"
                class={`${styles.iconButton} ${isActive() ? styles.iconButtonActive : ''}`}
                onClick={() => handleClick(spec.id)}
                aria-label={tooltipFor(spec)}
                aria-pressed={isActive()}
              >
                <Icon size={16} />
                <Show when={spec.id === 'activity'} fallback={
                  <Show when={spec.count() > 0}>
                    <span class={spec.id === 'changes' ? `${styles.iconBadge} ${styles.iconBadgeAccent}` : styles.iconBadge}>
                      {spec.count()}
                    </span>
                  </Show>
                }>
                  {renderActivityBadge()}
                </Show>
              </button>
            </Tip>
          );
        }}
      </For>
    </aside>
  );
}
