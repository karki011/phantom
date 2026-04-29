// PhantomOS v2 — System Cockpit with live metrics, analytics, resources, project dashboard, and hunter profile
// Author: Subash Karki

import { lazy, Show, type JSX } from 'solid-js';
import { Gauge } from 'lucide-solid';
import { MetricsPanel } from './MetricsPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ResourceMonitorPanel } from './ResourceMonitorPanel';
import { ProjectDashboardPanel } from './ProjectDashboardPanel';
import { gamificationEnabled } from '@/core/signals/gamification';
import { cockpitView, setCockpitView } from '@/core/signals/app';
import * as styles from './SystemCockpit.css';

const HunterProfileView = lazy(() =>
  import('@/screens/hunter/HunterProfileView').then((m) => ({ default: m.HunterProfileView })),
);

export function SystemCockpit(): JSX.Element {

  return (
    <div class={styles.cockpitContainer}>
      <Show when={cockpitView() === 'system'}>
        <div class={styles.cockpitHeader}>
          <div class={styles.cockpitHeaderRow}>
            <Gauge size={28} class={styles.cockpitIcon} />
            <div class={styles.cockpitTitle}>System Cockpit</div>
            <span class={styles.cockpitBadge}>Live</span>

            <Show when={gamificationEnabled()}>
              <button
                type="button"
                class={styles.cockpitBadge}
                style={{
                  cursor: 'pointer',
                  'margin-left': 'auto',
                  border: 'none',
                }}
                onClick={() => setCockpitView('hunter')}
              >
                Hunter Profile
              </button>
            </Show>
          </div>
          <p class={styles.cockpitSubtitle}>
            Live system metrics, session analytics, resource monitoring, and project overview.
          </p>
        </div>
      </Show>

      <Show
        when={cockpitView() === 'system'}
        fallback={
          <div style={{ flex: 1, 'min-height': 0, 'overflow-y': 'auto' }}>
            <HunterProfileView />
          </div>
        }
      >
        <div class={styles.cockpitGrid}>
          <div class={styles.gridCell}>
            <MetricsPanel />
          </div>
          <div class={styles.gridCell}>
            <AnalyticsPanel />
          </div>
          <div class={styles.gridCell}>
            <ResourceMonitorPanel />
          </div>
          <div class={styles.gridCell}>
            <ProjectDashboardPanel />
          </div>
        </div>
      </Show>
    </div>
  );
}
