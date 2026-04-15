/**
 * JournalPane — Daily developer journal with auto-generated briefs
 * Opens to today's date. Browse past days with arrow navigation.
 *
 * @author Subash Karki
 */
import { ScrollArea, Text } from '@mantine/core';
import { Lock, Pencil, ChevronLeft, ChevronRight, CalendarDays, Loader2, GitCommit, GitPullRequest, Activity, Clock } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JournalEntry } from '../lib/api';
import {
  getJournal,
  generateMorningBrief,
  generateEndOfDay,
  updateJournalNotes,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Content rendering — parse journal text into styled elements
// ---------------------------------------------------------------------------

/** Highlight [project-name] brackets, markdown links, PR #numbers, and $amounts */
function renderLine(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Step 1: Parse markdown links [text](url) and plain [brackets]
  // Markdown links match [text](url), plain brackets match [text] not followed by (
  const bracketRegex = /\[([^\]]+)\](?:\((https?:\/\/[^)]+)\))?/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = bracketRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const linkText = match[1];
    const url = match[2];

    if (url) {
      // Clickable markdown link — open in system browser
      parts.push(
        <a
          key={key++}
          href={url}
          onClick={(e) => { e.preventDefault(); window.open(url, '_blank'); }}
          style={{ color: '#a855f7', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
        >
          {linkText}
        </a>,
      );
    } else {
      // Plain [project-name] — cyan highlight
      parts.push(
        <span key={key++} style={{ color: 'var(--phantom-accent-cyan, #06b6d4)', fontWeight: 600 }}>
          [{linkText}]
        </span>,
      );
    }
    lastIndex = bracketRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // Step 2: Highlight PR #numbers and $amounts in remaining text segments
  const finalParts: React.ReactNode[] = [];
  for (const part of parts) {
    if (typeof part !== 'string') { finalParts.push(part); continue; }
    const prParts = part.split(/(PR #\d+)/g);
    for (const p of prParts) {
      if (/^PR #\d+$/.test(p)) {
        finalParts.push(<span key={key++} style={{ color: '#a855f7', fontWeight: 600 }}>{p}</span>);
      } else if (/\$[\d.]+/.test(p)) {
        // Highlight dollar amounts
        const dollarParts = p.split(/(\$[\d.]+)/g);
        for (const dp of dollarParts) {
          if (/^\$[\d.]+$/.test(dp)) {
            finalParts.push(<span key={key++} style={{ color: 'var(--phantom-accent-gold, #f59e0b)', fontWeight: 600 }}>{dp}</span>);
          } else {
            finalParts.push(dp);
          }
        }
      } else {
        finalParts.push(p);
      }
    }
  }

  return finalParts;
}

/** Parse content block — split lines, render bullets as styled cards */
function JournalContent({ content, variant }: { content: string; variant: 'brief' | 'eod' | 'log' }) {
  const lines = content.split('\n').filter((l) => l.trim());

  const cardBg = variant === 'brief'
    ? 'rgba(6, 182, 212, 0.06)'
    : variant === 'eod'
      ? 'rgba(168, 85, 247, 0.06)'
      : 'transparent';

  const cardBorder = variant === 'brief'
    ? 'rgba(6, 182, 212, 0.15)'
    : variant === 'eod'
      ? 'rgba(168, 85, 247, 0.15)'
      : 'var(--phantom-border-subtle)';

  return (
    <div style={{
      padding: '8px 12px', margin: '0 12px 8px',
      borderRadius: 8,
      backgroundColor: cardBg,
      border: `1px solid ${cardBorder}`,
    }}>
      {lines.map((line, i) => {
        const trimmed = line.replace(/^- /, '').trim();
        const isBullet = line.trimStart().startsWith('- ');
        const isHeader = !isBullet && !line.startsWith(' ') && i === 0;

        if (isHeader) {
          return (
            <div key={i} style={{
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--phantom-text-primary)',
              marginBottom: 6, lineHeight: 1.5,
            }}>
              {renderLine(trimmed)}
            </div>
          );
        }

        if (isBullet) {
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0',
            }}>
              <span style={{
                color: 'var(--phantom-accent-cyan, #06b6d4)', fontSize: '0.7rem',
                marginTop: 2, flexShrink: 0,
              }}>
                ●
              </span>
              <span style={{
                fontSize: '0.78rem', color: 'var(--phantom-text-secondary)', lineHeight: 1.5,
              }}>
                {renderLine(trimmed)}
              </span>
            </div>
          );
        }

        // Regular line
        return (
          <div key={i} style={{
            fontSize: '0.78rem', color: 'var(--phantom-text-secondary)',
            lineHeight: 1.5, padding: '2px 0',
          }}>
            {renderLine(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

/** Render work log with time column + event column */
function WorkLogContent({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <div style={{ padding: '4px 12px 8px' }}>
      {lines.map((line, i) => {
        // Parse "HH:MM · [project] message" pattern
        const timeMatch = line.match(/^(\d{1,2}:\d{2})\s*·?\s*(.*)/);
        const time = timeMatch ? timeMatch[1] : '';
        const rest = timeMatch ? timeMatch[2] : line;

        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0',
            borderBottom: i < lines.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            {time && (
              <span style={{
                fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--phantom-text-muted)', minWidth: 40, flexShrink: 0,
              }}>
                {time}
              </span>
            )}
            <span style={{
              fontSize: '0.78rem', color: 'var(--phantom-text-secondary)', lineHeight: 1.4,
            }}>
              {renderLine(rest)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const sectionStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px',
};

const SectionHeader = ({ title, locked, icon }: { title: string; locked: boolean; icon?: React.ReactNode }) => (
  <div style={sectionStyle}>
    {icon}
    <Text fz="0.7rem" fw={700} tt="uppercase" c="var(--phantom-text-muted)" style={{ letterSpacing: '0.06em', flex: 1 }}>
      {title}
    </Text>
    {locked ? (
      <Lock size={10} style={{ color: 'var(--phantom-text-muted)', opacity: 0.4 }} />
    ) : (
      <Pencil size={10} style={{ color: 'var(--phantom-text-muted)', opacity: 0.4 }} />
    )}
  </div>
);

const generateBtnStyle = (active: boolean): CSSProperties => ({
  padding: '7px 14px', borderRadius: 6, textAlign: 'center',
  cursor: active ? 'default' : 'pointer',
  backgroundColor: active ? 'var(--phantom-surface-elevated)' : 'var(--phantom-accent-cyan, #06b6d4)',
  color: active ? 'var(--phantom-text-muted)' : '#000',
  fontSize: '0.73rem', fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  margin: '4px 12px 8px',
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const JournalPane = () => {
  const [date, setDate] = useState(() => todayString());
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingMorning, setGeneratingMorning] = useState(false);
  const [generatingEod, setGeneratingEod] = useState(false);
  const [notes, setNotes] = useState('');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    getJournal(date)
      .then((e) => { setEntry(e); setNotes(e.notes); })
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  }, [date]);

  const handleGenerateMorning = useCallback(async () => {
    setGeneratingMorning(true);
    try {
      const result = await generateMorningBrief(date);
      setEntry(result.entry);
    } catch { /* 409 = already generated */ }
    finally { setGeneratingMorning(false); }
  }, [date]);

  const handleGenerateEod = useCallback(async () => {
    setGeneratingEod(true);
    try {
      const result = await generateEndOfDay(date);
      setEntry(result.entry);
    } catch {}
    finally { setGeneratingEod(false); }
  }, [date]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      updateJournalNotes(date, value).catch(() => {});
    }, 1000);
  }, [date]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--phantom-text-muted)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        borderBottom: '1px solid var(--phantom-border-subtle)', flexShrink: 0,
      }}>
        <CalendarDays size={15} style={{ color: 'var(--phantom-accent-cyan)' }} />
        <Text fz="0.88rem" fw={600} c="var(--phantom-text-primary)" style={{ flex: 1 }}>
          {formatDateDisplay(date)}
        </Text>
        <div
          onClick={() => setDate(shiftDate(date, -1))}
          style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          <ChevronLeft size={14} style={{ color: 'var(--phantom-text-muted)' }} />
        </div>
        <div
          onClick={() => setDate(shiftDate(date, 1))}
          style={{ cursor: 'pointer', padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        >
          <ChevronRight size={14} style={{ color: 'var(--phantom-text-muted)' }} />
        </div>
        {date !== todayString() && (
          <div
            onClick={() => setDate(todayString())}
            style={{
              cursor: 'pointer', padding: '3px 10px', borderRadius: 4, fontSize: '0.68rem',
              fontWeight: 600, color: 'var(--phantom-accent-cyan)', border: '1px solid var(--phantom-accent-cyan)',
            }}
          >
            Today
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ paddingBottom: 16 }}>
          {/* Morning Brief */}
          <SectionHeader title="Morning Brief" locked={!!entry?.morningGeneratedAt} icon={<Activity size={12} style={{ color: 'var(--phantom-accent-cyan)' }} />} />
          {entry?.morningBrief ? (
            <JournalContent content={entry.morningBrief} variant="brief" />
          ) : (
            <div onClick={!generatingMorning ? handleGenerateMorning : undefined} style={generateBtnStyle(generatingMorning)}>
              {generatingMorning && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
              {generatingMorning ? 'Generating...' : 'Generate Morning Brief'}
            </div>
          )}

          {/* Work Log */}
          <SectionHeader title="Work Log" locked icon={<Clock size={12} style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }} />} />
          {entry?.workLog && entry.workLog.length > 0 ? (
            <WorkLogContent lines={entry.workLog} />
          ) : (
            <Text fz="0.75rem" c="var(--phantom-text-muted)" px={12} py={6} fs="italic">
              No activity logged yet today
            </Text>
          )}

          {/* End of Day */}
          <SectionHeader title="End of Day" locked={!!entry?.eodGeneratedAt} icon={<GitCommit size={12} style={{ color: '#a855f7' }} />} />
          {entry?.endOfDayRecap ? (
            <JournalContent content={entry.endOfDayRecap} variant="eod" />
          ) : (
            <div onClick={!generatingEod ? handleGenerateEod : undefined} style={generateBtnStyle(generatingEod)}>
              {generatingEod && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
              {generatingEod ? 'Generating...' : 'Generate End of Day Recap'}
            </div>
          )}

          {/* Notes */}
          <SectionHeader title="Notes" locked={false} icon={<Pencil size={12} style={{ color: 'var(--phantom-text-muted)' }} />} />
          <div style={{ padding: '4px 12px 12px' }}>
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Add personal notes..."
              rows={4}
              style={{
                width: '100%', padding: '10px 12px', fontSize: '0.78rem', borderRadius: 8,
                background: 'var(--phantom-surface-bg, #0a0a1a)',
                border: '1px solid var(--phantom-border-subtle)',
                color: 'var(--phantom-text-primary)', outline: 'none',
                fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
              }}
            />
          </div>
        </div>
      </ScrollArea>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
