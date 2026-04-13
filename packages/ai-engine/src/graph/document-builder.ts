/**
 * DocumentBuilder — Ingests project documentation into the knowledge graph
 * Parses markdown files, extracts headings/code refs, and links to code nodes.
 *
 * @author Subash Karki
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, extname, join, basename } from 'node:path';
import type { DocumentNode, GraphEdge } from '../types/graph.js';
import type { InMemoryGraph } from './in-memory-graph.js';
import type { EventBus } from '../events/event-bus.js';

/** Document file extensions to process */
const DOC_EXTENSIONS = new Set(['.md', '.txt']);

/** Document filenames that are always important */
const PRIORITY_DOCS = new Set([
  'README.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'CHANGELOG.md',
  'DESIGN.md', 'DECISIONS.md', 'TODO.md',
]);

/** Directories to skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.claude', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache',
  '__pycache__', '.venv', 'venv', 'env', 'target', '.gradle', 'bin', 'obj',
]);

/** Max depth for doc search (don't recurse deeply into docs/) */
const MAX_DEPTH = 4;

export class DocumentBuilder {
  constructor(
    private graph: InMemoryGraph,
    private eventBus: EventBus,
  ) {}

  /**
   * Walk project directory for doc files and ingest them into the graph.
   */
  async buildDocs(projectId: string, rootDir: string): Promise<void> {
    const absRoot = resolve(rootDir);
    const docPaths = await this.walkDocFiles(absRoot, 0);

    for (const absPath of docPaths) {
      try {
        await this.ingestDocument(projectId, absRoot, absPath);
      } catch (err) {
        this.eventBus.emit({
          type: 'graph:build:error',
          projectId,
          phase: 'layer1',
          error: err instanceof Error ? err.message : String(err),
          file: relative(absRoot, absPath),
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Ingest a single document file into the graph.
   */
  private async ingestDocument(
    projectId: string,
    absRoot: string,
    absPath: string,
  ): Promise<void> {
    const relPath = relative(absRoot, absPath);
    const ext = extname(absPath);
    const content = await readFile(absPath, 'utf-8');
    const fileStat = await stat(absPath);

    const docId = `doc:${projectId}:${relPath.split('\\').join('/')}`;
    const contentHash = createHash('md5').update(content).digest('hex');

    // Extract title and sections from content
    const title = this.extractTitle(content, relPath);
    const sections = this.extractSections(content);
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    const docNode: DocumentNode = {
      id: docId,
      type: 'document',
      projectId,
      path: relPath,
      title,
      format: ext === '.md' ? 'markdown' : 'text',
      sections,
      contentHash,
      wordCount,
      metadata: {
        lastModified: fileStat.mtimeMs,
        isPriority: PRIORITY_DOCS.has(basename(absPath)),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.graph.addNode(docNode);

    // Create edges to code files referenced in the document
    const referencedPaths = this.extractFileReferences(content);
    for (const refPath of referencedPaths) {
      const fileNode = this.graph.getFileByPath(refPath);
      if (fileNode) {
        const edgeId = `edge:${docId}:${fileNode.id}:documents`;
        const edge: GraphEdge = {
          id: edgeId,
          sourceId: docId,
          targetId: fileNode.id,
          type: 'documents',
          projectId,
          weight: 1,
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.graph.addEdge(edge);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Content Extraction
  // ---------------------------------------------------------------------------

  /** Extract the document title from content or fallback to filename */
  private extractTitle(content: string, relPath: string): string {
    // Look for first # heading in markdown
    const match = content.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();
    // Fallback: filename without extension
    return basename(relPath, extname(relPath));
  }

  /** Extract section headings from markdown */
  private extractSections(content: string): string[] {
    const headings: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^#{1,4}\s+(.+)$/);
      if (match) headings.push(match[1].trim());
    }
    return headings;
  }

  /** Extract file path references from document content */
  private extractFileReferences(content: string): string[] {
    const paths = new Set<string>();

    // Match code blocks with file paths: `src/foo/bar.ts`
    const backtickRefs = content.matchAll(/`([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})`/g);
    for (const m of backtickRefs) {
      const candidate = m[1];
      if (this.looksLikeFilePath(candidate)) {
        paths.add(candidate);
      }
    }

    // Match paths in prose: src/foo/bar.ts (word boundary)
    const proseRefs = content.matchAll(/(?:^|\s)((?:src|lib|packages|apps|components|routes|services|utils|hooks|types|config)[a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})(?:\s|$|[,;:.)])/gm);
    for (const m of proseRefs) {
      paths.add(m[1].trim());
    }

    return [...paths];
  }

  /** Simple heuristic: does this string look like a file path? */
  private looksLikeFilePath(s: string): boolean {
    if (!s.includes('/') && !s.includes('.')) return false;
    if (s.startsWith('http')) return false;
    if (s.includes(' ')) return false;
    const ext = extname(s).replace('.', '');
    const codeExts = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'json', 'yaml', 'yml', 'toml', 'sql']);
    return codeExts.has(ext);
  }

  // ---------------------------------------------------------------------------
  // Directory Walking
  // ---------------------------------------------------------------------------

  private async walkDocFiles(dir: string, depth: number): Promise<string[]> {
    if (depth > MAX_DEPTH) return [];
    const files: string[] = [];

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const subFiles = await this.walkDocFiles(join(dir, entry.name), depth + 1);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (DOC_EXTENSIONS.has(ext)) {
          files.push(join(dir, entry.name));
        }
      }
    }

    return files;
  }
}
