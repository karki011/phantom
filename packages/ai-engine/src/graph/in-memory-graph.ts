/**
 * InMemoryGraph — Fast in-memory graph for context queries
 * Adjacency list representation optimized for traversal
 *
 * All lookups are O(1) via Map. Neighbor queries are O(degree).
 * BFS traversal follows both outgoing and incoming edges.
 *
 * @author Subash Karki
 */
import type {
  GraphNode,
  GraphEdge,
  FileNode,
  ModuleNode,
  NodeType,
} from '../types/graph.js';

export class InMemoryGraph {
  /** Node lookup by ID */
  private nodes = new Map<string, GraphNode>();

  /** Outgoing edge IDs per node */
  private adjacency = new Map<string, Set<string>>();

  /** Incoming edge IDs per node */
  private reverseAdjacency = new Map<string, Set<string>>();

  /** Edge lookup by ID */
  private edges = new Map<string, GraphEdge>();

  /**
   * File path → node ID index, keyed as `${projectId}:${path}` to prevent
   * cross-project collisions when two projects share the same relative path.
   */
  private filesByPath = new Map<string, string>();

  /** Module name → node ID */
  private modulesByName = new Map<string, string>();

  /**
   * Project ID → Set of node IDs. Maintained incrementally in addNode/removeNode.
   * Enables O(1) `getNodesByProject` without full scans.
   */
  private nodesByProject = new Map<string, Set<string>>();

  /**
   * `${projectId}:${type}` → Set of node IDs. Enables fast typed queries
   * scoped to a project (e.g. "all file nodes in project X").
   */
  private nodesByProjectAndType = new Map<string, Set<string>>();

  // ---------------------------------------------------------------------------
  // Private index helpers
  // ---------------------------------------------------------------------------

  private filePathKey(projectId: string, path: string): string {
    return `${projectId}:${path}`;
  }

  private projectTypeKey(projectId: string, type: NodeType): string {
    return `${projectId}:${type}`;
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);

    // Ensure adjacency sets exist
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
    if (!this.reverseAdjacency.has(node.id)) {
      this.reverseAdjacency.set(node.id, new Set());
    }

    // Project index
    let projectSet = this.nodesByProject.get(node.projectId);
    if (!projectSet) {
      projectSet = new Set();
      this.nodesByProject.set(node.projectId, projectSet);
    }
    projectSet.add(node.id);

    // Project + type index
    const ptKey = this.projectTypeKey(node.projectId, node.type);
    let ptSet = this.nodesByProjectAndType.get(ptKey);
    if (!ptSet) {
      ptSet = new Set();
      this.nodesByProjectAndType.set(ptKey, ptSet);
    }
    ptSet.add(node.id);

    // Shortcut indexes
    if (node.type === 'file') {
      const key = this.filePathKey(node.projectId, (node as FileNode).path);
      this.filesByPath.set(key, node.id);
    }
    if (node.type === 'module') {
      this.modulesByName.set((node as ModuleNode).name, node.id);
    }
  }

  addEdge(edge: GraphEdge): void {
    this.edges.set(edge.id, edge);

    let outSet = this.adjacency.get(edge.sourceId);
    if (!outSet) {
      outSet = new Set();
      this.adjacency.set(edge.sourceId, outSet);
    }
    outSet.add(edge.id);

    let inSet = this.reverseAdjacency.get(edge.targetId);
    if (!inSet) {
      inSet = new Set();
      this.reverseAdjacency.set(edge.targetId, inSet);
    }
    inSet.add(edge.id);
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove all connected edges (outgoing + incoming)
    // Snapshot into arrays to avoid iterator invalidation — removeEdgeInternal mutates the sets
    const outEdgeIds = this.adjacency.get(id);
    if (outEdgeIds) {
      for (const edgeId of [...outEdgeIds]) {
        this.removeEdgeInternal(edgeId);
      }
    }

    const inEdgeIds = this.reverseAdjacency.get(id);
    if (inEdgeIds) {
      for (const edgeId of [...inEdgeIds]) {
        this.removeEdgeInternal(edgeId);
      }
    }

    // Remove shortcut index entries
    if (node.type === 'file') {
      const key = this.filePathKey(node.projectId, (node as FileNode).path);
      this.filesByPath.delete(key);
    }
    if (node.type === 'module') {
      this.modulesByName.delete((node as ModuleNode).name);
    }

    // Remove from project index
    const projectSet = this.nodesByProject.get(node.projectId);
    if (projectSet) {
      projectSet.delete(id);
      if (projectSet.size === 0) this.nodesByProject.delete(node.projectId);
    }

    // Remove from project + type index
    const ptKey = this.projectTypeKey(node.projectId, node.type);
    const ptSet = this.nodesByProjectAndType.get(ptKey);
    if (ptSet) {
      ptSet.delete(id);
      if (ptSet.size === 0) this.nodesByProjectAndType.delete(ptKey);
    }

    this.adjacency.delete(id);
    this.reverseAdjacency.delete(id);
    this.nodes.delete(id);
  }

  removeEdge(id: string): void {
    this.removeEdgeInternal(id);
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Scoped O(1) file lookup by project and path.
   * Preferred over `getFileByPath` in multi-project graphs.
   */
  getFileByPathInProject(projectId: string, path: string): FileNode | undefined {
    const key = this.filePathKey(projectId, path);
    const nodeId = this.filesByPath.get(key);
    if (!nodeId) return undefined;
    return this.nodes.get(nodeId) as FileNode | undefined;
  }

  /**
   * Legacy single-project lookup — searches all projects for a matching path.
   * Works correctly when only one project is loaded.
   * In multi-project graphs, returns the first match (non-deterministic) and
   * logs a one-time warning if multiple projects are present.
   *
   * @deprecated Prefer `getFileByPathInProject(projectId, path)` in new callers.
   */
  getFileByPath(path: string): FileNode | undefined {
    // Fast path: single project
    if (this.nodesByProject.size <= 1) {
      for (const [key, nodeId] of this.filesByPath) {
        if (key.endsWith(`:${path}`)) {
          return this.nodes.get(nodeId) as FileNode | undefined;
        }
      }
      return undefined;
    }

    // Multi-project: warn once, return first match
    if (!InMemoryGraph._multiProjectWarned) {
      InMemoryGraph._multiProjectWarned = true;
      console.warn(
        '[InMemoryGraph] getFileByPath() called on a multi-project graph. ' +
          'Use getFileByPathInProject(projectId, path) to avoid cross-project collisions.',
      );
    }

    for (const [key, nodeId] of this.filesByPath) {
      if (key.endsWith(`:${path}`)) {
        return this.nodes.get(nodeId) as FileNode | undefined;
      }
    }
    return undefined;
  }

  /** Reset the multi-project warning (useful in tests). */
  static resetWarnings(): void {
    InMemoryGraph._multiProjectWarned = false;
  }

  private static _multiProjectWarned = false;

  getModuleByName(name: string): ModuleNode | undefined {
    const nodeId = this.modulesByName.get(name);
    if (!nodeId) return undefined;
    return this.nodes.get(nodeId) as ModuleNode | undefined;
  }

  // ---------------------------------------------------------------------------
  // Edge Queries
  // ---------------------------------------------------------------------------

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.adjacency.get(nodeId);
    if (!edgeIds) return [];
    const result: GraphEdge[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge) result.push(edge);
    }
    return result;
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    const edgeIds = this.reverseAdjacency.get(nodeId);
    if (!edgeIds) return [];
    const result: GraphEdge[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId);
      if (edge) result.push(edge);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Traversal
  // ---------------------------------------------------------------------------

  /**
   * BFS traversal from a node, following both outgoing and incoming edges.
   * Returns neighbors up to `depth` hops away (default 1).
   * Does NOT include the starting node.
   */
  getNeighbors(nodeId: string, depth = 1): GraphNode[] {
    const visited = new Set<string>();
    visited.add(nodeId);

    let frontier = [nodeId];

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = [];

      for (const currentId of frontier) {
        // Follow outgoing edges
        const outEdgeIds = this.adjacency.get(currentId);
        if (outEdgeIds) {
          for (const edgeId of outEdgeIds) {
            const edge = this.edges.get(edgeId);
            if (edge && !visited.has(edge.targetId)) {
              visited.add(edge.targetId);
              nextFrontier.push(edge.targetId);
            }
          }
        }

        // Follow incoming edges
        const inEdgeIds = this.reverseAdjacency.get(currentId);
        if (inEdgeIds) {
          for (const edgeId of inEdgeIds) {
            const edge = this.edges.get(edgeId);
            if (edge && !visited.has(edge.sourceId)) {
              visited.add(edge.sourceId);
              nextFrontier.push(edge.sourceId);
            }
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }

    // Collect all visited nodes except the start
    visited.delete(nodeId);
    const result: GraphNode[] = [];
    for (const id of visited) {
      const node = this.nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Filtered Queries
  // ---------------------------------------------------------------------------

  getNodesByType(type: NodeType): GraphNode[] {
    const result: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.type === type) result.push(node);
    }
    return result;
  }

  /**
   * O(k) project lookup via the incremental index (k = nodes in the project).
   * No longer performs a full scan of all nodes.
   */
  getNodesByProject(projectId: string): GraphNode[] {
    const idSet = this.nodesByProject.get(projectId);
    if (!idSet) return [];
    const result: GraphNode[] = [];
    for (const id of idSet) {
      const node = this.nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  }

  /**
   * O(k) typed project lookup (k = nodes of that type in the project).
   * Equivalent to `getNodesByProject(pid).filter(n => n.type === type)` but O(k) instead of O(n).
   */
  getNodesByProjectAndType(projectId: string, type: NodeType): GraphNode[] {
    const key = this.projectTypeKey(projectId, type);
    const idSet = this.nodesByProjectAndType.get(key);
    if (!idSet) return [];
    const result: GraphNode[] = [];
    for (const id of idSet) {
      const node = this.nodes.get(id);
      if (node) result.push(node);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Bulk Access
  // ---------------------------------------------------------------------------

  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  getAllEdges(): GraphEdge[] {
    return [...this.edges.values()];
  }

  clear(): void {
    this.nodes.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
    this.edges.clear();
    this.filesByPath.clear();
    this.modulesByName.clear();
    this.nodesByProject.clear();
    this.nodesByProjectAndType.clear();
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  get stats(): { nodes: number; edges: number; files: number; modules: number } {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      files: this.filesByPath.size,
      modules: this.modulesByName.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Remove an edge from all indices without triggering recursive cleanup.
   */
  private removeEdgeInternal(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) return;

    // Remove from source's outgoing set
    const outSet = this.adjacency.get(edge.sourceId);
    if (outSet) outSet.delete(id);

    // Remove from target's incoming set
    const inSet = this.reverseAdjacency.get(edge.targetId);
    if (inSet) inSet.delete(id);

    this.edges.delete(id);
  }
}
