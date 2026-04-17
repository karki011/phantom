/**
 * Tests for InMemoryGraph — in-memory adjacency-list graph structure
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import type { FileNode, ModuleNode, GraphEdge } from '../types/graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileNode(id: string, path: string, projectId = 'p1'): FileNode {
  return {
    id,
    type: 'file',
    projectId,
    path,
    extension: 'ts',
    size: 100,
    contentHash: 'abc123',
    lastModified: Date.now(),
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeModuleNode(id: string, name: string, projectId = 'p1'): ModuleNode {
  return {
    id,
    type: 'module',
    projectId,
    name,
    version: '1.0.0',
    isExternal: true,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeEdge(
  id: string,
  sourceId: string,
  targetId: string,
  type: GraphEdge['type'] = 'imports',
  projectId = 'p1',
): GraphEdge {
  return {
    id,
    sourceId,
    targetId,
    type,
    projectId,
    weight: 1,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryGraph', () => {
  let graph: InMemoryGraph;

  beforeEach(() => {
    graph = new InMemoryGraph();
  });

  // -------------------------------------------------------------------------
  // Node CRUD
  // -------------------------------------------------------------------------

  describe('addNode / getNode', () => {
    it('should store and retrieve a node by ID', () => {
      const node = makeFileNode('f1', 'src/index.ts');
      graph.addNode(node);
      expect(graph.getNode('f1')).toBe(node);
    });

    it('should return undefined for missing nodes', () => {
      expect(graph.getNode('nonexistent')).toBeUndefined();
    });
  });

  describe('removeNode', () => {
    it('should remove a node by ID', () => {
      const node = makeFileNode('f1', 'src/index.ts');
      graph.addNode(node);
      graph.removeNode('f1');
      expect(graph.getNode('f1')).toBeUndefined();
    });

    it('should be a no-op for nonexistent node', () => {
      expect(() => graph.removeNode('missing')).not.toThrow();
    });

    it('should cascade-remove connected edges', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const edge = makeEdge('e1', 'a', 'b');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(edge);

      expect(graph.getEdge('e1')).toBeDefined();

      graph.removeNode('a');

      expect(graph.getEdge('e1')).toBeUndefined();
      expect(graph.getOutgoingEdges('b')).toHaveLength(0);
      expect(graph.getIncomingEdges('b')).toHaveLength(0);
    });

    it('should also remove incoming edges when removing the target node', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const edge = makeEdge('e1', 'a', 'b');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(edge);

      graph.removeNode('b');

      expect(graph.getEdge('e1')).toBeUndefined();
      expect(graph.getOutgoingEdges('a')).toHaveLength(0);
    });

    it('should remove file path index entry', () => {
      const node = makeFileNode('f1', 'src/index.ts');
      graph.addNode(node);
      expect(graph.getFileByPath('src/index.ts')).toBeDefined();

      graph.removeNode('f1');
      expect(graph.getFileByPath('src/index.ts')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Edge CRUD
  // -------------------------------------------------------------------------

  describe('addEdge / getEdge', () => {
    it('should store and retrieve an edge', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const edge = makeEdge('e1', 'a', 'b');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(edge);

      expect(graph.getEdge('e1')).toBe(edge);
    });

    it('should return undefined for missing edges', () => {
      expect(graph.getEdge('nope')).toBeUndefined();
    });
  });

  describe('removeEdge', () => {
    it('should remove an edge and update adjacency', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const edge = makeEdge('e1', 'a', 'b');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(edge);

      graph.removeEdge('e1');

      expect(graph.getEdge('e1')).toBeUndefined();
      expect(graph.getOutgoingEdges('a')).toHaveLength(0);
      expect(graph.getIncomingEdges('b')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // File / Module Index Lookups
  // -------------------------------------------------------------------------

  describe('getFileByPath', () => {
    it('should find a file node by its path', () => {
      const node = makeFileNode('f1', 'src/utils.ts');
      graph.addNode(node);
      expect(graph.getFileByPath('src/utils.ts')).toBe(node);
    });

    it('should return undefined for unknown path', () => {
      expect(graph.getFileByPath('unknown.ts')).toBeUndefined();
    });
  });

  describe('getModuleByName', () => {
    it('should find a module node by name', () => {
      const mod = makeModuleNode('m1', 'react');
      graph.addNode(mod);
      expect(graph.getModuleByName('react')).toBe(mod);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Queries
  // -------------------------------------------------------------------------

  describe('getOutgoingEdges / getIncomingEdges', () => {
    it('should return outgoing edges for a node', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const c = makeFileNode('c', 'c.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addNode(c);
      graph.addEdge(makeEdge('e1', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'a', 'c'));

      const outgoing = graph.getOutgoingEdges('a');
      expect(outgoing).toHaveLength(2);
      expect(outgoing.map(e => e.targetId).sort()).toEqual(['b', 'c']);
    });

    it('should return incoming edges for a node', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const c = makeFileNode('c', 'c.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addNode(c);
      graph.addEdge(makeEdge('e1', 'a', 'c'));
      graph.addEdge(makeEdge('e2', 'b', 'c'));

      const incoming = graph.getIncomingEdges('c');
      expect(incoming).toHaveLength(2);
      expect(incoming.map(e => e.sourceId).sort()).toEqual(['a', 'b']);
    });

    it('should return empty array for node with no edges', () => {
      const a = makeFileNode('a', 'a.ts');
      graph.addNode(a);
      expect(graph.getOutgoingEdges('a')).toHaveLength(0);
      expect(graph.getIncomingEdges('a')).toHaveLength(0);
    });

    it('should return empty array for unknown node', () => {
      expect(graph.getOutgoingEdges('missing')).toHaveLength(0);
      expect(graph.getIncomingEdges('missing')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Neighbors (BFS)
  // -------------------------------------------------------------------------

  describe('getNeighbors', () => {
    it('should return depth-1 neighbors via outgoing edges', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const c = makeFileNode('c', 'c.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addNode(c);
      graph.addEdge(makeEdge('e1', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'a', 'c'));

      const neighbors = graph.getNeighbors('a');
      expect(neighbors).toHaveLength(2);
      const ids = neighbors.map(n => n.id).sort();
      expect(ids).toEqual(['b', 'c']);
    });

    it('should return depth-1 neighbors via incoming edges (reverse)', () => {
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(makeEdge('e1', 'b', 'a'));

      // 'a' is the target, so BFS from 'a' should find 'b' via reverse adjacency
      const neighbors = graph.getNeighbors('a');
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0]!.id).toBe('b');
    });

    it('should traverse depth-2 neighbors', () => {
      // A -> B -> C
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');
      const c = makeFileNode('c', 'c.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addNode(c);
      graph.addEdge(makeEdge('e1', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'b', 'c'));

      // Depth 1 from A: just B
      const depth1 = graph.getNeighbors('a', 1);
      expect(depth1.map(n => n.id)).toEqual(['b']);

      // Depth 2 from A: B and C
      const depth2 = graph.getNeighbors('a', 2);
      expect(depth2).toHaveLength(2);
      expect(depth2.map(n => n.id).sort()).toEqual(['b', 'c']);
    });

    it('should not include the starting node', () => {
      // A -> B -> A (cycle)
      const a = makeFileNode('a', 'a.ts');
      const b = makeFileNode('b', 'b.ts');

      graph.addNode(a);
      graph.addNode(b);
      graph.addEdge(makeEdge('e1', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'b', 'a'));

      const neighbors = graph.getNeighbors('a', 3);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0]!.id).toBe('b');
    });

    it('should return empty array for isolated node', () => {
      const a = makeFileNode('a', 'a.ts');
      graph.addNode(a);
      expect(graph.getNeighbors('a')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Filtered Queries
  // -------------------------------------------------------------------------

  describe('getNodesByType', () => {
    it('should return only nodes of the given type', () => {
      graph.addNode(makeFileNode('f1', 'a.ts'));
      graph.addNode(makeFileNode('f2', 'b.ts'));
      graph.addNode(makeModuleNode('m1', 'react'));

      const files = graph.getNodesByType('file');
      expect(files).toHaveLength(2);
      expect(files.every(n => n.type === 'file')).toBe(true);

      const modules = graph.getNodesByType('module');
      expect(modules).toHaveLength(1);
    });
  });

  describe('getNodesByProject', () => {
    it('should return only nodes belonging to the project', () => {
      graph.addNode(makeFileNode('f1', 'a.ts', 'proj-a'));
      graph.addNode(makeFileNode('f2', 'b.ts', 'proj-b'));
      graph.addNode(makeModuleNode('m1', 'react', 'proj-a'));

      const projANodes = graph.getNodesByProject('proj-a');
      expect(projANodes).toHaveLength(2);
      expect(projANodes.every(n => n.projectId === 'proj-a')).toBe(true);
    });

    it('should not scan unrelated project nodes (correctness in mixed graph)', () => {
      // proj-a has 3 nodes, proj-b has 2 nodes
      graph.addNode(makeFileNode('a1', 'src/a.ts', 'proj-a'));
      graph.addNode(makeFileNode('a2', 'src/b.ts', 'proj-a'));
      graph.addNode(makeModuleNode('am1', 'lodash', 'proj-a'));
      graph.addNode(makeFileNode('b1', 'src/a.ts', 'proj-b'));
      graph.addNode(makeFileNode('b2', 'src/c.ts', 'proj-b'));

      const projA = graph.getNodesByProject('proj-a');
      const projB = graph.getNodesByProject('proj-b');

      expect(projA).toHaveLength(3);
      expect(projA.every(n => n.projectId === 'proj-a')).toBe(true);
      expect(projB).toHaveLength(2);
      expect(projB.every(n => n.projectId === 'proj-b')).toBe(true);
    });

    it('should return empty array for unknown project', () => {
      graph.addNode(makeFileNode('f1', 'a.ts', 'proj-a'));
      expect(graph.getNodesByProject('proj-unknown')).toHaveLength(0);
    });

    it('should update correctly after removeNode', () => {
      graph.addNode(makeFileNode('f1', 'a.ts', 'proj-a'));
      graph.addNode(makeFileNode('f2', 'b.ts', 'proj-a'));
      graph.removeNode('f1');
      const nodes = graph.getNodesByProject('proj-a');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.id).toBe('f2');
    });
  });

  describe('getFileByPathInProject', () => {
    it('should find a file node by project and path', () => {
      const node = makeFileNode('f1', 'src/utils.ts', 'proj-a');
      graph.addNode(node);
      expect(graph.getFileByPathInProject('proj-a', 'src/utils.ts')).toBe(node);
    });

    it('should not collide when two projects share the same path', () => {
      const nodeA = makeFileNode('a1', 'src/index.ts', 'proj-a');
      const nodeB = makeFileNode('b1', 'src/index.ts', 'proj-b');
      graph.addNode(nodeA);
      graph.addNode(nodeB);

      expect(graph.getFileByPathInProject('proj-a', 'src/index.ts')).toBe(nodeA);
      expect(graph.getFileByPathInProject('proj-b', 'src/index.ts')).toBe(nodeB);
      // Verify they are distinct nodes
      expect(graph.getFileByPathInProject('proj-a', 'src/index.ts')?.id).toBe('a1');
      expect(graph.getFileByPathInProject('proj-b', 'src/index.ts')?.id).toBe('b1');
    });

    it('should return undefined for wrong projectId', () => {
      graph.addNode(makeFileNode('f1', 'src/utils.ts', 'proj-a'));
      expect(graph.getFileByPathInProject('proj-b', 'src/utils.ts')).toBeUndefined();
    });

    it('should be undefined after the node is removed', () => {
      graph.addNode(makeFileNode('f1', 'src/utils.ts', 'proj-a'));
      graph.removeNode('f1');
      expect(graph.getFileByPathInProject('proj-a', 'src/utils.ts')).toBeUndefined();
    });
  });

  describe('getNodesByProjectAndType', () => {
    it('should return only nodes of the given type in the given project', () => {
      graph.addNode(makeFileNode('f1', 'a.ts', 'proj-a'));
      graph.addNode(makeFileNode('f2', 'b.ts', 'proj-a'));
      graph.addNode(makeModuleNode('m1', 'react', 'proj-a'));
      graph.addNode(makeFileNode('f3', 'c.ts', 'proj-b'));

      const projAFiles = graph.getNodesByProjectAndType('proj-a', 'file');
      expect(projAFiles).toHaveLength(2);
      expect(projAFiles.every(n => n.projectId === 'proj-a' && n.type === 'file')).toBe(true);

      const projAModules = graph.getNodesByProjectAndType('proj-a', 'module');
      expect(projAModules).toHaveLength(1);
      expect(projAModules[0]!.id).toBe('m1');
    });

    it('should return empty array for unknown project or type combination', () => {
      graph.addNode(makeFileNode('f1', 'a.ts', 'proj-a'));
      expect(graph.getNodesByProjectAndType('proj-b', 'file')).toHaveLength(0);
      expect(graph.getNodesByProjectAndType('proj-a', 'module')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Bulk & Stats
  // -------------------------------------------------------------------------

  describe('getAllNodes / getAllEdges', () => {
    it('should return all nodes and edges', () => {
      graph.addNode(makeFileNode('a', 'a.ts'));
      graph.addNode(makeFileNode('b', 'b.ts'));
      graph.addEdge(makeEdge('e1', 'a', 'b'));

      expect(graph.getAllNodes()).toHaveLength(2);
      expect(graph.getAllEdges()).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('should report correct counts', () => {
      graph.addNode(makeFileNode('f1', 'a.ts'));
      graph.addNode(makeFileNode('f2', 'b.ts'));
      graph.addNode(makeModuleNode('m1', 'react'));
      graph.addEdge(makeEdge('e1', 'f1', 'f2'));

      expect(graph.stats).toEqual({
        nodes: 3,
        edges: 1,
        files: 2,
        modules: 1,
      });
    });
  });

  describe('clear', () => {
    it('should reset the graph to empty', () => {
      graph.addNode(makeFileNode('f1', 'a.ts'));
      graph.addNode(makeModuleNode('m1', 'react'));
      graph.addEdge(makeEdge('e1', 'f1', 'm1'));

      graph.clear();

      expect(graph.stats).toEqual({ nodes: 0, edges: 0, files: 0, modules: 0 });
      expect(graph.getAllNodes()).toHaveLength(0);
      expect(graph.getAllEdges()).toHaveLength(0);
      expect(graph.getFileByPathInProject('p1', 'a.ts')).toBeUndefined();
    });
  });
});
