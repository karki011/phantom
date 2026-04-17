/**
 * PhantomOS Todo Watcher
 * Watches ~/.claude/todos/ for TodoWrite JSON files, syncs to DB as tasks.
 * @author Subash Karki
 */
import { logger } from '../logger.js';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { watch } from 'chokidar';
import { eq, sql } from 'drizzle-orm';
import { db, sessions, tasks } from '@phantom-os/db';
import { parseCrew, safeReadJson } from '@phantom-os/shared/file-utils';

const TODOS_DIR = join(homedir(), '.claude', 'todos');

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

type Broadcast = (event: string, data: unknown) => void;
type OnTaskComplete = (sessionId: string, taskId: string) => void;

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

const processTodoFile = (
  filePath: string,
  broadcast: Broadcast,
  onTaskComplete: OnTaskComplete,
): void => {
  const filename = basename(filePath);
  if (!filename.endsWith('.json')) return;

  const sessionId = filename.replace('.json', '').split('-agent-')[0];
  if (!sessionId) return;

  const items = safeReadJson<TodoItem[]>(filePath);
  if (!items || !Array.isArray(items)) return;

  const sessionExists = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!sessionExists) {
    logger.warn('TodoWatcher', `Skipping orphan todos — no session ${sessionId} found`);
    return;
  }

  const seenIds = new Set<string>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!item || !item.content) continue;

    const taskId = `${sessionId}:todo-${index}`;
    seenIds.add(taskId);

    const { crew, cleanSubject } = parseCrew(item.content);
    const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    const previousStatus = existing?.status;

    if (existing) {
      db.update(tasks)
        .set({
          sessionId,
          taskNum: index,
          subject: cleanSubject || existing.subject,
          description: null,
          crew: crew ?? existing.crew,
          status: item.status ?? existing.status,
          activeForm: item.activeForm ?? null,
          updatedAt: Date.now(),
        })
        .where(eq(tasks.id, taskId))
        .run();

      broadcast('task:update', { id: taskId, sessionId, status: item.status, subject: cleanSubject || existing.subject });
    } else {
      db.insert(tasks)
        .values({
          id: taskId,
          sessionId,
          taskNum: index,
          subject: cleanSubject || null,
          description: null,
          crew,
          status: item.status ?? 'pending',
          activeForm: item.activeForm ?? null,
          blocks: null,
          blockedBy: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          durationMs: null,
        })
        .run();

      db.update(sessions)
        .set({ taskCount: sql`${sessions.taskCount} + 1` })
        .where(eq(sessions.id, sessionId))
        .run();

      broadcast('task:new', { id: taskId, sessionId, subject: cleanSubject });
    }

    const newStatus = item.status ?? existing?.status;
    if (newStatus === 'completed' && previousStatus !== 'completed') {
      onTaskComplete(sessionId, taskId);
    }
  }

  const existingTodos = db
    .select()
    .from(tasks)
    .where(sql`${tasks.id} LIKE ${sessionId + ':todo-%'}`)
    .all();

  for (const row of existingTodos) {
    if (!seenIds.has(row.id) && row.status !== 'completed') {
      const previousStatus = row.status;

      db.update(tasks)
        .set({ status: 'completed', updatedAt: Date.now() })
        .where(eq(tasks.id, row.id))
        .run();

      broadcast('task:update', { id: row.id, sessionId, status: 'completed', subject: row.subject });

      if (previousStatus !== 'completed') {
        onTaskComplete(sessionId, row.id);
      }
    }
  }
};

export const startTodoWatcher = (
  broadcast: Broadcast,
  onTaskComplete: OnTaskComplete,
): void => {
  const watcher = watch(TODOS_DIR, {
    ignoreInitial: false,
    persistent: true,
    ignored: [/\.lock$/, /node_modules/],
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handle = (path: string): void => {
    if (!path.endsWith('.json')) return;
    debounce(path, () => processTodoFile(path, broadcast, onTaskComplete), 200);
  };

  watcher.on('add', handle);
  watcher.on('change', handle);

  logger.info('TodoWatcher', `Watching ${TODOS_DIR}`);
};
