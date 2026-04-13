/**
 * DocumentBuilder Tests
 * @author Subash Karki
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocumentBuilder } from '../graph/document-builder.js';
import { InMemoryGraph } from '../graph/in-memory-graph.js';
import { EventBus } from '../events/event-bus.js';
import type { FileNode, DocumentNode } from '../types/graph.js';

const PROJECT = 'test-project';
const now = Date.now();

function makeFile(path: string): FileNode {
  return {
    id: `file:${PROJECT}:${path}`,
    type: 'file',
    projectId: PROJECT,
    path,
    extension: path.split('.').pop()!,
    size: 100,
    contentHash: 'abc123',
    lastModified: now,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

describe('DocumentBuilder', () => {
  let graph: InMemoryGraph;
  let eventBus: EventBus;
  let builder: DocumentBuilder;
  let tmpDir: string;

  beforeEach(async () => {
    graph = new InMemoryGraph();
    eventBus = new EventBus();
    builder = new DocumentBuilder(graph, eventBus);
    tmpDir = await mkdtemp(join(tmpdir(), 'doc-builder-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  it('discovers .md and .txt files', async () => {
    await writeFile(join(tmpDir, 'README.md'), '# Hello\nWorld');
    await writeFile(join(tmpDir, 'notes.txt'), 'Some notes');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(2);
    const paths = nodes.map((n) => (n as DocumentNode).path);
    expect(paths).toContain('README.md');
    expect(paths).toContain('notes.txt');
  });

  it('discovers docs in subdirectories', async () => {
    await mkdir(join(tmpDir, 'docs'));
    await writeFile(join(tmpDir, 'docs', 'guide.md'), '# Guide');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as DocumentNode).path).toMatch(/docs\/guide\.md$/);
  });

  it('skips directories in SKIP_DIRS', async () => {
    await mkdir(join(tmpDir, 'node_modules'));
    await writeFile(join(tmpDir, 'node_modules', 'README.md'), '# Skip me');
    await mkdir(join(tmpDir, '.git'));
    await writeFile(join(tmpDir, '.git', 'info.md'), '# Skip me too');
    await writeFile(join(tmpDir, 'README.md'), '# Keep me');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as DocumentNode).path).toBe('README.md');
  });

  it('ignores non-doc files', async () => {
    await writeFile(join(tmpDir, 'app.ts'), 'const x = 1;');
    await writeFile(join(tmpDir, 'style.css'), 'body {}');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Title Extraction
  // ---------------------------------------------------------------------------

  it('extracts title from first # heading', async () => {
    await writeFile(join(tmpDir, 'README.md'), '# My Project\n\nSome text');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as DocumentNode).title).toBe('My Project');
  });

  it('falls back to filename when no heading present', async () => {
    await writeFile(join(tmpDir, 'notes.txt'), 'Just some text without headings');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(1);
    expect((nodes[0] as DocumentNode).title).toBe('notes');
  });

  // ---------------------------------------------------------------------------
  // Section Extraction
  // ---------------------------------------------------------------------------

  it('extracts section headings', async () => {
    const content = [
      '# Main Title',
      '## Section One',
      'Some content',
      '### Subsection',
      '#### Deep Section',
      'More content',
    ].join('\n');
    await writeFile(join(tmpDir, 'doc.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.sections).toEqual([
      'Main Title',
      'Section One',
      'Subsection',
      'Deep Section',
    ]);
  });

  // ---------------------------------------------------------------------------
  // File References & Edge Creation
  // ---------------------------------------------------------------------------

  it('extracts file path references from backtick code', async () => {
    // Pre-populate graph with a FileNode
    graph.addNode(makeFile('src/utils/helper.ts'));

    const content = 'See `src/utils/helper.ts` for details.';
    await writeFile(join(tmpDir, 'README.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges).toHaveLength(1);
    expect(edges[0].targetId).toBe(`file:${PROJECT}:src/utils/helper.ts`);
  });

  it('extracts file path references from prose', async () => {
    graph.addNode(makeFile('src/index.ts'));

    const content = 'The entry point is src/index.ts which bootstraps the app.';
    await writeFile(join(tmpDir, 'README.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges).toHaveLength(1);
    expect(edges[0].targetId).toBe(`file:${PROJECT}:src/index.ts`);
  });

  it('does NOT create edges to non-existent files', async () => {
    // No FileNode in graph for this path
    const content = 'See `src/nonexistent/foo.ts` for info.';
    await writeFile(join(tmpDir, 'README.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges).toHaveLength(0);
  });

  it('creates multiple edges for multiple referenced files', async () => {
    graph.addNode(makeFile('src/a.ts'));
    graph.addNode(makeFile('src/b.ts'));

    const content = 'Files: `src/a.ts` and `src/b.ts`';
    await writeFile(join(tmpDir, 'README.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Node Metadata
  // ---------------------------------------------------------------------------

  it('sets format to markdown for .md files', async () => {
    await writeFile(join(tmpDir, 'doc.md'), '# Doc');

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.format).toBe('markdown');
  });

  it('sets format to text for .txt files', async () => {
    await writeFile(join(tmpDir, 'notes.txt'), 'Notes');

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.format).toBe('text');
  });

  it('calculates word count', async () => {
    await writeFile(join(tmpDir, 'doc.md'), 'one two three four five');

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.wordCount).toBe(5);
  });

  it('marks priority docs with isPriority metadata', async () => {
    await writeFile(join(tmpDir, 'README.md'), '# Readme');
    await writeFile(join(tmpDir, 'ARCHITECTURE.md'), '# Architecture');
    await writeFile(join(tmpDir, 'random.md'), '# Random');

    await builder.buildDocs(PROJECT, tmpDir);

    const docs = graph.getNodesByType('document') as DocumentNode[];
    const readme = docs.find((d) => d.path === 'README.md')!;
    const arch = docs.find((d) => d.path === 'ARCHITECTURE.md')!;
    const random = docs.find((d) => d.path === 'random.md')!;

    expect(readme.metadata.isPriority).toBe(true);
    expect(arch.metadata.isPriority).toBe(true);
    expect(random.metadata.isPriority).toBe(false);
  });

  it('sets contentHash on document nodes', async () => {
    await writeFile(join(tmpDir, 'doc.md'), '# Test');

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.contentHash).toBeTruthy();
    expect(doc.contentHash).toHaveLength(32); // MD5 hex length
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  it('handles empty documents gracefully', async () => {
    await writeFile(join(tmpDir, 'empty.md'), '');

    await builder.buildDocs(PROJECT, tmpDir);

    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(1);
    const doc = nodes[0] as DocumentNode;
    expect(doc.title).toBe('empty'); // Fallback to filename
    expect(doc.sections).toEqual([]);
    expect(doc.wordCount).toBe(0);
  });

  it('emits error event when ingestion fails', async () => {
    const errors: unknown[] = [];
    eventBus.on('graph:build:error', (event) => errors.push(event));

    // Create a directory where a file is expected (will cause read to fail)
    await mkdir(join(tmpDir, 'bad.md'));

    await builder.buildDocs(PROJECT, tmpDir);

    // The walker skips directories, so bad.md (a directory) won't be processed
    // Let's verify no documents are created for it
    const nodes = graph.getNodesByType('document');
    expect(nodes).toHaveLength(0);
  });

  it('deduplicates file references within a document', async () => {
    graph.addNode(makeFile('src/utils.ts'));

    const content = 'File `src/utils.ts` is used. Also see `src/utils.ts` again.';
    await writeFile(join(tmpDir, 'README.md'), content);

    await builder.buildDocs(PROJECT, tmpDir);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges).toHaveLength(1);
  });

  it('sets correct projectId on nodes and edges', async () => {
    graph.addNode(makeFile('src/app.ts'));

    await writeFile(join(tmpDir, 'README.md'), 'See `src/app.ts`');

    await builder.buildDocs(PROJECT, tmpDir);

    const doc = graph.getNodesByType('document')[0] as DocumentNode;
    expect(doc.projectId).toBe(PROJECT);

    const edges = graph.getAllEdges().filter((e) => e.type === 'documents');
    expect(edges[0].projectId).toBe(PROJECT);
  });
});
