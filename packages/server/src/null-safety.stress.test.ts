/**
 * Null-Safety Stress Tests for PhantomOS
 * Validates that null/undefined guards in system-metrics, graph-engine,
 * and worktree-manager hold under adversarial and concurrent conditions.
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// 1. system-metrics — getTopProcesses null safety
// ---------------------------------------------------------------------------

describe('system-metrics route', () => {
  // Lazy import — the Hono app may pull in os-level deps at module scope
  let systemMetricsRoutes: import('hono').Hono;

  beforeEach(async () => {
    const mod = await import('./routes/system-metrics.js');
    systemMetricsRoutes = mod.systemMetricsRoutes;
  });

  it('golden path — GET /system-metrics returns valid JSON', async () => {
    const res = await systemMetricsRoutes.request('/system-metrics');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('response shape has cpu, memory, swap, loadAvg, topProcesses', async () => {
    const res = await systemMetricsRoutes.request('/system-metrics');
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toHaveProperty('cpu');
    expect(body).toHaveProperty('memory');
    expect(body).toHaveProperty('swap');
    expect(body).toHaveProperty('loadAvg');
    expect(body).toHaveProperty('topProcesses');

    // cpu shape
    const cpu = body.cpu as Record<string, unknown>;
    expect(typeof cpu.usage).toBe('number');
    expect(typeof cpu.cores).toBe('number');
    expect(cpu.cores).toBeGreaterThan(0);

    // memory shape
    const mem = body.memory as Record<string, unknown>;
    expect(typeof mem.used).toBe('number');
    expect(typeof mem.total).toBe('number');
    expect(typeof mem.usedPercent).toBe('number');
    expect(mem.total).toBeGreaterThan(0);

    // loadAvg shape
    expect(Array.isArray(body.loadAvg)).toBe(true);
    expect((body.loadAvg as number[]).length).toBe(3);

    // topProcesses shape
    expect(Array.isArray(body.topProcesses)).toBe(true);
  });

  it('topProcesses items never have NaN values', async () => {
    const res = await systemMetricsRoutes.request('/system-metrics');
    const body = (await res.json()) as { topProcesses: Array<{ name: string; memMB: number; pid: number }> };

    for (const proc of body.topProcesses) {
      expect(typeof proc.name).toBe('string');
      expect(proc.name.length).toBeGreaterThan(0);
      expect(Number.isNaN(proc.memMB)).toBe(false);
      expect(Number.isNaN(proc.pid)).toBe(false);
      expect(typeof proc.memMB).toBe('number');
      expect(typeof proc.pid).toBe('number');
      expect(proc.memMB).toBeGreaterThanOrEqual(0);
      expect(proc.pid).toBeGreaterThan(0);
    }
  });

  it('rapid sequential requests all return valid responses', async () => {
    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await systemMetricsRoutes.request('/system-metrics');
      results.push((await res.json()) as Record<string, unknown>);
    }

    expect(results.length).toBe(20);
    for (const b of results) {
      expect(b).toHaveProperty('cpu');
      expect(b).toHaveProperty('topProcesses');
      expect(Array.isArray(b.topProcesses)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. graph-engine — LRU Map.get safety
// ---------------------------------------------------------------------------

describe('graph-engine null safety', () => {
  let graphEngine: typeof import('./services/graph-engine.js')['graphEngine'];

  beforeEach(async () => {
    const mod = await import('./services/graph-engine.js');
    graphEngine = mod.graphEngine;
  });

  it('singleton exists and is defined', () => {
    expect(graphEngine).toBeDefined();
    expect(typeof graphEngine).toBe('object');
  });

  it('getStats(nonExistentId) returns null, not throws', () => {
    const result = graphEngine.getStats('nonexistent-project-' + randomUUID());
    expect(result).toBeNull();
  });

  it('getQuery(nonExistentId) returns null, not throws', () => {
    const result = graphEngine.getQuery('nonexistent-project-' + randomUUID());
    expect(result).toBeNull();
  });

  it('getFileList(nonExistentId) returns empty array, not throws', () => {
    const result = graphEngine.getFileList('nonexistent-project-' + randomUUID());
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('getStats with empty string returns null', () => {
    expect(graphEngine.getStats('')).toBeNull();
  });

  it('getQuery with empty string returns null', () => {
    expect(graphEngine.getQuery('')).toBeNull();
  });

  it('getFileList with empty string returns empty array', () => {
    expect(graphEngine.getFileList('')).toEqual([]);
  });

  describe('special character IDs', () => {
    const adversarialIds = [
      'id-with-spaces and stuff',
      'id/with/slashes',
      '../../../etc/passwd',
      '<script>alert(1)</script>',
      'null',
      'undefined',
      'NaN',
      '0',
      '-1',
      '\x00\x01\x02',
      'a'.repeat(10_000),
      '🔥💀🚀',
      '{"__proto__":{"polluted":true}}',
    ];

    for (const id of adversarialIds) {
      const label = id.length > 40 ? id.slice(0, 40) + '...' : id;

      it(`getStats("${label}") returns null without throwing`, () => {
        expect(() => graphEngine.getStats(id)).not.toThrow();
        expect(graphEngine.getStats(id)).toBeNull();
      });

      it(`getQuery("${label}") returns null without throwing`, () => {
        expect(() => graphEngine.getQuery(id)).not.toThrow();
        expect(graphEngine.getQuery(id)).toBeNull();
      });

      it(`getFileList("${label}") returns [] without throwing`, () => {
        expect(() => graphEngine.getFileList(id)).not.toThrow();
        expect(graphEngine.getFileList(id)).toEqual([]);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. worktree-manager — nested execSync safety
// ---------------------------------------------------------------------------

describe('worktree-manager null safety', () => {
  let createWorktree: typeof import('./worktree-manager.js')['createWorktree'];
  let isGitRepo: typeof import('./worktree-manager.js')['isGitRepo'];
  let getWorktreeDir: typeof import('./worktree-manager.js')['getWorktreeDir'];
  let tempDir: string;

  beforeEach(async () => {
    const mod = await import('./worktree-manager.js');
    createWorktree = mod.createWorktree;
    isGitRepo = mod.isGitRepo;
    getWorktreeDir = mod.getWorktreeDir;
    tempDir = join(tmpdir(), `phantom-null-test-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('createWorktree with invalid repo path throws a descriptive error', async () => {
    const invalidPath = join(tempDir, 'not-a-repo');
    mkdirSync(invalidPath, { recursive: true });
    const targetDir = join(tempDir, 'target');

    await expect(
      createWorktree(invalidPath, 'test-branch', targetDir),
    ).rejects.toThrow();
  });

  it('createWorktree error message is not a raw execSync buffer', async () => {
    const invalidPath = join(tempDir, 'not-a-repo');
    mkdirSync(invalidPath, { recursive: true });
    const targetDir = join(tempDir, 'target');

    try {
      await createWorktree(invalidPath, 'test-branch', targetDir);
      // Should not reach here
      expect.unreachable('createWorktree should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      // The error message should be a readable string, not [object Object] or a Buffer
      const msg = (err as Error).message;
      expect(typeof msg).toBe('string');
      expect(msg).not.toContain('[object Object]');
      expect(msg).not.toContain('[object Buffer]');
    }
  });

  it('createWorktree with nonexistent path rejects gracefully', async () => {
    const noSuchPath = join(tempDir, 'does-not-exist-' + randomUUID());
    const targetDir = join(tempDir, 'target2');

    await expect(
      createWorktree(noSuchPath, 'branch', targetDir),
    ).rejects.toThrow();
  });

  it('isGitRepo returns false for invalid paths without throwing', () => {
    expect(() => isGitRepo('')).not.toThrow();
    expect(isGitRepo('')).toBe(false);
    expect(isGitRepo(join(tempDir, 'nope'))).toBe(false);
  });

  it('getWorktreeDir handles empty strings without crashing', () => {
    expect(() => getWorktreeDir('', '')).not.toThrow();
    const result = getWorktreeDir('', '');
    expect(typeof result).toBe('string');
  });

  it('getWorktreeDir handles very long strings', () => {
    const longName = 'x'.repeat(5000);
    expect(() => getWorktreeDir(longName, longName)).not.toThrow();
  });

  it('getWorktreeDir handles special characters safely', () => {
    const specials = ['../../../etc', '<script>', 'a b c', 'foo\x00bar'];
    for (const s of specials) {
      expect(() => getWorktreeDir(s, s)).not.toThrow();
      // Result should not contain raw special chars (sanitization)
      const result = getWorktreeDir(s, s);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Concurrent stress — rapid fire calls
// ---------------------------------------------------------------------------

describe('concurrent stress — graph-engine rapid fire', () => {
  let graphEngine: typeof import('./services/graph-engine.js')['graphEngine'];

  beforeEach(async () => {
    const mod = await import('./services/graph-engine.js');
    graphEngine = mod.graphEngine;
  });

  it('50 concurrent getStats calls with random IDs all return null', async () => {
    const ids = Array.from({ length: 50 }, () => `stress-${randomUUID()}`);
    const results = await Promise.all(
      ids.map((id) => Promise.resolve(graphEngine.getStats(id))),
    );

    expect(results.length).toBe(50);
    for (const r of results) {
      expect(r).toBeNull();
    }
  });

  it('50 concurrent getQuery calls with random IDs all return null', async () => {
    const ids = Array.from({ length: 50 }, () => `stress-${randomUUID()}`);
    const results = await Promise.all(
      ids.map((id) => Promise.resolve(graphEngine.getQuery(id))),
    );

    expect(results.length).toBe(50);
    for (const r of results) {
      expect(r).toBeNull();
    }
  });

  it('50 concurrent getFileList calls with random IDs all return []', async () => {
    const ids = Array.from({ length: 50 }, () => `stress-${randomUUID()}`);
    const results = await Promise.all(
      ids.map((id) => Promise.resolve(graphEngine.getFileList(id))),
    );

    expect(results.length).toBe(50);
    for (const r of results) {
      expect(Array.isArray(r)).toBe(true);
      expect(r.length).toBe(0);
    }
  });

  it('100 mixed concurrent calls (getStats + getQuery + getFileList) never throw', async () => {
    const calls: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `mixed-stress-${randomUUID()}`;
      const pick = i % 3;
      if (pick === 0) calls.push(Promise.resolve(graphEngine.getStats(id)));
      else if (pick === 1) calls.push(Promise.resolve(graphEngine.getQuery(id)));
      else calls.push(Promise.resolve(graphEngine.getFileList(id)));
    }

    const results = await Promise.all(calls);
    expect(results.length).toBe(100);

    // All should be null or empty array — none should be undefined
    for (const r of results) {
      expect(r === null || (Array.isArray(r) && r.length === 0)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Edge case inputs
// ---------------------------------------------------------------------------

describe('edge case inputs', () => {
  let graphEngine: typeof import('./services/graph-engine.js')['graphEngine'];
  let getWorktreeDir: typeof import('./worktree-manager.js')['getWorktreeDir'];
  let isGitRepo: typeof import('./worktree-manager.js')['isGitRepo'];

  beforeEach(async () => {
    const geMod = await import('./services/graph-engine.js');
    graphEngine = geMod.graphEngine;
    const wtMod = await import('./worktree-manager.js');
    getWorktreeDir = wtMod.getWorktreeDir;
    isGitRepo = wtMod.isGitRepo;
  });

  describe('empty string inputs', () => {
    it('graphEngine.getStats("") returns null', () => {
      expect(graphEngine.getStats('')).toBeNull();
    });

    it('graphEngine.getQuery("") returns null', () => {
      expect(graphEngine.getQuery('')).toBeNull();
    });

    it('graphEngine.getFileList("") returns []', () => {
      expect(graphEngine.getFileList('')).toEqual([]);
    });

    it('isGitRepo("") returns false', () => {
      expect(isGitRepo('')).toBe(false);
    });

    it('getWorktreeDir("", "") returns a string', () => {
      expect(typeof getWorktreeDir('', '')).toBe('string');
    });
  });

  describe('very long string inputs', () => {
    const longStr = 'a'.repeat(100_000);

    it('graphEngine.getStats with 100k char ID returns null', () => {
      expect(graphEngine.getStats(longStr)).toBeNull();
    });

    it('graphEngine.getQuery with 100k char ID returns null', () => {
      expect(graphEngine.getQuery(longStr)).toBeNull();
    });

    it('graphEngine.getFileList with 100k char ID returns []', () => {
      expect(graphEngine.getFileList(longStr)).toEqual([]);
    });
  });

  describe('special characters in IDs', () => {
    const specialInputs = [
      '\n\r\t',
      '\0',
      '  leading-trailing  ',
      'DROP TABLE projects;--',
      'SELECT * FROM projects WHERE 1=1',
      '${process.exit(1)}',
      '$(rm -rf /)',
      '`whoami`',
      String.fromCharCode(0xFFFF),
      '\uD800', // lone surrogate
    ];

    for (const input of specialInputs) {
      const label = JSON.stringify(input).slice(0, 30);

      it(`graphEngine methods handle ${label} safely`, () => {
        expect(() => graphEngine.getStats(input)).not.toThrow();
        expect(() => graphEngine.getQuery(input)).not.toThrow();
        expect(() => graphEngine.getFileList(input)).not.toThrow();
      });

      it(`worktree getWorktreeDir handles ${label} safely`, () => {
        expect(() => getWorktreeDir(input, input)).not.toThrow();
      });
    }
  });

  describe('type coercion edge cases', () => {
    it('graphEngine.getStats handles numeric-like strings', () => {
      expect(graphEngine.getStats('0')).toBeNull();
      expect(graphEngine.getStats('-1')).toBeNull();
      expect(graphEngine.getStats('Infinity')).toBeNull();
      expect(graphEngine.getStats('NaN')).toBeNull();
    });

    it('graphEngine.getQuery handles numeric-like strings', () => {
      expect(graphEngine.getQuery('0')).toBeNull();
      expect(graphEngine.getQuery('false')).toBeNull();
      expect(graphEngine.getQuery('true')).toBeNull();
    });

    it('graphEngine.getFileList handles boolean-like strings', () => {
      expect(graphEngine.getFileList('true')).toEqual([]);
      expect(graphEngine.getFileList('false')).toEqual([]);
      expect(graphEngine.getFileList('null')).toEqual([]);
      expect(graphEngine.getFileList('undefined')).toEqual([]);
    });
  });
});
