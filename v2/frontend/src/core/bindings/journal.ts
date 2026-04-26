// PhantomOS v2 — Activity Journal bindings
// Author: Subash Karki

import type { JournalEntry, DailyStats } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

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
