/**
 * PhantomOS — Cockpit Routes
 * REST endpoints for the CodeBurn Cockpit dashboard.
 * @author Subash Karki
 */
import { Hono } from 'hono';
import type { CockpitPeriod } from '@phantom-os/shared';
import { aggregateDashboard } from '../services/cockpit-aggregator.js';

export const cockpitRoutes = new Hono();

const VALID_PERIODS: CockpitPeriod[] = ['today', '7d', '30d', 'all'];

/**
 * GET /api/cockpit/dashboard?period=today|7d|30d|all
 * Returns a CockpitDashboard aggregated for the given period.
 */
cockpitRoutes.get('/dashboard', (c) => {
  const rawPeriod = c.req.query('period') ?? 'today';

  if (!VALID_PERIODS.includes(rawPeriod as CockpitPeriod)) {
    return c.json(
      { error: `Invalid period "${rawPeriod}". Must be one of: ${VALID_PERIODS.join(', ')}` },
      400,
    );
  }

  const period = rawPeriod as CockpitPeriod;

  try {
    const dashboard = aggregateDashboard(period);
    return c.json(dashboard);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to aggregate dashboard: ${message}` }, 500);
  }
});

export default cockpitRoutes;
