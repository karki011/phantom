/**
 * GraphEngineService — Manages graph instances for all projects
 * LRU cache: max 3 projects in memory, hydrate from SQLite on demand
 * @author Subash Karki
 */
import { db, sqlite, projects, worktrees } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import {
  EventBus,
  InMemoryGraph,
  GraphBuilder,
  GraphQuery,
  GraphPersistence,
  IncrementalUpdater,
  FileWatcher,
  ASTEnricher,
} from '@phantom-os/ai-engine';
import type { GraphStats } from '@phantom-os/ai-engine';
import { logger } from '../logger.js';

type BroadcastFn = (event: string, data: unknown) => void;

/** Build lifecycle status for a single project. */
export type BuildStatusState = 'idle' | 'building' | 'ready' | 'error';

export interface BuildStatus {
  projectId: string;
  status: BuildStatusState;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
}

interface ProjectGraphContext {
  graph: InMemoryGraph;
  builder: GraphBuilder;
  query: GraphQuery;
  updater: IncrementalUpdater;
  watcher: FileWatcher;
  repoPath: string;
}

/** Max projects to keep in memory simultaneously */
const MAX_IN_MEMORY = 3;

class GraphEngineService {
  /** LRU-ordered: most recently used at the end */
  private lru: string[] = [];
  private instances = new Map<string, ProjectGraphContext>();
  private eventBus = new EventBus();
  private persistence = new GraphPersistence(sqlite);
  private broadcast: BroadcastFn = () => {};
  private unsubscribe: (() => void) | null = null;
  private enriching = new Set<string>();
  /** Per-project build lifecycle status. Also acts as the in-flight guard (status === 'building'). */
  private buildStatuses = new Map<string, BuildStatus>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  init(broadcast: BroadcastFn): void {
    this.broadcast = broadcast;

    this.unsubscribe = this.eventBus.onAll((event) => {
      this.broadcast('graph', event);
    });

    // Check all projects — build graphs for any that don't have persisted data
    // Limit concurrent builds to MAX_IN_MEMORY to avoid EMFILE from too many watchers
    const allProjects = db.select().from(projects).all();
    const needsBuild: typeof allProjects = [];
    for (const project of allProjects) {
      const meta = this.persistence.loadMeta(project.id);
      if (!meta || meta.fileCount === 0) {
        needsBuild.push(project);
      }
    }

    // Build only the first batch immediately; the rest will build on-demand when accessed
    const immediateBuild = needsBuild.slice(0, MAX_IN_MEMORY);
    for (const project of immediateBuild) {
      void this.buildProject(project.id, project.repoPath);
    }

    logger.info('GraphEngine', `Initialized (LRU mode, max ${MAX_IN_MEMORY} in memory). Building ${immediateBuild.length}/${needsBuild.length} projects now, rest on-demand.`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async buildProject(projectId: string, repoPath: string): Promise<void> {
    if (this.buildStatuses.get(projectId)?.status === 'building') {
      logger.info('GraphEngine', `Build already in progress for ${projectId} — skipping`);
      return;
    }

    const startTime = Date.now();
    this.buildStatuses.set(projectId, { projectId, status: 'building', startedAt: startTime });

    logger.info('GraphEngine', `Building graph for project ${projectId} at ${repoPath}`);

    const ctx = this.ensureContext(projectId, repoPath);

    // Clear in-memory graph before rebuild so old nodes don't linger
    ctx.graph.clear();

    try {
      await ctx.builder.buildProject(projectId, repoPath);

      if (!this.instances.has(projectId)) {
        logger.info('GraphEngine', `Project ${projectId} removed during build — skipping persist`);
        return;
      }

      // Clear old persisted data before saving fresh build
      this.persistence.deleteProject(projectId);
      this.persistGraph(projectId, ctx);

      const stats = ctx.query.getStats(projectId);
      stats.lastBuiltAt = Date.now();
      this.persistence.saveMeta(stats);

      const durationMs = Date.now() - startTime;
      logger.info(
        'GraphEngine',
        `Graph built for ${projectId}: ${stats.fileCount} files, ${stats.totalEdges} edges in ${durationMs}ms`,
      );

      // Record successful build finish
      this.buildStatuses.set(projectId, {
        projectId,
        status: 'ready',
        startedAt: startTime,
        finishedAt: Date.now(),
        durationMs,
      });

      // Only start file watcher if this project is within the LRU limit
      // to avoid EMFILE errors from too many concurrent watchers
      if (!ctx.watcher.isWatching() && this.lru.indexOf(projectId) >= this.lru.length - MAX_IN_MEMORY) {
        ctx.watcher.start();
      }

      void this.enrichProject(projectId, repoPath, ctx);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('GraphEngine', `Graph build failed for project ${projectId}:`, err);
      // Record error status
      this.buildStatuses.set(projectId, {
        projectId,
        status: 'error',
        startedAt: startTime,
        finishedAt: Date.now(),
        durationMs: Date.now() - startTime,
        error: errMsg,
      });
    }
  }

  /** Return the current build lifecycle status for a project (idle if never built). */
  getBuildStatus(projectId: string): BuildStatus {
    return this.buildStatuses.get(projectId) ?? { projectId, status: 'idle' };
  }

  getQuery(projectId: string): GraphQuery | null {
    const ctx = this.resolve(projectId);
    return ctx?.query ?? null;
  }

  getStats(projectId: string): GraphStats | null {
    const ctx = this.resolve(projectId);
    if (!ctx) return null;
    return ctx.query.getStats(projectId);
  }

  /** Get stats for all projects in one call (from persisted meta) */
  getAllStats(): Record<string, { fileCount: number; totalEdges: number }> {
    const allMeta = this.persistence.loadAllMeta();
    const result: Record<string, { fileCount: number; totalEdges: number }> = {};
    for (const meta of allMeta) {
      result[meta.projectId] = { fileCount: meta.fileCount, totalEdges: meta.totalEdges };
    }
    return result;
  }

  /** Get all file paths in the graph for a project */
  getFileList(projectId: string): Array<{ path: string }> {
    const ctx = this.resolve(projectId);
    if (!ctx) return [];
    return ctx.graph
      .getNodesByProject(projectId)
      .filter((n) => n.type === 'file')
      .map((n) => ({ path: (n as { path: string }).path }));
  }

  removeProject(projectId: string): void {
    const ctx = this.instances.get(projectId);
    if (ctx) {
      ctx.watcher.stop();
      ctx.updater.destroy();
      ctx.graph.clear();
      this.instances.delete(projectId);
      this.lru = this.lru.filter((id) => id !== projectId);
    }

    this.buildStatuses.delete(projectId);

    try {
      this.persistence.deleteProject(projectId);
    } catch (err) {
      logger.warn('GraphEngine', `Failed to delete persisted graph for ${projectId}:`, err);
    }

    logger.info('GraphEngine', `Removed graph for project ${projectId}`);
  }

  destroy(): void {
    for (const [, ctx] of this.instances) {
      ctx.watcher.stop();
      ctx.updater.destroy();
      ctx.graph.clear();
    }
    this.instances.clear();
    this.lru = [];

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.eventBus.removeAll();
    logger.info('GraphEngine', 'Destroyed');
  }

  // ---------------------------------------------------------------------------
  // LRU Management
  // ---------------------------------------------------------------------------

  /**
   * Resolve a project context — hydrate from SQLite if not in memory.
   * Returns null if no persisted data exists.
   */
  private resolve(projectId: string): ProjectGraphContext | null {
    // Already in memory — touch LRU
    if (this.instances.has(projectId)) {
      this.touch(projectId);
      const ctx = this.instances.get(projectId);
      if (ctx) return ctx;
    }

    // Try to hydrate from SQLite
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (project) {
      const hydrated = this.hydrateProject(projectId, project.repoPath);
      return hydrated ? (this.instances.get(projectId) ?? null) : null;
    }

    // Not a project — check if it's a worktree and fall back to parent project's graph
    const wt = db.select({ projectId: worktrees.projectId })
      .from(worktrees)
      .where(eq(worktrees.id, projectId))
      .get();
    if (wt?.projectId) {
      if (wt.projectId === projectId) {
        logger.warn('GraphEngine', `Worktree ${projectId} references itself — skipping`);
        return null;
      }
      logger.debug('GraphEngine', `Worktree ${projectId} → using parent project ${wt.projectId} graph`);
      return this.resolve(wt.projectId);
    }

    return null;
  }

  /**
   * Ensure a context exists (for builds). Creates fresh if not in memory.
   */
  private ensureContext(projectId: string, repoPath: string): ProjectGraphContext {
    if (this.instances.has(projectId)) {
      this.touch(projectId);
      const ctx = this.instances.get(projectId);
      if (ctx) return ctx;
    }
    return this.createContext(projectId, repoPath);
  }

  /** Move a project to the end of the LRU (most recently used) */
  private touch(projectId: string): void {
    this.lru = this.lru.filter((id) => id !== projectId);
    this.lru.push(projectId);
  }

  /** Evict the least recently used project if over capacity */
  private evictIfNeeded(): void {
    let safety = this.lru.length;
    while (this.lru.length > MAX_IN_MEMORY) {
      if (--safety < 0) {
        logger.warn('GraphEngine', 'All in-memory projects are building/enriching — cannot evict');
        break;
      }

      const evictId = this.lru.shift();
      if (!evictId) break;

      // Don't evict projects with active builds
      if (this.buildStatuses.get(evictId)?.status === 'building' || this.enriching.has(evictId)) {
        this.lru.push(evictId); // put it back
        continue;
      }

      const ctx = this.instances.get(evictId);
      if (ctx) {
        // Persist before evicting
        this.persistGraph(evictId, ctx);
        ctx.watcher.stop();
        ctx.updater.destroy();
        ctx.graph.clear();
        this.instances.delete(evictId);
        logger.debug('GraphEngine', `Evicted project ${evictId} from memory (LRU)`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async enrichProject(
    projectId: string,
    repoPath: string,
    ctx: ProjectGraphContext,
  ): Promise<void> {
    if (this.enriching.has(projectId)) {
      logger.info('GraphEngine', `Enrichment already in progress for ${projectId} — skipping`);
      return;
    }
    this.enriching.add(projectId);

    try {
      const enricher = new ASTEnricher(ctx.graph, this.eventBus);
      await enricher.enrichProject(projectId, repoPath);

      if (!this.instances.has(projectId)) {
        logger.info('GraphEngine', `Project ${projectId} removed during enrichment — skipping persist`);
        return;
      }

      this.persistence.deleteProject(projectId);
      this.persistGraph(projectId, ctx);

      const stats = ctx.query.getStats(projectId);
      stats.lastUpdatedAt = Date.now();
      this.persistence.saveMeta(stats);

      logger.info(
        'GraphEngine',
        `Layer 2 enrichment complete for ${projectId}: ${stats.layer2Count} AST nodes`,
      );
    } catch (err) {
      logger.error('GraphEngine', `Layer 2 enrichment failed for project ${projectId}:`, err);
    } finally {
      this.enriching.delete(projectId);
    }
  }

  private persistGraph(projectId: string, ctx: ProjectGraphContext): void {
    const allNodes = ctx.graph.getAllNodes();
    const allEdges = ctx.graph.getAllEdges();
    this.persistence.saveNodes(allNodes);
    this.persistence.saveEdges(allEdges);
  }

  private createContext(projectId: string, repoPath: string): ProjectGraphContext {
    this.evictIfNeeded();

    const graph = new InMemoryGraph();
    const builder = new GraphBuilder(graph, this.eventBus);
    const query = new GraphQuery(graph, projectId);
    const updater = new IncrementalUpdater(graph, builder, this.eventBus, projectId, repoPath);
    const watcher = new FileWatcher(updater, repoPath, this.eventBus);
    watcher.setProjectId(projectId);

    const ctx: ProjectGraphContext = { graph, builder, query, updater, watcher, repoPath };
    this.instances.set(projectId, ctx);
    this.touch(projectId);
    return ctx;
  }

  private hydrateProject(projectId: string, repoPath: string): boolean {
    const nodes = this.persistence.loadNodes(projectId);
    const edges = this.persistence.loadEdges(projectId);

    if (nodes.length === 0) return false;

    const ctx = this.createContext(projectId, repoPath);

    for (const node of nodes) {
      ctx.graph.addNode(node);
    }
    for (const edge of edges) {
      ctx.graph.addEdge(edge);
    }

    // Only start file watcher if within LRU limit to avoid EMFILE
    if (!ctx.watcher.isWatching() && this.instances.size <= MAX_IN_MEMORY) {
      ctx.watcher.start();
    }

    logger.debug(
      'GraphEngine',
      `Hydrated graph for ${projectId}: ${nodes.length} nodes, ${edges.length} edges`,
    );
    return true;
  }
}

/** Singleton instance */
export const graphEngine = new GraphEngineService();
