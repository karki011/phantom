/**
 * GraphPersistence -- SQLite persistence for the in-memory graph
 * Saves/loads nodes and edges, handles batch operations via raw prepared statements.
 *
 * @author Subash Karki
 */
import type Database from 'better-sqlite3';
import type { GraphNode, GraphEdge, GraphStats } from '../types/graph.js';

export class GraphPersistence {
  private readonly sqlite: Database.Database;

  constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
  }

  // ---------------------------------------------------------------------------
  // Nodes
  // ---------------------------------------------------------------------------

  /** Batch upsert nodes to SQLite (transactional) */
  saveNodes(nodes: GraphNode[]): void {
    if (nodes.length === 0) return;

    const stmt = this.sqlite.prepare(`
      INSERT INTO graph_nodes (id, project_id, type, path, name, content_hash, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type        = excluded.type,
        path        = excluded.path,
        name        = excluded.name,
        content_hash = excluded.content_hash,
        metadata    = excluded.metadata,
        updated_at  = excluded.updated_at
    `);

    const run = this.sqlite.transaction((items: GraphNode[]) => {
      for (const node of items) {
        stmt.run(
          node.id,
          node.projectId,
          node.type,
          'path' in node ? (node as { path: string }).path : null,
          'name' in node ? (node as { name: string }).name : null,
          'contentHash' in node ? (node as { contentHash: string }).contentHash : null,
          JSON.stringify(node),  // Store the FULL node so Layer 2 fields survive round-trip
          node.createdAt,
          node.updatedAt,
        );
      }
    });

    run(nodes);
  }

  /** Load all nodes for a project */
  loadNodes(projectId: string): GraphNode[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM graph_nodes WHERE project_id = ?')
      .all(projectId) as Array<{
        id: string;
        project_id: string;
        type: string;
        path: string | null;
        name: string | null;
        content_hash: string | null;
        metadata: string | null;
        created_at: number;
        updated_at: number;
      }>;

    return rows.map((row) => {
      // Metadata column now stores the full serialized node (including Layer 2 fields)
      if (row.metadata) {
        try {
          return JSON.parse(row.metadata) as GraphNode;
        } catch {
          // Fall through to partial reconstruction
        }
      }

      // Fallback for legacy rows that don't have the full node in metadata
      const base = {
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        metadata: {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      if (row.path !== null) {
        return { ...base, path: row.path, contentHash: row.content_hash ?? '' } as unknown as GraphNode;
      }
      if (row.name !== null) {
        return { ...base, name: row.name } as unknown as GraphNode;
      }

      return base as unknown as GraphNode;
    });
  }

  // ---------------------------------------------------------------------------
  // Edges
  // ---------------------------------------------------------------------------

  /** Batch upsert edges to SQLite (transactional) */
  saveEdges(edges: GraphEdge[]): void {
    if (edges.length === 0) return;

    const stmt = this.sqlite.prepare(`
      INSERT INTO graph_edges (id, project_id, source_id, target_id, type, weight, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_id  = excluded.source_id,
        target_id  = excluded.target_id,
        type       = excluded.type,
        weight     = excluded.weight,
        metadata   = excluded.metadata,
        updated_at = excluded.updated_at
    `);

    const run = this.sqlite.transaction((items: GraphEdge[]) => {
      for (const edge of items) {
        stmt.run(
          edge.id,
          edge.projectId,
          edge.sourceId,
          edge.targetId,
          edge.type,
          edge.weight,
          JSON.stringify(edge.metadata),
          edge.createdAt,
          edge.updatedAt,
        );
      }
    });

    run(edges);
  }

  /** Load all edges for a project */
  loadEdges(projectId: string): GraphEdge[] {
    const rows = this.sqlite
      .prepare('SELECT * FROM graph_edges WHERE project_id = ?')
      .all(projectId) as Array<{
        id: string;
        project_id: string;
        source_id: string;
        target_id: string;
        type: string;
        weight: number | null;
        metadata: string | null;
        created_at: number;
        updated_at: number;
      }>;

    return rows.map((row) => {
      let metadata: Record<string, unknown> = {};
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
        } catch {
          // Corrupted metadata — default to empty object
        }
      }
      return {
        id: row.id,
        projectId: row.project_id,
        sourceId: row.source_id,
        targetId: row.target_id,
        type: row.type as GraphEdge['type'],
        weight: row.weight ?? 1,
        metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------------

  /** Save or update graph metadata for a project */
  saveMeta(stats: GraphStats): void {
    this.sqlite
      .prepare(`
        INSERT INTO graph_meta (project_id, last_built_at, last_updated_at, file_count, edge_count, layer2_count, coverage)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          last_built_at   = excluded.last_built_at,
          last_updated_at = excluded.last_updated_at,
          file_count      = excluded.file_count,
          edge_count      = excluded.edge_count,
          layer2_count    = excluded.layer2_count,
          coverage        = excluded.coverage
      `)
      .run(
        stats.projectId,
        stats.lastBuiltAt,
        stats.lastUpdatedAt,
        stats.fileCount,
        stats.totalEdges,
        stats.layer2Count,
        stats.coverage,
      );
  }

  /** Load graph metadata for a project */
  loadMeta(projectId: string): GraphStats | null {
    const row = this.sqlite
      .prepare('SELECT * FROM graph_meta WHERE project_id = ?')
      .get(projectId) as {
        project_id: string;
        last_built_at: number | null;
        last_updated_at: number | null;
        file_count: number | null;
        edge_count: number | null;
        layer2_count: number | null;
        coverage: number | null;
      } | undefined;

    if (!row) return null;

    return {
      projectId: row.project_id,
      totalNodes: (row.file_count ?? 0) + (row.layer2_count ?? 0),
      totalEdges: row.edge_count ?? 0,
      fileCount: row.file_count ?? 0,
      moduleCount: 0,
      layer2Count: row.layer2_count ?? 0,
      lastBuiltAt: row.last_built_at ?? 0,
      lastUpdatedAt: row.last_updated_at ?? 0,
      coverage: row.coverage ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Remove all graph data for a project (transactional) */
  deleteProject(projectId: string): void {
    const run = this.sqlite.transaction((pid: string) => {
      this.sqlite.prepare('DELETE FROM graph_edges WHERE project_id = ?').run(pid);
      this.sqlite.prepare('DELETE FROM graph_nodes WHERE project_id = ?').run(pid);
      this.sqlite.prepare('DELETE FROM graph_meta WHERE project_id = ?').run(pid);
    });

    run(projectId);
  }
}
