/**
 * Hunter Stats Routes — Phase 1 analytics endpoints
 * Heatmap, lifetime stats, model breakdown, session timeline
 * @author Subash Karki
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { sqlite } from '@phantom-os/db';

export const hunterStatsRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /hunter-stats/heatmap — Daily activity from stats-cache.json
// ---------------------------------------------------------------------------

hunterStatsRoutes.get('/hunter-stats/heatmap', (c) => {
  try {
    const cachePath = path.join(os.homedir(), '.claude', 'stats-cache.json');
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const dailyActivity: {
      date: string;
      messageCount: number;
      sessionCount: number;
      toolCallCount: number;
    }[] = Array.isArray(parsed.dailyActivity) ? parsed.dailyActivity : [];
    return c.json(dailyActivity);
  } catch {
    return c.json([]);
  }
});

// ---------------------------------------------------------------------------
// GET /hunter-stats/lifetime — Aggregated lifetime stats
// ---------------------------------------------------------------------------

hunterStatsRoutes.get('/hunter-stats/lifetime', (c) => {
  try {
    const sessionAgg = sqlite
      .prepare(
        `SELECT
           COUNT(*) as totalSessions,
           COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
           COALESCE(SUM(estimated_cost_micros), 0) as totalCost,
           COALESCE(MAX(CASE WHEN ended_at IS NOT NULL THEN ended_at - started_at ELSE 0 END), 0) as longestSession,
           COUNT(DISTINCT date(started_at / 1000, 'unixepoch')) as activeDays,
           COALESCE(SUM(message_count), 0) as totalMessages,
           COALESCE(SUM(tool_use_count), 0) as totalToolCalls
         FROM sessions`,
      )
      .get() as {
      totalSessions: number;
      totalTokens: number;
      totalCost: number;
      longestSession: number;
      activeDays: number;
      totalMessages: number;
      totalToolCalls: number;
    };

    const favoriteModelRow = sqlite
      .prepare(
        `SELECT model, COUNT(*) as cnt
         FROM sessions
         WHERE model IS NOT NULL
         GROUP BY model
         ORDER BY cnt DESC
         LIMIT 1`,
      )
      .get() as { model: string; cnt: number } | undefined;

    const peakHourRow = sqlite
      .prepare(
        `SELECT CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour, COUNT(*) as cnt
         FROM sessions
         WHERE started_at IS NOT NULL
         GROUP BY hour
         ORDER BY cnt DESC
         LIMIT 1`,
      )
      .get() as { hour: number; cnt: number } | undefined;

    const profile = sqlite
      .prepare(
        `SELECT streak_current, streak_best FROM hunter_profile WHERE id = 1`,
      )
      .get() as { streak_current: number; streak_best: number } | undefined;

    return c.json({
      totalSessions: sessionAgg.totalSessions,
      totalTokens: sessionAgg.totalTokens,
      totalCost: sessionAgg.totalCost,
      favoriteModel: favoriteModelRow?.model ?? 'unknown',
      longestSession: sessionAgg.longestSession,
      currentStreak: profile?.streak_current ?? 0,
      bestStreak: profile?.streak_best ?? 0,
      activeDays: sessionAgg.activeDays,
      peakHour: peakHourRow?.hour ?? 0,
      totalMessages: sessionAgg.totalMessages,
      totalToolCalls: sessionAgg.totalToolCalls,
    });
  } catch {
    return c.json({
      totalSessions: 0,
      totalTokens: 0,
      totalCost: 0,
      favoriteModel: 'unknown',
      longestSession: 0,
      currentStreak: 0,
      bestStreak: 0,
      activeDays: 0,
      peakHour: 0,
      totalMessages: 0,
      totalToolCalls: 0,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /hunter-stats/model-breakdown — Sessions grouped by model
// ---------------------------------------------------------------------------

hunterStatsRoutes.get('/hunter-stats/model-breakdown', (c) => {
  try {
    const rows = sqlite
      .prepare(
        `SELECT
           model,
           COUNT(*) as sessions,
           COALESCE(SUM(input_tokens + output_tokens), 0) as tokens,
           COALESCE(SUM(estimated_cost_micros), 0) as cost
         FROM sessions
         WHERE model IS NOT NULL
         GROUP BY model`,
      )
      .all() as { model: string; sessions: number; tokens: number; cost: number }[];

    return c.json(rows);
  } catch {
    return c.json([]);
  }
});

// ---------------------------------------------------------------------------
// GET /hunter-stats/timeline — Recent sessions with computed duration
// ---------------------------------------------------------------------------

hunterStatsRoutes.get('/hunter-stats/timeline', (c) => {
  try {
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);

    const rows = sqlite
      .prepare(
        `SELECT
           id,
           model,
           started_at as startedAt,
           ended_at as endedAt,
           COALESCE(input_tokens + output_tokens, 0) as tokens,
           COALESCE(estimated_cost_micros, 0) as cost,
           COALESCE(task_count, 0) as taskCount,
           first_prompt as firstPrompt
         FROM sessions
         ORDER BY started_at DESC
         LIMIT ?`,
      )
      .all(limit) as {
      id: string;
      model: string | null;
      startedAt: number;
      endedAt: number | null;
      tokens: number;
      cost: number;
      taskCount: number;
      firstPrompt: string | null;
    }[];

    const now = Date.now();
    const result = rows.map((row) => ({
      ...row,
      duration: row.endedAt ? row.endedAt - row.startedAt : now - row.startedAt,
    }));

    return c.json(result);
  } catch {
    return c.json([]);
  }
});
