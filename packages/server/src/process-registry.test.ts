/**
 * Tests for PhantomOS Process Registry
 * @author Subash Karki
 */
import { describe, it, expect, vi, type Mock, beforeEach } from 'vitest';
import {
  initProcessRegistry,
  registerProcess,
  unregisterProcess,
  getProcesses,
  getProcessByTermId,
} from './process-registry.js';
import type { RunningProcess } from './process-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockProcess = (overrides: Partial<RunningProcess> = {}): RunningProcess => ({
  termId: `term-${Math.random().toString(36).slice(2, 8)}`,
  worktreeId: 'wt-1',
  projectId: 'proj-1',
  recipe: 'npm-dev',
  recipeLabel: 'Dev',
  category: 'serve',
  port: 3000,
  pid: 12345,
  startedAt: Date.now(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessRegistry', () => {
  let broadcastSpy: Mock;

  beforeEach(() => {
    // Clear the registry between tests by unregistering everything
    for (const proc of getProcesses()) {
      unregisterProcess(proc.termId);
    }

    broadcastSpy = vi.fn();
    initProcessRegistry(broadcastSpy);
  });

  // -------------------------------------------------------------------------
  // registerProcess / getProcesses
  // -------------------------------------------------------------------------

  describe('registerProcess', () => {
    it('registers a process and makes it retrievable', () => {
      const proc = createMockProcess({ termId: 'term-1' });

      registerProcess(proc);

      const all = getProcesses();
      expect(all).toHaveLength(1);
      expect(all[0]).toEqual(proc);
    });

    it('registers multiple processes', () => {
      const proc1 = createMockProcess({ termId: 'term-1' });
      const proc2 = createMockProcess({ termId: 'term-2' });

      registerProcess(proc1);
      registerProcess(proc2);

      expect(getProcesses()).toHaveLength(2);
    });

    it('broadcasts server:start event on register', () => {
      const proc = createMockProcess({ termId: 'term-1' });

      registerProcess(proc);

      expect(broadcastSpy).toHaveBeenCalledWith('server:start', proc);
    });

    it('overwrites process with same termId', () => {
      const proc1 = createMockProcess({ termId: 'term-1', port: 3000 });
      const proc2 = createMockProcess({ termId: 'term-1', port: 4000 });

      registerProcess(proc1);
      registerProcess(proc2);

      const all = getProcesses();
      expect(all).toHaveLength(1);
      expect(all[0].port).toBe(4000);
    });
  });

  // -------------------------------------------------------------------------
  // unregisterProcess
  // -------------------------------------------------------------------------

  describe('unregisterProcess', () => {
    it('removes a registered process', () => {
      const proc = createMockProcess({ termId: 'term-1' });
      registerProcess(proc);

      unregisterProcess('term-1');

      expect(getProcesses()).toHaveLength(0);
    });

    it('broadcasts server:stop event on unregister', () => {
      const proc = createMockProcess({ termId: 'term-1', worktreeId: 'wt-abc' });
      registerProcess(proc);
      broadcastSpy.mockClear();

      unregisterProcess('term-1');

      expect(broadcastSpy).toHaveBeenCalledWith('server:stop', {
        termId: 'term-1',
        worktreeId: 'wt-abc',
      });
    });

    it('is a no-op for unknown termId', () => {
      registerProcess(createMockProcess({ termId: 'term-1' }));
      broadcastSpy.mockClear();

      unregisterProcess('nonexistent');

      expect(getProcesses()).toHaveLength(1);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getProcesses with worktreeId filter
  // -------------------------------------------------------------------------

  describe('getProcesses filtering', () => {
    it('returns all processes when no worktreeId given', () => {
      registerProcess(createMockProcess({ termId: 'term-1', worktreeId: 'wt-a' }));
      registerProcess(createMockProcess({ termId: 'term-2', worktreeId: 'wt-b' }));

      expect(getProcesses()).toHaveLength(2);
    });

    it('filters by worktreeId', () => {
      registerProcess(createMockProcess({ termId: 'term-1', worktreeId: 'wt-a' }));
      registerProcess(createMockProcess({ termId: 'term-2', worktreeId: 'wt-b' }));
      registerProcess(createMockProcess({ termId: 'term-3', worktreeId: 'wt-a' }));

      const filtered = getProcesses('wt-a');

      expect(filtered).toHaveLength(2);
      expect(filtered.every((p) => p.worktreeId === 'wt-a')).toBe(true);
    });

    it('returns empty array when no processes match worktreeId', () => {
      registerProcess(createMockProcess({ termId: 'term-1', worktreeId: 'wt-a' }));

      expect(getProcesses('wt-nonexistent')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getProcessByTermId
  // -------------------------------------------------------------------------

  describe('getProcessByTermId', () => {
    it('returns the process for a known termId', () => {
      const proc = createMockProcess({ termId: 'term-1' });
      registerProcess(proc);

      expect(getProcessByTermId('term-1')).toEqual(proc);
    });

    it('returns undefined for unknown termId', () => {
      expect(getProcessByTermId('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // initProcessRegistry
  // -------------------------------------------------------------------------

  describe('initProcessRegistry', () => {
    it('sets the broadcast function used by register/unregister', () => {
      const customBroadcast = vi.fn();
      initProcessRegistry(customBroadcast);

      const proc = createMockProcess({ termId: 'term-init' });
      registerProcess(proc);

      expect(customBroadcast).toHaveBeenCalledWith('server:start', proc);
    });
  });
});
