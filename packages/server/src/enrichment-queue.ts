/**
 * EnrichmentQueue — Manages a concurrency-limited queue of projects
 * that need their dependency graph built via GraphEngine.
 *
 * - Max 2 concurrent builds
 * - Active-first priority: prioritize() moves a queued item to position 0
 * - No duplicate enqueues (skip if already queued, building, or completed)
 * - Broadcasts SSE events via a BroadcastFn callback
 *
 * @author Subash Karki
 */

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BroadcastFn = (event: string, data: unknown) => void;

export interface EnrichmentItem {
  projectId: string;
  projectName: string;
  repoPath: string;
  status: 'queued' | 'building' | 'complete' | 'error';
}

/**
 * Structural interface for the graph engine — uses only the buildProject method.
 * Defined here to avoid importing the unexported GraphEngineService class,
 * which would create a circular dependency.
 */
type GraphEngine = {
  buildProject(projectId: string, repoPath: string): Promise<void>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 2;

// ---------------------------------------------------------------------------
// EnrichmentQueue implementation
// ---------------------------------------------------------------------------

class EnrichmentQueue {
  private broadcast: BroadcastFn = () => {};
  private graphEngine: GraphEngine | null = null;

  /** Items waiting to be built (in priority order). */
  private queue: EnrichmentItem[] = [];

  /** Items that are currently being built (max MAX_CONCURRENT). */
  private active: EnrichmentItem[] = [];

  /** Set of projectIds that have finished (complete or error). */
  private completed = new Set<string>();

  /** Total number of items ever enqueued in this session. */
  private totalEnqueued = 0;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Initialize with the broadcast function and graph engine reference. */
  init(broadcast: BroadcastFn, graphEngine: GraphEngine): void {
    this.broadcast = broadcast;
    this.graphEngine = graphEngine;
    logger.info('EnrichmentQueue', 'Initialized');
  }

  /**
   * Enqueue a project for graph building.
   * Silently skips duplicates (already queued, building, or completed).
   */
  enqueue(projectId: string, projectName: string, repoPath: string): void {
    if (this.isAlreadyTracked(projectId)) {
      logger.debug('EnrichmentQueue', `Skipping duplicate enqueue for ${projectId}`);
      return;
    }

    const item: EnrichmentItem = {
      projectId,
      projectName,
      repoPath,
      status: 'queued',
    };

    this.queue.push(item);
    this.totalEnqueued++;

    logger.info('EnrichmentQueue', `Enqueued project ${projectId} (${projectName}). Queue length: ${this.queue.length}`);

    this.broadcastProgress();
    this.drain();
  }

  /**
   * Move a queued project to the front of the queue (active-first priority).
   * Has no effect if the project is already building, completed, or not found.
   */
  prioritize(projectId: string): void {
    const idx = this.queue.findIndex((item) => item.projectId === projectId);
    if (idx === -1) {
      logger.debug('EnrichmentQueue', `prioritize: project ${projectId} not in queue — ignoring`);
      return;
    }

    if (idx === 0) return; // already at front

    const [item] = this.queue.splice(idx, 1);
    this.queue.unshift(item);

    logger.info('EnrichmentQueue', `Prioritized project ${projectId} to front of queue`);
    this.broadcastProgress();
  }

  /** Return a snapshot of the current queue state. */
  getStatus(): {
    completed: number;
    total: number;
    active: string[];
    items: EnrichmentItem[];
  } {
    return {
      completed: this.completed.size,
      total: this.totalEnqueued,
      active: this.active.map((i) => i.projectName),
      items: [
        ...this.active,
        ...this.queue,
        // completed items are not surfaced in items to keep the list clean
      ],
    };
  }

  /** Returns true if the project has finished enrichment (complete or error). */
  isEnriched(projectId: string): boolean {
    return this.completed.has(projectId);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Start as many queued builds as the concurrency limit allows.
   */
  private drain(): void {
    while (this.active.length < MAX_CONCURRENT && this.queue.length > 0) {
      const item = this.queue.shift()!;
      item.status = 'building';
      this.active.push(item);
      void this.runBuild(item);
    }
  }

  private async runBuild(item: EnrichmentItem): Promise<void> {
    if (!this.graphEngine) {
      logger.error('EnrichmentQueue', 'graphEngine not initialized — cannot build');
      this.finalize(item, 'error');
      return;
    }

    logger.info('EnrichmentQueue', `Starting graph build for ${item.projectId} (${item.projectName})`);

    this.broadcast('project:enrichment', {
      projectId: item.projectId,
      step: 'graph',
      status: 'building',
    });

    this.broadcastProgress();

    try {
      await this.graphEngine.buildProject(item.projectId, item.repoPath);

      logger.info('EnrichmentQueue', `Graph build complete for ${item.projectId}`);

      this.broadcast('project:enrichment', {
        projectId: item.projectId,
        step: 'graph',
        status: 'complete',
      });

      this.finalize(item, 'complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('EnrichmentQueue', `Graph build failed for ${item.projectId}: ${message}`);

      this.broadcast('project:enrichment', {
        projectId: item.projectId,
        step: 'graph',
        status: 'error',
      });

      this.finalize(item, 'error');
    }
  }

  /** Remove an item from the active list, record its outcome, then drain. */
  private finalize(item: EnrichmentItem, outcome: 'complete' | 'error'): void {
    item.status = outcome;
    this.active = this.active.filter((i) => i.projectId !== item.projectId);
    this.completed.add(item.projectId);

    this.broadcastProgress();
    this.drain();
  }

  private broadcastProgress(): void {
    this.broadcast('enrichment:progress', {
      completed: this.completed.size,
      total: this.totalEnqueued,
      active: this.active.map((i) => i.projectName),
    });
  }

  /** True if a project is already queued, actively building, or finished. */
  private isAlreadyTracked(projectId: string): boolean {
    if (this.completed.has(projectId)) return true;
    if (this.active.some((i) => i.projectId === projectId)) return true;
    if (this.queue.some((i) => i.projectId === projectId)) return true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** Singleton enrichment queue instance. Call init() once at server startup. */
export const enrichmentQueue = new EnrichmentQueue();
