// Phantom — Live server log lines for the header drawer
// Author: Subash Karki

import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { getRecentAppLogs } from '@/core/bindings/applog';
import * as styles from './AppBackendLogDrawer.css';

export interface AppBackendLogDrawerProps {
  open: Accessor<boolean>;
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'default';

interface ParsedLine {
  timestamp: string;
  level: LogLevel;
  levelLabel: string;
  message: string;
}

/** Strip ANSI escape sequences (e.g. \x1B[1;38;5;86m or bare [32m variants). */
const stripAnsi = (str: string): string =>
  str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\[[\d;]*m/g, '');

/** Extract HH:MM:SS from common timestamp formats, or return '' if none found. */
const extractTime = (raw: string): string => {
  // ISO-8601: 2006-01-02T15:04:05 / 2006-01-02 15:04:05
  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
  if (isoMatch) return isoMatch[0].slice(-8); // HH:MM:SS
  // Bare time: 15:04:05 at start of line
  const bareMatch = raw.match(/^\d{2}:\d{2}:\d{2}/);
  if (bareMatch) return bareMatch[0];
  return '';
};

/** Detect the log level from the cleaned line text. */
const detectLevel = (line: string): { level: LogLevel; label: string } => {
  const upper = line.toUpperCase();
  if (/\bERROR\b|\bERRO\b|\bFATAL\b/.test(upper)) return { level: 'error', label: 'ERR' };
  if (/\bWARN(ING)?\b/.test(upper)) return { level: 'warn', label: 'WRN' };
  if (/\bINFO?\b|\bINF\b/.test(upper)) return { level: 'info', label: 'INF' };
  if (/\bDEBUG\b|\bDBG\b|\bTRACE\b/.test(upper)) return { level: 'debug', label: 'DBG' };
  return { level: 'default', label: '' };
};

/** Parse one raw log line into its displayable parts. */
const parseLine = (raw: string): ParsedLine => {
  const clean = stripAnsi(raw);
  const timestamp = extractTime(clean);
  const { level, label } = detectLevel(clean);

  // Strip the full timestamp from the message to avoid repetition
  const message = clean
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/, '')
    .replace(/^\d{2}:\d{2}:\d{2}\s*/, '')
    .replace(/\b(ERROR|ERRO|FATAL|WARN(?:ING)?|INFO?|INF|DEBUG|DBG|TRACE)\b/i, '')
    .trim();

  return { timestamp, level, levelLabel: label, message };
};

const levelBadgeStyle: Record<LogLevel, string> = {
  error: styles.logLevelError,
  warn: styles.logLevelWarn,
  info: styles.logLevelInfo,
  debug: styles.logLevelDebug,
  default: styles.logLevelDefault,
};

const messageStyle: Record<LogLevel, string> = {
  error: styles.logMessageError,
  warn: styles.logMessageWarn,
  info: styles.logMessage,
  debug: styles.logMessage,
  default: styles.logMessage,
};

type LevelFilter = 'all' | 'error' | 'warn' | 'info' | 'debug';

const LEVEL_PILLS: { id: LevelFilter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'error', label: 'ERR' },
  { id: 'warn', label: 'WRN' },
  { id: 'info', label: 'INF' },
  { id: 'debug', label: 'DBG' },
];

export function AppBackendLogDrawer(props: AppBackendLogDrawerProps): JSX.Element {
  const [logLines, setLogLines] = createSignal<string[]>([]);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [levelFilter, setLevelFilter] = createSignal<LevelFilter>('all');
  let logContainerEl: HTMLDivElement | undefined;

  const pull = async () => {
    setLogLines(await getRecentAppLogs(200));
  };

  createEffect(() => {
    if (!props.open()) return;
    void pull();
    const id = setInterval(() => void pull(), 2000);
    onCleanup(() => clearInterval(id));
  });

  const allParsedLines = createMemo(() => logLines().map(parseLine));

  const filteredLines = createMemo(() => {
    let lines = allParsedLines();

    const level = levelFilter();
    if (level !== 'all') {
      lines = lines.filter((l) => l.level === level);
    }

    const q = searchQuery().toLowerCase().trim();
    if (q) {
      lines = lines.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.level.toLowerCase().includes(q) ||
          l.timestamp.includes(q),
      );
    }

    return lines;
  });

  // Only auto-scroll when not filtering (so user can read filtered results)
  createEffect(() => {
    logLines();
    const q = searchQuery();
    const level = levelFilter();
    if (q || level !== 'all') return;
    const el = logContainerEl;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  return (
    <div class={styles.root}>
      <p class={styles.hint}>
        Last 200 lines · refreshes every 2s while open · pin the header so clicks outside do not close this drawer
      </p>

      {/* Search + filter bar */}
      <div class={styles.searchBar}>
        <div class={styles.searchInputWrapper}>
          <input
            class={styles.searchInput}
            type="text"
            placeholder="Filter logs..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            spellcheck={false}
          />
          <Show when={searchQuery().length > 0}>
            <button
              class={styles.clearButton}
              type="button"
              onClick={() => setSearchQuery('')}
              title="Clear filter"
            >
              ×
            </button>
          </Show>
        </div>

        <div class={styles.filterPills}>
          <For each={LEVEL_PILLS}>
            {(pill) => {
              const isActive = () => levelFilter() === pill.id;
              const pillClass = () => {
                if (!isActive()) return styles.pill;
                if (pill.id === 'error') return `${styles.pill} ${styles.pillActiveError}`;
                if (pill.id === 'warn') return `${styles.pill} ${styles.pillActiveWarn}`;
                if (pill.id === 'info') return `${styles.pill} ${styles.pillActiveInfo}`;
                if (pill.id === 'debug') return `${styles.pill} ${styles.pillActiveDebug}`;
                return `${styles.pill} ${styles.pillActive}`;
              };
              return (
                <button
                  class={pillClass()}
                  type="button"
                  onClick={() => setLevelFilter(pill.id)}
                >
                  {pill.label}
                </button>
              );
            }}
          </For>
        </div>

        <span class={styles.matchCount}>
          {filteredLines().length} / {allParsedLines().length}
        </span>
      </div>

      <div
        class={styles.logContainer}
        ref={(el) => {
          logContainerEl = el ?? undefined;
        }}
      >
        {filteredLines().length === 0 ? (
          <span class={styles.logEmpty}>
            {allParsedLines().length === 0 ? 'No log lines yet.' : 'No lines match filter.'}
          </span>
        ) : (
          <For each={filteredLines()}>
            {(parsed) => (
              <div class={styles.logLine}>
                {parsed.timestamp && (
                  <span class={styles.logTimestamp}>{parsed.timestamp}</span>
                )}
                {parsed.levelLabel && (
                  <span class={levelBadgeStyle[parsed.level]}>{parsed.levelLabel}</span>
                )}
                <span class={messageStyle[parsed.level]}>
                  {parsed.message || '—'}
                </span>
              </div>
            )}
          </For>
        )}
      </div>
    </div>
  );
}
