/**
 * Graph API Routes — Query the codebase graph
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { graphEngine } from '../services/graph-engine.js';
import { logger } from '../logger.js';

export const graphRoutes = new Hono();

/** GET /graph/:projectId/stats — Return graph stats */
graphRoutes.get('/graph/:projectId/stats', (c) => {
  const projectId = c.req.param('projectId');
  const stats = graphEngine.getStats(projectId);

  if (!stats) {
    return c.json({ error: 'Project graph not found' }, 404);
  }

  return c.json(stats);
});

/** GET /graph/:projectId/context?file=path — Return context for a file */
graphRoutes.get('/graph/:projectId/context', (c) => {
  const projectId = c.req.param('projectId');
  const file = c.req.query('file');

  if (!file) {
    return c.json({ error: 'file query parameter is required' }, 400);
  }

  const query = graphEngine.getQuery(projectId);
  if (!query) {
    return c.json({ error: 'Project graph not found' }, 404);
  }

  try {
    const result = query.getContext(file);
    // Convert Map to plain object for JSON serialization
    const scores: Record<string, number> = {};
    for (const [key, value] of result.scores) {
      scores[key] = value;
    }
    return c.json({ ...result, scores });
  } catch (err) {
    logger.error('GraphRoutes', `Context query failed for ${projectId}:`, err);
    return c.json({ error: 'Failed to get context' }, 500);
  }
});

/** GET /graph/:projectId/blast-radius?file=path — Return blast radius analysis */
graphRoutes.get('/graph/:projectId/blast-radius', (c) => {
  const projectId = c.req.param('projectId');
  const file = c.req.query('file');

  if (!file) {
    return c.json({ error: 'file query parameter is required' }, 400);
  }

  const query = graphEngine.getQuery(projectId);
  if (!query) {
    return c.json({ error: 'Project graph not found' }, 404);
  }

  try {
    const result = query.getBlastRadius(file);
    return c.json(result);
  } catch (err) {
    logger.error('GraphRoutes', `Blast radius query failed for ${projectId}:`, err);
    return c.json({ error: 'Failed to calculate blast radius' }, 500);
  }
});

/** GET /graph/:projectId/related?files=path1,path2 — Return related files */
graphRoutes.get('/graph/:projectId/related', (c) => {
  const projectId = c.req.param('projectId');
  const filesParam = c.req.query('files');

  if (!filesParam) {
    return c.json({ error: 'files query parameter is required' }, 400);
  }

  const query = graphEngine.getQuery(projectId);
  if (!query) {
    return c.json({ error: 'Project graph not found' }, 404);
  }

  try {
    const filePaths = filesParam.split(',').map((f) => f.trim()).filter(Boolean);
    const result = query.getRelatedFiles(filePaths);
    return c.json(result);
  } catch (err) {
    logger.error('GraphRoutes', `Related files query failed for ${projectId}:`, err);
    return c.json({ error: 'Failed to find related files' }, 500);
  }
});

/** GET /graph/:projectId/path?from=path1&to=path2 — Find shortest path between files */
graphRoutes.get('/graph/:projectId/path', (c) => {
  const projectId = c.req.param('projectId');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) {
    return c.json({ error: 'from and to query parameters are required' }, 400);
  }

  const query = graphEngine.getQuery(projectId);
  if (!query) {
    return c.json({ error: 'Project graph not found' }, 404);
  }

  try {
    const result = query.findPath(from, to);
    return c.json(result);
  } catch (err) {
    logger.error('GraphRoutes', `Path query failed for ${projectId}:`, err);
    return c.json({ error: 'Failed to find path' }, 500);
  }
});

/** GET /graph/:projectId/files — List all file paths in the graph */
graphRoutes.get('/graph/:projectId/files', (c) => {
  const projectId = c.req.param('projectId');
  const files = graphEngine.getFileList(projectId);
  return c.json(files);
});

/** POST /graph/:projectId/build — Trigger a rebuild */
graphRoutes.post('/graph/:projectId/build', async (c) => {
  const projectId = c.req.param('projectId');

  // Look up the project to get the repoPath
  const { db, projects } = await import('@phantom-os/db');
  const { eq } = await import('drizzle-orm');

  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  // Trigger build in background — don't await
  void graphEngine.buildProject(projectId, project.repoPath).catch((err) => {
    logger.error('GraphRoutes', `Background build failed for ${projectId}:`, err);
  });

  return c.json({ status: 'building', projectId });
});
