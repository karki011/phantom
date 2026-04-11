/**
 * IncrementalUpdater Tests
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IncrementalUpdater } from '../graph/incremental.js';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import { GraphBuilder } from '../graph/builder.js';
import { EventBus } from '../events/event-bus.js';
import type { FileNode, GraphEvent } from '../types/index.js';

const PROJECT = 'test-project';
const now = Date.now();

function makeFile(path: string, hash = 'abc123'): FileNode {
  return {
    id: `file:${PROJECT}:${path}`,
    type: 'file',
    projectId: PROJECT,
    path,
    extension: path.split('.').pop()!,
    size: 100,
    contentHash: hash,
    lastModified: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('IncrementalUpdater', () => {
  let graph: InMemoryGraph;
  let builder: GraphBuilder;
  let eventBus: EventBus;
  let updater: IncrementalUpdater;
  let tmpDir: string;
  let events: GraphEvent[];

  beforeEach(() => {
    graph = new InMemoryGraph();
    eventBus = new EventBus();
    builder = new GraphBuilder(graph, eventBus);
    events = [];
    eventBus.onAll((e) => events.push(e));

    // Create temp project
    tmpDir = mkdtempSync(join(tmpdir(), 'phantom-test-'));
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/index.ts'), 'export const x = 1;');
    writeFileSync(join(tmpDir, 'src/utils.ts'), 'import { x } from "./index";\nexport const y = x + 1;');

    updater = new IncrementalUpdater(graph, builder, eventBus, PROJECT, tmpDir, {
      debounceMs: 10,
    });
  });

  afterEach(() => {
    updater.destroy();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('queueChange + flush', () => {
    it('processes queued changes on flush', async () => {
      // Pre-populate graph
      graph.addNode(makeFile('src/index.ts'));

      // Modify the file content
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const x = 2;');

      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      await updater.flush();

      expect(events.some((e) => e.type === 'graph:update:start')).toBe(true);
      expect(events.some((e) => e.type === 'graph:update:complete')).toBe(true);
    });

    it('deduplicates changes to the same file', async () => {
      graph.addNode(makeFile('src/index.ts'));
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const x = 3;');

      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      await updater.flush();

      const updateStarts = events.filter((e) => e.type === 'graph:update:start');
      expect(updateStarts).toHaveLength(1);
      if (updateStarts[0].type === 'graph:update:start') {
        expect(updateStarts[0].changedFiles).toHaveLength(1);
      }
    });

    it('skips unchanged files (same hash)', async () => {
      // File content hasn't changed, hash still matches
      const content = 'export const x = 1;';
      writeFileSync(join(tmpDir, 'src/index.ts'), content);

      // Create hash that matches
      const { createHash } = await import('node:crypto');
      const hash = createHash('md5').update(content).digest('hex');
      graph.addNode(makeFile('src/index.ts', hash));

      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      await updater.flush();

      const complete = events.find((e) => e.type === 'graph:update:complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'graph:update:complete') {
        expect(complete.updatedNodes).toBe(0);
      }
    });

    it('handles no pending changes', async () => {
      await updater.flush();
      expect(events).toHaveLength(0);
    });
  });

  describe('file deletion', () => {
    it('removes deleted file from graph', async () => {
      graph.addNode(makeFile('src/index.ts'));
      expect(graph.getFileByPath('src/index.ts')).toBeDefined();

      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'unlink' });
      await updater.flush();

      expect(graph.getFileByPath('src/index.ts')).toBeUndefined();
    });
  });

  describe('new files', () => {
    it('adds new files to graph', async () => {
      writeFileSync(join(tmpDir, 'src/new.ts'), 'export const z = 42;');

      updater.queueChange({ path: join(tmpDir, 'src/new.ts'), type: 'add' });
      await updater.flush();

      // The builder should have added the file to the graph
      expect(events.some((e) => e.type === 'graph:update:complete')).toBe(true);
    });
  });

  describe('debouncing', () => {
    it('debounces rapid changes', async () => {
      graph.addNode(makeFile('src/index.ts'));
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const x = 99;');

      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });

      // Wait for debounce to fire
      await new Promise((r) => setTimeout(r, 50));

      expect(events.some((e) => e.type === 'graph:update:complete')).toBe(true);
    });
  });

  describe('handleBranchSwitch', () => {
    it('queues all changed files and flushes', async () => {
      graph.addNode(makeFile('src/index.ts'));
      graph.addNode(makeFile('src/utils.ts'));
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const switched = true;');
      writeFileSync(join(tmpDir, 'src/utils.ts'), 'export const also = true;');

      await updater.handleBranchSwitch(['src/index.ts', 'src/utils.ts']);

      expect(events.some((e) => e.type === 'graph:update:complete')).toBe(true);
    });
  });

  describe('checkStaleness', () => {
    it('detects stale files', async () => {
      // Add a file node with old timestamp
      const oldFile = makeFile('src/index.ts');
      oldFile.updatedAt = now - 100_000;
      graph.addNode(oldFile);

      // Touch the actual file so mtime is newer
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const fresh = true;');

      const stale = await updater.checkStaleness();
      expect(stale).toContain('src/index.ts');
    });

    it('emits stale event when files are stale', async () => {
      const oldFile = makeFile('src/index.ts');
      oldFile.updatedAt = now - 100_000;
      graph.addNode(oldFile);
      writeFileSync(join(tmpDir, 'src/index.ts'), 'export const fresh = true;');

      await updater.checkStaleness();
      expect(events.some((e) => e.type === 'graph:stale')).toBe(true);
    });

    it('returns empty when nothing is stale', async () => {
      // File node with future timestamp
      const freshFile = makeFile('src/index.ts');
      freshFile.updatedAt = Date.now() + 100_000;
      graph.addNode(freshFile);

      const stale = await updater.checkStaleness();
      expect(stale).toHaveLength(0);
    });
  });

  describe('destroy', () => {
    it('cleans up timers and pending changes', () => {
      updater.queueChange({ path: join(tmpDir, 'src/index.ts'), type: 'change' });
      updater.destroy();
      // Should not throw or process after destroy
      expect(() => updater.flush()).not.toThrow();
    });
  });
});
