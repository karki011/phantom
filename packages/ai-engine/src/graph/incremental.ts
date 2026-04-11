/**
 * IncrementalUpdater — Watches for file changes and updates the graph incrementally
 * Hash-based change detection, re-parses only changed files
 *
 * @author Subash Karki
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { EventBus } from '../events/event-bus.js';
import type { FileNode } from '../types/graph.js';
import type { GraphBuilder } from './builder.js';
import type { InMemoryGraph } from './in-memory-graph.js';

export interface FileChange {
  path: string;
  type: 'add' | 'change' | 'unlink';
}

export class IncrementalUpdater {
  private pendingChanges: FileChange[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(
    private graph: InMemoryGraph,
    private builder: GraphBuilder,
    private eventBus: EventBus,
    private projectId: string,
    private rootDir: string,
    options?: { debounceMs?: number },
  ) {
    this.debounceMs = options?.debounceMs ?? 300;
  }

  /**
   * Queue a file change for processing.
   * Changes are debounced to batch rapid saves.
   */
  queueChange(change: FileChange): void {
    this.pendingChanges.push(change);

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /**
   * Process all pending changes immediately.
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingChanges.length === 0) return;

    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    // Deduplicate by path (keep last change type per path)
    const byPath = new Map<string, FileChange>();
    for (const change of changes) {
      byPath.set(change.path, change);
    }
    const unique = [...byPath.values()];

    this.eventBus.emit({
      type: 'graph:update:start',
      projectId: this.projectId,
      changedFiles: unique.map((c) => c.path),
      timestamp: Date.now(),
    });

    const startTime = Date.now();
    let updatedNodes = 0;
    let updatedEdges = 0;

    for (const change of unique) {
      const relPath = relative(this.rootDir, change.path);

      if (change.type === 'unlink') {
        const result = this.removeFile(relPath);
        updatedNodes += result.removedNodes;
        updatedEdges += result.removedEdges;
      } else {
        // add or change — check hash first
        const needsUpdate = await this.hasFileChanged(relPath);
        if (needsUpdate) {
          // Remove old data for this file, then rebuild
          this.removeFile(relPath);
          await this.builder.buildFile(this.projectId, this.rootDir, change.path);
          updatedNodes++;
          // Count new edges roughly from the graph
          const fileNode = this.graph.getFileByPath(relPath);
          if (fileNode) {
            updatedEdges += this.graph.getOutgoingEdges(fileNode.id).length;
          }
        }
      }
    }

    this.eventBus.emit({
      type: 'graph:update:complete',
      projectId: this.projectId,
      updatedNodes,
      updatedEdges,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a file has changed by comparing content hash.
   */
  private async hasFileChanged(relPath: string): Promise<boolean> {
    const existing = this.graph.getFileByPath(relPath) as FileNode | undefined;
    if (!existing) return true;

    try {
      const fullPath = join(this.rootDir, relPath);
      const content = await readFile(fullPath, 'utf-8');
      const hash = createHash('md5').update(content).digest('hex');
      return hash !== existing.contentHash;
    } catch {
      // File might have been deleted between check and read
      return true;
    }
  }

  /**
   * Remove a file and its connected edges from the graph.
   * Returns counts of removed items.
   */
  private removeFile(relPath: string): { removedNodes: number; removedEdges: number } {
    const existing = this.graph.getFileByPath(relPath);
    if (!existing) return { removedNodes: 0, removedEdges: 0 };

    const outgoing = this.graph.getOutgoingEdges(existing.id);
    const incoming = this.graph.getIncomingEdges(existing.id);
    const removedEdges = outgoing.length + incoming.length;

    this.graph.removeNode(existing.id); // cascades to edges
    return { removedNodes: 1, removedEdges };
  }

  /**
   * Handle a git branch switch — diff changed files and batch update.
   */
  async handleBranchSwitch(changedFiles: string[]): Promise<void> {
    for (const file of changedFiles) {
      this.queueChange({ path: join(this.rootDir, file), type: 'change' });
    }
    // Flush immediately on branch switch
    await this.flush();
  }

  /**
   * Full staleness check — compare all tracked files against filesystem.
   * Used on app launch to catch changes made while app was closed.
   */
  async checkStaleness(): Promise<string[]> {
    const staleFiles: string[] = [];
    const allNodes = this.graph.getNodesByProject(this.projectId);

    for (const node of allNodes) {
      if (node.type !== 'file') continue;
      const fileNode = node as FileNode;

      try {
        const fullPath = join(this.rootDir, fileNode.path);
        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs > fileNode.updatedAt) {
          const changed = await this.hasFileChanged(fileNode.path);
          if (changed) staleFiles.push(fileNode.path);
        }
      } catch {
        // File was deleted
        staleFiles.push(fileNode.path);
      }
    }

    if (staleFiles.length > 0) {
      this.eventBus.emit({
        type: 'graph:stale',
        projectId: this.projectId,
        staleFiles: staleFiles.length,
        timestamp: Date.now(),
      });
    }

    return staleFiles;
  }

  /** Clean up timers */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingChanges = [];
  }
}
