/**
 * GraphQuery — High-level query API for the in-memory graph
 * Provides context selection, blast radius analysis, and related file discovery
 *
 * @author Subash Karki
 */
import type { InMemoryGraph } from './in-memory-graph.js';
import type {
  BlastRadiusResult,
  ContextResult,
  DocumentNode,
  FileNode,
  GraphEdge,
  GraphNode,
  GraphStats,
  ModuleNode,
} from '../types/graph.js';

export class GraphQuery {
  constructor(private graph: InMemoryGraph) {}

  /**
   * Get relevant context for a given file path.
   * Returns the file, its direct dependencies, and their connections.
   */
  getContext(filePath: string, depth = 2): ContextResult {
    const root = this.graph.getFileByPath(filePath);
    if (!root) {
      return { files: [], edges: [], modules: [], documents: [], scores: new Map() };
    }

    const visited = new Set<string>();
    const files: FileNode[] = [];
    const edges: GraphEdge[] = [];
    const modules: ModuleNode[] = [];
    const documents: DocumentNode[] = [];
    const scores = new Map<string, number>();

    // BFS from root node
    const queue: Array<{ nodeId: string; currentDepth: number }> = [
      { nodeId: root.id, currentDepth: 0 },
    ];
    visited.add(root.id);

    while (queue.length > 0) {
      const { nodeId, currentDepth } = queue.shift()!;
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      // Score decreases with distance from root
      const score = 1 / (1 + currentDepth);

      if (node.type === 'file') {
        files.push(node as FileNode);
        scores.set(node.id, score);
      } else if (node.type === 'module') {
        modules.push(node as ModuleNode);
      } else if (node.type === 'document') {
        documents.push(node as DocumentNode);
      }

      // Collect edges and traverse neighbors
      if (currentDepth < depth) {
        const outgoing = this.graph.getOutgoingEdges(nodeId);
        const incoming = this.graph.getIncomingEdges(nodeId);

        for (const edge of [...outgoing, ...incoming]) {
          edges.push(edge);
          const neighborId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push({ nodeId: neighborId, currentDepth: currentDepth + 1 });
          }
        }
      }
    }

    // Deduplicate edges
    const uniqueEdges = [...new Map(edges.map((e) => [e.id, e])).values()];

    return { files, edges: uniqueEdges, modules, documents, scores };
  }

  /**
   * Calculate the blast radius of changing a file.
   * Direct: files that import this file.
   * Transitive: files that transitively depend on this file.
   */
  getBlastRadius(filePath: string): BlastRadiusResult {
    const root = this.graph.getFileByPath(filePath);
    if (!root) {
      return { direct: [], transitive: [], impactScore: 0 };
    }

    const direct: FileNode[] = [];
    const transitive: FileNode[] = [];
    const visited = new Set<string>([root.id]);

    // Direct dependents — files that import this file
    const incoming = this.graph.getIncomingEdges(root.id);
    for (const edge of incoming) {
      if (edge.type === 'imports' && !visited.has(edge.sourceId)) {
        const node = this.graph.getNode(edge.sourceId);
        if (node?.type === 'file') {
          direct.push(node as FileNode);
          visited.add(node.id);
        }
      }
    }

    // Transitive dependents — BFS from direct dependents
    const queue = direct.map((f) => f.id);
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const nodeIncoming = this.graph.getIncomingEdges(nodeId);
      for (const edge of nodeIncoming) {
        if (edge.type === 'imports' && !visited.has(edge.sourceId)) {
          const node = this.graph.getNode(edge.sourceId);
          if (node?.type === 'file') {
            transitive.push(node as FileNode);
            visited.add(node.id);
            queue.push(node.id);
          }
        }
      }
    }

    // Impact score: normalized by total file count
    const totalFiles = this.graph.stats.files;
    const impactCount = direct.length + transitive.length;
    const impactScore = totalFiles > 0 ? impactCount / totalFiles : 0;

    return { direct, transitive, impactScore };
  }

  /**
   * Find files related to a set of file paths.
   * Useful for "given these changed files, what else might be affected?"
   */
  getRelatedFiles(filePaths: string[], depth = 1): FileNode[] {
    const seen = new Set<string>();
    const result: FileNode[] = [];

    for (const fp of filePaths) {
      const root = this.graph.getFileByPath(fp);
      if (!root) continue;
      seen.add(root.id);
    }

    for (const fp of filePaths) {
      const root = this.graph.getFileByPath(fp);
      if (!root) continue;

      const neighbors = this.graph.getNeighbors(root.id, depth);
      for (const neighbor of neighbors) {
        if (neighbor.type === 'file' && !seen.has(neighbor.id)) {
          seen.add(neighbor.id);
          result.push(neighbor as FileNode);
        }
      }
    }

    return result;
  }

  /**
   * Get graph statistics for a project.
   */
  getStats(projectId: string): GraphStats {
    const allNodes = this.graph.getNodesByProject(projectId);
    const allEdges = this.graph.getAllEdges().filter((e) => e.projectId === projectId);
    const files = allNodes.filter((n) => n.type === 'file');
    const modules = allNodes.filter((n) => n.type === 'module');
    const layer2 = allNodes.filter(
      (n) => n.type === 'function' || n.type === 'class' || n.type === 'type' || n.type === 'component',
    );

    return {
      projectId,
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      fileCount: files.length,
      moduleCount: modules.length,
      layer2Count: layer2.length,
      lastBuiltAt: 0,
      lastUpdatedAt: Date.now(),
      coverage: files.length > 0 ? 100 : 0,
    };
  }

  /**
   * Find the shortest path between two files.
   * Returns the file nodes along the path, or empty if no path exists.
   */
  findPath(fromPath: string, toPath: string): FileNode[] {
    const from = this.graph.getFileByPath(fromPath);
    const to = this.graph.getFileByPath(toPath);
    if (!from || !to) return [];
    if (from.id === to.id) return [from];

    // BFS shortest path
    const visited = new Set<string>([from.id]);
    const parent = new Map<string, string>();
    const queue = [from.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to.id) break;

      const outgoing = this.graph.getOutgoingEdges(current);
      const incoming = this.graph.getIncomingEdges(current);
      for (const edge of [...outgoing, ...incoming]) {
        const neighborId = edge.sourceId === current ? edge.targetId : edge.sourceId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parent.set(neighborId, current);
          queue.push(neighborId);
        }
      }
    }

    if (!parent.has(to.id) && from.id !== to.id) return [];

    // Reconstruct path
    const path: FileNode[] = [];
    let current: string | undefined = to.id;
    while (current !== undefined) {
      const node = this.graph.getNode(current);
      if (node?.type === 'file') path.unshift(node as FileNode);
      current = parent.get(current);
    }

    return path;
  }
}
