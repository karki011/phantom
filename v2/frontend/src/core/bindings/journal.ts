// PhantomOS v2 — Daily Journal + Session bindings
// Author: Subash Karki

import type { JournalEntry, DailyStats, DailyJournalEntry } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

// ── Legacy session-based journal ─────────────────────────────────────────────

export async function getSessionsByDate(date: string): Promise<JournalEntry[]> {
  try {
    const raw = (await App()?.GetSessionsByDate(date)) ?? [];
    return normalize<JournalEntry[]>(raw);
  } catch {
    return [];
  }
}

export async function getSessionsByProject(repo: string, limit: number): Promise<JournalEntry[]> {
  try {
    const raw = (await App()?.GetSessionsByProject(repo, limit)) ?? [];
    return normalize<JournalEntry[]>(raw);
  } catch {
    return [];
  }
}

export async function getRecentSessions(limit: number): Promise<JournalEntry[]> {
  try {
    const raw = (await App()?.GetRecentSessions(limit)) ?? [];
    return normalize<JournalEntry[]>(raw);
  } catch {
    return [];
  }
}

export async function getDailyStatsRange(startDate: string, endDate: string): Promise<DailyStats[]> {
  try {
    const raw = (await App()?.GetDailyStatsRange(startDate, endDate)) ?? [];
    return normalize<DailyStats[]>(raw);
  } catch {
    return [];
  }
}

export async function getDailyStatsRangeByProject(startDate: string, endDate: string, projectId: string): Promise<DailyStats[]> {
  try {
    const raw = (await App()?.GetDailyStatsRangeByProject(startDate, endDate, projectId)) ?? [];
    return normalize<DailyStats[]>(raw);
  } catch {
    return [];
  }
}

export async function getLastActiveSession(): Promise<JournalEntry | null> {
  try {
    const raw = await App()?.GetLastActiveSession();
    return raw ? normalize<JournalEntry>(raw) : null;
  } catch {
    return null;
  }
}

// ── v2 Daily Journal ─────────────────────────────────────────────────────────

export async function getDailyJournalEntry(date: string, project?: string): Promise<DailyJournalEntry> {
  try {
    const raw = await App()?.GetDailyJournalEntry(date, project ?? '');
    return normalize<DailyJournalEntry>(raw ?? emptyJournal(date));
  } catch {
    return emptyJournal(date);
  }
}

export async function generateMorningBrief(date: string, project?: string): Promise<DailyJournalEntry> {
  try {
    const raw = await App()?.GenerateMorningBrief(date, project ?? '');
    return normalize<DailyJournalEntry>(raw ?? emptyJournal(date));
  } catch {
    return emptyJournal(date);
  }
}

export async function generateEndOfDay(date: string, project?: string): Promise<DailyJournalEntry> {
  try {
    const raw = await App()?.GenerateEndOfDay(date, project ?? '');
    return normalize<DailyJournalEntry>(raw ?? emptyJournal(date));
  } catch {
    return emptyJournal(date);
  }
}

export async function updateJournalNotes(date: string, project?: string, notes?: string): Promise<DailyJournalEntry> {
  try {
    const raw = await App()?.UpdateJournalNotes(date, project ?? '', notes ?? '');
    return normalize<DailyJournalEntry>(raw ?? emptyJournal(date));
  } catch {
    return emptyJournal(date);
  }
}

export async function listJournalDates(limit: number): Promise<string[]> {
  try {
    return (await App()?.ListJournalDates(limit)) ?? [];
  } catch {
    return [];
  }
}

function emptyJournal(date: string): DailyJournalEntry {
  return {
    date,
    morning_brief: '',
    morning_generated_at: 0,
    work_log: [],
    end_of_day_recap: '',
    eod_generated_at: 0,
    notes: '',
  };
}
