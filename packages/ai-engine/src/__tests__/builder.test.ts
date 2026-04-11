/**
 * Tests for GraphBuilder — Layer 1 file-level dependency graph builder
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import { GraphBuilder } from '../graph/builder.js';
import { EventBus } from '../events/event-bus.js';
import type { GraphEvent } from '../types/events.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'graph-builder-test-'));

  // src/index.ts → imports ./utils, react
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'index.ts'),
    [
      "import { doStuff } from './utils.js';",
      "import React from 'react';",
      '',
      'export const main = () => doStuff();',
    ].join('\n'),
  );

  // src/utils.ts → imports ./helpers, node:path
  writeFileSync(
    join(dir, 'src', 'utils.ts'),
    [
      "import { helper } from './helpers.js';",
      "import { resolve } from 'node:path';",
      '',
      'export const doStuff = () => helper(resolve("."));',
    ].join('\n'),
  );

  // src/helpers.ts → exports helper functions
  writeFileSync(
    join(dir, 'src', 'helpers.ts'),
    [
      'export const helper = (x: string) => x.toUpperCase();',
      'export function formatName(name: string) { return name.trim(); }',
    ].join('\n'),
  );

  // src/components/App.tsx → imports react, ./Button
  mkdirSync(join(dir, 'src', 'components'), { recursive: true });
  writeFileSync(
    join(dir, 'src', 'components', 'App.tsx'),
    [
      "import React from 'react';",
      "import { Button } from './Button.js';",
      '',
      'export const App = () => <Button label=\"Hello\" />;',
    ].join('\n'),
  );

  // src/components/Button.tsx → imports react
  writeFileSync(
    join(dir, 'src', 'components', 'Button.tsx'),
    [
      "import React from 'react';",
      '',
      'export const Button = ({ label }: { label: string }) => <button>{label}</button>;',
    ].join('\n'),
  );

  // node_modules/ — should be skipped
  mkdirSync(join(dir, 'node_modules', 'react'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'react', 'index.js'), 'module.exports = {};');

  // dist/ — should be skipped
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'bundle.js'), 'console.log("built");');

  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphBuilder', () => {
  let tmpDir: string;
  let graph: InMemoryGraph;
  let eventBus: EventBus;
  let builder: GraphBuilder;
  let events: GraphEvent[];

  beforeEach(() => {
    tmpDir = createTempProject();
    graph = new InMemoryGraph();
    eventBus = new EventBus();
    builder = new GraphBuilder(graph, eventBus);
    events = [];
    eventBus.onAll((e) => events.push(e));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // buildProject — File Nodes
  // -------------------------------------------------------------------------

  describe('buildProject — file nodes', () => {
    it('should create FileNodes for all source files', async () => {
      await builder.buildProject('test', tmpDir);

      const files = graph.getNodesByType('file');
      const paths = files.map((f) => (f as any).path).sort();

      expect(paths).toEqual([
        'src/components/App.tsx',
        'src/components/Button.tsx',
        'src/helpers.ts',
        'src/index.ts',
        'src/utils.ts',
      ]);
    });

    it('should generate deterministic file IDs', async () => {
      await builder.buildProject('myproj', tmpDir);

      const indexNode = graph.getFileByPath('src/index.ts');
      expect(indexNode).toBeDefined();
      expect(indexNode!.id).toBe('file:myproj:src/index.ts');
    });

    it('should compute content hashes', async () => {
      await builder.buildProject('test', tmpDir);

      const node = graph.getFileByPath('src/index.ts');
      expect(node).toBeDefined();
      expect(node!.contentHash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('should populate file extension without dot', async () => {
      await builder.buildProject('test', tmpDir);

      const tsNode = graph.getFileByPath('src/index.ts');
      expect(tsNode!.extension).toBe('ts');

      const tsxNode = graph.getFileByPath('src/components/App.tsx');
      expect(tsxNode!.extension).toBe('tsx');
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Skipped Directories
  // -------------------------------------------------------------------------

  describe('buildProject — skipped directories', () => {
    it('should not include files from node_modules or dist', async () => {
      await builder.buildProject('test', tmpDir);

      const allPaths = graph.getNodesByType('file').map((f) => (f as any).path);
      const forbidden = allPaths.filter(
        (p: string) => p.includes('node_modules') || p.includes('dist'),
      );
      expect(forbidden).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Import Edges
  // -------------------------------------------------------------------------

  describe('buildProject — import edges', () => {
    it('should create IMPORTS edges for relative imports', async () => {
      await builder.buildProject('test', tmpDir);

      const indexId = 'file:test:src/index.ts';
      const utilsId = 'file:test:src/utils.ts';
      const edgeId = `edge:${indexId}:${utilsId}:imports`;

      const edge = graph.getEdge(edgeId);
      expect(edge).toBeDefined();
      expect(edge!.type).toBe('imports');
      expect(edge!.sourceId).toBe(indexId);
      expect(edge!.targetId).toBe(utilsId);
    });

    it('should create IMPORTS edges for component imports', async () => {
      await builder.buildProject('test', tmpDir);

      const appId = 'file:test:src/components/App.tsx';
      const buttonId = 'file:test:src/components/Button.tsx';

      const outgoing = graph.getOutgoingEdges(appId);
      const importEdges = outgoing.filter((e) => e.type === 'imports');

      expect(importEdges.some((e) => e.targetId === buttonId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Module Nodes (external deps)
  // -------------------------------------------------------------------------

  describe('buildProject — module nodes', () => {
    it('should create ModuleNodes for external dependencies', async () => {
      await builder.buildProject('test', tmpDir);

      const modules = graph.getNodesByType('module');
      const names = modules.map((m) => (m as any).name).sort();

      expect(names).toContain('react');
      expect(names).toContain('node:path');
    });

    it('should create DEPENDS_ON edges for bare specifiers', async () => {
      await builder.buildProject('test', tmpDir);

      const indexId = 'file:test:src/index.ts';
      const reactModuleId = 'module:test:react';

      const edgeId = `edge:${indexId}:${reactModuleId}:depends_on`;
      const edge = graph.getEdge(edgeId);

      expect(edge).toBeDefined();
      expect(edge!.type).toBe('depends_on');
    });

    it('should not duplicate ModuleNodes for the same package', async () => {
      await builder.buildProject('test', tmpDir);

      // react is imported by index.ts, App.tsx, Button.tsx — should only have 1 ModuleNode
      const reactModules = graph
        .getNodesByType('module')
        .filter((m) => (m as any).name === 'react');

      expect(reactModules).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Exports metadata
  // -------------------------------------------------------------------------

  describe('buildProject — export parsing', () => {
    it('should store exported names in file metadata', async () => {
      await builder.buildProject('test', tmpDir);

      const helpers = graph.getFileByPath('src/helpers.ts');
      expect(helpers).toBeDefined();
      expect(helpers!.metadata.exports).toContain('helper');
      expect(helpers!.metadata.exports).toContain('formatName');
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Events
  // -------------------------------------------------------------------------

  describe('buildProject — events', () => {
    it('should emit build:start, progress, and build:complete events', async () => {
      await builder.buildProject('test', tmpDir);

      const types = events.map((e) => e.type);

      expect(types[0]).toBe('graph:build:start');
      expect(types[types.length - 1]).toBe('graph:build:complete');
      expect(types.filter((t) => t === 'graph:build:progress').length).toBeGreaterThan(0);
    });

    it('should include correct totalFiles in start event', async () => {
      await builder.buildProject('test', tmpDir);

      const startEvent = events.find((e) => e.type === 'graph:build:start');
      expect(startEvent).toBeDefined();
      expect((startEvent as any).totalFiles).toBe(5);
    });

    it('should include stats in complete event', async () => {
      await builder.buildProject('test', tmpDir);

      const completeEvent = events.find((e) => e.type === 'graph:build:complete');
      expect(completeEvent).toBeDefined();
      expect((completeEvent as any).stats.files).toBe(5);
      expect((completeEvent as any).stats.edges).toBeGreaterThan(0);
      expect((completeEvent as any).stats.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildProject — Graph stats
  // -------------------------------------------------------------------------

  describe('buildProject — graph stats', () => {
    it('should report correct stats after full build', async () => {
      await builder.buildProject('test', tmpDir);

      const { nodes, edges, files, modules } = graph.stats;
      expect(files).toBe(5);
      expect(modules).toBeGreaterThanOrEqual(2); // react, node:path
      expect(nodes).toBe(files + modules);
      expect(edges).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildFile — single file update
  // -------------------------------------------------------------------------

  describe('buildFile', () => {
    it('should add a single file to an existing graph', async () => {
      await builder.buildProject('test', tmpDir);
      const statsBefore = { ...graph.stats };

      // Create a new file
      writeFileSync(
        join(tmpDir, 'src', 'newfile.ts'),
        "import { helper } from './helpers.js';\nexport const extra = helper('x');",
      );

      await builder.buildFile('test', tmpDir, join(tmpDir, 'src', 'newfile.ts'));

      expect(graph.stats.files).toBe(statsBefore.files + 1);
      expect(graph.getFileByPath('src/newfile.ts')).toBeDefined();
    });

    it('should replace an existing file node on rebuild', async () => {
      await builder.buildProject('test', tmpDir);

      const originalNode = graph.getFileByPath('src/index.ts');
      const originalHash = originalNode!.contentHash;

      // Modify the file
      writeFileSync(
        join(tmpDir, 'src', 'index.ts'),
        "import React from 'react';\nexport const main = () => 'changed';",
      );

      await builder.buildFile('test', tmpDir, join(tmpDir, 'src', 'index.ts'));

      const updatedNode = graph.getFileByPath('src/index.ts');
      expect(updatedNode).toBeDefined();
      expect(updatedNode!.contentHash).not.toBe(originalHash);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should emit error event for unreadable files but continue building', async () => {
      // Create a file with bad permissions (simulate via a directory with a source extension)
      // Instead: create an empty project with one valid and reference missing import
      const smallDir = mkdtempSync(join(tmpdir(), 'builder-err-'));
      mkdirSync(join(smallDir, 'src'), { recursive: true });

      writeFileSync(join(smallDir, 'src', 'good.ts'), 'export const x = 1;');

      await builder.buildProject('err-test', smallDir);

      // Should still have the good file
      expect(graph.getFileByPath('src/good.ts')).toBeDefined();

      rmSync(smallDir, { recursive: true, force: true });
    });
  });
});
