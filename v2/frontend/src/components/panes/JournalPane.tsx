// PhantomOS v2 — Activity Journal pane
// Author: Subash Karki

import { onMount, For, Show, createSignal, createMemo } from 'solid-js';
import { ChevronLeft, ChevronRight, FileEdit, GitBranch, Calendar, BookOpen } from 'lucide-solid';
import { vars } from '@/styles/theme.css';
import {
  bootstrapJournal,
  daySessions,
  selectedDate,
  loadDaySessions,
  formatCost,
  formatDuration,
  parseFilesTouched,
} from '@/core/signals/journal';
import type { JournalEntry } from '@/core/types';
import * as styles from '@/styles/journal.css';

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatTime = (epochSecs: number | null): string => {
  if (!epochSecs) return '--:--';
  const d = new Date(epochSecs * 1000);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatFullDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
};

const timeAgo = (epochSecs: number | null): string => {
  if (!epochSecs) return '';
  const diffMins = Math.round((Date.now() / 1000 - epochSecs) / 60);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const hrs = Math.floor(diffMins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const extractPrNumber = (url: string | null): string | null => {
  if (!url) return null;
  const match = url.match(/\/pull\/(\d+)/);
  return match ? `#${match[1]}` : null;
};

const shortModel = (model: string | null): string => {
  if (!model) return '';
  // Trim common prefixes for display
  return model
    .replace('claude-', '')
    .replace('anthropic/', '')
    .replace('-latest', '');
};

const shortRepo = (repo: string | null): string => {
  if (!repo) return '';
  const parts = repo.split('/');
  return parts[parts.length - 1] ?? repo;
};

// ── Date helpers ───────────────────────────────────────────────────────────

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const formatDateLabel = (dateStr: string): string => {
  const today = todayStr();
  const yesterday = addDays(today, -1);
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

// ── DatePagination ──────────────────────────────────────────────────────────

function DatePagination() {
  const isFuture = () => selectedDate() >= todayStr();

  const goBack = () => void loadDaySessions(addDays(selectedDate(), -1));
  const goForward = () => { if (!isFuture()) void loadDaySessions(addDays(selectedDate(), 1)); };
  const goToday = () => void loadDaySessions(todayStr());

  return (
    <div class={styles.calendarHeader}>
      <button class={styles.calendarNavButton} type="button" onClick={goBack} aria-label="Previous day">
        <ChevronLeft size={16} />
      </button>
      <button
        class={styles.calendarTitle}
        type="button"
        onClick={goToday}
        title="Go to today"
        style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', font: 'inherit' }}
      >
        {formatDateLabel(selectedDate())}
      </button>
      <button
        class={styles.calendarNavButton}
        type="button"
        onClick={goForward}
        aria-label="Next day"
        style={{ opacity: isFuture() ? '0.3' : '1' }}
        disabled={isFuture()}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── DayHeader ───────────────────────────────────────────────────────────────

function DayHeader(props: { sessions: () => JournalEntry[] }) {
  const sessions = props.sessions;

  const totalDuration = createMemo(() => {
    let secs = 0;
    for (const s of sessions()) {
      const start = s.started_at ?? 0;
      const end = s.ended_at ?? Math.floor(Date.now() / 1000);
      secs += end - start;
    }
    return formatDuration(0, secs);
  });

  const totalCost = createMemo(() => {
    let micros = 0;
    for (const s of sessions()) {
      micros += s.estimated_cost_micros ?? 0;
    }
    return formatCost(micros);
  });

  const prs = createMemo(() => {
    const result: { number: string; status: string }[] = [];
    for (const s of sessions()) {
      const num = extractPrNumber(s.pr_url);
      if (num) {
        result.push({
          number: num,
          status: (s.pr_status ?? 'open').toLowerCase(),
        });
      }
    }
    return result;
  });

  return (
    <Show when={sessions().length > 0}>
      <div class={styles.dayHeader}>
        <div class={styles.dayHeaderTitle}>
          {formatFullDate(selectedDate())}
        </div>
        <div class={styles.dayHeaderStats}>
          <span>{sessions().length} {sessions().length === 1 ? 'session' : 'sessions'}</span>
          <span class={styles.dot}>&middot;</span>
          <span>{totalDuration()}</span>
          <span class={styles.dot}>&middot;</span>
          <span>{totalCost()}</span>
        </div>
        <Show when={prs().length > 0}>
          <div class={styles.dayHeaderPrs}>
            <For each={prs()}>
              {(pr) => (
                <span
                  class={styles.prBadge}
                  data-status={pr.status}
                >
                  PR {pr.number} &bull; {pr.status === 'merged' ? 'Merged' : pr.status === 'closed' ? 'Closed' : 'Open'}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

// ── SessionCard ─────────────────────────────────────────────────────────────

function SessionCard(props: { session: JournalEntry }) {
  const [expanded, setExpanded] = createSignal(false);

  const s = () => props.session;
  const files = createMemo(() => parseFilesTouched(s().files_touched));
  const linesAdded = () => s().git_lines_added ?? 0;
  const linesRemoved = () => s().git_lines_removed ?? 0;
  const prNumber = () => extractPrNumber(s().pr_url);
  const statusClass = createMemo(() => {
    const st = (s().status ?? '').toLowerCase();
    if (st === 'completed' || st === 'done') return styles.statusDone;
    if (st === 'active' || st === 'running') return styles.statusActive;
    if (st === 'interrupted' || st === 'error') return styles.statusInterrupted;
    return styles.statusDone;
  });
  const statusLabel = createMemo(() => {
    const st = (s().status ?? '').toLowerCase();
    if (st === 'completed' || st === 'done') return 'Done';
    if (st === 'active' || st === 'running') return 'Active';
    if (st === 'interrupted') return 'Interrupted';
    if (st === 'error') return 'Error';
    return st || 'Done';
  });

  // Parse tool breakdown JSON
  const toolBreakdown = createMemo(() => {
    if (!s().tool_breakdown) return [];
    try {
      const parsed = JSON.parse(s().tool_breakdown!) as Record<string, number>;
      const entries = Object.entries(parsed).sort((a, b) => b[1] - a[1]);
      const max = entries[0]?.[1] ?? 1;
      return entries.map(([name, count]) => ({ name, count, pct: (count / max) * 100 }));
    } catch {
      return [];
    }
  });

  return (
    <div class={styles.sessionCard}>
      {/* Collapsed header */}
      <div class={styles.sessionCardHeader} onClick={() => setExpanded((v) => !v)}>
        <div class={styles.sessionCardHeaderLeft}>
          {/* Meta line: time, duration, model, cost */}
          <div class={styles.sessionCardMeta}>
            <span>{formatTime(s().started_at)}</span>
            <span class={styles.dot}>&middot;</span>
            <span>{formatDuration(s().started_at, s().ended_at)}</span>
            <Show when={s().model}>
              <span class={styles.dot}>&middot;</span>
              <span>{shortModel(s().model)}</span>
            </Show>
            <span class={styles.dot}>&middot;</span>
            <span>{formatCost(s().estimated_cost_micros)}</span>
          </div>

          {/* First prompt */}
          <Show when={s().first_prompt}>
            <div class={styles.sessionCardPrompt}>"{s().first_prompt}"</div>
          </Show>

          {/* Files & diff */}
          <div class={styles.sessionCardFiles}>
            <Show when={files().length > 0}>
              <span>
                <FileEdit size={11} style={{ 'vertical-align': 'middle' }} />{' '}
                {files().length <= 3
                  ? files().join(', ')
                  : `${files().slice(0, 2).join(', ')} (+${files().length - 2})`}
              </span>
            </Show>
            <Show when={linesAdded() > 0 || linesRemoved() > 0}>
              <span class={styles.sessionCardDiff}>
                <span>&#x23C7;</span>
                <span class={styles.diffAdded}>+{linesAdded()}</span>
                <span>/</span>
                <span class={styles.diffRemoved}>-{linesRemoved()}</span>
              </span>
            </Show>
          </div>
        </div>

        {/* Right side: PR badge + status + chevron */}
        <div class={styles.sessionCardFooter}>
          <Show when={prNumber()}>
            <span
              class={styles.prBadge}
              data-status={(s().pr_status ?? 'open').toLowerCase()}
            >
              PR {prNumber()} &bull; {(s().pr_status ?? 'Open')}
            </span>
          </Show>
          <span class={`${styles.statusBadge} ${statusClass()}`}>
            {statusLabel()}
          </span>
          <span class={`${styles.chevronIcon}${expanded() ? ` ${styles.chevronOpen}` : ''}`}>
            <ChevronRight size={14} />
          </span>
        </div>
      </div>

      {/* Expanded details */}
      <Show when={expanded()}>
        <div class={styles.sessionDetails}>
          {/* Outcome / summary */}
          <Show when={s().outcome || s().summary}>
            <div class={styles.detailSection}>
              <span class={styles.detailLabel}>Summary</span>
              <span class={styles.detailValue}>{s().outcome ?? s().summary}</span>
            </div>
          </Show>

          {/* Token usage */}
          <div class={styles.detailSection}>
            <span class={styles.detailLabel}>Tokens</span>
            <span class={styles.detailValue}>
              {(s().input_tokens ?? 0).toLocaleString()} in / {(s().output_tokens ?? 0).toLocaleString()} out
              &middot; {s().message_count ?? 0} messages
              &middot; {s().tool_use_count ?? 0} tool calls
            </span>
          </div>

          {/* Branch / commits */}
          <Show when={s().branch}>
            <div class={styles.detailSection}>
              <span class={styles.detailLabel}>Git</span>
              <span class={styles.detailValue}>
                <GitBranch size={11} style={{ 'vertical-align': 'middle' }} />{' '}
                {s().branch}
                <Show when={s().git_commits}>
                  {' '}&middot; {s().git_commits} {s().git_commits === 1 ? 'commit' : 'commits'}
                </Show>
              </span>
            </div>
          </Show>

          {/* Files touched */}
          <Show when={files().length > 0}>
            <div class={styles.detailSection}>
              <span class={styles.detailLabel}>Files Touched</span>
              <div class={styles.fileList}>
                <For each={files()}>
                  {(file) => <span class={styles.fileChip}>{file}</span>}
                </For>
              </div>
            </div>
          </Show>

          {/* Tool breakdown */}
          <Show when={toolBreakdown().length > 0}>
            <div class={styles.detailSection}>
              <span class={styles.detailLabel}>Tool Usage</span>
              <For each={toolBreakdown()}>
                {(tool) => (
                  <div class={styles.toolBreakdownRow}>
                    <span>{tool.name}</span>
                    <span>{tool.count}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── JournalPane (Main) ──────────────────────────────────────────────────────

export default function JournalPane() {
  const [projectFilter, setProjectFilter] = createSignal<string | null>(null);

  const projects = createMemo(() => {
    const repos = new Set<string>();
    for (const s of daySessions()) {
      if (s.repo) repos.add(s.repo);
    }
    return [...repos];
  });

  const filteredSessions = createMemo(() => {
    const filter = projectFilter();
    if (!filter) return daySessions();
    return daySessions().filter((s) => s.repo === filter);
  });

  onMount(() => {
    void bootstrapJournal();
  });

  return (
    <div class={styles.journalContainer}>
      {/* Date Pagination */}
      <DatePagination />

      {/* Project Filter */}
      <Show when={projects().length > 1}>
        <div style={{
          display: 'flex',
          gap: vars.space.xs,
          padding: `0 ${vars.space.lg}`,
          'flex-wrap': 'wrap',
        }}>
          <button
            type="button"
            style={{
              'font-family': vars.font.mono,
              'font-size': vars.fontSize.xs,
              padding: `2px ${vars.space.sm}`,
              background: vars.color.bgTertiary,
              border: `1px solid ${!projectFilter() ? vars.color.accent : vars.color.border}`,
              'border-radius': vars.radius.sm,
              color: !projectFilter() ? vars.color.textPrimary : vars.color.textSecondary,
              cursor: 'pointer',
            }}
            onClick={() => setProjectFilter(null)}
          >
            All
          </button>
          <For each={projects()}>
            {(repo) => {
              const name = repo.split('/').pop() ?? repo;
              return (
                <button
                  type="button"
                  style={{
                    'font-family': vars.font.mono,
                    'font-size': vars.fontSize.xs,
                    padding: `2px ${vars.space.sm}`,
                    background: vars.color.bgTertiary,
                    border: `1px solid ${projectFilter() === repo ? vars.color.accent : vars.color.border}`,
                    'border-radius': vars.radius.sm,
                    color: projectFilter() === repo ? vars.color.textPrimary : vars.color.textSecondary,
                    cursor: 'pointer',
                  }}
                  onClick={() => setProjectFilter(repo)}
                >
                  {name}
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Day Header */}
      <DayHeader sessions={filteredSessions} />

      {/* Section divider */}
      <Show when={filteredSessions().length > 0}>
        <div class={styles.sectionDivider} />
      </Show>

      {/* Session Cards */}
      <Show
        when={filteredSessions().length > 0}
        fallback={
          <div style={{
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            'justify-content': 'center',
            flex: '1',
            gap: vars.space.lg,
            padding: vars.space.xxl,
          }}>
            <div style={{
              display: 'flex',
              'flex-direction': 'column',
              'align-items': 'center',
              gap: vars.space.md,
              'max-width': '360px',
              'text-align': 'center',
            }}>
              <span style={{
                color: vars.color.accent,
                opacity: '0.4',
              }}>
                <BookOpen size={40} />
              </span>
              <div style={{
                width: '80px',
                height: '1px',
                background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
                opacity: '0.4',
              }} />
              <span style={{
                'font-family': vars.font.mono,
                'font-size': vars.fontSize.sm,
                color: vars.color.textSecondary,
              }}>
                No activity on {formatDateLabel(selectedDate()).toLowerCase()}
              </span>
              <span style={{
                'font-family': vars.font.mono,
                'font-size': vars.fontSize.xs,
                color: vars.color.textDisabled,
                'line-height': '1.6',
              }}>
                Sessions will appear here as you work with Claude.
                Navigate to a different day or start a new session.
              </span>
            </div>
          </div>
        }
      >
        <div class={styles.sessionList}>
          <For each={filteredSessions()}>
            {(session) => <SessionCard session={session} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
