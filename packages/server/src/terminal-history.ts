/**
 * PhantomOS Terminal History Writer
 * Persists terminal session metadata + scrollback to SQLite for cold restore.
 * @author Subash Karki
 */
import { db, terminalSessions } from '@phantom-os/db';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger.js';
import { getDaemonClient, getPtySession, getScrollback } from './terminal-manager.js';

/** Auto-save scrollback interval (ms) */
const SAVE_INTERVAL_MS = 10_000;

let saveTimer: ReturnType<typeof setInterval> | null = null;

/** Record a new terminal session */
export const recordSession = (
  paneId: string,
  opts: {
    worktreeId: string;
    shell: string;
    cwd: string;
    env: string;
    cols: number;
    rows: number;
  },
): void => {
  try {
    db.insert(terminalSessions)
      .values({
        paneId,
        worktreeId: opts.worktreeId,
        shell: opts.shell,
        cwd: opts.cwd,
        env: opts.env,
        cols: opts.cols,
        rows: opts.rows,
        scrollback: '',
        status: 'active',
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: terminalSessions.paneId,
        set: {
          worktreeId: opts.worktreeId,
          cwd: opts.cwd,
          env: opts.env,
          cols: opts.cols,
          rows: opts.rows,
          status: 'active',
          lastActiveAt: Date.now(),
          endedAt: null,
        },
      })
      .run();
  } catch (err) {
    logger.warn('TerminalHistory', `Failed to record session ${paneId}: ${(err as Error).message}`);
  }
};

/** Update scrollback snapshot for a session */
export const updateScrollback = (paneId: string, scrollback: string): void => {
  try {
    db.update(terminalSessions)
      .set({ scrollback, lastActiveAt: Date.now() })
      .where(eq(terminalSessions.paneId, paneId))
      .run();
  } catch (err) {
    logger.warn('TerminalHistory', `Failed to update scrollback ${paneId}: ${(err as Error).message}`);
  }
};

/** Mark a session as exited */
export const markExited = (paneId: string): void => {
  try {
    db.update(terminalSessions)
      .set({ status: 'exited', endedAt: Date.now() })
      .where(eq(terminalSessions.paneId, paneId))
      .run();
  } catch (err) {
    logger.warn('TerminalHistory', `Failed to mark exited ${paneId}: ${(err as Error).message}`);
  }
};

/** Get all restorable sessions (active, not ended) for a worktree */
export const getRestorableSessions = (worktreeId?: string) => {
  try {
    const conditions = [
      eq(terminalSessions.status, 'active'),
    ];
    if (worktreeId) {
      conditions.push(eq(terminalSessions.worktreeId, worktreeId));
    }
    return db
      .select()
      .from(terminalSessions)
      .where(and(...conditions))
      .all();
  } catch (err) {
    logger.warn('TerminalHistory', `Failed to get restorable sessions: ${(err as Error).message}`);
    return [];
  }
};

/** Get a single session's scrollback */
export const getSessionScrollback = (paneId: string): string | null => {
  try {
    const row = db.select({ scrollback: terminalSessions.scrollback })
      .from(terminalSessions)
      .where(eq(terminalSessions.paneId, paneId))
      .get();
    return row?.scrollback ?? null;
  } catch {
    return null;
  }
};

/** Clear a session record */
export const clearSession = (paneId: string): void => {
  try {
    db.delete(terminalSessions)
      .where(eq(terminalSessions.paneId, paneId))
      .run();
  } catch {
    // ignore
  }
};

/** Periodic scrollback save — snapshots active sessions to DB */
const saveAllScrollbacks = async (): Promise<void> => {
  const daemon = getDaemonClient();

  // Get all active sessions from DB
  const active = getRestorableSessions();
  for (const session of active) {
    try {
      let scrollback: string | null = null;

      // Try daemon snapshot first
      if (daemon?.connected) {
        scrollback = await daemon.snapshot(session.paneId).catch(() => null);
      }

      // Fallback: get scrollback from direct PTY session's rolling buffer
      if (!scrollback) {
        const local = getPtySession(session.paneId);
        if (!local) {
          // Session gone from memory — mark as exited
          markExited(session.paneId);
          continue;
        }
        scrollback = getScrollback(session.paneId);
      }

      if (scrollback) {
        updateScrollback(session.paneId, scrollback);
      }
    } catch {
      // Skip this session
    }
  }
};

/** Start the periodic scrollback save timer */
export const startHistoryWriter = (): void => {
  if (saveTimer) return;
  saveTimer = setInterval(() => {
    saveAllScrollbacks().catch(() => {});
  }, SAVE_INTERVAL_MS);
  logger.info('TerminalHistory', 'Started periodic scrollback writer');
};

/** Stop the periodic save timer */
export const stopHistoryWriter = (): void => {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
};

/** Mark all active sessions as exited (call on clean shutdown) */
export const markAllExited = (): void => {
  try {
    db.update(terminalSessions)
      .set({ status: 'exited', endedAt: Date.now() })
      .where(eq(terminalSessions.status, 'active'))
      .run();
  } catch {
    // ignore
  }
};

/** Convenience export for use as a namespace */
export const historyWriter = {
  recordSession,
  updateScrollback,
  markExited,
  getRestorableSessions,
  getSessionScrollback,
  clearSession,
  startHistoryWriter,
  stopHistoryWriter,
  markAllExited,
};
