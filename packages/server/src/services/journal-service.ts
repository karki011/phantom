/**
 * JournalService — File-based daily developer journal
 * Stores markdown files at ~/.phantom-os/journal/
 * @author Subash Karki
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JOURNAL_DIR = join(homedir(), '.phantom-os', 'journal');

function ensureDir(): void {
  if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true });
}

function journalPath(date: string): string {
  return join(JOURNAL_DIR, `${date}.md`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalFrontmatter {
  date: string;
  morningGeneratedAt: number | null;
  eodGeneratedAt: number | null;
}

export interface JournalEntry {
  date: string;
  morningBrief: string | null;
  morningGeneratedAt: number | null;
  workLog: string[];
  endOfDayRecap: string | null;
  eodGeneratedAt: number | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Frontmatter Parser
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { frontmatter: JournalFrontmatter; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: { date: '', morningGeneratedAt: null, eodGeneratedAt: null }, body: raw };
  }
  const end = raw.indexOf('---', 3);
  if (end === -1) {
    return { frontmatter: { date: '', morningGeneratedAt: null, eodGeneratedAt: null }, body: raw };
  }
  const fmRaw = raw.slice(3, end).trim();
  const fm: Record<string, unknown> = {};
  for (const line of fmRaw.split('\n')) {
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim().replace(/^"(.*)"$/, '$1');
    fm[key.trim()] = val === 'null' ? null : isNaN(Number(val)) ? val : Number(val);
  }
  return { frontmatter: fm as unknown as JournalFrontmatter, body: raw.slice(end + 3).trim() };
}

function serializeFrontmatter(fm: JournalFrontmatter): string {
  return [
    '---',
    `date: "${fm.date}"`,
    `morningGeneratedAt: ${fm.morningGeneratedAt ?? 'null'}`,
    `eodGeneratedAt: ${fm.eodGeneratedAt ?? 'null'}`,
    '---',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Section Parser / Serializer
// ---------------------------------------------------------------------------

interface Sections {
  morningBrief: string;
  workLog: string;
  endOfDay: string;
  notes: string;
}

const SECTION_NAMES = ['Morning Brief', 'Work Log', 'End of Day', 'Notes'] as const;

function parseSections(body: string): Sections {
  const result: Sections = {
    morningBrief: '',
    workLog: '',
    endOfDay: '',
    notes: '',
  };

  // Split on ## headers, preserving the header name
  const parts = body.split(/^## /m);

  for (const part of parts) {
    const nlIdx = part.indexOf('\n');
    if (nlIdx === -1) continue;
    const header = part.slice(0, nlIdx).trim();
    const content = part.slice(nlIdx + 1).trim();

    switch (header) {
      case 'Morning Brief':
        result.morningBrief = content;
        break;
      case 'Work Log':
        result.workLog = content;
        break;
      case 'End of Day':
        result.endOfDay = content;
        break;
      case 'Notes':
        result.notes = content;
        break;
    }
  }

  return result;
}

function parseWorkLogLines(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

export function parseJournal(raw: string): JournalEntry {
  const { frontmatter, body } = parseFrontmatter(raw);
  const sections = parseSections(body);

  const morningBrief = sections.morningBrief || null;
  const endOfDayRecap = sections.endOfDay && sections.endOfDay !== '_Not yet generated_'
    ? sections.endOfDay
    : null;

  return {
    date: frontmatter.date,
    morningBrief,
    morningGeneratedAt: frontmatter.morningGeneratedAt,
    workLog: parseWorkLogLines(sections.workLog),
    endOfDayRecap,
    eodGeneratedAt: frontmatter.eodGeneratedAt,
    notes: sections.notes,
  };
}

export function serializeJournal(entry: JournalEntry): string {
  const fm = serializeFrontmatter({
    date: entry.date,
    morningGeneratedAt: entry.morningGeneratedAt,
    eodGeneratedAt: entry.eodGeneratedAt,
  });

  const morningSection = entry.morningBrief ?? '_Not yet generated_';
  const workLogSection = entry.workLog.length > 0
    ? entry.workLog.map((l) => `- ${l}`).join('\n')
    : '';
  const eodSection = entry.endOfDayRecap ?? '_Not yet generated_';
  const notesSection = entry.notes;

  return [
    fm,
    '',
    '## Morning Brief',
    '',
    morningSection,
    '',
    '## Work Log',
    '',
    workLogSection,
    '',
    '## End of Day',
    '',
    eodSection,
    '',
    '## Notes',
    '',
    notesSection,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function emptyEntry(date: string): JournalEntry {
  return {
    date,
    morningBrief: null,
    morningGeneratedAt: null,
    workLog: [],
    endOfDayRecap: null,
    eodGeneratedAt: null,
    notes: '',
  };
}

export function getEntry(date: string): JournalEntry {
  ensureDir();
  const path = journalPath(date);
  if (!existsSync(path)) return emptyEntry(date);
  const raw = readFileSync(path, 'utf-8');
  const entry = parseJournal(raw);
  // Ensure date is set even if file frontmatter was empty
  if (!entry.date) entry.date = date;
  return entry;
}

export function setMorningBrief(date: string, content: string): boolean {
  ensureDir();
  const entry = getEntry(date);
  if (entry.morningGeneratedAt) return false; // immutable
  entry.morningBrief = content;
  entry.morningGeneratedAt = Date.now();
  if (!entry.date) entry.date = date;
  writeFileSync(journalPath(date), serializeJournal(entry), 'utf-8');
  return true;
}

export function setEndOfDay(date: string, content: string): boolean {
  ensureDir();
  const entry = getEntry(date);
  if (entry.eodGeneratedAt) return false; // immutable
  entry.endOfDayRecap = content;
  entry.eodGeneratedAt = Date.now();
  if (!entry.date) entry.date = date;
  writeFileSync(journalPath(date), serializeJournal(entry), 'utf-8');
  return true;
}

export function appendWorkLog(date: string, line: string): void {
  ensureDir();
  const entry = getEntry(date);
  if (!entry.date) entry.date = date;
  entry.workLog.push(line);
  writeFileSync(journalPath(date), serializeJournal(entry), 'utf-8');
}

export function setNotes(date: string, content: string): void {
  ensureDir();
  const entry = getEntry(date);
  if (!entry.date) entry.date = date;
  entry.notes = content;
  writeFileSync(journalPath(date), serializeJournal(entry), 'utf-8');
}

export function listDates(limit: number = 30): string[] {
  ensureDir();
  try {
    return readdirSync(JOURNAL_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''))
      .sort()
      .reverse()
      .slice(0, limit);
  } catch {
    return [];
  }
}
