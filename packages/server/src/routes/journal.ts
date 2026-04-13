/**
 * PhantomOS Journal Routes
 * @author Subash Karki
 */
import { Hono } from 'hono';
import * as journalService from '../services/journal-service.js';
import { generateMorningBrief, generateEndOfDay } from '../services/journal-generator.js';
import { db, projects } from '@phantom-os/db';

export const journalRoutes = new Hono();

/** GET /journal/list — List dates with journal entries */
journalRoutes.get('/journal/list', (c) => {
  const limit = Number(c.req.query('limit')) || 30;
  return c.json(journalService.listDates(limit));
});

/** GET /journal/:date — Full journal entry for a date */
journalRoutes.get('/journal/:date', (c) => {
  const date = c.req.param('date');
  return c.json(journalService.getEntry(date));
});

/** POST /journal/:date/generate-morning — Generate morning brief (immutable once set) */
journalRoutes.post('/journal/:date/generate-morning', async (c) => {
  const date = c.req.param('date');
  const entry = journalService.getEntry(date);
  if (entry.morningGeneratedAt) {
    return c.json({ error: 'Morning brief already generated' }, 409);
  }

  const allProjects = db.select().from(projects).all();
  const projectList = allProjects.map((p) => ({
    id: p.id,
    name: p.name,
    repoPath: p.repoPath,
  }));
  const brief = await generateMorningBrief(projectList);
  journalService.setMorningBrief(date, brief);
  return c.json({ ok: true, entry: journalService.getEntry(date) });
});

/** POST /journal/:date/generate-eod — Generate end-of-day recap (immutable once set) */
journalRoutes.post('/journal/:date/generate-eod', async (c) => {
  const date = c.req.param('date');
  const entry = journalService.getEntry(date);
  if (entry.eodGeneratedAt) {
    return c.json({ error: 'End of day already generated' }, 409);
  }

  const allProjects = db.select().from(projects).all();
  const projectList = allProjects.map((p) => ({
    id: p.id,
    name: p.name,
    repoPath: p.repoPath,
  }));
  const recap = await generateEndOfDay(projectList);
  journalService.setEndOfDay(date, recap);
  return c.json({ ok: true, entry: journalService.getEntry(date) });
});

/** POST /journal/:date/log — Append a work log event */
journalRoutes.post('/journal/:date/log', async (c) => {
  const { line } = await c.req.json<{ line: string }>();
  if (!line?.trim()) return c.json({ error: 'line required' }, 400);
  journalService.appendWorkLog(c.req.param('date'), line.trim());
  return c.json({ ok: true });
});

/** PUT /journal/:date/notes — Update notes (only user-editable section) */
journalRoutes.put('/journal/:date/notes', async (c) => {
  const { notes } = await c.req.json<{ notes: string }>();
  journalService.setNotes(c.req.param('date'), notes ?? '');
  return c.json({ ok: true });
});
