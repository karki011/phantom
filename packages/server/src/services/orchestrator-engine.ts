/**
 * OrchestratorEngineService — Manages AI strategy orchestrators per project
 * LRU cache mirrors GraphEngineService. Creates Orchestrator + StrategyRegistry
 * + KnowledgeDB per project, wired to the existing graph engine.
 * @author Subash Karki
 */
import {
  Orchestrator,
  StrategyRegistry,
  EventBus,
  GraphQuery,
  KnowledgeDB,
  KnowledgeWriter,
  Compactor,
  DecisionQuery,
  DirectStrategy,
  AdvisorStrategy,
  SelfRefineStrategy,
  TreeOfThoughtStrategy,
  DebateStrategy,
  GraphOfThoughtStrategy,
  StrategyPerformanceStore,
} from '@phantom-os/ai-engine';
import type { GoalInput, OrchestratorResult } from '@phantom-os/ai-engine';
import { graphEngine } from './graph-engine.js';
import { logger } from '../logger.js';

type BroadcastFn = (event: string, data: unknown) => void;

interface ProjectOrchestratorContext {
  orchestrator: Orchestrator;
  registry: StrategyRegistry;
  knowledgeDb: KnowledgeDB;
  eventBus: EventBus;
}

const MAX_IN_MEMORY = 3;

class OrchestratorEngineService {
  private lru: string[] = [];
  private instances = new Map<string, ProjectOrchestratorContext>();
  private broadcast: BroadcastFn = () => {};
  private globalListeners = new Set<(event: import('@phantom-os/ai-engine').GraphEvent) => void>();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  init(broadcast: BroadcastFn): void {
    this.broadcast = broadcast;
    logger.info('OrchestratorEngine', `Initialized (LRU mode, max ${MAX_IN_MEMORY} in memory)`);
  }

  /**
   * Subscribe to all orchestrator knowledge events across all projects.
   * Returns an unsubscribe function.
   */
  onEvent(listener: (event: import('@phantom-os/ai-engine').GraphEvent) => void): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  destroy(): void {
    for (const [, ctx] of this.instances) {
      ctx.knowledgeDb.close();
      ctx.eventBus.removeAll();
    }
    this.instances.clear();
    this.lru = [];
    this.globalListeners.clear();
    logger.info('OrchestratorEngine', 'Destroyed');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a goal through the orchestrator pipeline for a project.
   * Lazily creates the orchestrator context if it doesn't exist.
   */
  async process(input: GoalInput): Promise<OrchestratorResult> {
    const ctx = this.resolve(input.projectId);
    if (!ctx) {
      throw new Error(`Cannot create orchestrator for project ${input.projectId} — no graph available`);
    }
    return ctx.orchestrator.process(input);
  }

  /**
   * Process with auto-escalation retry.
   */
  async processWithRetry(input: GoalInput, maxRetries = 2): Promise<OrchestratorResult> {
    const ctx = this.resolve(input.projectId);
    if (!ctx) {
      throw new Error(`Cannot create orchestrator for project ${input.projectId} — no graph available`);
    }
    return ctx.orchestrator.processWithRetry(input, maxRetries);
  }

  /**
   * Get available strategies and their enabled state for a project.
   */
  getStrategies(projectId: string): Array<{ id: string; name: string; enabled: boolean; description: string }> {
    const ctx = this.resolve(projectId);
    if (!ctx) return [];
    return ctx.registry.getAll().map((entry) => ({
      id: entry.strategy.id,
      name: entry.strategy.name,
      enabled: entry.enabled,
      description: entry.strategy.description,
    }));
  }

  /**
   * Get recent decisions from the knowledge DB.
   */
  getHistory(projectId: string, limit = 20): Array<Record<string, unknown>> {
    const ctx = this.resolve(projectId);
    if (!ctx) return [];

    try {
      const rows = ctx.knowledgeDb.db.prepare(`
        SELECT d.id, d.goal, d.strategy_id, d.strategy_name, d.confidence,
               d.complexity, d.risk, d.duration_ms, d.created_at,
               o.success, o.evaluation_score, o.recommendation, o.failure_reason
        FROM decisions d
        LEFT JOIN outcomes o ON o.decision_id = d.id
        WHERE d.project_id = ?
        ORDER BY d.created_at DESC
        LIMIT ?
      `).all(projectId, limit) as Array<Record<string, unknown>>;

      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Remove a project's orchestrator context.
   */
  removeProject(projectId: string): void {
    const ctx = this.instances.get(projectId);
    if (ctx) {
      ctx.knowledgeDb.close();
      ctx.eventBus.removeAll();
      this.instances.delete(projectId);
      this.lru = this.lru.filter((id) => id !== projectId);
    }
  }

  // ---------------------------------------------------------------------------
  // LRU Management
  // ---------------------------------------------------------------------------

  private resolve(projectId: string): ProjectOrchestratorContext | null {
    if (this.instances.has(projectId)) {
      this.touch(projectId);
      return this.instances.get(projectId) ?? null;
    }

    // Lazily create — requires a graph to exist
    const graphQuery = graphEngine.getQuery(projectId);
    if (!graphQuery) return null;

    return this.createContext(projectId, graphQuery);
  }

  private createContext(projectId: string, graphQuery: GraphQuery): ProjectOrchestratorContext {
    this.evictIfNeeded();

    const eventBus = new EventBus();
    const knowledgeDb = new KnowledgeDB(projectId);
    const decisionQuery = new DecisionQuery(knowledgeDb);
    const knowledgeWriter = new KnowledgeWriter(knowledgeDb, eventBus);
    const compactor = new Compactor(knowledgeDb, eventBus);
    const performanceStore = new StrategyPerformanceStore(knowledgeDb);

    // Build strategy registry with all strategies
    const registry = new StrategyRegistry();
    registry.setPerformanceStore(performanceStore);

    registry.register(new DirectStrategy(), 10);       // highest priority fallback
    registry.register(new AdvisorStrategy(), 5);
    registry.register(new SelfRefineStrategy(), 4);
    registry.register(new TreeOfThoughtStrategy(), 3);
    registry.register(new DebateStrategy(), 2);
    registry.register(new GraphOfThoughtStrategy(), 1);

    // Build orchestrator
    const orchestrator = new Orchestrator(graphQuery, registry, {
      knowledgeWriter,
      compactor,
      decisionQuery,
    });

    // Forward knowledge events to SSE and global listeners
    eventBus.onAll((event) => {
      const type = (event as { type?: string }).type ?? '';
      if (type.startsWith('knowledge:')) {
        this.broadcast('orchestrator', event);
        for (const listener of this.globalListeners) {
          try { listener(event); } catch { /* non-fatal */ }
        }
      }
    });

    const ctx: ProjectOrchestratorContext = { orchestrator, registry, knowledgeDb, eventBus };
    this.instances.set(projectId, ctx);
    this.touch(projectId);

    logger.info('OrchestratorEngine', `Created orchestrator for project ${projectId} (6 strategies registered)`);
    return ctx;
  }

  private touch(projectId: string): void {
    this.lru = this.lru.filter((id) => id !== projectId);
    this.lru.push(projectId);
  }

  private evictIfNeeded(): void {
    while (this.lru.length >= MAX_IN_MEMORY) {
      const evictId = this.lru.shift();
      if (!evictId) break;

      const ctx = this.instances.get(evictId);
      if (ctx) {
        ctx.knowledgeDb.close();
        ctx.eventBus.removeAll();
        this.instances.delete(evictId);
        logger.debug('OrchestratorEngine', `Evicted project ${evictId} from memory (LRU)`);
      }
    }
  }
}

/** Singleton instance */
export const orchestratorEngine = new OrchestratorEngineService();
