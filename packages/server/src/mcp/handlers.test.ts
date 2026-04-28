/**
 * Tests for MCP Tool Handlers
 * @author Subash Karki
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGraphContext,
  handleBlastRadius,
  handleRelated,
  handleStats,
  handlePath,
  handleBuild,
  handleListProjects,
  handleTaskStatus,
  handleBeforeEdit,
} from './handlers.js';
import type { GraphEngineAdapter, OrchestratorEngineAdapter, TaskStatusResult } from './handlers.js';
import type { GraphQuery } from '@phantom-os/ai-engine';

// ---------------------------------------------------------------------------
// Mock DB — handlers.ts imports `db` and `projects` from @phantom-os/db
// ---------------------------------------------------------------------------

const mockDbRows: Array<{ id: string; name: string; repoPath: string }> = [];

vi.mock('@phantom-os/db', () => {
  const get = vi.fn(() => mockDbRows[0] ?? undefined);
  const all = vi.fn(() => mockDbRows);
  const where = vi.fn(() => ({ get, all }));
  const from = vi.fn(() => ({ where, all }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { select },
    projects: { id: 'id' },
    eq: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock GraphQuery
// ---------------------------------------------------------------------------

function createMockQuery(): GraphQuery {
  return {
    getContext: vi.fn().mockReturnValue({
      files: [
        { id: 'f1', type: 'file', path: 'src/index.ts', projectId: 'p1' },
        { id: 'f2', type: 'file', path: 'src/utils.ts', projectId: 'p1' },
      ],
      edges: [
        { id: 'e1', sourceId: 'f1', targetId: 'f2', type: 'imports' },
      ],
      modules: [
        { id: 'm1', type: 'module', name: 'lodash' },
      ],
      scores: new Map([['f1', 1.0], ['f2', 0.5]]),
    }),
    getBlastRadius: vi.fn().mockReturnValue({
      direct: [{ id: 'f2', type: 'file', path: 'src/utils.ts' }],
      transitive: [{ id: 'f3', type: 'file', path: 'src/app.ts' }],
      impactScore: 0.25,
    }),
    getRelatedFiles: vi.fn().mockReturnValue([
      { id: 'f3', type: 'file', path: 'src/app.ts' },
    ]),
    getStats: vi.fn().mockReturnValue({
      projectId: 'p1',
      totalNodes: 10,
      totalEdges: 15,
      fileCount: 5,
      moduleCount: 3,
      layer2Count: 2,
      lastBuiltAt: 1000,
      lastUpdatedAt: 2000,
      coverage: 100,
    }),
    findPath: vi.fn().mockReturnValue([
      { id: 'f1', type: 'file', path: 'src/index.ts' },
      { id: 'f2', type: 'file', path: 'src/utils.ts' },
    ]),
  } as unknown as GraphQuery;
}

// ---------------------------------------------------------------------------
// Mock GraphEngineAdapter
// ---------------------------------------------------------------------------

function createMockEngine(
  query: GraphQuery | null = null,
  buildStatus?: TaskStatusResult,
): GraphEngineAdapter {
  const defaultStatus: TaskStatusResult = buildStatus ?? { projectId: 'p1', status: 'idle' };
  return {
    getQuery: vi.fn().mockReturnValue(query),
    getStats: vi.fn().mockReturnValue(
      query
        ? {
            projectId: 'p1',
            fileCount: 5,
            totalEdges: 15,
            moduleCount: 3,
            coverage: 100,
            lastBuiltAt: 1000,
          }
        : null,
    ),
    buildProject: vi.fn().mockResolvedValue(undefined),
    getBuildStatus: vi.fn().mockReturnValue(defaultStatus),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseContent(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP Tool Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.length = 0;
  });

  // -------------------------------------------------------------------------
  // phantom_graph_context
  // -------------------------------------------------------------------------

  describe('handleGraphContext', () => {
    it('should return files, edges, and modules for a valid project', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handleGraphContext(engine, { projectId: 'p1', file: 'src/index.ts', depth: 2 });
      const data = parseContent(result) as { files: unknown[]; edges: unknown[]; modules: string[] };

      expect(data.files).toHaveLength(2);
      expect(data.files[0]).toEqual({ path: 'src/index.ts', relevance: 1.0 });
      expect(data.edges).toHaveLength(1);
      expect(data.edges[0]).toEqual({ source: 'f1', target: 'f2', type: 'imports' });
      expect(data.modules).toEqual(['lodash']);
      expect(query.getContext).toHaveBeenCalledWith('src/index.ts', 2);
    });

    it('should return error for unknown project', () => {
      const engine = createMockEngine(null);

      const result = handleGraphContext(engine, { projectId: 'unknown', file: 'foo.ts' });
      const data = parseContent(result) as { error: string };

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not found');
    });

    it('should use default depth when not specified', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      handleGraphContext(engine, { projectId: 'p1', file: 'src/index.ts' });

      expect(query.getContext).toHaveBeenCalledWith('src/index.ts', 2);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_graph_blast_radius
  // -------------------------------------------------------------------------

  describe('handleBlastRadius', () => {
    it('should return directly and transitively affected files', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handleBlastRadius(engine, { projectId: 'p1', file: 'src/index.ts' });
      const data = parseContent(result) as {
        directlyAffected: string[];
        transitivelyAffected: string[];
        impactScore: number;
      };

      expect(data.directlyAffected).toEqual(['src/utils.ts']);
      expect(data.transitivelyAffected).toEqual(['src/app.ts']);
      expect(data.impactScore).toBe(0.25);
    });

    it('should return error for unknown project', () => {
      const engine = createMockEngine(null);

      const result = handleBlastRadius(engine, { projectId: 'unknown', file: 'foo.ts' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_graph_related
  // -------------------------------------------------------------------------

  describe('handleRelated', () => {
    it('should return related file paths', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handleRelated(engine, { projectId: 'p1', files: ['src/index.ts'], depth: 1 });
      const data = parseContent(result) as { relatedFiles: string[] };

      expect(data.relatedFiles).toEqual(['src/app.ts']);
      expect(query.getRelatedFiles).toHaveBeenCalledWith(['src/index.ts'], 1);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_graph_stats
  // -------------------------------------------------------------------------

  describe('handleStats', () => {
    it('should return project graph statistics', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handleStats(engine, { projectId: 'p1' });
      const data = parseContent(result) as {
        files: number;
        edges: number;
        modules: number;
        coverage: number;
        lastBuiltAt: number;
      };

      expect(data.files).toBe(5);
      expect(data.edges).toBe(15);
      expect(data.modules).toBe(3);
      expect(data.coverage).toBe(100);
      expect(data.lastBuiltAt).toBe(1000);
    });

    it('should return error for unknown project', () => {
      const engine = createMockEngine(null);

      const result = handleStats(engine, { projectId: 'unknown' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_graph_path
  // -------------------------------------------------------------------------

  describe('handlePath', () => {
    it('should return shortest path between two files', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handlePath(engine, { projectId: 'p1', from: 'src/index.ts', to: 'src/utils.ts' });
      const data = parseContent(result) as { path: string[]; length: number };

      expect(data.path).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(data.length).toBe(2);
      expect(query.findPath).toHaveBeenCalledWith('src/index.ts', 'src/utils.ts');
    });

    it('should return error for unknown project', () => {
      const engine = createMockEngine(null);

      const result = handlePath(engine, { projectId: 'unknown', from: 'a.ts', to: 'b.ts' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_graph_build
  // -------------------------------------------------------------------------

  describe('handleBuild', () => {
    it('should return building status when project exists', () => {
      mockDbRows.push({ id: 'p1', name: 'Test', repoPath: '/tmp/test' });
      const engine = createMockEngine(null);

      const result = handleBuild(engine, { projectId: 'p1' });
      const data = parseContent(result) as { status: string; message: string };

      expect(data.status).toBe('building');
      expect(data.message).toContain('p1');
    });

    it('should return error for unknown project', () => {
      // mockDbRows is empty — no project found
      const engine = createMockEngine(null);

      const result = handleBuild(engine, { projectId: 'unknown' });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_list_projects
  // -------------------------------------------------------------------------

  describe('handleListProjects', () => {
    it('should return list of all projects', () => {
      mockDbRows.push(
        { id: 'p1', name: 'Project A', repoPath: '/repos/a' },
        { id: 'p2', name: 'Project B', repoPath: '/repos/b' },
      );

      const result = handleListProjects();
      const data = parseContent(result) as { projects: Array<{ id: string; name: string; repoPath: string }> };

      expect(data.projects).toHaveLength(2);
      expect(data.projects[0]).toEqual({ id: 'p1', name: 'Project A', repoPath: '/repos/a' });
      expect(data.projects[1]).toEqual({ id: 'p2', name: 'Project B', repoPath: '/repos/b' });
    });

    it('should return empty array when no projects exist', () => {
      // mockDbRows is empty
      const result = handleListProjects();
      const data = parseContent(result) as { projects: unknown[] };

      expect(data.projects).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // phantom_task_status
  // -------------------------------------------------------------------------

  describe('handleTaskStatus', () => {
    it('should return idle status before any build is triggered', () => {
      const engine = createMockEngine(null, { projectId: 'p1', status: 'idle' });

      const result = handleTaskStatus(engine, { projectId: 'p1' });
      const data = parseContent(result) as TaskStatusResult;

      expect(result.isError).toBeFalsy();
      expect(data.status).toBe('idle');
      expect(data.projectId).toBe('p1');
      expect(data.startedAt).toBeUndefined();
      expect(data.finishedAt).toBeUndefined();
    });

    it('should return building status while graph is being built', () => {
      const now = Date.now();
      const engine = createMockEngine(null, {
        projectId: 'p1',
        status: 'building',
        startedAt: now,
      });

      const result = handleTaskStatus(engine, { projectId: 'p1' });
      const data = parseContent(result) as TaskStatusResult;

      expect(data.status).toBe('building');
      expect(data.startedAt).toBe(now);
      expect(data.finishedAt).toBeUndefined();
    });

    it('should return ready status with timing after a successful build', () => {
      const startedAt = Date.now() - 5000;
      const finishedAt = Date.now();
      const engine = createMockEngine(null, {
        projectId: 'p1',
        status: 'ready',
        startedAt,
        finishedAt,
        durationMs: 5000,
      });

      const result = handleTaskStatus(engine, { projectId: 'p1' });
      const data = parseContent(result) as TaskStatusResult;

      expect(data.status).toBe('ready');
      expect(data.startedAt).toBe(startedAt);
      expect(data.finishedAt).toBe(finishedAt);
      expect(data.durationMs).toBe(5000);
    });

    it('should return error status with message after a failed build', () => {
      const engine = createMockEngine(null, {
        projectId: 'p1',
        status: 'error',
        startedAt: Date.now() - 1000,
        finishedAt: Date.now(),
        durationMs: 1000,
        error: 'EACCES: permission denied',
      });

      const result = handleTaskStatus(engine, { projectId: 'p1' });
      const data = parseContent(result) as TaskStatusResult;

      expect(data.status).toBe('error');
      expect(data.error).toContain('EACCES');
    });
  });

  // -------------------------------------------------------------------------
  // phantom_before_edit (composite handler)
  // -------------------------------------------------------------------------

  describe('handleBeforeEdit', () => {
    function createMockOrchestrator(shouldFail = false): OrchestratorEngineAdapter {
      return {
        process: shouldFail
          ? vi.fn().mockRejectedValue(new Error('No orchestrator context'))
          : vi.fn().mockResolvedValue({
              strategy: 'direct',
              alternatives: ['advisor'],
              context: { files: [], blastRadius: {}, relatedFiles: [] },
              taskContext: { complexity: 'simple', risk: 'low', isAmbiguous: false },
              output: { confidence: 0.9 },
              totalDurationMs: 50,
            }),
        getStrategies: vi.fn().mockReturnValue([]),
        getHistory: vi.fn().mockReturnValue([]),
      };
    }

    it('should return combined context, blast radius, and related files', async () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = await handleBeforeEdit(engine, undefined, {
        projectId: 'p1',
        files: ['src/index.ts'],
      });
      const data = parseContent(result) as {
        context: { files: Array<{ path: string; relevance: number }>; edges: unknown[]; modules: string[] };
        blastRadius: { directlyAffected: string[]; transitivelyAffected: string[]; maxImpactScore: number };
        relatedFiles: string[];
      };

      expect(data.context.files).toHaveLength(2);
      expect(data.context.files[0].path).toBe('src/index.ts');
      expect(data.context.edges).toHaveLength(1);
      expect(data.context.modules).toEqual(['lodash']);
      expect(data.blastRadius.directlyAffected).toEqual(['src/utils.ts']);
      expect(data.blastRadius.transitivelyAffected).toEqual(['src/app.ts']);
      expect(data.blastRadius.maxImpactScore).toBe(0.25);
      expect(data.relatedFiles).toEqual(['src/app.ts']);
    });

    it('should merge scores across multiple files keeping highest relevance', async () => {
      const query = createMockQuery();
      // Second call returns different scores for the same file
      (query.getContext as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        files: [{ id: 'f1', type: 'file', path: 'src/index.ts', projectId: 'p1' }],
        edges: [],
        modules: [],
        scores: new Map([['f1', 0.3]]),
      }).mockReturnValueOnce({
        files: [{ id: 'f1', type: 'file', path: 'src/index.ts', projectId: 'p1' }],
        edges: [],
        modules: [],
        scores: new Map([['f1', 0.8]]),
      });
      const engine = createMockEngine(query);

      const result = await handleBeforeEdit(engine, undefined, {
        projectId: 'p1',
        files: ['src/a.ts', 'src/b.ts'],
      });
      const data = parseContent(result) as {
        context: { files: Array<{ path: string; relevance: number }> };
      };

      // Should keep the higher score (0.8)
      expect(data.context.files).toHaveLength(1);
      expect(data.context.files[0].relevance).toBe(0.8);
    });

    it('should include strategy when goal and orchestrator are provided', async () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);
      const orchestrator = createMockOrchestrator();

      const result = await handleBeforeEdit(engine, orchestrator, {
        projectId: 'p1',
        files: ['src/index.ts'],
        goal: 'refactor auth module',
      });
      const data = parseContent(result) as { strategy?: { name: string; confidence: number } };

      expect(data.strategy).toBeDefined();
      expect(data.strategy!.name).toBe('direct');
      expect(data.strategy!.confidence).toBe(0.9);
      expect(orchestrator.process).toHaveBeenCalledWith({
        projectId: 'p1',
        goal: 'refactor auth module',
        activeFiles: ['src/index.ts'],
      });
    });

    it('should omit strategy when no goal is provided', async () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);
      const orchestrator = createMockOrchestrator();

      const result = await handleBeforeEdit(engine, orchestrator, {
        projectId: 'p1',
        files: ['src/index.ts'],
      });
      const data = parseContent(result) as { strategy?: unknown };

      expect(data.strategy).toBeUndefined();
      expect(orchestrator.process).not.toHaveBeenCalled();
    });

    it('should gracefully skip orchestrator when it fails', async () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);
      const orchestrator = createMockOrchestrator(true);

      const result = await handleBeforeEdit(engine, orchestrator, {
        projectId: 'p1',
        files: ['src/index.ts'],
        goal: 'something complex',
      });
      const data = parseContent(result) as { strategy?: unknown; context: unknown };

      // Should not be an error — orchestrator failure is swallowed
      expect(result.isError).toBeFalsy();
      expect(data.strategy).toBeUndefined();
      expect(data.context).toBeDefined();
    });

    it('should return error for unknown project', async () => {
      const engine = createMockEngine(null);

      const result = await handleBeforeEdit(engine, undefined, {
        projectId: 'unknown',
        files: ['foo.ts'],
      });

      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // MCP content format
  // -------------------------------------------------------------------------

  describe('MCP content format', () => {
    it('should always return content as array with type text', () => {
      const query = createMockQuery();
      const engine = createMockEngine(query);

      const result = handleGraphContext(engine, { projectId: 'p1', file: 'src/index.ts' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      // Ensure text is valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Graph warm-up behaviour
  //
  // The stdio entry fires buildProject on spawn (non-blocking). During warm-up
  // the graph is not yet in memory, so query handlers return a "not found"
  // error. This test verifies that behaviour is stable and doesn't crash,
  // and that buildProject is fire-and-forget (void) — no Promise rejection
  // propagates to the caller.
  // -------------------------------------------------------------------------

  describe('graph warm-up compatibility', () => {
    it('query handlers return a graceful error while graph is warming (getQuery returns null)', () => {
      // Simulate engine state during warm-up: build in progress, graph not yet loaded
      const engine = createMockEngine(null);

      const ctxResult = handleGraphContext(engine, { projectId: 'p1', file: 'src/index.ts' });
      const blastResult = handleBlastRadius(engine, { projectId: 'p1', file: 'src/index.ts' });
      const relatedResult = handleRelated(engine, { projectId: 'p1', files: ['src/index.ts'] });
      const pathResult = handlePath(engine, { projectId: 'p1', from: 'a.ts', to: 'b.ts' });

      expect(ctxResult.isError).toBe(true);
      expect(blastResult.isError).toBe(true);
      expect(relatedResult.isError).toBe(true);
      expect(pathResult.isError).toBe(true);

      // All errors contain a human-readable message
      for (const result of [ctxResult, blastResult, relatedResult, pathResult]) {
        const parsed = JSON.parse(result.content[0].text) as { error: string };
        expect(typeof parsed.error).toBe('string');
        expect(parsed.error.length).toBeGreaterThan(0);
      }
    });

    it('buildProject is called with void (fire-and-forget) during warm-up', async () => {
      mockDbRows.push({ id: 'p1', name: 'Test', repoPath: '/tmp/test' });
      const engine = createMockEngine(null);

      // Simulate the warm-up call pattern from stdio-entry.ts:
      //   void engine.buildProject(projectId, repoPath)
      // The returned Promise must resolve without throwing.
      await expect(engine.buildProject('p1', '/tmp/test')).resolves.toBeUndefined();
      expect(engine.buildProject).toHaveBeenCalledWith('p1', '/tmp/test');
    });
  });
});
