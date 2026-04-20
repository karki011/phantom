// PhantomOS v2 — Reactive session state (global signals)
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type { Session } from '../types';
import { getSessions } from '../bindings';
import { onWailsEvent } from '../events';

// ── Signals ───────────────────────────────────────────────────────────────────

const [sessions, setSessions] = createSignal<Session[]>([]);
const [activeSessionId, setActiveSessionId] = createSignal<string | null>(null);

// ── Derived ───────────────────────────────────────────────────────────────────

/** The currently selected session object, or null if none is selected. */
const activeSession = createMemo<Session | null>(() => {
  const id = activeSessionId();
  if (!id) return null;
  return sessions().find((s) => s.id === id) ?? null;
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

/**
 * Call once from the App root (onMount) to load initial state and wire
 * Wails event subscriptions. Must be called inside a reactive Solid root.
 */
export function bootstrapSessions(): void {
  // Initial load
  getSessions().then((data) => setSessions(data));

  // New session created
  onWailsEvent<Session>('session:new', (s) => {
    setSessions((prev) => {
      const exists = prev.some((p) => p.id === s.id);
      return exists ? prev : [s, ...prev];
    });
  });

  // Session metadata updated (status, token counts, cost, etc.)
  onWailsEvent<Session>('session:update', (updated) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)),
    );
  });

  // Session ended — mark as completed without removing from list
  onWailsEvent<{ id: string }>('session:end', ({ id }) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, status: 'completed', ended_at: Date.now() / 1000 } : s,
      ),
    );
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

export { sessions, setSessions, activeSessionId, setActiveSessionId, activeSession };
