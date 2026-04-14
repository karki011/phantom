/**
 * PhantomOS Session Watcher
 * Watches ~/.claude/sessions/ for session JSON files, syncs to DB, detects stale PIDs.
 * @author Subash Karki
 */
import { logger } from '../logger.js';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { watch } from 'chokidar';
import { eq } from 'drizzle-orm';
import { db, sessions } from '@phantom-os/db';
import { SESSIONS_DIR, PROJECTS_DIR, extractRepoName, isProcessAlive, safeReadJson } from '@phantom-os/shared';

interface SessionFile {
  sessionId?: string;
  id?: string;
  pid?: number;
  cwd?: string;
  name?: string;
  kind?: string;
  entrypoint?: string;
  startedAt?: number;
}

type Broadcast = (event: string, data: unknown) => void;

const readContextBridge = (sessionId: string): number | null => {
  const bridgePath = join(homedir(), '.claude', 'phantom-os', 'context', `${sessionId}.json`);
  const data = safeReadJson<{ usedPercentage?: number }>(bridgePath);
  return data?.usedPercentage ?? null;
};

const upsertSession = (
  filePath: string,
  broadcast: Broadcast,
  onStart?: (sessionId: string) => void,
): void => {
  const data = safeReadJson<SessionFile>(filePath);
  if (!data) return;

  const id = data.sessionId ?? data.id;
  if (!id) return;

  const pid = data.pid ?? 0;
  const alive = pid > 0 ? isProcessAlive(pid) : false;
  const status = alive ? 'active' : 'completed';
  const repo = data.cwd ? extractRepoName(data.cwd) : null;

  const existing = db.select().from(sessions).where(eq(sessions.id, id)).get();

  if (existing) {
    db.update(sessions)
      .set({
        pid,
        cwd: data.cwd ?? existing.cwd,
        repo: repo ?? existing.repo,
        name: data.name ?? existing.name,
        kind: data.kind ?? existing.kind,
        entrypoint: data.entrypoint ?? existing.entrypoint,
        status,
        endedAt: status === 'completed' && !existing.endedAt ? Date.now() : existing.endedAt,
      })
      .where(eq(sessions.id, id))
      .run();

    broadcast('session:update', { id, status });
  } else {
    db.insert(sessions)
      .values({
        id,
        pid,
        cwd: data.cwd ?? null,
        repo,
        name: data.name ?? null,
        kind: data.kind ?? null,
        entrypoint: data.entrypoint ?? null,
        startedAt: data.startedAt ?? Date.now(),
        status,
        taskCount: 0,
        completedTasks: 0,
        xpEarned: 0,
      })
      .run();

    broadcast('session:new', { id, status, repo });

    if (status === 'active' && onStart) {
      onStart(id);
    }
  }

  // Update live context % from Claude's statusline bridge file
  const ctxPct = readContextBridge(id);
  if (ctxPct !== null) {
    db.update(sessions).set({ contextUsedPct: ctxPct }).where(eq(sessions.id, id)).run();
  }
};

const markCompleted = (filePath: string, broadcast: Broadcast, onEnd?: (id: string) => void): void => {
  // Filename is PID.json — look up session by pid, not filename
  const pidStr = basename(filePath, '.json');
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) return;

  const existing = db.select().from(sessions).where(eq(sessions.pid, pid)).get();
  if (existing && existing.status !== 'completed') {
    db.update(sessions)
      .set({ status: 'completed', endedAt: Date.now() })
      .where(eq(sessions.id, existing.id))
      .run();

    broadcast('session:end', {
      id: existing.id,
      cwd: existing.cwd,
      repo: existing.repo,
      name: existing.name,
      inputTokens: existing.inputTokens,
      outputTokens: existing.outputTokens,
      estimatedCostMicros: existing.estimatedCostMicros,
    });

    if (onEnd) {
      onEnd(existing.id);
    }
  }
};

/** Read directory entries, returning [] on error */
const safeDirs = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/** Check if a session's JSONL file has been idle (no writes) for a duration */
const isJsonlIdle = (sessionId: string, cwd: string | null, idleMs: number): boolean => {
  // Try finding JSONL by cwd-encoded project dir (handles /clear rotation)
  if (cwd) {
    const encoded = cwd.replace(/\//g, '-');
    const projectDir = join(PROJECTS_DIR, encoded);
    try {
      const files = readdirSync(projectDir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          try { return statSync(join(projectDir, f)).mtimeMs; } catch { return 0; }
        });
      if (files.length > 0) {
        const latestMtime = Math.max(...files);
        return Date.now() - latestMtime > idleMs;
      }
    } catch { /* project dir doesn't exist */ }
  }

  // Fallback: try by session ID directly
  for (const dir of safeDirs(PROJECTS_DIR)) {
    const candidate = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    try {
      const stat = statSync(candidate);
      return Date.now() - stat.mtimeMs > idleMs;
    } catch { /* not in this dir */ }
  }

  // No JSONL found — can't determine
  return false;
};

const detectStaleSessions = (broadcast: Broadcast, onEnd?: (id: string) => void): void => {
  const activeSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .all();

  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes with no PID = stale (reduced from 30)
  const JSONL_IDLE_MS = 5 * 60 * 1000; // 5 minutes of JSONL inactivity

  for (const session of activeSessions) {
    const pid = session.pid;
    const alive = pid && pid > 0 ? isProcessAlive(pid) : false;
    const age = Date.now() - (session.startedAt ?? 0);

    // Reason to mark as completed:
    // 1. PID is dead (most reliable)
    // 2. No valid PID and session is old (>10 min)
    // 3. JSONL has been idle for >5 min AND PID is dead or missing
    const pidDead = !alive && (pid ?? 0) > 0;
    const noPidAndOld = !alive && (pid ?? 0) === 0 && age > STALE_THRESHOLD_MS;
    const jsonlIdle = isJsonlIdle(session.id, session.cwd, JSONL_IDLE_MS);
    const jsonlIdleAndNoPid = jsonlIdle && !alive;

    if (pidDead || noPidAndOld || jsonlIdleAndNoPid) {
      db.update(sessions)
        .set({ status: 'completed', endedAt: Date.now() })
        .where(eq(sessions.id, session.id))
        .run();

      broadcast('session:stale', { id: session.id });

      if (onEnd) {
        onEnd(session.id);
      }
    } else if (alive) {
      // Update live context % from bridge files for active sessions
      const ctxPct = readContextBridge(session.id);
      if (ctxPct !== null && ctxPct !== session.contextUsedPct) {
        db.update(sessions).set({ contextUsedPct: ctxPct }).where(eq(sessions.id, session.id)).run();
        broadcast('session:context', { id: session.id, contextUsedPct: ctxPct });
      }
    }
  }
};

export const startSessionWatcher = (
  broadcast: Broadcast,
  onStart?: (sessionId: string) => void,
  onEnd?: (sessionId: string) => void,
): void => {
  // Ensure sessions directory exists before watching
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // Watch directory (NOT glob) — chokidar v4 glob doesn't emit initial add events on macOS
  const watcher = watch(SESSIONS_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const handleFile = (path: string) => {
    if (!path.endsWith('.json')) return;
    upsertSession(path, broadcast, onStart);
  };

  watcher.on('add', handleFile);
  watcher.on('change', handleFile);
  watcher.on('unlink', (path) => {
    if (!path.endsWith('.json')) return;
    markCompleted(path, broadcast, onEnd);
  });

  // Poll for stale sessions every 5 seconds
  setInterval(() => detectStaleSessions(broadcast, onEnd), 5_000);

  logger.info('SessionWatcher', `Watching ${SESSIONS_DIR}`);
};
