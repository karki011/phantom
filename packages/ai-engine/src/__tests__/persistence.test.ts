/**
 * GraphPersistence Tests
 * Uses an in-memory SQLite database with the graph schema.
 *
 * @author Subash Karki
 */
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphPersistence, safeStringify } from '../graph/persistence.js';
import type { GraphNode, GraphEdge, GraphStats } from '../types/graph.js';
import type { FileNode, ModuleNode } from '../types/graph.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-test-1';

/** Create an in-memory SQLite DB with the graph schema */
function createTestDb(): Database.Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Minimal projects table (referenced by graph tables)
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL UNIQUE,
      default_branch TEXT DEFAULT 'main',
      worktree_base_dir TEXT,
      color TEXT,
      profile TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Graph tables
  sqlite.exec(`
    CREATE TABLE graph_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      path TEXT,
      name TEXT,
      content_hash TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE graph_edges (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      source_id TEXT NOT NULL REFERENCES graph_nodes(id),
      target_id TEXT NOT NULL REFERENCES graph_nodes(id),
      type TEXT NOT NULL,
      weight INTEGER DEFAULT 1,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE graph_meta (
      project_id TEXT PRIMARY KEY REFERENCES projects(id),
      last_built_at INTEGER,
      last_updated_at INTEGER,
      file_count INTEGER DEFAULT 0,
      edge_count INTEGER DEFAULT 0,
      layer2_count INTEGER DEFAULT 0,
      coverage INTEGER DEFAULT 0
    );
  `);

  // Seed a project row so FK constraints pass
  sqlite.prepare(
    'INSERT INTO projects (id, name, repo_path, created_at) VALUES (?, ?, ?, ?)',
  ).run(PROJECT_ID, 'Test Project', '/tmp/test-repo', Date.now());

  return sqlite;
}

function makeFileNode(id: string, path: string): FileNode {
  return {
    id,
    projectId: PROJECT_ID,
    type: 'file',
    path,
    extension: path.split('.').pop() ?? '',
    size: 1024,
    contentHash: `hash-${id}`,
    lastModified: Date.now(),
    metadata: { lines: 42 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeModuleNode(id: string, name: string): ModuleNode {
  return {
    id,
    projectId: PROJECT_ID,
    type: 'module',
    name,
    version: '1.0.0',
    isExternal: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeEdge(id: string, sourceId: string, targetId: string): GraphEdge {
  return {
    id,
    projectId: PROJECT_ID,
    sourceId,
    targetId,
    type: 'imports',
    weight: 1,
    metadata: { resolved: true },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphPersistence', () => {
  let sqlite: Database.Database;
  let persistence: GraphPersistence;

  beforeEach(() => {
    sqlite = createTestDb();
    persistence = new GraphPersistence(sqlite);
  });

  // -----------------------------------------------------------------------
  // Nodes
  // -----------------------------------------------------------------------

  describe('saveNodes / loadNodes', () => {
    it('should save and load file nodes', () => {
      const nodes: GraphNode[] = [
        makeFileNode('f1', 'src/index.ts'),
        makeFileNode('f2', 'src/utils.ts'),
      ];

      persistence.saveNodes(nodes);
      const loaded = persistence.loadNodes(PROJECT_ID);

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe('f1');
      expect(loaded[1].id).toBe('f2');
      expect(loaded[0].type).toBe('file');
      expect((loaded[0] as FileNode).path).toBe('src/index.ts');
    });

    it('should save and load module nodes', () => {
      const nodes: GraphNode[] = [makeModuleNode('m1', 'react')];

      persistence.saveNodes(nodes);
      const loaded = persistence.loadNodes(PROJECT_ID);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].type).toBe('module');
      expect((loaded[0] as ModuleNode).name).toBe('react');
    });

    it('should upsert nodes on conflict', () => {
      const node = makeFileNode('f1', 'src/old.ts');
      persistence.saveNodes([node]);

      const updated = { ...node, path: 'src/new.ts', updatedAt: Date.now() + 1000 } as unknown as GraphNode;
      persistence.saveNodes([updated]);

      const loaded = persistence.loadNodes(PROJECT_ID);
      expect(loaded).toHaveLength(1);
      expect((loaded[0] as FileNode).path).toBe('src/new.ts');
    });

    it('should parse metadata JSON on load', () => {
      const node = makeFileNode('f1', 'src/index.ts');
      (node as FileNode).metadata = { lines: 42, language: 'typescript' };
      persistence.saveNodes([node]);

      const loaded = persistence.loadNodes(PROJECT_ID);
      expect(loaded[0].metadata).toEqual({ lines: 42, language: 'typescript' });
    });

    it('should return empty array for unknown project', () => {
      const loaded = persistence.loadNodes('nonexistent-project');
      expect(loaded).toEqual([]);
    });

    it('should handle empty array without error', () => {
      expect(() => persistence.saveNodes([])).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Edges
  // -----------------------------------------------------------------------

  describe('saveEdges / loadEdges', () => {
    it('should save and load edges', () => {
      persistence.saveNodes([
        makeFileNode('f1', 'src/a.ts'),
        makeFileNode('f2', 'src/b.ts'),
      ]);

      const edges: GraphEdge[] = [makeEdge('e1', 'f1', 'f2')];
      persistence.saveEdges(edges);

      const loaded = persistence.loadEdges(PROJECT_ID);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].sourceId).toBe('f1');
      expect(loaded[0].targetId).toBe('f2');
      expect(loaded[0].type).toBe('imports');
    });

    it('should upsert edges on conflict', () => {
      persistence.saveNodes([
        makeFileNode('f1', 'src/a.ts'),
        makeFileNode('f2', 'src/b.ts'),
      ]);

      const edge = makeEdge('e1', 'f1', 'f2');
      persistence.saveEdges([edge]);

      const updated: GraphEdge = { ...edge, weight: 5, updatedAt: Date.now() + 1000 };
      persistence.saveEdges([updated]);

      const loaded = persistence.loadEdges(PROJECT_ID);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].weight).toBe(5);
    });

    it('should parse edge metadata JSON on load', () => {
      persistence.saveNodes([
        makeFileNode('f1', 'src/a.ts'),
        makeFileNode('f2', 'src/b.ts'),
      ]);

      const edge = makeEdge('e1', 'f1', 'f2');
      edge.metadata = { resolved: true, specifier: './b' };
      persistence.saveEdges([edge]);

      const loaded = persistence.loadEdges(PROJECT_ID);
      expect(loaded[0].metadata).toEqual({ resolved: true, specifier: './b' });
    });

    it('should return empty array for project with no edges', () => {
      const loaded = persistence.loadEdges(PROJECT_ID);
      expect(loaded).toEqual([]);
    });

    it('should handle empty array without error', () => {
      expect(() => persistence.saveEdges([])).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Meta
  // -----------------------------------------------------------------------

  describe('saveMeta / loadMeta', () => {
    it('should save and load metadata', () => {
      const stats: GraphStats = {
        projectId: PROJECT_ID,
        totalNodes: 100,
        totalEdges: 250,
        fileCount: 80,
        moduleCount: 20,
        layer2Count: 50,
        lastBuiltAt: Date.now(),
        lastUpdatedAt: Date.now(),
        coverage: 75,
      };

      persistence.saveMeta(stats);
      const loaded = persistence.loadMeta(PROJECT_ID);

      expect(loaded).not.toBeNull();
      expect(loaded!.projectId).toBe(PROJECT_ID);
      expect(loaded!.fileCount).toBe(80);
      expect(loaded!.totalEdges).toBe(250);
      expect(loaded!.layer2Count).toBe(50);
      expect(loaded!.coverage).toBe(75);
    });

    it('should upsert metadata on conflict', () => {
      const stats: GraphStats = {
        projectId: PROJECT_ID,
        totalNodes: 10,
        totalEdges: 20,
        fileCount: 10,
        moduleCount: 0,
        layer2Count: 0,
        lastBuiltAt: Date.now(),
        lastUpdatedAt: Date.now(),
        coverage: 10,
      };

      persistence.saveMeta(stats);
      persistence.saveMeta({ ...stats, fileCount: 50, coverage: 90 });

      const loaded = persistence.loadMeta(PROJECT_ID);
      expect(loaded!.fileCount).toBe(50);
      expect(loaded!.coverage).toBe(90);
    });

    it('should return null for unknown project', () => {
      const loaded = persistence.loadMeta('nonexistent-project');
      expect(loaded).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // safeStringify — circular reference and depth guard
  // -----------------------------------------------------------------------

  describe('safeStringify', () => {
    it('serializes a plain object to valid JSON', () => {
      const obj = { a: 1, b: 'hello', c: true, d: null };
      const result = safeStringify(obj);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(JSON.parse(result)).toEqual(obj);
    });

    it('replaces circular references with "[Circular]" and produces valid JSON', () => {
      const obj: Record<string, unknown> = { name: 'cycle' };
      obj['self'] = obj; // circular ref

      const result = safeStringify(obj);
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result) as Record<string, unknown>;
      expect(parsed['name']).toBe('cycle');
      expect(parsed['self']).toBe('[Circular]');
    });

    it('handles deeper circular chains', () => {
      const a: Record<string, unknown> = { label: 'a' };
      const b: Record<string, unknown> = { label: 'b', parent: a };
      a['child'] = b; // a → b → a

      const result = safeStringify(a);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(result).toContain('[Circular]');
    });

    it('replaces values beyond maxDepth with "[MaxDepth]"', () => {
      // Build an object nested 15 levels deep
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 14; i++) {
        deep = { nested: deep };
      }

      const result = safeStringify(deep, 5);
      expect(() => JSON.parse(result)).not.toThrow();
      expect(result).toContain('[MaxDepth]');
    });

    it('saveNodes succeeds when a node contains a circular metadata ref', () => {
      const node = makeFileNode('f-circ', 'src/circ.ts');
      // Inject a circular reference into the metadata field
      const meta: Record<string, unknown> = { label: 'test' };
      meta['self'] = meta;
      (node as { metadata: unknown }).metadata = meta;

      expect(() => persistence.saveNodes([node as unknown as GraphNode])).not.toThrow();
      const loaded = persistence.loadNodes(PROJECT_ID);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('f-circ');
    });
  });

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  describe('deleteProject', () => {
    it('should remove all graph data for a project', () => {
      // Seed nodes, edges, meta
      persistence.saveNodes([
        makeFileNode('f1', 'src/a.ts'),
        makeFileNode('f2', 'src/b.ts'),
      ]);
      persistence.saveEdges([makeEdge('e1', 'f1', 'f2')]);
      persistence.saveMeta({
        projectId: PROJECT_ID,
        totalNodes: 2,
        totalEdges: 1,
        fileCount: 2,
        moduleCount: 0,
        layer2Count: 0,
        lastBuiltAt: Date.now(),
        lastUpdatedAt: Date.now(),
        coverage: 50,
      });

      persistence.deleteProject(PROJECT_ID);

      expect(persistence.loadNodes(PROJECT_ID)).toEqual([]);
      expect(persistence.loadEdges(PROJECT_ID)).toEqual([]);
      expect(persistence.loadMeta(PROJECT_ID)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Transactions
  // -----------------------------------------------------------------------

  describe('transactional batch operations', () => {
    it('should roll back all nodes if one fails mid-batch', () => {
      const goodNode = makeFileNode('f1', 'src/ok.ts');
      // Create a node with a bad project_id to trigger FK violation
      const badNode = makeFileNode('f2', 'src/bad.ts');
      (badNode as { projectId: string }).projectId = 'nonexistent-project';

      expect(() => persistence.saveNodes([goodNode, badNode])).toThrow();

      // Neither node should have been saved
      const loaded = persistence.loadNodes(PROJECT_ID);
      expect(loaded).toEqual([]);
    });

    it('should roll back all edges if one fails mid-batch', () => {
      persistence.saveNodes([
        makeFileNode('f1', 'src/a.ts'),
        makeFileNode('f2', 'src/b.ts'),
      ]);

      const goodEdge = makeEdge('e1', 'f1', 'f2');
      // Edge referencing nonexistent node
      const badEdge = makeEdge('e2', 'f1', 'nonexistent-node');

      expect(() => persistence.saveEdges([goodEdge, badEdge])).toThrow();

      // Neither edge should have been saved
      const loaded = persistence.loadEdges(PROJECT_ID);
      expect(loaded).toEqual([]);
    });
  });
});
