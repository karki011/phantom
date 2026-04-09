/**
 * PhantomOS Session Routes
 * @author Subash Karki
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { desc, eq, like, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, sessions, tasks } from '@phantom-os/db';
import { safeReadDir } from '@phantom-os/shared';

export const sessionRoutes = new Hono();

/** Attach tasks array to each session row */
const withTasks = (rows: (typeof sessions.$inferSelect)[]) =>
  rows.map((session) => ({
    ...session,
    tasks: db
      .select()
      .from(tasks)
      .where(eq(tasks.sessionId, session.id))
      .orderBy(tasks.taskNum)
      .all(),
  }));

/** GET /sessions — All sessions, ordered by startedAt desc, with optional filters */
sessionRoutes.get('/sessions', (c) => {
  const status = c.req.query('status');
  const search = c.req.query('search');
  const limit = Number(c.req.query('limit')) || 50;

  let query = db.select().from(sessions).orderBy(desc(sessions.startedAt));

  if (status) {
    query = query.where(eq(sessions.status, status)) as typeof query;
  }

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      or(
        like(sessions.name, pattern),
        like(sessions.repo, pattern),
        like(sessions.firstPrompt, pattern),
      ),
    ) as typeof query;
  }

  const rows = query.limit(limit).all();
  return c.json(withTasks(rows));
});

/** GET /sessions/active — Only active sessions */
sessionRoutes.get('/sessions/active', (c) => {
  const rows = db
    .select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .orderBy(desc(sessions.startedAt))
    .all();

  return c.json(withTasks(rows));
});

/** GET /sessions/:id — Single session with its tasks */
sessionRoutes.get('/sessions/:id', (c) => {
  const id = c.req.param('id');

  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const sessionTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.sessionId, id))
    .orderBy(tasks.taskNum)
    .all();

  return c.json({ ...session, tasks: sessionTasks });
});

/** POST /sessions/:id/stop — Stop a running session by killing its PID */
sessionRoutes.post('/sessions/:id/stop', (c) => {
  const id = c.req.param('id');

  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.status !== 'active') {
    return c.json({ error: 'Session is not active' }, 400);
  }

  const pid = session.pid;
  if (!pid || pid <= 0) {
    return c.json({ error: 'No valid PID for session' }, 400);
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process may already be gone
  }

  db.update(sessions)
    .set({ status: 'completed', endedAt: Date.now() })
    .where(eq(sessions.id, id))
    .run();

  return c.json({ ok: true, id });
});

/** GET /sessions/:id/messages — Load conversation from JSONL on demand */
sessionRoutes.get('/sessions/:id/messages', async (c) => {
  const id = c.req.param('id');
  const limit = Number(c.req.query('limit')) || 100;

  // Find the JSONL file across all project directories
  const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
  const projectDirs = safeReadDir(PROJECTS_DIR);

  let jsonlPath: string | null = null;
  for (const dir of projectDirs) {
    const candidate = join(PROJECTS_DIR, dir, `${id}.jsonl`);
    if (existsSync(candidate)) {
      jsonlPath = candidate;
      break;
    }
  }

  if (!jsonlPath) return c.json({ messages: [] });

  // For incremental polling, only read the tail of the file (last 200KB)
  // to avoid re-reading 10-50MB JSONL files every 3 seconds
  const after = c.req.query('after');
  let content: string;
  if (after) {
    const stat = statSync(jsonlPath);
    const tailSize = Math.min(stat.size, 200_000);
    const buf = Buffer.alloc(tailSize);
    const fd = openSync(jsonlPath, 'r');
    readSync(fd, buf, 0, tailSize, stat.size - tailSize);
    closeSync(fd);
    content = buf.toString('utf-8');
  } else {
    content = readFileSync(jsonlPath, 'utf-8');
  }
  const messages: Array<{
    role: string;
    content: string;
    timestamp: string;
    toolUse?: { name: string }[];
  }> = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.type !== 'user' && data.type !== 'assistant') continue;

      const msg = data.message;
      if (!msg) continue;

      let textContent = '';
      const toolUses: { name: string }[] = [];

      if (typeof msg.content === 'string') {
        textContent = msg.content;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') textContent += block.text + '\n';
          if (block.type === 'tool_use') toolUses.push({ name: block.name });
        }
      }

      // Truncate long messages to 500 chars for the viewer
      textContent = textContent.trim().slice(0, 500);
      if (textContent.length === 500) textContent += '...';

      messages.push({
        role: data.type,
        content: textContent,
        timestamp: data.timestamp ?? '',
        ...(toolUses.length > 0 ? { toolUse: toolUses } : {}),
      });
    } catch {
      /* skip malformed lines */
    }
  }

  // Filter: ?after=<timestamp> returns only newer messages
  const filtered = after
    ? messages.filter((m) => m.timestamp > after)
    : messages.slice(-limit);

  return c.json({ messages: filtered });
});
