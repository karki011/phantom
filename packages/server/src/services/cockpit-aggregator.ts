/**
 * PhantomOS — Cockpit Aggregator
 * Aggregates session data into a CockpitDashboard for the CodeBurn Cockpit feature.
 * @author Subash Karki
 */
import { sqlite } from '@phantom-os/db';
import type {
  CockpitPeriod,
  CockpitDashboard,
  CockpitOverview,
  DailyEntry,
  RankedEntry,
  ActivityEntry,
  ActivityCategory,
} from '@phantom-os/shared';
import { classifySession, estimateOneShotRate } from './turn-classifier.js';

// ---------------------------------------------------------------------------
// Period → SQL WHERE clause
// ---------------------------------------------------------------------------

function periodToWhere(period: CockpitPeriod): string {
  const now = Date.now();
  switch (period) {
    case 'today': {
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      return `date(started_at / 1000, 'unixepoch', 'localtime') = '${todayStr}'`;
    }
    case '7d':
      return `started_at >= ${now - 7 * 24 * 60 * 60 * 1000}`;
    case '30d':
      return `started_at >= ${now - 30 * 24 * 60 * 60 * 1000}`;
    case 'all':
    default:
      return '1=1';
  }
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

interface SessionRow {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated_cost_micros: number;
  message_count: number;
  tool_use_count: number;
  tool_breakdown: string | null;
  first_prompt: string | null;
  repo: string | null;
  model: string | null;
  started_at: number;
}

export function aggregateDashboard(period: CockpitPeriod): CockpitDashboard {
  const where = periodToWhere(period);

  // --- Overview ---
  const overviewRow = sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(input_tokens), 0)         AS input_tokens,
         COALESCE(SUM(output_tokens), 0)        AS output_tokens,
         COALESCE(SUM(cache_read_tokens), 0)    AS cache_read_tokens,
         COALESCE(SUM(cache_write_tokens), 0)   AS cache_write_tokens,
         COALESCE(SUM(estimated_cost_micros), 0) AS total_cost,
         COALESCE(SUM(message_count), 0)        AS total_calls,
         COUNT(*)                               AS total_sessions
       FROM sessions
       WHERE ${where}`,
    )
    .get() as {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    total_cost: number;
    total_calls: number;
    total_sessions: number;
  };

  const cacheHitRate =
    overviewRow.input_tokens + overviewRow.cache_read_tokens > 0
      ? overviewRow.cache_read_tokens /
        (overviewRow.input_tokens + overviewRow.cache_read_tokens)
      : 0;

  const overview: CockpitOverview = {
    totalCost: overviewRow.total_cost,
    totalCalls: overviewRow.total_calls,
    totalSessions: overviewRow.total_sessions,
    cacheHitRate,
    inputTokens: overviewRow.input_tokens,
    outputTokens: overviewRow.output_tokens,
    cacheReadTokens: overviewRow.cache_read_tokens,
    cacheWriteTokens: overviewRow.cache_write_tokens,
  };

  // --- Daily ---
  const dailyRows = sqlite
    .prepare(
      `SELECT
         date(started_at / 1000, 'unixepoch', 'localtime') AS date,
         COALESCE(SUM(estimated_cost_micros), 0)            AS cost,
         COALESCE(SUM(message_count), 0)                   AS calls,
         COUNT(*)                                          AS sessions
       FROM sessions
       WHERE ${where}
       GROUP BY date(started_at / 1000, 'unixepoch', 'localtime')
       ORDER BY date DESC
       LIMIT 14`,
    )
    .all() as { date: string; cost: number; calls: number; sessions: number }[];

  const daily: DailyEntry[] = dailyRows.map((r) => ({
    date: r.date,
    cost: r.cost,
    calls: r.calls,
    sessions: r.sessions,
  }));

  // --- Projects ---
  const projectRows = sqlite
    .prepare(
      `SELECT
         COALESCE(repo, 'unknown')                          AS name,
         COALESCE(SUM(estimated_cost_micros), 0)           AS cost,
         COUNT(*)                                          AS count
       FROM sessions
       WHERE ${where}
       GROUP BY repo
       ORDER BY cost DESC
       LIMIT 10`,
    )
    .all() as { name: string; cost: number; count: number }[];

  const projects: RankedEntry[] = projectRows.map((r) => ({
    name: r.name,
    cost: r.cost,
    count: r.count,
  }));

  // --- Models ---
  const modelRows = sqlite
    .prepare(
      `SELECT
         COALESCE(model, 'unknown')                        AS name,
         COALESCE(SUM(estimated_cost_micros), 0)          AS cost,
         COUNT(*)                                         AS count
       FROM sessions
       WHERE ${where}
       GROUP BY model
       ORDER BY cost DESC
       LIMIT 10`,
    )
    .all() as { name: string; cost: number; count: number }[];

  const models: RankedEntry[] = modelRows.map((r) => ({
    name: r.name,
    cost: r.cost,
    count: r.count,
  }));

  // --- Activities ---
  const sessionRows = sqlite
    .prepare(
      `SELECT
         tool_breakdown,
         first_prompt,
         estimated_cost_micros
       FROM sessions
       WHERE ${where}`,
    )
    .all() as { tool_breakdown: string | null; first_prompt: string | null; estimated_cost_micros: number }[];

  const activityMap = new Map<
    ActivityCategory,
    { cost: number; sessions: number; oneShotTotal: number; oneShotCount: number }
  >();

  for (const row of sessionRows) {
    const category = classifySession({
      toolBreakdown: row.tool_breakdown,
      firstPrompt: row.first_prompt,
    });
    const oneShot = estimateOneShotRate(row.tool_breakdown);

    const existing = activityMap.get(category) ?? {
      cost: 0,
      sessions: 0,
      oneShotTotal: 0,
      oneShotCount: 0,
    };

    existing.cost += row.estimated_cost_micros ?? 0;
    existing.sessions += 1;
    if (oneShot !== null) {
      existing.oneShotTotal += oneShot ? 1 : 0;
      existing.oneShotCount += 1;
    }

    activityMap.set(category, existing);
  }

  const activities: ActivityEntry[] = Array.from(activityMap.entries()).map(
    ([category, data]) => ({
      category,
      cost: data.cost,
      sessions: data.sessions,
      oneShotRate: data.oneShotCount > 0 ? data.oneShotTotal / data.oneShotCount : null,
    }),
  );

  // --- Tools (non-MCP) ---
  const toolMap = new Map<string, number>();

  for (const row of sessionRows) {
    if (!row.tool_breakdown) continue;
    let parsed: Record<string, number>;
    try {
      parsed = JSON.parse(row.tool_breakdown) as Record<string, number>;
    } catch {
      continue;
    }
    for (const [tool, count] of Object.entries(parsed)) {
      if (tool.startsWith('mcp__')) continue;
      toolMap.set(tool, (toolMap.get(tool) ?? 0) + count);
    }
  }

  const tools: RankedEntry[] = Array.from(toolMap.entries())
    .map(([name, count]) => ({ name, cost: 0, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // --- MCP Servers ---
  const mcpMap = new Map<string, number>();

  for (const row of sessionRows) {
    if (!row.tool_breakdown) continue;
    let parsed: Record<string, number>;
    try {
      parsed = JSON.parse(row.tool_breakdown) as Record<string, number>;
    } catch {
      continue;
    }
    for (const [tool, count] of Object.entries(parsed)) {
      if (!tool.startsWith('mcp__')) continue;
      // Format: mcp__<server>__<tool> — extract server name (middle parts)
      const parts = tool.split('__');
      // parts[0] = 'mcp', parts[1..-2] = server segments, parts[-1] = tool name
      const serverName = parts.length >= 3 ? parts.slice(1, -1).join('__') : parts[1] ?? tool;
      mcpMap.set(serverName, (mcpMap.get(serverName) ?? 0) + count);
    }
  }

  const mcpServers: RankedEntry[] = Array.from(mcpMap.entries())
    .map(([name, count]) => ({ name, cost: 0, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // --- Shell Commands (v1: Bash tool usage count) ---
  const bashCount = toolMap.get('Bash') ?? 0;
  const shellCommands: RankedEntry[] =
    bashCount > 0 ? [{ name: 'Bash', cost: 0, count: bashCount }] : [];

  return {
    period,
    overview,
    daily,
    projects,
    models,
    activities,
    tools,
    mcpServers,
    shellCommands,
  };
}
