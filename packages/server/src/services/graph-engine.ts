/**
 * GraphEngineService — Manages graph instances for all projects
 * Singleton: one InMemoryGraph per project, shared EventBus, SQLite persistence
 * @author Subash Karki
 */
import { db, sqlite, projects } from '@phantom-os/db';
import {
  EventBus,
  InMemoryGraph,
  GraphBuilder,
  GraphQuery,
  GraphPersistence,
  IncrementalUpdater,
  ASTEnricher,
} from '@phantom-os/ai-engine';
import type { GraphStats } from '@phantom-os/ai-engine';
import { logger } from '../logger.js';

type BroadcastFn = (event: string, data: unknown) => void;

interface ProjectGraphContext {
  graph: InMemoryGraph;
  builder: GraphBuilder;
  query: GraphQuery;
  updater: IncrementalUpdater;
}

class GraphEngineService {
  private instances = new Map<string, ProjectGraphContext>();
  private eventBus = new EventBus();
  private persistence = new GraphPersistence(sqlite);
  private broadcast: BroadcastFn = () => {};
  private unsubscribe: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the graph engine with the SSE broadcast function.
   * Loads existing graphs from SQLite for all known projects.
   */
  init(broadcast: BroadcastFn): void {
    this.broadcast = broadcast;

    // Forward all graph events to SSE
    this.unsubscribe = this.eventBus.onAll((event) => {
      this.broadcast('graph', event);
    });

    // Hydrate graphs from SQLite for all existing projects
    const allProjects = db.select().from(projects).all();

    for (const project of allProjects) {
      try {
        this.hydrateProject(project.id, project.repoPath);
      } catch (err) {
        logger.warn('GraphEngine', `Failed to hydrate graph for project ${project.id}:`, err);
      }
    }

    logger.info('GraphEngine', `Initialized with ${this.instances.size} project graph(s)`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Full Layer 1 build for a project. Runs in background (non-blocking).
   * After build completes, persists to SQLite.
   */
  async buildProject(projectId: string, repoPath: string): Promise<void> {
    const startTime = Date.now();
    logger.info('GraphEngine', `Building graph for project ${projectId} at ${repoPath}`);

    // Ensure context exists
    let ctx = this.instances.get(projectId);
    if (!ctx) {
      ctx = this.createContext(projectId, repoPath);
    }

    try {
      await ctx.builder.buildProject(projectId, repoPath);

      // Persist to SQLite after build
      const allNodes = ctx.graph.getAllNodes();
      const allEdges = ctx.graph.getAllEdges();
      this.persistence.saveNodes(allNodes);
      this.persistence.saveEdges(allEdges);

      const stats = ctx.query.getStats(projectId);
      stats.lastBuiltAt = Date.now();
      this.persistence.saveMeta(stats);

      const durationMs = Date.now() - startTime;
      logger.info(
        'GraphEngine',
        `Graph built for ${projectId}: ${stats.fileCount} files, ${stats.totalEdges} edges in ${durationMs}ms`,
      );

      // Trigger Layer 2 enrichment in background (non-blocking)
      void this.enrichProject(projectId, repoPath, ctx);
    } catch (err) {
      logger.error('GraphEngine', `Graph build failed for project ${projectId}:`, err);
    }
  }

  /**
   * Get the GraphQuery interface for a project.
   */
  getQuery(projectId: string): GraphQuery | null {
    return this.instances.get(projectId)?.query ?? null;
  }

  /**
   * Get graph stats for a project.
   */
  getStats(projectId: string): GraphStats | null {
    const ctx = this.instances.get(projectId);
    if (!ctx) return null;
    return ctx.query.getStats(projectId);
  }

  /**
   * Remove a project's graph from memory and SQLite.
   */
  removeProject(projectId: string): void {
    const ctx = this.instances.get(projectId);
    if (ctx) {
      ctx.updater.destroy();
      ctx.graph.clear();
      this.instances.delete(projectId);
    }

    try {
      this.persistence.deleteProject(projectId);
    } catch (err) {
      logger.warn('GraphEngine', `Failed to delete persisted graph for ${projectId}:`, err);
    }

    logger.info('GraphEngine', `Removed graph for project ${projectId}`);
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    for (const [projectId, ctx] of this.instances) {
      ctx.updater.destroy();
      ctx.graph.clear();
    }
    this.instances.clear();

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.eventBus.removeAll();
    logger.info('GraphEngine', 'Destroyed');
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Layer 2 AST enrichment — runs in background after Layer 1 completes.
   * Persists enriched nodes/edges and updates graph meta.
   */
  private async enrichProject(
    projectId: string,
    repoPath: string,
    ctx: ProjectGraphContext,
  ): Promise<void> {
    try {
      const enricher = new ASTEnricher(ctx.graph, this.eventBus);
      await enricher.enrichProject(projectId, repoPath);

      // Persist enriched nodes/edges to SQLite
      const allNodes = ctx.graph.getAllNodes();
      const allEdges = ctx.graph.getAllEdges();
      this.persistence.saveNodes(allNodes);
      this.persistence.saveEdges(allEdges);

      // Update layer2Count in graph meta
      const stats = ctx.query.getStats(projectId);
      stats.lastUpdatedAt = Date.now();
      this.persistence.saveMeta(stats);

      logger.info(
        'GraphEngine',
        `Layer 2 enrichment complete for ${projectId}: ${stats.layer2Count} AST nodes`,
      );
    } catch (err) {
      logger.error('GraphEngine', `Layer 2 enrichment failed for project ${projectId}:`, err);
    }
  }

  /**
   * Create a fresh graph context for a project.
   */
  private createContext(projectId: string, repoPath: string): ProjectGraphContext {
    const graph = new InMemoryGraph();
    const builder = new GraphBuilder(graph, this.eventBus);
    const query = new GraphQuery(graph);
    const updater = new IncrementalUpdater(graph, builder, this.eventBus, projectId, repoPath);

    const ctx: ProjectGraphContext = { graph, builder, query, updater };
    this.instances.set(projectId, ctx);
    return ctx;
  }

  /**
   * Load persisted graph data from SQLite into memory.
   */
  private hydrateProject(projectId: string, repoPath: string): void {
    const nodes = this.persistence.loadNodes(projectId);
    const edges = this.persistence.loadEdges(projectId);

    if (nodes.length === 0) {
      // No persisted data — skip hydration, build will happen on demand
      return;
    }

    const ctx = this.createContext(projectId, repoPath);

    for (const node of nodes) {
      ctx.graph.addNode(node);
    }
    for (const edge of edges) {
      ctx.graph.addEdge(edge);
    }

    logger.debug(
      'GraphEngine',
      `Hydrated graph for ${projectId}: ${nodes.length} nodes, ${edges.length} edges`,
    );
  }
}

/** Singleton instance */
export const graphEngine = new GraphEngineService();
