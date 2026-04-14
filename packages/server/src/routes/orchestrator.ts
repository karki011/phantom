/**
 * Orchestrator API Routes — AI strategy pipeline endpoints
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { orchestratorEngine } from '../services/orchestrator-engine.js';
import { logger } from '../logger.js';

export const orchestratorRoutes = new Hono();

/** POST /orchestrator/process — Route a goal through the strategy pipeline */
orchestratorRoutes.post('/orchestrator/process', async (c) => {
  const body = await c.req.json<{
    projectId: string;
    goal: string;
    activeFiles?: string[];
    hints?: {
      isAmbiguous?: boolean;
      isCritical?: boolean;
      estimatedComplexity?: 'simple' | 'moderate' | 'complex' | 'critical';
    };
  }>();

  if (!body.projectId || !body.goal) {
    return c.json({ error: 'projectId and goal are required' }, 400);
  }

  try {
    const result = await orchestratorEngine.process({
      projectId: body.projectId,
      goal: body.goal,
      activeFiles: body.activeFiles,
      hints: body.hints,
    });

    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Orchestrator processing failed';
    logger.error('OrchestratorRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** GET /orchestrator/:projectId/strategies — List available strategies */
orchestratorRoutes.get('/orchestrator/:projectId/strategies', (c) => {
  const projectId = c.req.param('projectId');
  const strategies = orchestratorEngine.getStrategies(projectId);

  if (strategies.length === 0) {
    return c.json({ error: 'No orchestrator available — ensure graph is built first' }, 404);
  }

  return c.json({ strategies });
});

/** GET /orchestrator/:projectId/history — Recent orchestrator decisions */
orchestratorRoutes.get('/orchestrator/:projectId/history', (c) => {
  const projectId = c.req.param('projectId');
  const limit = Number(c.req.query('limit')) || 20;
  const history = orchestratorEngine.getHistory(projectId, limit);

  return c.json({ decisions: history, count: history.length });
});
