/**
 * FileWatcher Tests
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileWatcher } from '../graph/file-watcher.js';
import { EventBus } from '../events/event-bus.js';
import type { IncrementalUpdater, FileChange } from '../graph/incremental.js';

const PROJECT = 'test-watcher';

/** Helper to wait for chokidar events to propagate */
const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms));

function createMockUpdater(): IncrementalUpdater & { calls: FileChange[] } {
  const calls: FileChange[] = [];
  return {
    calls,
    queueChange: vi.fn((change: FileChange) => {
      calls.push(change);
    }),
    flush: vi.fn().mockResolvedValue(undefined),
    handleBranchSwitch: vi.fn().mockResolvedValue(undefined),
    checkStaleness: vi.fn().mockResolvedValue([]),
    destroy: vi.fn(),
  } as unknown as IncrementalUpdater & { calls: FileChange[] };
}

describe('FileWatcher', () => {
  let tmpDir: string;
  let eventBus: EventBus;
  let updater: ReturnType<typeof createMockUpdater>;
  let watcher: FileWatcher;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'phantom-fw-test-'));
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/existing.ts'), 'export const x = 1;');

    eventBus = new EventBus();
    updater = createMockUpdater();
    watcher = new FileWatcher(updater, tmpDir, eventBus);
    watcher.setProjectId(PROJECT);
  });

  afterEach(() => {
    watcher.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('start/stop lifecycle', () => {
    it('reports isWatching correctly', () => {
      expect(watcher.isWatching()).toBe(false);
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('start is a no-op when already watching', () => {
      watcher.start();
      watcher.start(); // second call should not throw or create duplicate watchers
      expect(watcher.isWatching()).toBe(true);
    });

    it('stop is a no-op when not watching', () => {
      watcher.stop(); // should not throw
      expect(watcher.isWatching()).toBe(false);
    });

    it('can be restarted after stop', () => {
      watcher.start();
      watcher.stop();
      expect(watcher.isWatching()).toBe(false);
      watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });
  });

  describe('file change detection', () => {
    it('detects new file additions', async () => {
      watcher.start();
      await waitFor(200);

      writeFileSync(join(tmpDir, 'src/new-file.ts'), 'export const y = 2;');
      await waitFor(500);

      expect(updater.queueChange).toHaveBeenCalledWith(
        expect.objectContaining({
          path: join(tmpDir, 'src/new-file.ts'),
          type: 'add',
        }),
      );
    });

    it('detects file modifications', async () => {
      watcher.start();
      await waitFor(200);

      writeFileSync(join(tmpDir, 'src/existing.ts'), 'export const x = 999;');
      await waitFor(500);

      expect(updater.queueChange).toHaveBeenCalledWith(
        expect.objectContaining({
          path: join(tmpDir, 'src/existing.ts'),
          type: 'change',
        }),
      );
    });

    it('detects file deletions', async () => {
      watcher.start();
      await waitFor(200);

      unlinkSync(join(tmpDir, 'src/existing.ts'));
      await waitFor(500);

      expect(updater.queueChange).toHaveBeenCalledWith(
        expect.objectContaining({
          path: join(tmpDir, 'src/existing.ts'),
          type: 'unlink',
        }),
      );
    });
  });

  describe('file filtering', () => {
    it('ignores non-source extensions', async () => {
      watcher.start();
      await waitFor(300);
      // Clear any startup noise before testing filtering
      vi.mocked(updater.queueChange).mockClear();
      updater.calls.length = 0;

      writeFileSync(join(tmpDir, 'src/readme.md'), '# Hello');
      writeFileSync(join(tmpDir, 'src/image.png'), 'fake-png-data');
      writeFileSync(join(tmpDir, 'src/style.css'), 'body {}');
      await waitFor(500);

      // Only non-source files were written, so no calls should have been made
      const sourceCallsAfterClear = updater.calls.filter(
        (c) => !c.path.endsWith('.md') && !c.path.endsWith('.png') && !c.path.endsWith('.css'),
      );
      // The mock should not have been called for non-source files
      for (const call of updater.calls) {
        expect(call.path).not.toMatch(/\.(md|png|css)$/);
      }
    });

    it('ignores node_modules directory', async () => {
      mkdirSync(join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
      watcher.start();
      await waitFor(300);
      // Clear any startup noise
      vi.mocked(updater.queueChange).mockClear();
      updater.calls.length = 0;

      writeFileSync(
        join(tmpDir, 'node_modules/pkg/index.js'),
        'module.exports = {};',
      );
      await waitFor(500);

      // No calls should reference node_modules paths
      const nmCalls = updater.calls.filter((c) => c.path.includes('node_modules'));
      expect(nmCalls).toHaveLength(0);
    });

    it('watches supported source extensions', async () => {
      watcher.start();
      await waitFor(200);

      writeFileSync(join(tmpDir, 'src/app.tsx'), 'export default () => <div/>;');
      writeFileSync(join(tmpDir, 'src/config.json'), '{"key": "val"}');
      await waitFor(500);

      const paths = updater.calls.map((c) => c.path);
      expect(paths).toContain(join(tmpDir, 'src/app.tsx'));
      expect(paths).toContain(join(tmpDir, 'src/config.json'));
    });
  });

  describe('ready event', () => {
    it('emits graph:update:complete on ready', async () => {
      const events: unknown[] = [];
      eventBus.onAll((e) => events.push(e));

      watcher.start();
      await waitFor(500);

      const readyEvent = events.find(
        (e: any) =>
          e.type === 'graph:update:complete' &&
          e.updatedNodes === 0 &&
          e.durationMs === 0,
      );
      expect(readyEvent).toBeDefined();
    });
  });
});
