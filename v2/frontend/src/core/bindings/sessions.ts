// Author: Subash Karki

import type { Session, Task, ActivityLog } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export async function getSessions(): Promise<Session[]> {
  try {
    const raw = (await App()?.GetSessions()) ?? [];
    return normalize<Session[]>(raw);
  } catch {
    return [];
  }
}

export async function getActiveSessions(): Promise<Session[]> {
  try {
    const raw = (await App()?.GetActiveSessions()) ?? [];
    return normalize<Session[]>(raw);
  } catch {
    return [];
  }
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    const raw = (await App()?.GetSession(id)) ?? null;
    return raw ? normalize<Session>(raw) : null;
  } catch {
    return null;
  }
}

export async function getSessionTasks(sessionId: string): Promise<Task[]> {
  try {
    const raw = (await App()?.GetSessionTasks(sessionId)) ?? [];
    return normalize<Task[]>(raw);
  } catch {
    return [];
  }
}

export async function parseSessionHistory(sessionId: string): Promise<number> {
  try {
    return (await App()?.ParseSessionHistory(sessionId)) ?? 0;
  } catch {
    return 0;
  }
}

export async function getActivityLog(sessionId: string, limit: number): Promise<ActivityLog[]> {
  try {
    const raw = (await App()?.GetActivityLog(sessionId, limit)) ?? [];
    return normalize<ActivityLog[]>(raw);
  } catch {
    return [];
  }
}
