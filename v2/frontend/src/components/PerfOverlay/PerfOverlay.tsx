// Author: Subash Karki

import { createSignal, onCleanup, onMount, Show, For } from 'solid-js';
import {
  getPerfReport,
  getPerfTargets,
  formatDuration,
  formatBytes,
  type PerfReport,
  type PerfTargetCheck,
} from '../../core/bindings/perf';
import { nativeTerminalIsEnabled } from '../../core/bindings/native-terminal';
import * as styles from './PerfOverlay.css';

export function PerfOverlay() {
  const [report, setReport] = createSignal<PerfReport | null>(null);
  const [targets, setTargets] = createSignal<Record<string, PerfTargetCheck>>({});
  const [collapsed, setCollapsed] = createSignal(false);
  const [nativeTerm, setNativeTerm] = createSignal(false);

  const refresh = async () => {
    const [r, t, nt] = await Promise.all([
      getPerfReport(),
      getPerfTargets(),
      nativeTerminalIsEnabled(),
    ]);
    setReport(r);
    setTargets(t ?? {});
    setNativeTerm(nt);
  };

  onMount(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    onCleanup(() => clearInterval(id));
  });

  return (
    <div class={styles.overlay} data-collapsed={collapsed()}>
      <button
        class={styles.header}
        onClick={() => setCollapsed(!collapsed())}
        type="button"
      >
        <span>PERF</span>
        <Show when={report()}>
          {(r) => (
            <span class={styles.headerSummary}>
              {formatBytes(r().mem_rss_bytes)} · {r().goroutine_count}g · {r().worktree_count}w
            </span>
          )}
        </Show>
      </button>

      <Show when={!collapsed()}>
        <Show when={report()} fallback={<div class={styles.loading}>loading…</div>}>
          {(r) => (
            <div class={styles.body}>
              <Row label="boot" value={formatDuration(r().boot_duration_ns)} />
              <Section label="git status">
                <Row label="p50" value={formatDuration(r().git_status.p50_ns)} sub={`n=${r().git_status.count}`} />
                <Row label="p95" value={formatDuration(r().git_status.p95_ns)} />
                <Row label="max" value={formatDuration(r().git_status.max_ns)} />
              </Section>
              <Section label="project switch">
                <Row label="p50" value={formatDuration(r().project_switch.p50_ns)} sub={`n=${r().project_switch.count}`} />
                <Row label="p95" value={formatDuration(r().project_switch.p95_ns)} />
              </Section>
              <Section label="sidebar refresh">
                <Row label="p50" value={formatDuration(r().sidebar_refresh.p50_ns)} sub={`n=${r().sidebar_refresh.count}`} />
                <Row label="p95" value={formatDuration(r().sidebar_refresh.p95_ns)} />
              </Section>
              <Section label="memory">
                <Row label="rss" value={formatBytes(r().mem_rss_bytes)} />
                <Row label="heap" value={formatBytes(r().heap_alloc_bytes)} />
                <Row label="goroutines" value={String(r().goroutine_count)} />
              </Section>
              <Section label="terminal">
                <Row label="native (libghostty)" value={nativeTerm() ? 'on' : 'off'} />
              </Section>
            </div>
          )}
        </Show>

        <div class={styles.targets}>
          <For each={Object.entries(targets())}>
            {([key, check]) => (
              <div class={styles.targetRow} data-met={check.met}>
                <span class={styles.targetKey}>{key.replace(/_/g, ' ')}</span>
                <span class={styles.targetValue}>
                  {check.met ? '✓' : '·'} {check.actual} / {check.target}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Row(props: { label: string; value: string; sub?: string }) {
  return (
    <div class={styles.row}>
      <span class={styles.label}>{props.label}</span>
      <span class={styles.value}>{props.value}</span>
      <Show when={props.sub}>
        <span class={styles.sub}>{props.sub}</span>
      </Show>
    </div>
  );
}

function Section(props: { label: string; children: any }) {
  return (
    <div class={styles.section}>
      <div class={styles.sectionLabel}>{props.label}</div>
      {props.children}
    </div>
  );
}
