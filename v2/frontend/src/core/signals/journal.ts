// Phantom — Daily Journal signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { DailyJournalEntry, DailyStats, JournalEnrichedEvent } from '../types';
import { getDailyJournalEntry, getDailyStatsRange } from '../bindings/journal';
import { onWailsEvent } from '../events';

// Selected date for the journal view
export const [selectedDate, setSelectedDate] = createSignal<string>(
  new Date().toISOString().slice(0, 10),
);

// Current daily journal entry
export const [journalEntry, setJournalEntry] = createSignal<DailyJournalEntry>({
  date: new Date().toISOString().slice(0, 10),
  morning_brief: '',
  morning_generated_at: 0,
  work_log: [],
  end_of_day_recap: '',
  eod_generated_at: 0,
  end_of_day_narrative: '',
  eod_narrative_at: 0,
  notes: '',
});

// Daily stats for calendar heatmap (current month by default)
export const [monthStats, setMonthStats] = createSignal<DailyStats[]>([]);

// Selected project filter for the journal view (null = all projects)
export const [selectedProject, setSelectedProject] = createSignal<string | null>(null);

// Loading state
export const [journalLoading, setJournalLoading] = createSignal(false);

// Load journal entry for a specific date, optionally filtered by project
export const loadJournalEntry = async (date: string, project?: string | null): Promise<void> => {
  setSelectedDate(date);
  if (project !== undefined) setSelectedProject(project);
  setJournalLoading(true);
  try {
    const entry = await getDailyJournalEntry(date, selectedProject() ?? undefined);
    setJournalEntry(entry);
  } finally {
    setJournalLoading(false);
  }
};

// Load month stats for calendar heatmap
export const loadMonthStats = async (year: number, month: number): Promise<void> => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const stats = await getDailyStatsRange(startDate, endDate);
  setMonthStats(stats);
};

// Bootstrap journal data + subscribe to LLM enrichment events.
// When the backend finishes narrating an EOD recap it emits
// `journal:enriched` with `{date, project}`; if the user is viewing the
// same date+project we silently re-fetch and the narrative slots in.
export const bootstrapJournal = async (): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  onWailsEvent<JournalEnrichedEvent>('journal:enriched', (evt) => {
    if (!evt) return;
    if (evt.date !== selectedDate()) return;
    const currentProject = selectedProject() ?? '';
    if (evt.project !== currentProject) return;
    void loadJournalEntry(selectedDate(), selectedProject());
  });

  await Promise.all([
    loadJournalEntry(today),
    loadMonthStats(now.getFullYear(), now.getMonth() + 1),
  ]);
};

// Helper: format cost from microdollars
export const formatCost = (micros: number | null): string => {
  if (!micros) return '$0.00';
  return `$${(micros / 1_000_000).toFixed(2)}`;
};

// Helper: normalize timestamp to seconds (handles both ms and s)
const toSecs = (t: number): number => (t > 1e12 ? Math.floor(t / 1000) : t);

// Helper: format duration
export const formatDuration = (startedAt: number | null, endedAt: number | null): string => {
  if (!startedAt) return '0m';
  const start = toSecs(startedAt);
  const end = endedAt ? toSecs(endedAt) : Math.floor(Date.now() / 1000);
  const mins = Math.max(0, Math.round((end - start) / 60));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};

// Helper: parse files_touched JSON string
export const parseFilesTouched = (json: string | null): string[] => {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
};
