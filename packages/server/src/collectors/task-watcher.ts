/**
 * PhantomOS Task Watcher
 * Watches ~/.claude/tasks/ for task JSON files, syncs to DB, triggers XP on completion.
 * @author Subash Karki
 */
import { logger } from '../logger.js';
import { basename, dirname, join } from 'node:path';
import { watch } from 'chokidar';
import { eq, sql } from 'drizzle-orm';
import { db, sessions, tasks } from '@phantom-os/db';
import { TASKS_DIR } from '@phantom-os/shared/constants-node';
import { parseCrew, safeReadJson } from '@phantom-os/shared/file-utils';

interface TaskFile {
  id?: string;
  taskId?: string;
  taskNum?: number;
  subject?: string;
  description?: string;
  status?: string;
  activeForm?: string;
  blocks?: string[];
  blockedBy?: string[];
  createdAt?: number;
  updatedAt?: number;
  durationMs?: number;
}

type Broadcast = (event: string, data: unknown) => void;
type OnTaskComplete = (sessionId: string, taskId: string) => void;

/** Debounce map to avoid duplicate processing of rapid file changes */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const debounce = (key: string, fn: () => void, ms: number): void => {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, ms),
  );
};

const processTaskFile = (
  filePath: string,
  broadcast: Broadcast,
  onTaskComplete: OnTaskComplete,
): void => {
  // Skip non-json, lock files, highwatermark files
  const filename = basename(filePath);
  if (!filename.endsWith('.json')) return;
  if (filename.endsWith('.lock') || filename.includes('highwatermark')) return;

  const data = safeReadJson<TaskFile>(filePath);
  if (!data) return;

  const rawId = data.id ?? data.taskId;
  if (!rawId) return;

  // Session ID is the parent directory name (tasks are stored as tasks/<sessionId>/<taskId>.json)
  const sessionId = basename(dirname(filePath));

  // Composite key to avoid collisions across sessions
  const taskId = `${sessionId}:${rawId}`;
  const taskNum = parseInt(String(rawId), 10) || null;

  const { crew, cleanSubject } = parseCrew(data.subject ?? '');

  const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  const previousStatus = existing?.status;

  if (existing) {
    db.update(tasks)
      .set({
        sessionId,
        taskNum: taskNum ?? existing.taskNum,
        subject: cleanSubject || existing.subject,
        description: data.description ?? existing.description,
        crew: crew ?? existing.crew,
        status: data.status ?? existing.status,
        activeForm: data.activeForm ?? existing.activeForm,
        blocks: data.blocks ? JSON.stringify(data.blocks) : existing.blocks,
        blockedBy: data.blockedBy ? JSON.stringify(data.blockedBy) : existing.blockedBy,
        updatedAt: data.updatedAt ?? Date.now(),
        durationMs: data.durationMs ?? existing.durationMs,
      })
      .where(eq(tasks.id, taskId))
      .run();

    broadcast('task:update', { id: taskId, sessionId, status: data.status, subject: cleanSubject || existing.subject });
  } else {
    // Skip task if no matching session exists — avoids phantom sessions with incomplete data
    const sessionExists = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!sessionExists) {
      logger.warn('TaskWatcher', `Skipping orphan task ${rawId} — no session ${sessionId} found`);
      return;
    } else if (!sessionExists.name && cleanSubject) {
      // Backfill name from first meaningful task if session has no name yet
      const rawSubject = data.subject ?? '';
      const sessionStartMatch = rawSubject.match(/SESSION:start\s+"?(.+?)"?\s*$/i);
      const derivedName = sessionStartMatch?.[1] ?? null;
      if (derivedName) {
        db.update(sessions)
          .set({ name: derivedName })
          .where(eq(sessions.id, sessionId))
          .run();
      }
    }

    db.insert(tasks)
      .values({
        id: taskId,
        sessionId,
        taskNum: taskNum ?? null,
        subject: cleanSubject || null,
        description: data.description ?? null,
        crew,
        status: data.status ?? 'pending',
        activeForm: data.activeForm ?? null,
        blocks: data.blocks ? JSON.stringify(data.blocks) : null,
        blockedBy: data.blockedBy ? JSON.stringify(data.blockedBy) : null,
        createdAt: data.createdAt ?? Date.now(),
        updatedAt: data.updatedAt ?? Date.now(),
        durationMs: data.durationMs ?? null,
      })
      .run();

    // Increment session task count
    db.update(sessions)
      .set({ taskCount: sql`${sessions.taskCount} + 1` })
      .where(eq(sessions.id, sessionId))
      .run();

    broadcast('task:new', { id: taskId, sessionId, subject: cleanSubject });
  }

  // If status changed to completed, trigger XP engine
  const newStatus = data.status ?? existing?.status;
  if (newStatus === 'completed' && previousStatus !== 'completed') {
    onTaskComplete(sessionId, taskId);
  }
};

export const startTaskWatcher = (
  broadcast: Broadcast,
  onTaskComplete: OnTaskComplete,
): void => {
  // Watch directory (NOT glob) — chokidar v4 glob doesn't emit initial add events on macOS
  const watcher = watch(TASKS_DIR, {
    ignoreInitial: false,
    persistent: true,
    ignored: [/\.lock$/, /highwatermark/, /node_modules/],
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handle = (path: string): void => {
    if (!path.endsWith('.json')) return;
    debounce(path, () => processTaskFile(path, broadcast, onTaskComplete), 200);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);

  logger.info('TaskWatcher', `Watching ${TASKS_DIR}`);
};
