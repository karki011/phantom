// PhantomOS v2 — Activity Journal signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { JournalEntry, DailyStats } from '../types';
import { getSessionsByDate, getRecentSessions, getDailyStatsRange, getLastActiveSession } from '../bindings/journal';

// Selected date for the journal view
export const [selectedDate, setSelectedDate] = createSignal<string>(
  new Date().toISOString().slice(0, 10)
);

// Sessions for the selected date
export const [daySessions, setDaySessions] = createSignal<JournalEntry[]>([]);

// Daily stats for calendar heatmap (current month by default)
export const [monthStats, setMonthStats] = createSignal<DailyStats[]>([]);

// Last active session for resume bar
export const [resumeSession, setResumeSession] = createSignal<JournalEntry | null>(null);

// View mode
export const [journalView, setJournalView] = createSignal<'today' | 'week' | 'all'>('today');

// Load sessions for a specific date
export const loadDaySessions = async (date: string): Promise<void> => {
  setSelectedDate(date);
  const sessions = await getSessionsByDate(date);
  setDaySessions(sessions);
};

// Load month stats for calendar heatmap
export const loadMonthStats = async (year: number, month: number): Promise<void> => {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
  const stats = await getDailyStatsRange(startDate, endDate);
  setMonthStats(stats);
};

// Load resume session on app startup
export const loadResumeSession = async (): Promise<void> => {
  const session = await getLastActiveSession();
  setResumeSession(session);
};

// Bootstrap journal data
export const bootstrapJournal = async (): Promise<void> => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  await Promise.all([
    loadDaySessions(today),
    loadMonthStats(now.getFullYear(), now.getMonth() + 1),
    loadResumeSession(),
  ]);
};

// Helper: parse files_touched JSON string
export const parseFilesTouched = (json: string | null): string[] => {
  if (!json) return [];
  try { return JSON.parse(json); }
  catch { return []; }
};

// Helper: format cost from microdollars
export const formatCost = (micros: number | null): string => {
  if (!micros) return '$0.00';
  return `$${(micros / 1_000_000).toFixed(2)}`;
};

// Helper: format duration from seconds
export const formatDuration = (startedAt: number | null, endedAt: number | null): string => {
  if (!startedAt) return '0m';
  const end = endedAt || Math.floor(Date.now() / 1000);
  const mins = Math.round((end - startedAt) / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
};
