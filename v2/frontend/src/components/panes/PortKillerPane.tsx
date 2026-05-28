// Author: Subash Karki

import { createSignal, createMemo, onMount, onCleanup, For, Show } from 'solid-js';
import { Skull, RefreshCw, Search } from 'lucide-solid';
import * as styles from '@/styles/port-killer.css';
import { vars } from '@/styles/theme.css';

interface PortProcess {
  pid: number;
  command: string;
  user: string;
  port: number;
  type: string;
  node: string;
}

const App = () => (window as any).go?.app?.App;

export default function PortKillerPane() {
  const [ports, setPorts] = createSignal<PortProcess[]>([]);
  const [filter, setFilter] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [killing, setKilling] = createSignal<number | null>(null); // PID being confirmed for kill
  const [lastRefresh, setLastRefresh] = createSignal<Date>(new Date());

  async function refresh() {
    try {
      const result = await App()?.GetListeningPorts();
      if (result) setPorts(result);
    } catch (e) {
      console.error('[PortKiller] refresh failed:', e);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }

  onMount(() => { refresh(); });

  // Auto-refresh every 3 seconds
  const interval = setInterval(refresh, 3000);
  onCleanup(() => clearInterval(interval));

  const filtered = createMemo(() => {
    const q = filter().toLowerCase().trim();
    if (!q) return ports();
    return ports().filter((p) =>
      String(p.port).includes(q) ||
      p.command.toLowerCase().includes(q) ||
      String(p.pid).includes(q) ||
      p.user.toLowerCase().includes(q)
    );
  });

  async function killProcess(pid: number) {
    try {
      await App()?.KillPortProcess(pid);
      setKilling(null);
      await refresh();
    } catch (e) {
      console.error('[PortKiller] kill failed:', e);
    }
  }

  return (
    <div class={styles.container}>
      {/* Header with search */}
      <div class={styles.header}>
        <Search size={14} color={vars.color.textDisabled} />
        <input
          class={styles.searchInput}
          type="text"
          placeholder="Filter by port, command, or PID..."
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          autofocus
        />
        <span class={styles.portCount}>
          {filtered().length} port{filtered().length !== 1 ? 's' : ''}
        </span>
        <button
          class={styles.killButton}
          style={{ color: vars.color.textSecondary, 'border-color': vars.color.border }}
          onClick={() => refresh()}
          title="Refresh"
          type="button"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Table */}
      <Show when={!loading() && filtered().length > 0}>
        <div class={styles.tableHeader}>
          <span>Port</span>
          <span>PID</span>
          <span>Command</span>
          <span>User</span>
          <span>Type</span>
          <span></span>
        </div>
        <div class={styles.tableWrapper}>
          <For each={filtered()}>
            {(proc) => (
              <div class={styles.row}>
                <span class={styles.cellPort}>{proc.port}</span>
                <span class={styles.cellPid}>{proc.pid}</span>
                <span class={styles.cellCommand} title={proc.command}>{proc.command}</span>
                <span class={styles.cellUser}>{proc.user}</span>
                <span class={styles.cellType}>{proc.type}</span>
                <button
                  class={styles.killButton}
                  onClick={() => setKilling(proc.pid)}
                  type="button"
                >
                  Kill
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && filtered().length === 0}>
        <div class={styles.emptyState}>
          <Skull size={32} />
          <Show when={filter()}>
            <span>No ports matching "{filter()}"</span>
          </Show>
          <Show when={!filter()}>
            <span>No listening ports found</span>
          </Show>
        </div>
      </Show>

      {/* Loading state */}
      <Show when={loading()}>
        <div class={styles.emptyState}>
          <span>Scanning ports...</span>
        </div>
      </Show>

      {/* Kill confirmation dialog */}
      <Show when={killing() !== null}>
        <div class={styles.confirmOverlay} onClick={() => setKilling(null)}>
          <div class={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ 'font-size': vars.fontSize.md, color: vars.color.textPrimary }}>
              Kill process {killing()}?
            </div>
            <div style={{ 'font-size': vars.fontSize.sm, color: vars.color.textSecondary }}>
              {(() => {
                const proc = ports().find((p) => p.pid === killing());
                return proc ? `${proc.command} on port ${proc.port}` : '';
              })()}
            </div>
            <div style={{ 'font-size': vars.fontSize.xs, color: vars.color.textDisabled }}>
              This will send SIGTERM to the process.
            </div>
            <div class={styles.confirmActions}>
              <button class={styles.confirmCancel} onClick={() => setKilling(null)} type="button">
                Cancel
              </button>
              <button class={styles.confirmKill} onClick={() => { const pid = killing(); if (pid) killProcess(pid); }} type="button">
                Kill Process
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
