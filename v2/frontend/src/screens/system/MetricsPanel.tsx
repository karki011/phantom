// Phantom — Live system metrics panel with arc gauges
// Author: Subash Karki

import { createSignal, createMemo, onMount, onCleanup, Show } from 'solid-js';
import { systemStats } from '@/core/signals/system-stats';
import { healthCheck } from '@/core/bindings/health';
import { ArcGauge } from '@/shared/ArcGauge/ArcGauge';
import * as styles from './MetricsPanel.css';

import type { JSX } from 'solid-js';
import type { HealthResponse } from '@/core/types';

const formatUptime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatGB = (gb: number): string => {
  if (gb >= 100) return `${Math.round(gb)}`;
  return gb.toFixed(1);
};

export function MetricsPanel(): JSX.Element {
  const [health, setHealth] = createSignal<HealthResponse | null>(null);

  // Poll health endpoint on mount + every 5s
  let healthTimer: ReturnType<typeof setInterval> | undefined;

  const pollHealth = async () => {
    const res = await healthCheck();
    if (res) setHealth(res);
  };

  onMount(() => {
    void pollHealth();
    healthTimer = setInterval(pollHealth, 5000);
  });

  onCleanup(() => {
    if (healthTimer) clearInterval(healthTimer);
  });

  // Derived gauge values
  const cpuPercent = createMemo(() => systemStats().cpu_percent);

  const memPercent = createMemo(() => {
    const s = systemStats();
    return s.mem_total_gb > 0 ? (s.mem_used_gb / s.mem_total_gb) * 100 : 0;
  });

  const diskPercent = createMemo(() => {
    const s = systemStats();
    return s.disk_total_gb > 0
      ? (s.disk_used_gb / s.disk_total_gb) * 100
      : 0;
  });

  const batteryPercent = createMemo(() => systemStats().battery_percent);
  const showBattery = createMemo(() => systemStats().battery_percent >= 0);

  // Sublabels
  const memSublabel = createMemo(() => {
    const s = systemStats();
    return `${formatGB(s.mem_used_gb)} / ${formatGB(s.mem_total_gb)} GB`;
  });

  const diskSublabel = createMemo(() => {
    const s = systemStats();
    return `${formatGB(s.disk_used_gb)} / ${formatGB(s.disk_total_gb)} GB`;
  });

  const cpuSublabel = createMemo(
    () => `${Math.round(cpuPercent())}%`,
  );

  const batterySublabel = createMemo(() =>
    systemStats().battery_charging ? 'Charging' : 'On Battery',
  );

  return (
    <div class={styles.panelContainer}>
      {/* Primary gauges */}
      <div class={styles.gaugesRow}>
        <ArcGauge
          value={cpuPercent()}
          label="CPU"
          sublabel={cpuSublabel()}
          size={140}
        />
        <ArcGauge
          value={memPercent()}
          label="Memory"
          sublabel={memSublabel()}
          size={140}
        />
        <ArcGauge
          value={diskPercent()}
          label="Disk"
          sublabel={diskSublabel()}
          size={140}
        />
        <Show when={showBattery()}>
          <ArcGauge
            value={batteryPercent()}
            label="Battery"
            sublabel={batterySublabel()}
            size={140}
          />
        </Show>
      </div>

      {/* Secondary stats from health pulse */}
      <Show when={health()}>
        {(h) => (
          <div class={styles.secondaryRow}>
            <div class={styles.secondaryStat}>
              <span class={styles.secondaryValue}>
                {h().goroutines}
              </span>
              <span class={styles.secondaryLabel}>Goroutines</span>
            </div>
            <div class={styles.secondaryStat}>
              <span class={styles.secondaryValue}>
                {formatUptime(h().uptime_ms)}
              </span>
              <span class={styles.secondaryLabel}>Uptime</span>
            </div>
            <div class={styles.secondaryStat}>
              <span class={styles.secondaryValue}>
                {h().mem_alloc_mb.toFixed(1)} MB
              </span>
              <span class={styles.secondaryLabel}>Go Alloc</span>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
