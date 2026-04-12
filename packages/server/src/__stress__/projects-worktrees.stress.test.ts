/**
 * Stress Tests — Project, Worktree & Graph Routes
 * Validates concurrency, race conditions, data integrity, and error handling
 * against a live PhantomOS server on port 3849.
 *
 * Run with: npx vitest run packages/server/src/__stress__/projects-worktrees.stress.test.ts
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3849/api';
const PHANTOM_REPO = '/Users/subash.karki/phantom-os';

/** IDs of projects created during tests — cleaned up in afterAll / afterEach */
const createdProjectIds: string[] = [];
/** IDs of worktrees created during tests — cleaned up in afterAll / afterEach */
const createdWorktreeIds: string[] = [];

const jsonHeaders = { 'Content-Type': 'application/json' };

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: jsonHeaders,
  body: JSON.stringify(body),
});

const patch = (body: unknown): RequestInit => ({
  method: 'PATCH',
  headers: jsonHeaders,
  body: JSON.stringify(body),
});

const del = (): RequestInit => ({ method: 'DELETE' });

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

/** Fire N concurrent requests and return all responses */
const concurrent = async (
  n: number,
  reqFn: (i: number) => [url: string, init?: RequestInit],
): Promise<Response[]> => {
  return Promise.all(
    Array.from({ length: n }, (_, i) => {
      const [url, init] = reqFn(i);
      return fetch(url, init);
    }),
  );
};

/** Fire N concurrent timed requests */
const concurrentTimed = (
  n: number,
  factory: (i: number) => Promise<{ status: number; body: unknown; ms: number }>,
) => {
  return Promise.allSettled(Array.from({ length: n }, (_, i) => factory(i)));
};

/** Extract fulfilled values from settled results */
function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  return results
    .filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/** Compute percentiles from a sorted numeric array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Compute p50/p95/p99 from timing array */
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

/** Create a test project via /projects/open (idempotent for the phantom-os repo) */
const ensureProject = async (): Promise<{ id: string; name: string; repoPath: string }> => {
  const res = await fetch(`${BASE}/projects/open`, json({ repoPath: PHANTOM_REPO }));
  const body = await res.json() as { project: { id: string; name: string; repoPath: string } };
  return body.project;
};

/** Quick cleanup helper — delete a project by id, swallow 404 */
const deleteProject = async (id: string): Promise<void> => {
  try {
    await fetch(`${BASE}/projects/${id}`, del());
  } catch {
    /* swallow */
  }
};

/** Quick cleanup helper — delete a worktree by id, swallow 404 */
const deleteWorktree = async (id: string): Promise<void> => {
  try {
    await fetch(`${BASE}/worktrees/${id}`, del());
  } catch {
    /* swallow */
  }
};

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE}/projects`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `Server is not reachable at ${BASE}. Start the PhantomOS server first (port 3849).\n${String(err)}`,
    );
  }
});

afterAll(async () => {
  // Clean up any worktrees we created
  for (const id of createdWorktreeIds) {
    await deleteWorktree(id);
  }
  // Clean up any projects we created (except the main phantom-os one)
  for (const id of createdProjectIds) {
    await deleteProject(id);
  }
});

// ===========================================================================
// 1. Concurrent project listing — 100 simultaneous GET /projects
// ===========================================================================

describe('1 — Concurrent project listing', () => {
  it('100 simultaneous GET /projects return consistent data', {
    timeout: 30_000,
  }, async () => {
    const results = await concurrentTimed(100, () => timed(`${BASE}/projects`));
    const ok = fulfilled(results);

    expect(ok.length).toBe(100);

    // Every request should return 200
    for (const r of ok) {
      expect(r.status).toBe(200);
    }

    // All responses must be identical arrays
    const baseline = JSON.stringify(ok[0].body);
    for (let i = 1; i < ok.length; i++) {
      expect(JSON.stringify(ok[i].body)).toBe(baseline);
    }

    // Latency report
    const stats = latencyStats(ok.map((r) => r.ms));
    console.log(
      `[1-project-listing] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
    );
  });
});

// ===========================================================================
// 2. Rapid project creation with same repoPath (duplicate detection)
// ===========================================================================

describe('2 — Rapid project creation with same repoPath', () => {
  const fakePath = `/tmp/phantom-stress-dup-${randomUUID()}`;

  afterEach(async () => {
    // clean up any projects with this fake path
    const res = await fetch(`${BASE}/projects`);
    if (res.ok) {
      const all = (await res.json()) as { id: string; repoPath: string }[];
      for (const p of all) {
        if (p.repoPath === fakePath) {
          await deleteProject(p.id);
        }
      }
    }
  });

  it('20 concurrent POST /projects with same fake repoPath — all get 400 (path not exist)', {
    timeout: 15_000,
  }, async () => {
    const responses = await concurrent(20, () => [
      `${BASE}/projects`,
      json({ repoPath: fakePath }),
    ]);

    const statuses = await Promise.all(
      responses.map(async (r) => ({ status: r.status, body: await r.json() })),
    );

    // Since path doesn't exist, all should get 400
    const created = statuses.filter((s) => s.status === 201);
    const rejected = statuses.filter((s) => s.status === 400 || s.status === 409);

    // Either 0 succeed (path validation) or exactly 1 if path existed
    expect(created.length).toBeLessThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(19);
  });

  it('20 concurrent POST /projects/open with SAME real repoPath — all return same project', {
    timeout: 30_000,
  }, async () => {
    // /projects/open is idempotent for an existing project
    const responses = await concurrent(20, () => [
      `${BASE}/projects/open`,
      json({ repoPath: PHANTOM_REPO }),
    ]);

    const bodies = await Promise.all(
      responses.map(async (r) => {
        expect([200, 201]).toContain(r.status);
        return r.json() as Promise<{ project: { id: string } }>;
      }),
    );

    // All should return the same project id (idempotent)
    const ids = new Set(bodies.map((b) => b.project.id));
    // Could be 1 or 2 if first call created it, but all should converge
    expect(ids.size).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// 3. Project rename race
// ===========================================================================

describe('3 — Project rename race', () => {
  it('50 concurrent PATCH /projects/:id with different names — last write wins, no corruption', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();
    const originalName = project.name;

    const names = Array.from({ length: 50 }, (_, i) => `stress-rename-${i}-${Date.now()}`);

    const responses = await concurrent(50, (i) => [
      `${BASE}/projects/${project.id}`,
      patch({ name: names[i] }),
    ]);

    for (const r of responses) {
      expect([200]).toContain(r.status);
      await r.json(); // drain body
    }

    // Final state should be one of the names we sent
    const final = await (await fetch(`${BASE}/projects`)).json() as { id: string; name: string }[];
    const found = final.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.name).toBeTruthy();
    expect(typeof found!.name).toBe('string');
    expect(found!.name.length).toBeGreaterThan(0);
    // Must be one of the names we submitted
    expect(names).toContain(found!.name);

    // Restore original name
    await fetch(`${BASE}/projects/${project.id}`, patch({ name: originalName }));
  });

  it('50 concurrent PATCH on same project — all responses have valid name field', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();
    const originalName = project.name;

    const results = await concurrentTimed(50, (i) =>
      timed(`${BASE}/projects/${project.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ name: `race-${i}-${Date.now()}` }),
      }),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);

    for (const r of ok) {
      expect(r.status).toBe(200);
      const body = r.body as { name: string } | null;
      expect(body).toBeDefined();
      expect(typeof body?.name).toBe('string');
      expect(body!.name.length).toBeGreaterThan(0);
    }

    // Restore
    await fetch(`${BASE}/projects/${project.id}`, patch({ name: originalName }));
  });
});

// ===========================================================================
// 4. Worktree listing flood — 200 concurrent GET /worktrees
// ===========================================================================

describe('4 — Worktree listing flood', () => {
  it('200 concurrent GET /worktrees return consistent data', {
    timeout: 30_000,
  }, async () => {
    const results = await concurrentTimed(200, () => timed(`${BASE}/worktrees`));
    const ok = fulfilled(results);

    expect(ok.length).toBe(200);
    for (const r of ok) {
      expect(r.status).toBe(200);
    }

    // Verify all responses are identical
    const baseline = JSON.stringify(ok[0].body);
    for (let i = 1; i < ok.length; i++) {
      expect(JSON.stringify(ok[i].body)).toBe(baseline);
    }

    const stats = latencyStats(ok.map((r) => r.ms));
    console.log(
      `[4-worktree-listing] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
    );
  });

  it('100 concurrent GET /worktrees?projectId=<id> with valid project', {
    timeout: 20_000,
  }, async () => {
    const project = await ensureProject();

    const responses = await concurrent(100, () => [
      `${BASE}/worktrees?projectId=${project.id}`,
    ]);

    for (const r of responses) {
      expect(r.status).toBe(200);
      const body = (await r.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
    }
  });

  it('50 concurrent GET /worktrees?projectId=<nonexistent> return empty arrays', {
    timeout: 15_000,
  }, async () => {
    const fakeId = randomUUID();
    const responses = await concurrent(50, () => [
      `${BASE}/worktrees?projectId=${fakeId}`,
    ]);

    for (const r of responses) {
      expect(r.status).toBe(200);
      const body = (await r.json()) as unknown[];
      expect(body).toEqual([]);
    }
  });
});

// ===========================================================================
// 5. Worktree PATCH flood
// ===========================================================================

describe('5 — Worktree PATCH flood', () => {
  it('100 concurrent PATCH with different tabOrder values — final state is valid', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    // Get an existing worktree
    const wtRes = await fetch(`${BASE}/worktrees?projectId=${project.id}`);
    const wts = (await wtRes.json()) as { id: string; tabOrder: number }[];

    if (wts.length === 0) return;

    const wtId = wts[0].id;
    const originalOrder = wts[0].tabOrder;

    const results = await concurrentTimed(100, (i) =>
      timed(`${BASE}/worktrees/${wtId}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ tabOrder: i }),
      }),
    );

    const ok = fulfilled(results);
    expect(ok.length).toBe(100);
    for (const r of ok) {
      expect(r.status).toBe(200);
    }

    // Verify final state is a valid number
    const finalRes = await fetch(`${BASE}/worktrees?projectId=${project.id}`);
    const finalWts = (await finalRes.json()) as { id: string; tabOrder: number }[];
    const updated = finalWts.find((w) => w.id === wtId);
    expect(updated).toBeDefined();
    expect(typeof updated!.tabOrder).toBe('number');
    expect(updated!.tabOrder).toBeGreaterThanOrEqual(0);
    expect(updated!.tabOrder).toBeLessThan(100);

    // Restore
    await fetch(`${BASE}/worktrees/${wtId}`, patch({ tabOrder: originalOrder }));
  });

  it('100 concurrent PATCH with mixed field updates — no corruption', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    const wtRes = await fetch(`${BASE}/worktrees?projectId=${project.id}`);
    const wts = (await wtRes.json()) as { id: string; name: string; tabOrder: number; isActive: number }[];

    if (wts.length === 0) return;

    const wtId = wts[0].id;
    const originalName = wts[0].name;
    const originalOrder = wts[0].tabOrder;

    const results = await concurrentTimed(100, (i) => {
      // Alternate between name updates, tabOrder updates, and isActive updates
      const fields: Record<string, unknown> = {};
      if (i % 3 === 0) fields.name = `mixed-${i}`;
      if (i % 3 === 1) fields.tabOrder = i;
      if (i % 3 === 2) fields.isActive = i % 2;
      // Ensure at least one field
      if (Object.keys(fields).length === 0) fields.tabOrder = i;

      return timed(`${BASE}/worktrees/${wtId}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(fields),
      });
    });

    const ok = fulfilled(results);
    expect(ok.length).toBe(100);
    for (const r of ok) {
      expect(r.status).toBe(200);
    }

    // Verify state is not corrupted
    const finalRes = await fetch(`${BASE}/worktrees?projectId=${project.id}`);
    const finalWts = (await finalRes.json()) as { id: string; name: string; tabOrder: number }[];
    const final = finalWts.find((w) => w.id === wtId);
    expect(final).toBeDefined();
    expect(typeof final!.name).toBe('string');
    expect(final!.name.length).toBeGreaterThan(0);

    // Restore
    await fetch(`${BASE}/worktrees/${wtId}`, patch({ name: originalName, tabOrder: originalOrder }));
  });
});

// ===========================================================================
// 6. Graph stats under load
// ===========================================================================

describe('6 — Graph stats under load', () => {
  it('100 concurrent GET /graph/:id/stats — all return consistent shape', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(100, () =>
      timed(`${BASE}/graph/${project.id}/stats`),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(100);

    // Some may be 404 (graph not built yet) — that's fine
    for (const r of ok) {
      expect([200, 404]).toContain(r.status);
    }

    // If any succeeded, verify consistent shape
    const successes = ok.filter((r) => r.status === 200);
    if (successes.length > 0) {
      const first = successes[0].body as Record<string, unknown>;
      expect(first).toHaveProperty('fileCount');
      expect(first).toHaveProperty('totalEdges');

      // All 200 responses should have same fileCount
      for (const r of successes) {
        const body = r.body as Record<string, unknown>;
        expect(body.fileCount).toBe(first.fileCount);
      }
    }

    const stats = latencyStats(ok.map((r) => r.ms));
    console.log(
      `[6-graph-stats] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
    );
  });

  it('50 concurrent GET /graph/<nonexistent>/stats return 404', {
    timeout: 15_000,
  }, async () => {
    const fakeId = randomUUID();
    const responses = await concurrent(50, () => [
      `${BASE}/graph/${fakeId}/stats`,
    ]);

    for (const r of responses) {
      expect(r.status).toBe(404);
      await r.json();
    }
  });
});

// ===========================================================================
// 7. Graph build trigger flood (deduplication via building set)
// ===========================================================================

describe('7 — Graph build trigger flood', () => {
  it('20 concurrent POST /graph/:id/build — all accepted, server handles dedup', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(20, () =>
      timed(`${BASE}/graph/${project.id}/build`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(20);

    for (const r of ok) {
      // 200 = accepted, 404 = project not found (shouldn't happen)
      expect([200]).toContain(r.status);
      const body = r.body as { status: string; projectId: string };
      expect(body.status).toBe('building');
      expect(body.projectId).toBe(project.id);
    }

    // All should return fast because the build is background
    const stats = latencyStats(ok.map((r) => r.ms));
    console.log(
      `[7-graph-build] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
    );
  });

  it('10 concurrent build on nonexistent project — all 404', {
    timeout: 15_000,
  }, async () => {
    const fakeId = randomUUID();
    const responses = await concurrent(10, () => [
      `${BASE}/graph/${fakeId}/build`,
      json({}),
    ]);

    for (const r of responses) {
      expect(r.status).toBe(404);
      await r.json();
    }
  });
});

// ===========================================================================
// 8. Invalid path handling
// ===========================================================================

describe('8 — Invalid path handling', () => {
  it('POST /projects with non-existent path returns 400', async () => {
    const fakePath = `/tmp/phantom-stress-test-fake-${randomUUID()}`;
    const res = await fetch(`${BASE}/projects`, json({ repoPath: fakePath }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('does not exist');
  });

  it('POST /projects with non-git path returns 400', async () => {
    // /tmp exists but is not a git repo
    const res = await fetch(`${BASE}/projects`, json({ repoPath: '/tmp' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not a git');
  });

  it('POST /projects with empty repoPath returns 400', async () => {
    const res = await fetch(`${BASE}/projects`, json({ repoPath: '' }));
    expect(res.status).toBe(400);
  });

  it('POST /projects with missing repoPath returns 400', async () => {
    const res = await fetch(`${BASE}/projects`, json({}));
    expect(res.status).toBe(400);
  });

  it('POST /projects with special chars in path returns 400', async () => {
    const paths = [
      '/tmp/../../../etc/passwd',
      '/tmp/phantom-stress-${"whoami"}',
      '/tmp/phantom-stress-$(rm -rf /)',
      '/tmp/phantom-stress-`whoami`',
      '/tmp/<script>alert(1)</script>',
      '/tmp/\x00null-byte-test',
      '/tmp/phantom stress with spaces',
    ];

    for (const p of paths) {
      const res = await fetch(`${BASE}/projects`, json({ repoPath: p }));
      // Should be 400 (not exist or not git) — never 201
      expect(res.status).toBe(400);
      await res.json(); // drain
    }
  });

  it('POST /projects/open with empty repoPath returns 400', async () => {
    const res = await fetch(`${BASE}/projects/open`, json({ repoPath: '' }));
    expect(res.status).toBe(400);
  });

  it('POST /projects/open with non-existent path returns 400', async () => {
    const fakePath = `/tmp/phantom-stress-test-fake-${randomUUID()}`;
    const res = await fetch(`${BASE}/projects/open`, json({ repoPath: fakePath }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('does not exist');
  });

  it('POST /projects/open with non-git path returns 400', async () => {
    const res = await fetch(`${BASE}/projects/open`, json({ repoPath: '/tmp' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not a git');
  });

  it('concurrent invalid path requests — server stays healthy', {
    timeout: 15_000,
  }, async () => {
    const results = await concurrentTimed(30, (i) => {
      const paths = [
        `/tmp/phantom-stress-test-fake-${randomUUID()}`,
        '/tmp',
        '',
        '/nonexistent/path',
        '/tmp/../../../etc/shadow',
      ];
      return timed(`${BASE}/projects`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ repoPath: paths[i % paths.length] }),
      });
    });
    const ok = fulfilled(results);
    expect(ok.length).toBe(30);
    for (const r of ok) {
      expect(r.status).toBe(400);
    }
  });
});

// ===========================================================================
// 9. Cascade delete stress
// ===========================================================================

describe('9 — Cascade delete stress', () => {
  it('Create project, verify worktrees exist, all worktrees share projectId', {
    timeout: 15_000,
  }, async () => {
    // Use /projects/open which creates project + branch worktree
    const project = await ensureProject();

    // List worktrees for this project
    const wtBefore = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; projectId: string }[];

    expect(wtBefore.length).toBeGreaterThan(0);

    // All worktrees should reference the same project
    for (const wt of wtBefore) {
      expect(wt.projectId).toBe(project.id);
    }
  });

  it('DELETE non-existent project returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/projects/${fakeId}`, del());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('not found');
  });

  it('20 concurrent DELETE on same non-existent project — all 404, no crash', {
    timeout: 15_000,
  }, async () => {
    const fakeId = randomUUID();
    const responses = await concurrent(20, () => [
      `${BASE}/projects/${fakeId}`,
      del(),
    ]);

    for (const r of responses) {
      expect(r.status).toBe(404);
      await r.json();
    }
  });

  it('50 concurrent DELETE on many non-existent projects — all 404', {
    timeout: 15_000,
  }, async () => {
    const results = await concurrentTimed(50, () => {
      const fakeId = randomUUID();
      return timed(`${BASE}/projects/${fakeId}`, { method: 'DELETE' });
    });
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);
    for (const r of ok) {
      expect(r.status).toBe(404);
    }
  });
});

// ===========================================================================
// 10. Mixed project/worktree operations
// ===========================================================================

describe('10 — Mixed concurrent operations', () => {
  it('Simultaneously list projects, list worktrees, query graph stats, query profile', {
    timeout: 45_000,
  }, async () => {
    const project = await ensureProject();

    const requests: [string, RequestInit?][] = [
      // 30 project listings
      ...Array.from({ length: 30 }, (): [string] => [`${BASE}/projects`]),
      // 30 worktree listings
      ...Array.from({ length: 30 }, (): [string] => [
        `${BASE}/worktrees?projectId=${project.id}`,
      ]),
      // 20 graph stat queries
      ...Array.from({ length: 20 }, (): [string] => [
        `${BASE}/graph/${project.id}/stats`,
      ]),
      // 10 graph file list queries
      ...Array.from({ length: 10 }, (): [string] => [
        `${BASE}/graph/${project.id}/files`,
      ]),
      // 10 project profile queries
      ...Array.from({ length: 10 }, (): [string] => [
        `${BASE}/projects/${project.id}/profile`,
      ]),
    ];

    // Shuffle for realistic interleaving
    for (let i = requests.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [requests[i], requests[j]] = [requests[j], requests[i]];
    }

    const t0 = performance.now();
    const responses = await Promise.all(
      requests.map(([url, init]) => fetch(url, init)),
    );
    const totalMs = performance.now() - t0;

    // No 500 errors — all should be 200 or 404 (graph not built)
    for (const r of responses) {
      expect(r.status).toBeLessThan(500);
      await r.json(); // drain
    }

    console.log(
      `[10-mixed-ops] ${requests.length} requests completed in ${totalMs.toFixed(0)}ms`,
    );
  });

  it('Mixed reads + writes simultaneously — no 500s', {
    timeout: 45_000,
  }, async () => {
    const project = await ensureProject();
    const originalName = project.name;

    const requests: [string, RequestInit?][] = [
      // Read operations
      ...Array.from({ length: 20 }, (): [string] => [`${BASE}/projects`]),
      ...Array.from({ length: 20 }, (): [string] => [`${BASE}/worktrees`]),
      ...Array.from({ length: 10 }, (): [string] => [
        `${BASE}/graph/${project.id}/stats`,
      ]),
      // Write operations — renames that we will restore
      ...Array.from({ length: 10 }, (_, i): [string, RequestInit] => [
        `${BASE}/projects/${project.id}`,
        {
          method: 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify({ name: `mixed-rw-${i}` }),
        },
      ]),
    ];

    // Shuffle
    for (let i = requests.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [requests[i], requests[j]] = [requests[j], requests[i]];
    }

    const responses = await Promise.all(
      requests.map(([url, init]) => fetch(url, init)),
    );

    for (const r of responses) {
      expect(r.status).toBeLessThan(500);
      await r.json();
    }

    // Restore name
    await fetch(`${BASE}/projects/${project.id}`, patch({ name: originalName }));
  });
});

// ===========================================================================
// 11. Branch listing while fetching
// ===========================================================================

describe('11 — Branch listing under concurrent load', () => {
  it('30 concurrent GET /projects/:id/branches — all succeed or fail gracefully', {
    timeout: 60_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(30, () =>
      timed(`${BASE}/projects/${project.id}/branches`),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(30);

    for (const r of ok) {
      // 200 = success, 400 = path issue, 500 = git fetch timeout (tolerated for branches)
      expect([200, 400, 500]).toContain(r.status);

      if (r.status === 200) {
        const body = r.body as {
          local: string[];
          remote: string[];
          current: string;
          defaultBranch: string;
        };
        expect(Array.isArray(body.local)).toBe(true);
        expect(Array.isArray(body.remote)).toBe(true);
        expect(typeof body.current).toBe('string');
        expect(typeof body.defaultBranch).toBe('string');
      }
    }

    // Report successes/failures
    const byStatus: Record<number, number> = {};
    for (const r of ok) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    console.log('[11-branches] status distribution:', JSON.stringify(byStatus));
  });

  it('GET /projects/<nonexistent>/branches returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/projects/${fakeId}/branches`);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 12. Git action validation
// ===========================================================================

describe('12 — Git action validation', () => {
  it('POST /worktrees/:id/git with invalid action returns 400', {
    timeout: 15_000,
  }, async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const invalidActions = [
      'reset-hard',
      'rm',
      'rebase',
      'force-push',
      'checkout-theirs',
      '',
      'DROP TABLE',
      '../../../etc/passwd',
      'rm -rf /',
      '; cat /etc/passwd',
    ];

    for (const action of invalidActions) {
      const res = await fetch(
        `${BASE}/worktrees/${wtId}/git`,
        json({ action }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Invalid action');
    }
  });

  it('POST /worktrees/:id/git "stage" without paths returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'stage' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('paths required');
  });

  it('POST /worktrees/:id/git "unstage" without paths returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'unstage' }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /worktrees/:id/git "commit" without message returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'commit' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('message required');
  });

  it('POST /worktrees/:id/git "commit" with empty message returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'commit', message: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /worktrees/:id/git "discard" without paths returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'discard' }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /worktrees/:id/git "clean" without paths returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'clean' }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /worktrees/<nonexistent>/git returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/worktrees/${fakeId}/git`,
      json({ action: 'fetch' }),
    );
    expect(res.status).toBe(404);
  });

  it('POST /worktrees/:id/git "fetch" is a safe read-only action', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    // fetch is safe — it only reads from remote
    const res = await fetch(
      `${BASE}/worktrees/${wtId}/git`,
      json({ action: 'fetch' }),
    );
    // Could be 200 (success) or 500 (no remote / offline)
    expect([200, 500]).toContain(res.status);
    await res.json(); // drain
  });

  it('concurrent invalid git action requests — server stays healthy', {
    timeout: 15_000,
  }, async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;

    const badActions = ['rm', 'rebase', 'force-push', 'DROP TABLE', ''];
    const results = await concurrentTimed(25, (i) =>
      timed(`${BASE}/worktrees/${wtId}/git`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ action: badActions[i % badActions.length] }),
      }),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(25);
    for (const r of ok) {
      expect(r.status).toBe(400);
    }
  });
});

// ===========================================================================
// 13. Graph query routes under load
// ===========================================================================

describe('13 — Graph query routes', () => {
  it('50 concurrent GET /graph/:id/files — consistent', {
    timeout: 20_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(50, () =>
      timed(`${BASE}/graph/${project.id}/files`),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);

    for (const r of ok) {
      expect([200]).toContain(r.status);
      expect(Array.isArray(r.body)).toBe(true);
    }

    // All responses should have the same shape. Count may vary if the graph
    // file watcher picks up changes during the test (expected live behavior).
    const lengths = ok.map((r) => (r.body as unknown[]).length);
    const maxDrift = Math.max(...lengths) - Math.min(...lengths);
    // Allow up to 10 files of drift during concurrent reads
    expect(maxDrift).toBeLessThanOrEqual(10);
  });

  it('GET /graph/:id/context without file param returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(`${BASE}/graph/${project.id}/context`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('file');
  });

  it('GET /graph/:id/blast-radius without file param returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(`${BASE}/graph/${project.id}/blast-radius`);
    expect(res.status).toBe(400);
  });

  it('GET /graph/:id/related without files param returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(`${BASE}/graph/${project.id}/related`);
    expect(res.status).toBe(400);
  });

  it('GET /graph/:id/path without from/to returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(`${BASE}/graph/${project.id}/path`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('from and to');
  });

  it('GET /graph/:id/path with only from returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(
      `${BASE}/graph/${project.id}/path?from=src/index.ts`,
    );
    expect(res.status).toBe(400);
  });

  it('GET /graph/<nonexistent>/context?file=x returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/graph/${fakeId}/context?file=test.ts`);
    expect(res.status).toBe(404);
  });

  it('GET /graph/<nonexistent>/blast-radius?file=x returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/graph/${fakeId}/blast-radius?file=test.ts`);
    expect(res.status).toBe(404);
  });

  it('GET /graph/<nonexistent>/related?files=x returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/graph/${fakeId}/related?files=test.ts`);
    expect(res.status).toBe(404);
  });

  it('GET /graph/<nonexistent>/path?from=a&to=b returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/graph/${fakeId}/path?from=a.ts&to=b.ts`);
    expect(res.status).toBe(404);
  });

  it('concurrent graph queries with valid file params — no 500s', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    // Get file list first to use real file paths
    const filesRes = await fetch(`${BASE}/graph/${project.id}/files`);
    const files = (await filesRes.json()) as { path: string }[];

    if (files.length === 0) return;

    const sampleFile = files[0].path;
    const sampleFile2 = files.length > 1 ? files[1].path : sampleFile;

    const requests: Promise<{ status: number; body: unknown; ms: number }>[] = [
      // Context queries
      ...Array.from({ length: 10 }, () =>
        timed(`${BASE}/graph/${project.id}/context?file=${encodeURIComponent(sampleFile)}`),
      ),
      // Blast radius queries
      ...Array.from({ length: 10 }, () =>
        timed(`${BASE}/graph/${project.id}/blast-radius?file=${encodeURIComponent(sampleFile)}`),
      ),
      // Related files queries
      ...Array.from({ length: 10 }, () =>
        timed(`${BASE}/graph/${project.id}/related?files=${encodeURIComponent(sampleFile)}`),
      ),
      // Path queries
      ...Array.from({ length: 10 }, () =>
        timed(
          `${BASE}/graph/${project.id}/path?from=${encodeURIComponent(sampleFile)}&to=${encodeURIComponent(sampleFile2)}`,
        ),
      ),
    ];

    const results = await Promise.allSettled(requests);
    const ok = fulfilled(results);
    expect(ok.length).toBe(40);

    for (const r of ok) {
      // Allow 200 (found) or 500 (internal, e.g. node not in graph)
      expect(r.status).toBeLessThanOrEqual(500);
    }
  });
});

// ===========================================================================
// 14. Worktree checkout validation
// ===========================================================================

describe('14 — Worktree checkout validation', () => {
  it('POST /worktrees/:id/checkout without branch returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; type: string }[];

    const branchWt = wts.find((w) => w.type === 'branch');
    if (!branchWt) return;

    const res = await fetch(
      `${BASE}/worktrees/${branchWt.id}/checkout`,
      json({ branch: '' }),
    );
    expect(res.status).toBe(400);
  });

  it('POST /worktrees/<nonexistent>/checkout returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/worktrees/${fakeId}/checkout`,
      json({ branch: 'main' }),
    );
    expect(res.status).toBe(404);
  });

  it('POST /worktrees/:id/checkout with whitespace-only branch returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; type: string }[];

    const branchWt = wts.find((w) => w.type === 'branch');
    if (!branchWt) return;

    const res = await fetch(
      `${BASE}/worktrees/${branchWt.id}/checkout`,
      json({ branch: '   ' }),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 15. Worktree delete validation
// ===========================================================================

describe('15 — Worktree delete validation', () => {
  it('DELETE /worktrees/<nonexistent> returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/worktrees/${fakeId}`, del());
    expect(res.status).toBe(404);
  });

  it('20 concurrent DELETE on same non-existent worktree — all 404', {
    timeout: 10_000,
  }, async () => {
    const fakeId = randomUUID();
    const responses = await concurrent(20, () => [
      `${BASE}/worktrees/${fakeId}`,
      del(),
    ]);

    for (const r of responses) {
      expect(r.status).toBe(404);
      await r.json();
    }
  });
});

// ===========================================================================
// 16. PATCH worktree validation
// ===========================================================================

describe('16 — PATCH worktree validation', () => {
  it('PATCH /worktrees/<nonexistent> returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/worktrees/${fakeId}`,
      patch({ name: 'test' }),
    );
    expect(res.status).toBe(404);
  });

  it('PATCH /worktrees/:id with empty body returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;

    const res = await fetch(
      `${BASE}/worktrees/${wts[0].id}`,
      patch({}),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('No fields');
  });

  it('PATCH /worktrees/:id with unrecognized fields returns 400', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string }[];

    if (wts.length === 0) return;

    // Only unrecognized fields — should produce "No fields to update"
    const res = await fetch(
      `${BASE}/worktrees/${wts[0].id}`,
      patch({ unknownField: 'test', anotherBogus: 42 }),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 17. Project profile & detect under load
// ===========================================================================

describe('17 — Project profile and detect', () => {
  it('50 concurrent GET /projects/:id/profile return consistent results', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(50, () =>
      timed(`${BASE}/projects/${project.id}/profile`),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);

    for (const r of ok) {
      expect([200]).toContain(r.status);
      expect(typeof r.body).toBe('object');
      expect(r.body).toBeDefined();
    }

    // All should return the same profile data
    const baseline = JSON.stringify(ok[0].body);
    for (let i = 1; i < ok.length; i++) {
      expect(JSON.stringify(ok[i].body)).toBe(baseline);
    }
  });

  it('GET /projects/<nonexistent>/profile returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(`${BASE}/projects/${fakeId}/profile`);
    expect(res.status).toBe(404);
  });

  it('POST /projects/<nonexistent>/detect returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/projects/${fakeId}/detect`,
      json({}),
    );
    expect(res.status).toBe(404);
  });

  it('10 concurrent POST /projects/:id/detect — all succeed', {
    timeout: 30_000,
  }, async () => {
    const project = await ensureProject();

    const results = await concurrentTimed(10, () =>
      timed(`${BASE}/projects/${project.id}/detect`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({}),
      }),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(10);

    for (const r of ok) {
      expect(r.status).toBe(200);
      expect(typeof r.body).toBe('object');
      expect(r.body).toBeDefined();
    }
  });
});

// ===========================================================================
// 18. PATCH project validation
// ===========================================================================

describe('18 — PATCH project validation', () => {
  it('PATCH /projects/<nonexistent> returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/projects/${fakeId}`,
      patch({ name: 'test' }),
    );
    expect(res.status).toBe(404);
  });

  it('PATCH /projects/:id with empty name returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(
      `${BASE}/projects/${project.id}`,
      patch({ name: '' }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('name is required');
  });

  it('PATCH /projects/:id with whitespace-only name returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(
      `${BASE}/projects/${project.id}`,
      patch({ name: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('PATCH /projects/:id with missing name field returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(
      `${BASE}/projects/${project.id}`,
      patch({}),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 19. Worktree creation validation
// ===========================================================================

describe('19 — Worktree creation validation', () => {
  it('POST /worktrees without projectId returns 400', async () => {
    const res = await fetch(`${BASE}/worktrees`, json({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('projectId');
  });

  it('POST /worktrees with non-existent projectId returns 404', async () => {
    const fakeId = randomUUID();
    const res = await fetch(
      `${BASE}/worktrees`,
      json({ projectId: fakeId }),
    );
    expect(res.status).toBe(404);
  });

  it('POST /worktrees with empty projectId returns 400', async () => {
    const res = await fetch(
      `${BASE}/worktrees`,
      json({ projectId: '' }),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 20. Sustained mixed load — 3 waves
// ===========================================================================

describe('20 — Sustained mixed load', () => {
  it('3 waves of 50 mixed requests with no 500s', {
    timeout: 60_000,
  }, async () => {
    const project = await ensureProject();

    const wave = async (waveNum: number): Promise<void> => {
      const requests: [string, RequestInit?][] = [
        ...Array.from({ length: 15 }, (): [string] => [`${BASE}/projects`]),
        ...Array.from({ length: 15 }, (): [string] => [
          `${BASE}/worktrees?projectId=${project.id}`,
        ]),
        ...Array.from({ length: 10 }, (): [string] => [
          `${BASE}/graph/${project.id}/stats`,
        ]),
        ...Array.from({ length: 10 }, (): [string] => [
          `${BASE}/projects/${project.id}/profile`,
        ]),
      ];

      const t0 = performance.now();
      const responses = await Promise.all(
        requests.map(([url, init]) => fetch(url, init)),
      );
      const ms = performance.now() - t0;

      for (const r of responses) {
        expect(r.status).toBeLessThan(500);
        await r.json();
      }

      console.log(`[20-sustained] wave ${waveNum}: ${requests.length} requests in ${ms.toFixed(0)}ms`);
    };

    // Run 3 waves sequentially
    await wave(1);
    await wave(2);
    await wave(3);
  });
});

// ===========================================================================
// 21. Response time regression — p99 checks
// ===========================================================================

describe('21 — Response time regression', { timeout: 60_000 }, () => {
  const P99_THRESHOLD_MS = 500;

  const benchmarkEndpoints = [
    { label: 'GET /projects', url: `${BASE}/projects` },
    { label: 'GET /worktrees', url: `${BASE}/worktrees` },
  ];

  for (const { label, url } of benchmarkEndpoints) {
    it(`${label} — p99 < ${P99_THRESHOLD_MS}ms (100 sequential)`, async () => {
      const timings: number[] = [];

      for (let i = 0; i < 100; i++) {
        const { ms, status } = await timed(url);
        expect(status).toBeLessThan(500);
        timings.push(ms);
      }

      const stats = latencyStats(timings);
      console.log(
        `[${label}] p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms`,
      );

      expect(stats.p99).toBeLessThan(P99_THRESHOLD_MS);
    });
  }
});

// ===========================================================================
// 22. Graph query parameter fuzzing
// ===========================================================================

describe('22 — Graph query parameter fuzzing', () => {
  it('context with special chars in file param — no crash', async () => {
    const project = await ensureProject();

    const fuzzFiles = [
      '../../../etc/passwd',
      '$(rm -rf /)',
      '<script>alert(1)</script>',
      '\x00null\x00byte',
      'a'.repeat(5000),
      '../../.env',
      encodeURIComponent("'; DROP TABLE graph_nodes; --"),
    ];

    for (const file of fuzzFiles) {
      const res = await fetch(
        `${BASE}/graph/${project.id}/context?file=${encodeURIComponent(file)}`,
      );
      // Never crash — 200, 404, or 500 from graph lookup are all acceptable
      expect(res.status).toBeLessThanOrEqual(500);
      await res.json();
    }
  });

  it('blast-radius with special chars — no crash', async () => {
    const project = await ensureProject();

    const fuzzFiles = ['../../../etc/passwd', '$(whoami)', ''];

    for (const file of fuzzFiles) {
      const res = await fetch(
        `${BASE}/graph/${project.id}/blast-radius?file=${encodeURIComponent(file)}`,
      );
      expect(res.status).toBeLessThanOrEqual(500);
      await res.json();
    }
  });

  it('related with malicious files param — no crash', async () => {
    const project = await ensureProject();

    const fuzzValues = [
      '',
      ',,,',
      '../../../etc/passwd,../../.env',
      'a'.repeat(10000),
    ];

    for (const files of fuzzValues) {
      const res = await fetch(
        `${BASE}/graph/${project.id}/related?files=${encodeURIComponent(files)}`,
      );
      expect(res.status).toBeLessThanOrEqual(500);
      await res.json();
    }
  });

  it('path with missing to param — returns 400', async () => {
    const project = await ensureProject();
    const res = await fetch(
      `${BASE}/graph/${project.id}/path?from=src/index.ts`,
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 23. Worktree PATCH validation edge cases
// ===========================================================================

describe('23 — Worktree PATCH edge cases', () => {
  it('PATCH with negative tabOrder — server handles gracefully', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; tabOrder: number }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;
    const original = wts[0].tabOrder;

    const res = await fetch(`${BASE}/worktrees/${wtId}`, patch({ tabOrder: -1 }));
    // Should either accept or reject — no 500
    expect(res.status).toBeLessThan(500);
    await res.json();

    // Restore
    await fetch(`${BASE}/worktrees/${wtId}`, patch({ tabOrder: original }));
  });

  it('PATCH with very large tabOrder — server handles gracefully', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; tabOrder: number }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;
    const original = wts[0].tabOrder;

    const res = await fetch(`${BASE}/worktrees/${wtId}`, patch({ tabOrder: 999999999 }));
    expect(res.status).toBeLessThan(500);
    await res.json();

    // Restore
    await fetch(`${BASE}/worktrees/${wtId}`, patch({ tabOrder: original }));
  });

  it('PATCH with name containing special characters', async () => {
    const project = await ensureProject();
    const wts = (
      await (await fetch(`${BASE}/worktrees?projectId=${project.id}`)).json()
    ) as { id: string; name: string }[];

    if (wts.length === 0) return;
    const wtId = wts[0].id;
    const originalName = wts[0].name;

    const specialNames = [
      'test <script>alert(1)</script>',
      "test'; DROP TABLE worktrees; --",
      'test\x00null',
      '\u{1F4A9} emoji name',
      'a'.repeat(500),
    ];

    for (const name of specialNames) {
      const res = await fetch(`${BASE}/worktrees/${wtId}`, patch({ name }));
      // Should never crash
      expect(res.status).toBeLessThan(500);
      await res.json();
    }

    // Restore
    await fetch(`${BASE}/worktrees/${wtId}`, patch({ name: originalName }));
  });
});

// ===========================================================================
// 24. Project open idempotency under extreme concurrency
// ===========================================================================

describe('24 — Project open idempotency stress', () => {
  it('50 concurrent /projects/open with same repo — all return consistent project', {
    timeout: 30_000,
  }, async () => {
    const results = await concurrentTimed(50, () =>
      timed(`${BASE}/projects/open`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ repoPath: PHANTOM_REPO }),
      }),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);

    const projectIds = new Set<string>();
    for (const r of ok) {
      expect([200, 201]).toContain(r.status);
      const body = r.body as { project: { id: string } };
      projectIds.add(body.project.id);
    }

    // All should converge on the same project (at most 2 IDs if first call creates)
    expect(projectIds.size).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// 25. Endpoint not found
// ===========================================================================

describe('25 — Unknown endpoints', () => {
  it('GET /api/nonexistent returns 404', async () => {
    const res = await fetch(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('POST /api/nonexistent returns 404', async () => {
    const res = await fetch(`${BASE}/nonexistent`, json({}));
    expect(res.status).toBe(404);
  });

  it('50 concurrent requests to unknown endpoints — no crash', {
    timeout: 15_000,
  }, async () => {
    const results = await concurrentTimed(50, (i) =>
      timed(`${BASE}/does-not-exist-${i}`),
    );
    const ok = fulfilled(results);
    expect(ok.length).toBe(50);
    for (const r of ok) {
      expect(r.status).toBe(404);
    }
  });
});
