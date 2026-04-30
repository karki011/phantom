// PhantomOS v2 — Daily Digest
// Markdown-based daily digest with Morning Brief, Work Log, End of Day, and Notes.
// Ported from v1 JournalPane to SolidJS.
// Author: Subash Karki

import { onMount, onCleanup, For, Show, createSignal, createMemo, type JSX } from 'solid-js';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Calendar,
  CalendarDays,
  Activity,
  Clock,
  GitCommit,
  Loader,
  ChevronDown,
} from 'lucide-solid';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { vars } from '@/styles/theme.css';
import {
  bootstrapJournal,
  journalEntry,
  setJournalEntry,
  selectedDate,
  loadJournalEntry,
  journalLoading,
  selectedProject,
  setSelectedProject,
} from '@/core/signals/journal';
import { projects } from '@/core/signals/projects';
import {
  generateMorningBrief,
  generateEndOfDay,
  updateJournalNotes,
} from '@/core/bindings/journal';
import { onWailsEvent } from '@/core/events';
import * as styles from '@/styles/journal.css';

// ── Date helpers ─────────────────────────────────────────────────────────────

const todayStr = (): string => new Date().toISOString().slice(0, 10);

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const formatFullDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const formatTime = (ms: number): string => {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

// ── Rich text rendering ──────────────────────────────────────────────────────

/** Highlight [project-name] in cyan, PR #N in purple, $amounts in gold, checkmarks in green. */
const renderLine = (text: string): JSX.Element => {
  const parts: JSX.Element[] = [];
  let key = 0;

  // Parse markdown links [text](url) and plain [brackets]
  const bracketRegex = /\[([^\]]+)\](?:\((https?:\/\/[^)]+)\))?/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = bracketRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<>{highlightInline(text.slice(lastIndex, match.index), key++)}</>);
    }

    const linkText = match[1];
    const url = match[2];

    if (url) {
      parts.push(
        <a
          href={url}
          onClick={(e) => { e.preventDefault(); window.open(url, '_blank'); }}
          class={styles.markdownLink}
        >
          {linkText}
        </a>,
      );
    } else {
      parts.push(
        <span class={styles.bracketSpan}>
          [{linkText}]
        </span>,
      );
    }
    lastIndex = bracketRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(<>{highlightInline(text.slice(lastIndex), key++)}</>);
  }

  return <>{parts}</>;
};

/** Highlight PR #N, $amounts, and checkmarks in a plain text segment. */
const highlightInline = (text: string, _key: number): JSX.Element => {
  // Split on PR #N, $amounts, and checkmarks
  const regex = /(PR #\d+|\$[\d.]+|✓)/g;
  const parts: JSX.Element[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let k = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<>{text.slice(lastIndex, match.index)}</>);
    }
    const m = match[0];
    if (m.startsWith('PR #')) {
      parts.push(<span class={styles.prHashSpan}>{m}</span>);
    } else if (m.startsWith('$')) {
      parts.push(<span class={styles.amountSpan}>{m}</span>);
    } else if (m === '✓') {
      parts.push(<span class={styles.checkmarkSpan}>{m}</span>);
    }
    lastIndex = regex.lastIndex;
    k++;
  }
  if (lastIndex < text.length) {
    parts.push(<>{text.slice(lastIndex)}</>);
  }
  return <>{parts}</>;
};

// ── Section components ───────────────────────────────────────────────────────

function SectionHeader(props: {
  title: string;
  icon: () => JSX.Element;
  locked: boolean;
  timestamp?: number;
}) {
  return (
    <div class={styles.sectionHeaderRow}>
      <span class={styles.sectionHeaderIcon}>
        {props.icon()}
      </span>
      <span class={styles.sectionHeaderTitle}>
        {props.title}
      </span>
      <Show when={props.timestamp && props.timestamp > 0}>
        <span class={styles.sectionHeaderTimestamp}>
          Generated {formatTime(props.timestamp!)}
        </span>
      </Show>
      <Show when={props.locked}>
        <Lock size={10} class={styles.sectionHeaderLock} />
      </Show>
    </div>
  );
}

/** Render content block — bullets, headers, sub-bullets */
function ContentBlock(props: { content: string; variant: 'brief' | 'eod' }) {
  const lines = () => props.content.split('\n').filter((l) => l.trim());

  const bgColor = () => props.variant === 'brief'
    ? `color-mix(in srgb, ${vars.color.accent} 6%, transparent)`
    : `color-mix(in srgb, #a855f7 6%, transparent)`;

  const borderColor = () => props.variant === 'brief'
    ? `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`
    : 'color-mix(in srgb, #a855f7 15%, transparent)';

  return (
    <div
      class={styles.contentBlock}
      style={{ '--block-bg': bgColor(), '--block-border': borderColor() }}
    >
      <For each={lines()}>
        {(line, i) => {
          const trimmed = line.replace(/^- /, '').replace(/^  · /, '').trim();
          const isBullet = line.trimStart().startsWith('- ');
          const isSubBullet = line.trimStart().startsWith('· ') || line.trimStart().startsWith('  ·');
          const isHeader = !isBullet && !isSubBullet && !line.startsWith(' ') && i() < 2;

          if (isHeader) {
            return (
              <div class={styles.contentBlockHeading}>
                {renderLine(trimmed)}
              </div>
            );
          }

          if (isBullet) {
            return (
              <div class={styles.bulletRow}>
                <span class={styles.bulletDot}>●</span>
                <span class={styles.bulletText}>
                  {renderLine(trimmed)}
                </span>
              </div>
            );
          }

          if (isSubBullet) {
            return (
              <div class={styles.subBulletText}>
                {renderLine(trimmed)}
              </div>
            );
          }

          return (
            <div class={styles.plainText}>
              {renderLine(trimmed)}
            </div>
          );
        }}
      </For>
    </div>
  );
}

/** Work log with time column + event column */
function WorkLogContent(props: { lines: string[] }) {
  return (
    <div class={styles.workLogContainer}>
      <For each={props.lines}>
        {(line, i) => {
          // Parse "HH:MM ..." pattern
          const timeMatch = line.match(/^(\d{1,2}:\d{2})\s*(.*)/);
          const time = timeMatch ? timeMatch[1] : '';
          const rest = timeMatch ? timeMatch[2] : line;
          const borderBottom = i() < props.lines.length - 1
            ? `1px solid color-mix(in srgb, ${vars.color.border} 50%, transparent)`
            : 'none';

          return (
            <div class={styles.workLogRow} style={{ 'border-bottom': borderBottom }}>
              <Show when={time}>
                <span class={styles.workLogTime}>{time}</span>
              </Show>
              <span class={styles.workLogEvent}>
                {renderLine(rest)}
              </span>
            </div>
          );
        }}
      </For>
    </div>
  );
}

/** Generate button shown when a section hasn't been generated yet */
function GenerateButton(props: { label: string; generating: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => !props.generating && props.onClick()}
      disabled={props.generating}
      class={styles.generateButton}
      data-generating={props.generating ? 'true' : undefined}
    >
      <Show when={props.generating}>
        <Loader size={12} class={styles.generateButtonSpinner} />
      </Show>
      {props.generating ? 'Generating...' : props.label}
    </button>
  );
}

// ── Date Pagination ──────────────────────────────────────────────────────────

function DatePagination() {
  const isFuture = () => selectedDate() >= todayStr();
  const goBack = () => void loadJournalEntry(addDays(selectedDate(), -1));
  const goForward = () => { if (!isFuture()) void loadJournalEntry(addDays(selectedDate(), 1)); };
  const goToday = () => void loadJournalEntry(todayStr());

  return (
    <div class={styles.datePaginationContainer}>
      <CalendarDays size={15} class={styles.datePaginationIcon} />
      <span class={styles.datePaginationLabel}>
        {formatFullDate(selectedDate())}
      </span>
      <button type="button" onClick={goBack} aria-label="Previous day" class={styles.navButton}>
        <ChevronLeft size={14} />
      </button>
      <button
        type="button"
        onClick={goForward}
        aria-label="Next day"
        class={styles.navButton}
        data-disabled={isFuture() ? 'true' : undefined}
        disabled={isFuture()}
      >
        <ChevronRight size={14} />
      </button>
      <Show when={selectedDate() !== todayStr()}>
        <button
          type="button"
          onClick={goToday}
          class={styles.todayButton}
        >
          Today
        </button>
      </Show>
      <Show when={projects().length > 0}>
        <DropdownMenu>
          <DropdownMenu.Trigger class={styles.dropdownTrigger}>
            <span class={styles.dropdownTriggerFlex}>
              {selectedProject() ?? 'All Projects'}
            </span>
            <DropdownMenu.Icon class={styles.dropdownTriggerIcon}>
              <ChevronDown size={12} />
            </DropdownMenu.Icon>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content class={styles.dropdownContent}>
              <DropdownMenu.Item
                class={`${styles.dropdownItem}${!selectedProject() ? ` ${styles.dropdownItemActive}` : ''}`}
                onSelect={() => { setSelectedProject(null); void loadJournalEntry(selectedDate(), null); }}
              >
                All Projects
              </DropdownMenu.Item>
              <For each={projects()}>
                {(p) => (
                  <DropdownMenu.Item
                    class={`${styles.dropdownItem}${selectedProject() === p.name ? ` ${styles.dropdownItemActive}` : ''}`}
                    onSelect={() => { setSelectedProject(p.name); void loadJournalEntry(selectedDate(), p.name); }}
                  >
                    {p.name}
                  </DropdownMenu.Item>
                )}
              </For>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu>
      </Show>
    </div>
  );
}

// ── Main JournalPane ─────────────────────────────────────────────────────────

export default function JournalPane() {
  const [generatingMorning, setGeneratingMorning] = createSignal(false);
  const [generatingEod, setGeneratingEod] = createSignal(false);
  const [notes, setNotes] = createSignal('');
  let notesTimer: ReturnType<typeof setTimeout> | undefined;

  const entry = journalEntry;

  // Sync notes from entry when it changes
  createMemo(() => {
    setNotes(entry().notes ?? '');
  });

  const handleGenerateMorning = async () => {
    setGeneratingMorning(true);
    try {
      const result = await generateMorningBrief(selectedDate(), selectedProject() ?? undefined);
      setJournalEntry(result);
    } finally {
      setGeneratingMorning(false);
    }
  };

  const handleGenerateEod = async () => {
    setGeneratingEod(true);
    try {
      const result = await generateEndOfDay(selectedDate(), selectedProject() ?? undefined);
      setJournalEntry(result);
    } finally {
      setGeneratingEod(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (notesTimer) clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      const result = await updateJournalNotes(selectedDate(), selectedProject() ?? undefined, value);
      setJournalEntry(result);
    }, 1000);
  };

  // Filter work log by selected project
  const filteredWorkLog = createMemo(() => {
    const proj = selectedProject();
    const log = entry().work_log ?? [];
    if (!proj) return log;
    return log.filter((line) => line.includes(`[${proj}]`));
  });

  // Auto-refresh work log when session events fire
  onMount(async () => {
    await bootstrapJournal();

    // Auto-generate morning brief if not yet generated for today
    const currentEntry = entry();
    if (selectedDate() === todayStr() && !currentEntry.morning_generated_at) {
      setGeneratingMorning(true);
      try {
        const result = await generateMorningBrief(todayStr(), selectedProject() ?? undefined);
        setJournalEntry(result);
      } finally {
        setGeneratingMorning(false);
      }
    }

    // Inject spin keyframes
    if (typeof document !== 'undefined') {
      const id = 'journal-spin-keyframes';
      if (!document.getElementById(id)) {
        const style = document.createElement('style');
        style.id = id;
        style.textContent = '@keyframes journal-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
    }
  });

  // Reload entry when session ends (work log updated by backend)
  onWailsEvent('session:end', () => {
    if (selectedDate() === todayStr()) {
      void loadJournalEntry(todayStr());
    }
  });
  onWailsEvent('session:new', () => {
    if (selectedDate() === todayStr()) {
      void loadJournalEntry(todayStr());
    }
  });
  onWailsEvent('session:stale', () => {
    if (selectedDate() === todayStr()) {
      void loadJournalEntry(todayStr());
    }
  });

  // Auto-generate End of Day when the last active session ends.
  onWailsEvent('journal:eod-trigger', async () => {
    if (selectedDate() === todayStr() && !entry().eod_generated_at) {
      setGeneratingEod(true);
      try {
        const result = await generateEndOfDay(todayStr(), selectedProject() ?? undefined);
        setJournalEntry(result);
      } finally {
        setGeneratingEod(false);
      }
    }
  });

  return (
    <div class={styles.journalContainer}>
      {/* Date Navigation */}
      <DatePagination />

      {/* Loading state */}
      <Show when={journalLoading()}>
        <div class={styles.journalLoading}>
          <Loader size={16} class={styles.generateButtonSpinner} />
        </div>
      </Show>

      {/* Journal Sections */}
      <Show when={!journalLoading()}>
        <div class={styles.journalSections}>
          {/* ── Morning Brief ────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Morning Brief"
              icon={() => <Activity size={14} />}
              locked={!!entry().morning_generated_at}
              timestamp={entry().morning_generated_at}
            />
            <div class={styles.sectionScroll}>
              <Show
                when={entry().morning_brief}
                fallback={
                  <GenerateButton
                    label="Generate Morning Brief"
                    generating={generatingMorning()}
                    onClick={handleGenerateMorning}
                  />
                }
              >
                <ContentBlock content={entry().morning_brief} variant="brief" />
              </Show>
            </div>
          </div>

          <div class={styles.sectionDivider} />

          {/* ── Work Log ─────────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Work Log"
              icon={() => <Clock size={14} />}
              locked
            />
            <div class={styles.sectionScroll}>
              <Show
                when={filteredWorkLog().length > 0}
                fallback={
                  <div class={styles.emptyWorkLog}>
                    No activity logged yet today
                  </div>
                }
              >
                <WorkLogContent lines={filteredWorkLog()} />
              </Show>
            </div>
          </div>

          <div class={styles.sectionDivider} />

          {/* ── End of Day ───────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="End of Day"
              icon={() => <GitCommit size={14} />}
              locked={!!entry().eod_generated_at}
              timestamp={entry().eod_generated_at}
            />
            <div class={styles.sectionScroll}>
              <Show
                when={entry().end_of_day_recap}
                fallback={
                  <GenerateButton
                    label="Generate End of Day Recap"
                    generating={generatingEod()}
                    onClick={handleGenerateEod}
                  />
                }
              >
                <ContentBlock content={entry().end_of_day_recap} variant="eod" />

                {/* LLM narrative supplement — slots in async via journal:enriched event. */}
                <Show when={entry().end_of_day_narrative}>
                  <div class={styles.narrativeBlock}>
                    <div class={styles.narrativeLabel}>✨ Narrative</div>
                    {entry().end_of_day_narrative}
                  </div>
                </Show>
              </Show>
            </div>
          </div>

          <div class={styles.sectionDivider} />

          {/* ── Notes ────────────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Notes"
              icon={() => <Pencil size={14} />}
              locked={false}
            />
            <textarea
              value={notes()}
              onInput={(e) => handleNotesChange(e.currentTarget.value)}
              placeholder="Add personal notes..."
              rows={4}
              class={styles.notesTextarea}
            />
          </div>
        </div>
      </Show>
    </div>
  );
}
