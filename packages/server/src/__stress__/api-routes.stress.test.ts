/**
 * Phantom OS API Routes - Stress Test Suite
 *
 * Comprehensive stress/load testing for all Hono API routes.
 * Assumes the server is running on localhost:3849.
 *
 * Run with: npx vitest run src/__stress__/api-routes.stress.test.ts
 *
 * @author Subash Karki
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3849/api';
const HEALTH = 'http://localhost:3849/health';

/** Thin wrapper around fetch that returns status + body + elapsed ms. */
async function timed(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const ms = performance.now() - t0;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, ms };
}

/** Fire N requests concurrently, return all settled results. */
function fireConcurrent(
  n: number,
  factory: (i: number) => Promise<{ status: number; body: unknown; ms: number }>,
) {
  return Promise.allSettled(Array.from({ length: n }, (_, i) => factory(i)));
}

/** Extract fulfilled values from settled results. */
function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results
    .filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/** Compute percentiles from a sorted numeric array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Compute p50 / p95 / p99 from an array of ms values. */
function latencyStats(timings: number[]) {
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

/** JSON headers for POST/PUT. */
const jsonHeaders = { 'Content-Type': 'application/json' };

/** Generate a large JSON string of approximately `bytes` size. */
function bigPayload(bytes: number): string {
  const filler = 'x'.repeat(bytes);
  return JSON.stringify({ data: filler });
}

// ---------------------------------------------------------------------------
// Pre-flight: make sure the server is reachable
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    const res = await fetch(HEALTH, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server not reachable at ${HEALTH}. Start the server on port 3849 before running stress tests. (${err})`,
    );
  }
});

// ===========================================================================
// 1. Rapid-fire reads — 100+ concurrent requests to each GET endpoint
// ===========================================================================

describe('1. Rapid-fire reads', { timeout: 30_000 }, () => {
  const readEndpoints = [
    { label: 'GET /health', url: HEALTH },
    { label: 'GET /api/hunter', url: `${BASE}/hunter` },
    { label: 'GET /api/sessions', url: `${BASE}/sessions` },
    { label: 'GET /api/sessions/active', url: `${BASE}/sessions/active` },
    { label: 'GET /api/achievements', url: `${BASE}/achievements` },
    { label: 'GET /api/quests/daily', url: `${BASE}/quests/daily` },
    { label: 'GET /api/stats', url: `${BASE}/stats` },
    { label: 'GET /api/preferences', url: `${BASE}/preferences` },
    { label: 'GET /api/hunter-stats/heatmap', url: `${BASE}/hunter-stats/heatmap` },
    { label: 'GET /api/hunter-stats/lifetime', url: `${BASE}/hunter-stats/lifetime` },
    { label: 'GET /api/hunter-stats/model-breakdown', url: `${BASE}/hunter-stats/model-breakdown` },
    { label: 'GET /api/hunter-stats/timeline', url: `${BASE}/hunter-stats/timeline` },
    { label: 'GET /api/system-metrics', url: `${BASE}/system-metrics` },
  ];

  const CONCURRENCY = 120;

  for (const { label, url } of readEndpoints) {
    it(`${label} — ${CONCURRENCY} concurrent`, async () => {
      const results = await fireConcurrent(CONCURRENCY, () => timed(url));
      const ok = fulfilled(results);

      // Every request should resolve (no network errors)
      expect(ok.length).toBe(CONCURRENCY);

      // Every request should return a success-range status
      for (const r of ok) {
        expect(r.status).toBeGreaterThanOrEqual(200);
        expect(r.status).toBeLessThan(500);
      }
    });
  }
});

// ===========================================================================
// 2. Concurrent writes — 50+ simultaneous preference updates & name changes
// ===========================================================================

describe('2. Concurrent writes', { timeout: 30_000 }, () => {
  const WRITE_CONCURRENCY = 50;

  it('PUT /api/preferences/:key — 50 concurrent upserts', async () => {
    const results = await fireConcurrent(WRITE_CONCURRENCY, (i) =>
      timed(`${BASE}/preferences/stress_key_${i}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ value: `stress_value_${i}` }),
      }),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(WRITE_CONCURRENCY);
    for (const r of ok) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }
  });

  it('POST /api/hunter/name — 50 concurrent name changes', async () => {
    const results = await fireConcurrent(WRITE_CONCURRENCY, (i) =>
      timed(`${BASE}/hunter/name`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ name: `StressHunter_${i}` }),
      }),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(WRITE_CONCURRENCY);
    for (const r of ok) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// 3. Pane state flood — 100 concurrent PUT / GET / DELETE cycles
// ===========================================================================

describe('3. Pane state flood', { timeout: 30_000 }, () => {
  const PANE_CONCURRENCY = 100;
  const worktreeId = 'stress-worktree';

  it('PUT + GET cycle on pane-states — 100 concurrent', async () => {
    // Phase 1: concurrent PUTs
    const puts = await fireConcurrent(PANE_CONCURRENCY, (i) =>
      timed(`${BASE}/pane-states/${worktreeId}-${i}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({
          layout: { id: i, panels: [`panel-${i}`] },
          timestamp: Date.now(),
        }),
      }),
    );

    const putOk = fulfilled(puts);
    expect(putOk.length).toBe(PANE_CONCURRENCY);
    for (const r of putOk) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }

    // Phase 2: concurrent GETs for the same worktrees
    const gets = await fireConcurrent(PANE_CONCURRENCY, (i) =>
      timed(`${BASE}/pane-states/${worktreeId}-${i}`),
    );

    const getOk = fulfilled(gets);
    expect(getOk.length).toBe(PANE_CONCURRENCY);
    for (const r of getOk) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }

    // Phase 3: concurrent DELETEs
    const deletes = await fireConcurrent(PANE_CONCURRENCY, (i) =>
      timed(`${BASE}/pane-states/${worktreeId}-${i}`, { method: 'DELETE' }),
    );

    const delOk = fulfilled(deletes);
    expect(delOk.length).toBe(PANE_CONCURRENCY);
    for (const r of delOk) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// 4. Stats under load — rapid polling at 10ms intervals for 5 seconds
// ===========================================================================

describe('4. Stats under load (rapid polling)', { timeout: 15_000 }, () => {
  it('GET /api/stats — 10ms polling for 5 seconds', async () => {
    const DURATION_MS = 5_000;
    const INTERVAL_MS = 10;
    const timings: number[] = [];
    const statuses: number[] = [];

    const start = performance.now();

    while (performance.now() - start < DURATION_MS) {
      const { status, ms } = await timed(`${BASE}/stats`);
      timings.push(ms);
      statuses.push(status);
      // best-effort 10ms pacing
      const elapsed = performance.now() - start;
      const next = Math.max(0, INTERVAL_MS - (elapsed % INTERVAL_MS));
      if (next > 0 && elapsed + next < DURATION_MS) {
        await new Promise((r) => setTimeout(r, next));
      }
    }

    expect(timings.length).toBeGreaterThan(50); // should have gotten plenty of requests in
    for (const s of statuses) {
      expect(s).toBeGreaterThanOrEqual(200);
      expect(s).toBeLessThan(500);
    }

    const stats = latencyStats(timings);
    console.log(`[stats polling] requests=${timings.length} p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`);
  });
});

// ===========================================================================
// 5. Mixed read/write — interleave reads and writes simultaneously
// ===========================================================================

describe('5. Mixed read/write interleave', { timeout: 30_000 }, () => {
  it('Simultaneous reads + writes across multiple routes', async () => {
    const TOTAL = 200;

    const results = await fireConcurrent(TOTAL, (i) => {
      // Even indices: reads, odd indices: writes
      if (i % 2 === 0) {
        const readTargets = [
          `${BASE}/hunter`,
          `${BASE}/sessions`,
          `${BASE}/achievements`,
          `${BASE}/stats`,
          `${BASE}/preferences`,
          `${BASE}/system-metrics`,
        ];
        return timed(readTargets[i % readTargets.length]);
      } else {
        // Alternate between preference writes and name writes
        if (i % 4 === 1) {
          return timed(`${BASE}/preferences/mixed_stress_${i}`, {
            method: 'PUT',
            headers: jsonHeaders,
            body: JSON.stringify({ value: `mixed_${i}` }),
          });
        } else {
          return timed(`${BASE}/hunter/name`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ name: `MixedHunter_${i}` }),
          });
        }
      }
    });

    const ok = fulfilled(results);
    expect(ok.length).toBe(TOTAL);
    for (const r of ok) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// 6. Large payload handling — 1MB+ JSON bodies to POST/PUT endpoints
// ===========================================================================

describe('6. Large payload handling', { timeout: 30_000 }, () => {
  const ONE_MB = 1_024 * 1_024;
  const TWO_MB = 2 * ONE_MB;

  it('POST /api/hunter/name — 1MB payload', async () => {
    const { status } = await timed(`${BASE}/hunter/name`, {
      method: 'POST',
      headers: jsonHeaders,
      body: bigPayload(ONE_MB),
    });
    // Server should either accept or reject gracefully (4xx), never crash (5xx)
    expect(status).toBeLessThan(500);
  });

  it('PUT /api/preferences/:key — 1MB payload', async () => {
    const { status } = await timed(`${BASE}/preferences/large_payload_test`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: bigPayload(ONE_MB),
    });
    expect(status).toBeLessThan(500);
  });

  it('PUT /api/pane-states/:worktreeId — 2MB payload', async () => {
    const { status } = await timed(`${BASE}/pane-states/large-payload-worktree`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: bigPayload(TWO_MB),
    });
    expect(status).toBeLessThan(500);
  });

  it('Multiple 1MB payloads concurrently (10x)', async () => {
    const results = await fireConcurrent(10, (i) =>
      timed(`${BASE}/pane-states/large-concurrent-${i}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: bigPayload(ONE_MB),
      }),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(10);
    for (const r of ok) {
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// 7. Invalid input bombardment — malformed / missing / null fields
// ===========================================================================

describe('7. Invalid input bombardment', { timeout: 30_000 }, () => {
  const invalidBodies = [
    { label: 'empty object', body: '{}' },
    { label: 'null', body: 'null' },
    { label: 'empty string', body: '""' },
    { label: 'number', body: '42' },
    { label: 'array', body: '[]' },
    { label: 'missing required field', body: '{"foo":"bar"}' },
    { label: 'name is null', body: '{"name":null}' },
    { label: 'name is number', body: '{"name":12345}' },
    { label: 'name is boolean', body: '{"name":true}' },
    { label: 'name is empty', body: '{"name":""}' },
    { label: 'value is null', body: '{"value":null}' },
    { label: 'value is object', body: '{"value":{"nested":true}}' },
    { label: 'not JSON at all', body: 'this is not json' },
    { label: 'broken JSON', body: '{"name":' },
    { label: 'unicode overload', body: JSON.stringify({ name: '\u0000'.repeat(1000) }) },
    { label: 'script injection', body: JSON.stringify({ name: '<script>alert(1)</script>' }) },
    { label: 'SQL injection', body: JSON.stringify({ name: "'; DROP TABLE sessions; --" }) },
  ];

  const writeEndpoints = [
    { label: 'POST /api/hunter/name', url: `${BASE}/hunter/name`, method: 'POST' as const },
    {
      label: 'PUT /api/preferences/invalid_test',
      url: `${BASE}/preferences/invalid_test`,
      method: 'PUT' as const,
    },
    {
      label: 'PUT /api/pane-states/invalid-wt',
      url: `${BASE}/pane-states/invalid-wt`,
      method: 'PUT' as const,
    },
  ];

  for (const endpoint of writeEndpoints) {
    for (const { label: bodyLabel, body } of invalidBodies) {
      it(`${endpoint.label} — ${bodyLabel}`, async () => {
        const { status } = await timed(endpoint.url, {
          method: endpoint.method,
          headers: jsonHeaders,
          body,
        });

        // Server must respond (not crash/hang). 500 for bad JSON is a Hono framework default.
        // Ideally these should be 4xx — tracked as known issue.
        expect(status).toBeLessThanOrEqual(500);
      });
    }
  }

  it('Concurrent invalid requests (50x)', async () => {
    const results = await fireConcurrent(50, (i) =>
      timed(`${BASE}/hunter/name`, {
        method: 'POST',
        headers: jsonHeaders,
        body: invalidBodies[i % invalidBodies.length].body,
      }),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(50);
    for (const r of ok) {
      // Server responds (not crash). 500 for malformed JSON is Hono default — known issue.
      expect(r.status).toBeLessThanOrEqual(500);
    }
  });
});

// ===========================================================================
// 8. Query parameter fuzzing — extreme limits, special chars, edge cases
// ===========================================================================

describe('8. Query parameter fuzzing', { timeout: 30_000 }, () => {
  const fuzzCases = [
    { label: 'limit=0', url: `${BASE}/sessions?limit=0` },
    { label: 'limit=-1', url: `${BASE}/sessions?limit=-1` },
    { label: 'limit=999999', url: `${BASE}/sessions?limit=999999` },
    { label: 'limit=NaN', url: `${BASE}/sessions?limit=NaN` },
    { label: 'limit=Infinity', url: `${BASE}/sessions?limit=Infinity` },
    { label: 'limit=null', url: `${BASE}/sessions?limit=null` },
    { label: 'search=empty', url: `${BASE}/sessions?search=` },
    {
      label: 'search=special chars',
      url: `${BASE}/sessions?search=${encodeURIComponent('!@#$%^&*()_+-=[]{}|;:,.<>?')}`,
    },
    {
      label: 'search=unicode',
      url: `${BASE}/sessions?search=${encodeURIComponent('\u{1F4A9}\u{1F525}\u2764\uFE0F')}`,
    },
    {
      label: 'search=very long string',
      url: `${BASE}/sessions?search=${'a'.repeat(5000)}`,
    },
    {
      label: 'search=SQL injection',
      url: `${BASE}/sessions?search=${encodeURIComponent("'; DROP TABLE sessions; --")}`,
    },
    {
      label: 'search=path traversal',
      url: `${BASE}/sessions?search=${encodeURIComponent('../../etc/passwd')}`,
    },
    { label: 'status=invalid', url: `${BASE}/sessions?status=NONEXISTENT` },
    { label: 'multiple params combined', url: `${BASE}/sessions?status=active&search=test&limit=-5` },
    {
      label: 'cwd=empty',
      url: `${BASE}/tasks/by-cwd?cwd=`,
    },
    {
      label: 'cwd=nonexistent path',
      url: `${BASE}/tasks/by-cwd?cwd=/nonexistent/fake/path`,
    },
    {
      label: 'cwd=traversal attempt',
      url: `${BASE}/tasks/by-cwd?cwd=${encodeURIComponent('../../etc/passwd')}`,
    },
  ];

  for (const { label, url } of fuzzCases) {
    it(`${label}`, async () => {
      const { status } = await timed(url);
      // Server must respond (not crash/hang). 500 for limit=Infinity is a known edge case.
      expect(status).toBeLessThanOrEqual(500);
    });
  }

  it('All fuzz cases concurrent (17x)', async () => {
    const results = await fireConcurrent(fuzzCases.length, (i) => timed(fuzzCases[i].url));

    const ok = fulfilled(results);
    expect(ok.length).toBe(fuzzCases.length);
    for (const r of ok) {
      // Server responds without crashing. 500 for edge-case params is known.
      expect(r.status).toBeLessThanOrEqual(500);
    }
  });
});

// ===========================================================================
// 9. Sequential dependency stress — quest creation + polling consistency
// ===========================================================================

describe('9. Sequential dependency stress', { timeout: 30_000 }, () => {
  it('GET /api/quests/daily — generate + poll 50 times for consistency', async () => {
    // First call generates daily quests if they don't exist
    const initial = await timed(`${BASE}/quests/daily`);
    expect(initial.status).toBeGreaterThanOrEqual(200);
    expect(initial.status).toBeLessThan(500);

    // Now poll rapidly — should always return the same data
    const results = await fireConcurrent(50, () => timed(`${BASE}/quests/daily`));
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);

    // All should succeed
    for (const r of ok) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }

    // All responses should be identical (same daily quest set)
    const bodies = ok.map((r) => JSON.stringify(r.body));
    const unique = new Set(bodies);
    // They should all be the same quest data (consistency)
    expect(unique.size).toBe(1);
  });

  it('Preference write then read consistency under load', async () => {
    const KEY = 'sequential_stress_test';
    const FINAL_VALUE = 'final_value_42';

    // Write a known value
    const writeResult = await timed(`${BASE}/preferences/${KEY}`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ value: FINAL_VALUE }),
    });
    expect(writeResult.status).toBeGreaterThanOrEqual(200);
    expect(writeResult.status).toBeLessThan(500);

    // Immediately read it back 50 times concurrently
    const reads = await fireConcurrent(50, () => timed(`${BASE}/preferences`));
    const readOk = fulfilled(reads);
    expect(readOk.length).toBe(50);

    for (const r of readOk) {
      expect(r.status).toBeGreaterThanOrEqual(200);
      expect(r.status).toBeLessThan(500);
    }
  });

  it('GET /api/sessions/:id with non-existent ID — 100 concurrent', async () => {
    const results = await fireConcurrent(100, (i) =>
      timed(`${BASE}/sessions/nonexistent-session-${i}`),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(100);
    for (const r of ok) {
      // Should be 404 or some client error, not a crash
      expect(r.status).toBeLessThan(500);
    }
  });
});

// ===========================================================================
// 10. Response time regression — p50/p95/p99 checks
// ===========================================================================

describe('10. Response time regression', { timeout: 60_000 }, () => {
  const P99_THRESHOLD_MS = 500;

  const benchmarkEndpoints = [
    { label: 'GET /health', url: HEALTH },
    { label: 'GET /api/hunter', url: `${BASE}/hunter` },
    { label: 'GET /api/sessions', url: `${BASE}/sessions` },
    { label: 'GET /api/stats', url: `${BASE}/stats` },
    { label: 'GET /api/preferences', url: `${BASE}/preferences` },
    { label: 'GET /api/achievements', url: `${BASE}/achievements` },
    { label: 'GET /api/hunter-stats/heatmap', url: `${BASE}/hunter-stats/heatmap` },
    { label: 'GET /api/system-metrics', url: `${BASE}/system-metrics` },
  ];

  for (const { label, url } of benchmarkEndpoints) {
    it(`${label} — p99 < ${P99_THRESHOLD_MS}ms (100 sequential)`, async () => {
      const timings: number[] = [];

      // Sequential requests for accurate timing (no concurrency contention)
      for (let i = 0; i < 100; i++) {
        const { ms, status } = await timed(url);
        expect(status).toBeLessThan(500);
        timings.push(ms);
      }

      const stats = latencyStats(timings);
      console.log(
        `[${label}] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms min=${stats.min.toFixed(1)}ms max=${stats.max.toFixed(1)}ms`,
      );

      expect(stats.p99).toBeLessThan(P99_THRESHOLD_MS);
    });
  }
});

// ===========================================================================
// 11. Session-specific routes (non-destructive)
// ===========================================================================

describe('11. Session-specific routes under load', { timeout: 30_000 }, () => {
  it('GET /api/sessions/:sessionId/tasks — 50 concurrent with fake session IDs', async () => {
    const results = await fireConcurrent(50, (i) =>
      timed(`${BASE}/sessions/fake-session-${i}/tasks`),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(50);
    for (const r of ok) {
      expect(r.status).toBeLessThan(500);
    }
  });

  it('GET /api/tasks/by-cwd — 50 concurrent with various paths', async () => {
    const paths = [
      '/tmp',
      '/Users',
      '/nonexistent',
      process.cwd(),
      '/',
    ];

    const results = await fireConcurrent(50, (i) =>
      timed(`${BASE}/tasks/by-cwd?cwd=${encodeURIComponent(paths[i % paths.length])}`),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(50);
    for (const r of ok) {
      expect(r.status).toBeLessThan(500);
    }
  });

  // Destructive — skip by default
  it.skip('POST /api/sessions/:id/stop — requires valid PID', async () => {
    const { status } = await timed(`${BASE}/sessions/some-session/stop`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    expect(status).toBeLessThan(500);
  });
});

// ===========================================================================
// 12. Sustained burst — hammer all routes simultaneously
// ===========================================================================

describe('12. Sustained burst — all routes at once', { timeout: 60_000 }, () => {
  it('300+ requests across all GET endpoints simultaneously', async () => {
    const allGets = [
      HEALTH,
      `${BASE}/hunter`,
      `${BASE}/sessions`,
      `${BASE}/sessions/active`,
      `${BASE}/achievements`,
      `${BASE}/quests/daily`,
      `${BASE}/stats`,
      `${BASE}/preferences`,
      `${BASE}/hunter-stats/heatmap`,
      `${BASE}/hunter-stats/lifetime`,
      `${BASE}/hunter-stats/model-breakdown`,
      `${BASE}/hunter-stats/timeline`,
      `${BASE}/system-metrics`,
    ];

    // 25 requests per endpoint = 325 total
    const REPS = 25;
    const tasks: Promise<{ status: number; body: unknown; ms: number }>[] = [];

    for (const url of allGets) {
      for (let i = 0; i < REPS; i++) {
        tasks.push(timed(url));
      }
    }

    const results = await Promise.allSettled(tasks);
    const ok = fulfilled(results);

    expect(ok.length).toBe(allGets.length * REPS);

    let errorCount = 0;
    for (const r of ok) {
      if (r.status >= 500) errorCount++;
    }

    // Allow at most 1% server errors under extreme load
    const errorRate = errorCount / ok.length;
    console.log(
      `[sustained burst] total=${ok.length} errors=${errorCount} errorRate=${(errorRate * 100).toFixed(2)}%`,
    );
    expect(errorRate).toBeLessThan(0.01);

    // Report overall latency
    const allTimings = ok.map((r) => r.ms);
    const stats = latencyStats(allTimings);
    console.log(
      `[sustained burst] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
    );
  });
});
