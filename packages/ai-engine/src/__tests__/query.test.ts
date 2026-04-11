/**
 * GraphQuery Tests
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphQuery } from '../graph/query.js';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import type { FileNode, ModuleNode, GraphEdge } from '../types/graph.js';

const PROJECT = 'test-project';
const now = Date.now();

function makeFile(path: string, id?: string): FileNode {
  return {
    id: id ?? `file:${PROJECT}:${path}`,
    type: 'file',
    projectId: PROJECT,
    path,
    extension: path.split('.').pop()!,
    size: 100,
    contentHash: 'abc123',
    lastModified: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function makeModule(name: string): ModuleNode {
  return {
    id: `module:${PROJECT}:${name}`,
    type: 'module',
    projectId: PROJECT,
    name,
    version: '1.0.0',
    isExternal: true,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

function makeEdge(
  sourceId: string,
  targetId: string,
  type: GraphEdge['type'] = 'imports',
): GraphEdge {
  return {
    id: `edge:${sourceId}:${targetId}:${type}`,
    sourceId,
    targetId,
    type,
    projectId: PROJECT,
    weight: 1,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('GraphQuery', () => {
  let graph: InMemoryGraph;
  let query: GraphQuery;

  // Setup a small graph:
  //   index.ts -> utils.ts -> helpers.ts
  //   index.ts -> react (module)
  //   app.tsx -> index.ts
  //   app.tsx -> react (module)
  beforeEach(() => {
    graph = new InMemoryGraph();
    query = new GraphQuery(graph);

    const indexFile = makeFile('src/index.ts');
    const utilsFile = makeFile('src/utils.ts');
    const helpersFile = makeFile('src/helpers.ts');
    const appFile = makeFile('src/app.tsx');
    const reactModule = makeModule('react');

    graph.addNode(indexFile);
    graph.addNode(utilsFile);
    graph.addNode(helpersFile);
    graph.addNode(appFile);
    graph.addNode(reactModule);

    graph.addEdge(makeEdge(indexFile.id, utilsFile.id));
    graph.addEdge(makeEdge(utilsFile.id, helpersFile.id));
    graph.addEdge(makeEdge(indexFile.id, reactModule.id, 'depends_on'));
    graph.addEdge(makeEdge(appFile.id, indexFile.id));
    graph.addEdge(makeEdge(appFile.id, reactModule.id, 'depends_on'));
  });

  describe('getContext', () => {
    it('returns context for a file with its dependencies', () => {
      const ctx = query.getContext('src/index.ts');
      expect(ctx.files.length).toBeGreaterThanOrEqual(1);
      expect(ctx.files.some((f) => f.path === 'src/index.ts')).toBe(true);
      expect(ctx.edges.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown file', () => {
      const ctx = query.getContext('nonexistent.ts');
      expect(ctx.files).toHaveLength(0);
      expect(ctx.edges).toHaveLength(0);
      expect(ctx.modules).toHaveLength(0);
    });

    it('includes modules in context', () => {
      const ctx = query.getContext('src/index.ts');
      expect(ctx.modules.some((m) => m.name === 'react')).toBe(true);
    });

    it('scores root file highest', () => {
      const ctx = query.getContext('src/index.ts');
      const rootId = `file:${PROJECT}:src/index.ts`;
      expect(ctx.scores.get(rootId)).toBe(1);
    });

    it('scores distant files lower', () => {
      const ctx = query.getContext('src/index.ts', 3);
      const rootId = `file:${PROJECT}:src/index.ts`;
      const helpersId = `file:${PROJECT}:src/helpers.ts`;
      const rootScore = ctx.scores.get(rootId) ?? 0;
      const helpersScore = ctx.scores.get(helpersId) ?? 0;
      expect(rootScore).toBeGreaterThan(helpersScore);
    });

    it('respects depth limit', () => {
      const ctx = query.getContext('src/app.tsx', 1);
      // depth 1: app.tsx -> index.ts (+ react module). helpers.ts is depth 3 away
      expect(ctx.files.some((f) => f.path === 'src/helpers.ts')).toBe(false);
    });

    it('deduplicates edges', () => {
      const ctx = query.getContext('src/index.ts');
      const edgeIds = ctx.edges.map((e) => e.id);
      expect(new Set(edgeIds).size).toBe(edgeIds.length);
    });
  });

  describe('getBlastRadius', () => {
    it('finds direct dependents', () => {
      const result = query.getBlastRadius('src/index.ts');
      // app.tsx imports index.ts
      expect(result.direct.some((f) => f.path === 'src/app.tsx')).toBe(true);
    });

    it('finds transitive dependents', () => {
      const result = query.getBlastRadius('src/helpers.ts');
      // utils.ts imports helpers.ts (direct), index.ts imports utils.ts (transitive)
      expect(result.direct.some((f) => f.path === 'src/utils.ts')).toBe(true);
      expect(result.transitive.some((f) => f.path === 'src/index.ts')).toBe(true);
    });

    it('returns empty for unknown file', () => {
      const result = query.getBlastRadius('nonexistent.ts');
      expect(result.direct).toHaveLength(0);
      expect(result.transitive).toHaveLength(0);
      expect(result.impactScore).toBe(0);
    });

    it('returns empty for leaf file with no dependents', () => {
      const result = query.getBlastRadius('src/app.tsx');
      expect(result.direct).toHaveLength(0);
      expect(result.transitive).toHaveLength(0);
    });

    it('calculates impact score', () => {
      const result = query.getBlastRadius('src/helpers.ts');
      expect(result.impactScore).toBeGreaterThan(0);
      expect(result.impactScore).toBeLessThanOrEqual(1);
    });
  });

  describe('getRelatedFiles', () => {
    it('finds neighbors of given files', () => {
      const related = query.getRelatedFiles(['src/index.ts']);
      expect(related.length).toBeGreaterThan(0);
      // Should include utils.ts and app.tsx (neighbors of index.ts)
      const paths = related.map((f) => f.path);
      expect(paths).toContain('src/utils.ts');
      expect(paths).toContain('src/app.tsx');
    });

    it('excludes the input files themselves', () => {
      const related = query.getRelatedFiles(['src/index.ts']);
      expect(related.some((f) => f.path === 'src/index.ts')).toBe(false);
    });

    it('returns empty for unknown files', () => {
      const related = query.getRelatedFiles(['nonexistent.ts']);
      expect(related).toHaveLength(0);
    });

    it('handles multiple input files', () => {
      const related = query.getRelatedFiles(['src/index.ts', 'src/helpers.ts']);
      const paths = related.map((f) => f.path);
      expect(paths).toContain('src/utils.ts');
      expect(paths).toContain('src/app.tsx');
    });
  });

  describe('getStats', () => {
    it('returns correct counts', () => {
      const stats = query.getStats(PROJECT);
      expect(stats.fileCount).toBe(4);
      expect(stats.moduleCount).toBe(1);
      expect(stats.totalNodes).toBe(5);
      expect(stats.totalEdges).toBe(5);
    });

    it('returns zero for unknown project', () => {
      const stats = query.getStats('nonexistent');
      expect(stats.totalNodes).toBe(0);
      expect(stats.totalEdges).toBe(0);
    });
  });

  describe('findPath', () => {
    it('finds direct path between connected files', () => {
      const path = query.findPath('src/index.ts', 'src/utils.ts');
      expect(path.length).toBe(2);
      expect(path[0].path).toBe('src/index.ts');
      expect(path[1].path).toBe('src/utils.ts');
    });

    it('finds multi-hop path', () => {
      const path = query.findPath('src/app.tsx', 'src/helpers.ts');
      expect(path.length).toBeGreaterThanOrEqual(3);
      expect(path[0].path).toBe('src/app.tsx');
      expect(path[path.length - 1].path).toBe('src/helpers.ts');
    });

    it('returns empty for disconnected nodes', () => {
      // Add a disconnected file
      graph.addNode(makeFile('src/isolated.ts'));
      const path = query.findPath('src/index.ts', 'src/isolated.ts');
      expect(path).toHaveLength(0);
    });

    it('returns single node for same file', () => {
      const path = query.findPath('src/index.ts', 'src/index.ts');
      expect(path).toHaveLength(1);
    });

    it('returns empty for unknown files', () => {
      const path = query.findPath('nonexistent.ts', 'src/index.ts');
      expect(path).toHaveLength(0);
    });
  });
});
