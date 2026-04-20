// PhantomOS v2 — Reactive session state (global signals)
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type { Session } from '../types';
import { getSessions, getSession } from '../bindings';
import { onWailsEvent } from '../events';

// ── Event payload types (Go backend sends these, NOT full Session objects) ──

interface SessionNewEvent {
  sessionId: string;
  cwd?: string;
  kind?: string;
  status?: string;
}

interface SessionUpdateEvent {
  sessionId: string;
  status?: string;
}

interface SessionEndEvent {
  sessionId: string;
  reason?: string;
}

interface SessionContextEvent {
  sessionId: string;
  contextUsedPct: number;
}

// ── Signals ───────────────────────────────────────────────────────────────────

const [sessions, setSessions] = createSignal<Session[]>([]);
const [activeSessionId, setActiveSessionId] = createSignal<string | null>(null);

// ── Derived ───────────────────────────────────────────────────────────────────

const activeSession = createMemo<Session | null>(() => {
  const id = activeSessionId();
  if (!id) return null;
  return sessions().find((s) => s.id === id) ?? null;
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function bootstrapSessions(): void {
  getSessions().then((data) => setSessions(data));

  onWailsEvent<SessionNewEvent>('session:new', async (evt) => {
    const exists = sessions().some((s) => s.id === evt.sessionId);
    if (exists) return;
    const full = await getSession(evt.sessionId);
    if (full) {
      setSessions((prev) =>
        prev.some((s) => s.id === full.id) ? prev : [full, ...prev],
      );
    }
  });

  onWailsEvent<SessionUpdateEvent>('session:update', async (evt) => {
    const full = await getSession(evt.sessionId);
    if (full) {
      setSessions((prev) =>
        prev.map((s) => (s.id === full.id ? full : s)),
      );
    }
  });

  onWailsEvent<SessionEndEvent>('session:end', ({ sessionId }) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'completed', ended_at: Date.now() / 1000 } : s,
      ),
    );
  });

  onWailsEvent<SessionContextEvent>('session:context', ({ sessionId, contextUsedPct }) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, context_used_pct: contextUsedPct } : s,
      ),
    );
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { sessions, setSessions, activeSessionId, setActiveSessionId, activeSession };
