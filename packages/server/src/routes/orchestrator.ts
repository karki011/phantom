/**
 * Orchestrator API Routes — AI strategy pipeline endpoints
 * @author Subash Karki
 */
import { Hono } from 'hono';
import { orchestratorEngine } from '../services/orchestrator-engine.js';
import { logger } from '../logger.js';

export const orchestratorRoutes = new Hono();

/** In-memory map tracking recent file edits for retry detection */
const recentEdits = new Map<string, number>();

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

/** GET /orchestrator/:projectId/timeline — Chronological decisions with outcomes */
orchestratorRoutes.get('/orchestrator/:projectId/timeline', (c) => {
  const projectId = c.req.param('projectId');
  const days = Number(c.req.query('days')) || 30;
  const limit = Number(c.req.query('limit')) || 100;
  const history = orchestratorEngine.getHistory(projectId, limit);

  // Filter to requested time window
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const filtered = history.filter((d) => {
    const ts = d.created_at as number | string | undefined;
    if (!ts) return true;
    const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
    return t >= cutoff;
  });

  return c.json({ decisions: filtered, period: days, count: filtered.length });
});

/** POST /orchestrator/record-outcome — Record a turn outcome from the Stop hook */
orchestratorRoutes.post('/orchestrator/record-outcome', async (c) => {
  try {
    const body = await c.req.json<{
      sessionId: string;
      timestamp?: string;
    }>();

    if (!body.sessionId) {
      return c.json({ error: 'sessionId required' }, 400);
    }

    // Log the outcome — full knowledge integration comes in Phase 2
    logger.info('OrchestratorRoutes', `[outcome] Session ${body.sessionId} turn completed at ${body.timestamp ?? 'unknown'}`);

    return c.json({ status: 'recorded' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record outcome';
    logger.error('OrchestratorRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** POST /orchestrator/check-retry — Check if a file edit is a retry (same file within 60s) */
orchestratorRoutes.post('/orchestrator/check-retry', async (c) => {
  try {
    const { filePath, timestamp } = await c.req.json<{
      filePath: string;
      timestamp: number;
    }>();

    if (!filePath || !timestamp) {
      return c.json({ error: 'filePath and timestamp are required' }, 400);
    }

    const lastEdit = recentEdits.get(filePath);
    const isRetry = lastEdit != null && (timestamp - lastEdit) < 60_000;
    recentEdits.set(filePath, timestamp);

    return c.json({ isRetry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check retry';
    logger.error('OrchestratorRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** POST /orchestrator/record-feedback — Record explicit or implicit feedback signal */
orchestratorRoutes.post('/orchestrator/record-feedback', async (c) => {
  try {
    const { signal, timestamp } = await c.req.json<{
      signal: 'success' | 'retry' | 'revert';
      timestamp?: string;
    }>();

    if (!signal) {
      return c.json({ error: 'signal is required' }, 400);
    }

    logger.info('OrchestratorRoutes', `[feedback] Signal: ${signal} at ${timestamp ?? 'unknown'}`);

    return c.json({ status: 'recorded', signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record feedback';
    logger.error('OrchestratorRoutes', message);
    return c.json({ error: message }, 500);
  }
});

/** GET /orchestrator/:projectId/evolution — Evolution dashboard data */
orchestratorRoutes.get('/orchestrator/:projectId/evolution', async (c) => {
  const projectId = c.req.param('projectId');

  try {
    // Gather history for derived metrics
    const history = orchestratorEngine.getHistory(projectId, 500);
    const strategies = orchestratorEngine.getStrategies(projectId);

    // ── Knowledge Health ────────────────────────────────────────────────
    const totalDecisions = history.length;
    const successCount = history.filter((d) => (d as any).success === 1).length;
    const avgSuccessRate = totalDecisions > 0 ? successCount / totalDecisions : 0;

    // Pattern detection: group by strategy+complexity, find repeating combos
    const patternMap = new Map<string, { count: number; success: number; firstSeen: string; lastSeen: string }>();
    for (const d of history) {
      const key = `${(d as any).strategy_id}:${(d as any).complexity ?? 'unknown'}`;
      const existing = patternMap.get(key);
      const ts = String((d as any).created_at ?? '');
      if (existing) {
        existing.count++;
        if ((d as any).success === 1) existing.success++;
        existing.lastSeen = ts;
      } else {
        patternMap.set(key, {
          count: 1,
          success: (d as any).success === 1 ? 1 : 0,
          firstSeen: ts,
          lastSeen: ts,
        });
      }
    }

    const activePatterns = [...patternMap.values()].filter((p) => p.count >= 3).length;
    const staleDecisions = history.filter((d) => {
      const ts = (d as any).created_at;
      const t = typeof ts === 'number' ? ts : new Date(ts as string).getTime();
      return Date.now() - t > 30 * 24 * 60 * 60 * 1000; // >30 days old
    }).length;

    // Health score: weighted combination of success rate, pattern coverage, freshness
    const freshnessFactor = totalDecisions > 0 ? Math.min(1, (totalDecisions - staleDecisions) / totalDecisions) : 0;
    const patternCoverage = totalDecisions > 0 ? Math.min(1, activePatterns / Math.max(strategies.length, 1)) : 0;
    const healthScore = Math.round((avgSuccessRate * 50 + patternCoverage * 30 + freshnessFactor * 20));

    // ── Threshold Drift ─────────────────────────────────────────────────
    // Placeholder — real auto-tuning thresholds come from Go compactor later
    const defaults = { complexityWeight: 0.4, riskWeight: 0.3, confidenceMin: 0.6 };
    const current = { ...defaults }; // No drift yet
    const driftPercent = 0;

    // ── Strategy Trends (last 7 days) ───────────────────────────────────
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentDecisions = history.filter((d) => {
      const ts = (d as any).created_at;
      const t = typeof ts === 'number' ? ts : new Date(ts as string).getTime();
      return t >= sevenDaysAgo;
    });

    const trendMap = new Map<string, Map<string, { total: number; success: number }>>();
    for (const d of recentDecisions) {
      const sid = (d as any).strategy_id as string;
      const ts = (d as any).created_at;
      const t = typeof ts === 'number' ? ts : new Date(ts as string).getTime();
      const dateStr = new Date(t).toISOString().slice(0, 10);

      if (!trendMap.has(sid)) trendMap.set(sid, new Map());
      const dayMap = trendMap.get(sid)!;
      const entry = dayMap.get(dateStr) ?? { total: 0, success: 0 };
      entry.total++;
      if ((d as any).success === 1) entry.success++;
      dayMap.set(dateStr, entry);
    }

    const strategyTrends: Array<{ strategyId: string; date: string; successRate: number }> = [];
    for (const [strategyId, dayMap] of trendMap) {
      for (const [date, counts] of dayMap) {
        strategyTrends.push({
          strategyId,
          date,
          successRate: counts.total > 0 ? counts.success / counts.total : 0,
        });
      }
    }
    strategyTrends.sort((a, b) => a.date.localeCompare(b.date));

    // ── Patterns ────────────────────────────────────────────────────────
    const patterns = [...patternMap.entries()]
      .filter(([, v]) => v.count >= 2)
      .map(([key, v]) => {
        const [strategyId, complexity] = key.split(':');
        return {
          strategyId,
          complexity,
          risk: 'unknown',
          successRate: v.count > 0 ? v.success / v.count : 0,
          discoveredAt: v.firstSeen,
          status: v.count >= 5 ? 'active' : 'emerging',
        };
      })
      .sort((a, b) => b.successRate - a.successRate);

    // ── Gap Alerts ──────────────────────────────────────────────────────
    // Detect complexity/risk combos with low success rates
    const gaps: Array<{ complexity: string; risk: string; bestStrategy: string; bestRate: number; severity: string }> = [];
    const complexityLevels = ['simple', 'moderate', 'complex', 'critical'];
    for (const complexity of complexityLevels) {
      const relevantPatterns = [...patternMap.entries()]
        .filter(([key]) => key.endsWith(`:${complexity}`))
        .map(([key, v]) => ({
          strategyId: key.split(':')[0],
          rate: v.count > 0 ? v.success / v.count : 0,
          count: v.count,
        }))
        .filter((p) => p.count >= 2);

      if (relevantPatterns.length > 0) {
        const best = relevantPatterns.sort((a, b) => b.rate - a.rate)[0];
        if (best.rate < 0.5) {
          gaps.push({
            complexity,
            risk: 'unknown',
            bestStrategy: best.strategyId,
            bestRate: best.rate,
            severity: best.rate < 0.25 ? 'critical' : 'warning',
          });
        }
      }
    }

    return c.json({
      health: {
        totalDecisions,
        activePatterns,
        deprecatedPatterns: 0,
        avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
        staleDecisions,
        healthScore,
      },
      thresholds: { current, defaults, driftPercent },
      strategyTrends,
      patterns,
      gaps,
      globalPatterns: [], // Populated when cross-project transfer (Go) is wired
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch evolution data';
    logger.error('OrchestratorRoutes', message);
    return c.json({ error: message }, 500);
  }
});
