/**
 * PhantomOS — Cockpit Routes
 * REST endpoints for the CodeBurn Cockpit dashboard.
 * @author Subash Karki
 */
import { Hono } from 'hono';
import type { CockpitPeriod, ToolCategory, ToolUsageEntry, ToolUsageResponse } from '@phantom-os/shared';
import { sqlite } from '@phantom-os/db';
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

// ---------------------------------------------------------------------------
// Tool Usage Tracker
// ---------------------------------------------------------------------------

const periodToMs = (period: CockpitPeriod): number | null => {
  const now = Date.now();
  switch (period) {
    case 'today': {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case '7d': return now - 7 * 86_400_000;
    case '30d': return now - 30 * 86_400_000;
    default: return null; // 'all'
  }
};

const VALID_CATEGORIES: ToolCategory[] = ['all', 'code', 'search', 'agent', 'terminal', 'task', 'git', 'mcp'];

/**
 * GET /api/cockpit/tool-usage?period=today|7d|30d|all&category=all|code|search|agent|terminal|task|git
 * Returns per-invocation tool usage history with aggregate stats.
 */
cockpitRoutes.get('/tool-usage', (c) => {
  const period = (c.req.query('period') ?? 'today') as CockpitPeriod;
  const category = (c.req.query('category') ?? 'all') as ToolCategory;

  if (!VALID_PERIODS.includes(period)) {
    return c.json({ error: `Invalid period "${period}"` }, 400);
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return c.json({ error: `Invalid category "${category}"` }, 400);
  }

  try {
    const sinceMs = periodToMs(period);
    const params: unknown[] = [];
    let whereClause = 'WHERE 1=1';

    if (sinceMs !== null) {
      whereClause += ' AND timestamp >= ?';
      params.push(sinceMs);
    }

    if (category !== 'all') {
      whereClause += ' AND json_extract(metadata, \'$.category\') = ?';
      params.push(category);
    }

    // Fetch entries (most recent first, capped at 500)
    const rows = sqlite.prepare(
      `SELECT id, timestamp, type, session_id, metadata
       FROM activity_log ${whereClause}
       ORDER BY timestamp DESC LIMIT 500`,
    ).all(...params) as { id: number; timestamp: number; type: string; session_id: string; metadata: string }[];

    const entries: ToolUsageEntry[] = rows.map((r) => {
      const meta = JSON.parse(r.metadata || '{}');
      return {
        id: r.id,
        timestamp: r.timestamp,
        type: r.type,
        displayName: meta.displayName ?? r.type,
        category: meta.category ?? 'code',
        detail: meta.detail ?? '',
        sessionName: meta.sessionName ?? '',
        skill: meta.skill,
        agentDesc: meta.agentDesc,
        mcpServer: meta.mcpServer,
        mcpTool: meta.mcpTool,
      };
    });

    // ── Stats from sessions.tool_breakdown (historical data) ──────────
    // tool_breakdown is a JSON column like {"Read": 61, "Write": 41, "Bash": 9}
    // Aggregate across all sessions in the period for accurate totals.
    const sessionParams: unknown[] = [];
    let sessionWhere = 'WHERE tool_breakdown IS NOT NULL';
    if (sinceMs !== null) {
      sessionWhere += ' AND started_at >= ?';
      sessionParams.push(Math.floor(sinceMs / 1000));
    }

    const sessionRows = sqlite.prepare(
      `SELECT tool_breakdown FROM sessions ${sessionWhere}`,
    ).all(...sessionParams) as { tool_breakdown: string }[];

    // Tool name → category mapping (mirrors TOOL_EVENTS in activity-poller)
    const toolCategoryMap: Record<string, string> = {
      Read: 'code', Edit: 'code', Write: 'code', MultiEdit: 'code',
      Bash: 'terminal', Grep: 'search', Glob: 'search',
      Agent: 'agent', Skill: 'agent',
      TaskCreate: 'task', TaskUpdate: 'task',
      WebSearch: 'search', WebFetch: 'search',
    };

    const toolTotals: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let total = 0;

    for (const row of sessionRows) {
      try {
        const breakdown = JSON.parse(row.tool_breakdown) as Record<string, number>;
        for (const [tool, count] of Object.entries(breakdown)) {
          toolTotals[tool] = (toolTotals[tool] ?? 0) + count;
          total += count;
          // Determine category — MCP tools get their own category
          const cat = tool.startsWith('mcp__') ? 'mcp' : (toolCategoryMap[tool] ?? 'code');
          byCategory[cat] = (byCategory[cat] ?? 0) + count;
        }
      } catch { /* skip malformed JSON */ }
    }

    // Top tools (sorted by count, top 10)
    const topTools = Object.entries(toolTotals)
      .filter(([name]) => !name.startsWith('mcp__')) // exclude MCP tools from top list for clarity
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // If category filter is active, filter stats to match
    const filteredTotal = category !== 'all' ? (byCategory[category] ?? 0) : total;

    const response: ToolUsageResponse = {
      entries,
      stats: {
        total: filteredTotal,
        byCategory,
        topTools,
      },
    };

    return c.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to query tool usage: ${message}` }, 500);
  }
});

// ---------------------------------------------------------------------------
// Skill Usage — aggregated from sessions.tool_breakdown "Skill:/" keys
// ---------------------------------------------------------------------------

cockpitRoutes.get('/skill-usage', (c) => {
  const period = (c.req.query('period') ?? 'all') as CockpitPeriod;
  if (!VALID_PERIODS.includes(period)) {
    return c.json({ error: `Invalid period "${period}"` }, 400);
  }

  try {
    const sinceMs = periodToMs(period);
    const params: unknown[] = [];
    let where = 'WHERE tool_breakdown IS NOT NULL';
    if (sinceMs !== null) {
      where += ' AND started_at >= ?';
      params.push(Math.floor(sinceMs / 1000));
    }

    const rows = sqlite.prepare(
      `SELECT tool_breakdown, repo, started_at FROM sessions ${where}`,
    ).all(...params) as { tool_breakdown: string; repo: string | null; started_at: number | null }[];

    // Aggregate skill counts + per-skill metadata
    const skills: Record<string, { count: number; repos: Set<string>; lastUsed: number }> = {};
    let totalSkillCalls = 0;

    for (const row of rows) {
      try {
        const breakdown = JSON.parse(row.tool_breakdown) as Record<string, number>;
        for (const [key, count] of Object.entries(breakdown)) {
          if (!key.startsWith('Skill:/')) continue;
          const skillName = key.slice(6); // remove "Skill:" prefix, keep the "/"
          totalSkillCalls += count;
          if (!skills[skillName]) {
            skills[skillName] = { count: 0, repos: new Set(), lastUsed: 0 };
          }
          skills[skillName].count += count;
          if (row.repo) skills[skillName].repos.add(row.repo);
          const ts = row.started_at ?? 0;
          if (ts > skills[skillName].lastUsed) skills[skillName].lastUsed = ts;
        }
      } catch { /* skip malformed JSON */ }
    }

    // Sort by usage count descending — most-used skills surface first.
    // Tie-break by most-recently-used so the freshest wins among equals.
    const entries = Object.entries(skills)
      .sort(([, a], [, b]) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastUsed - a.lastUsed;
      })
      .map(([name, data]) => ({
        name,
        count: data.count,
        repos: [...data.repos],
        lastUsed: data.lastUsed * 1000, // convert to ms for frontend
      }));

    return c.json({ total: totalSkillCalls, skills: entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Failed to query skill usage: ${message}` }, 500);
  }
});

export default cockpitRoutes;
