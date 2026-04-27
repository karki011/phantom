// PhantomOS v2 — System Cockpit with live metrics, analytics, resources, and project dashboard
// Author: Subash Karki

import { Gauge } from 'lucide-solid';
import { MetricsPanel } from './MetricsPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ResourceMonitorPanel } from './ResourceMonitorPanel';
import { ProjectDashboardPanel } from './ProjectDashboardPanel';
import * as styles from './SystemCockpit.css';

import type { JSX } from 'solid-js';

export function SystemCockpit(): JSX.Element {
  return (
    <div class={styles.cockpitContainer}>
      <div class={styles.cockpitHeader}>
        <div class={styles.cockpitHeaderRow}>
          <Gauge size={28} class={styles.cockpitIcon} />
          <div class={styles.cockpitTitle}>System Cockpit</div>
          <span class={styles.cockpitBadge}>Live</span>
        </div>
        <p class={styles.cockpitSubtitle}>
          Live system metrics, session analytics, resource monitoring, and project overview.
        </p>
      </div>

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
    </div>
  );
}
