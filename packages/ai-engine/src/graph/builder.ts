/**
 * GraphBuilder — Builds file-level dependency graph from project source
 * Layer 1: Parses imports/exports to build FileNode + edge relationships
 * Source code only — skips node_modules, .git, dist, build, coverage
 *
 * @author Subash Karki
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, extname, join, posix } from 'node:path';
import type { FileNode, ModuleNode, GraphEdge } from '../types/graph.js';
import type { EventBus } from '../events/event-bus.js';
import type { InMemoryGraph } from './in-memory-graph.js';

/** Source file extensions we process */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
]);

/** Directories to skip during walk */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache',
]);

// ---------------------------------------------------------------------------
// Regex patterns for import/export detection (Layer 1 — fast, no AST)
// ---------------------------------------------------------------------------

/** import ... from '...' / import '...' */
const IMPORT_FROM_RE = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/** export ... from '...' */
const EXPORT_FROM_RE = /export\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g;

/** require('...') */
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Detect exported declarations */
const EXPORT_DECL_RE = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;

export class GraphBuilder {
  constructor(
    private graph: InMemoryGraph,
    private eventBus: EventBus,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Full Layer 1 build: walk project, create FileNodes + edges.
   * Two-pass approach so all FileNodes exist before resolving cross-references.
   */
  async buildProject(projectId: string, rootDir: string): Promise<void> {
    const startTime = Date.now();
    const absRoot = resolve(rootDir);

    // Discover source files
    const filePaths = await this.walkSourceFiles(absRoot);

    this.eventBus.emit({
      type: 'graph:build:start',
      projectId,
      phase: 'layer1',
      totalFiles: filePaths.length,
      timestamp: Date.now(),
    });

    // Pass 1: Create all FileNodes (no edges yet) so cross-references resolve
    const fileContents = new Map<string, string>();
    for (const absPath of filePaths) {
      try {
        const content = await this.createFileNode(projectId, absRoot, absPath);
        fileContents.set(absPath, content);
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

    // Pass 2: Parse imports and create edges (all nodes already in graph)
    for (let i = 0; i < filePaths.length; i++) {
      const absPath = filePaths[i]!;
      const content = fileContents.get(absPath);
      if (content !== undefined) {
        try {
          this.createEdgesForFile(projectId, absRoot, absPath, content);
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

      this.eventBus.emit({
        type: 'graph:build:progress',
        projectId,
        phase: 'layer1',
        current: i + 1,
        total: filePaths.length,
        currentFile: relative(absRoot, absPath),
        timestamp: Date.now(),
      });
    }

    this.eventBus.emit({
      type: 'graph:build:complete',
      projectId,
      phase: 'layer1',
      stats: {
        files: this.graph.stats.files,
        edges: this.graph.stats.edges,
        durationMs: Date.now() - startTime,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * Parse and update a single file (incremental use-case).
   * For single-file updates the target nodes should already exist in the graph.
   */
  async buildFile(projectId: string, rootDir: string, filePath: string): Promise<void> {
    const absRoot = resolve(rootDir);
    const absPath = resolve(filePath);
    const relPath = relative(absRoot, absPath);

    // Remove existing node + edges for this file if present
    const existingNode = this.graph.getFileByPath(relPath);
    if (existingNode) {
      this.graph.removeNode(existingNode.id);
    }

    const content = await this.createFileNode(projectId, absRoot, absPath);
    this.createEdgesForFile(projectId, absRoot, absPath, content);
  }

  // ---------------------------------------------------------------------------
  // Internal: two-pass file processing
  // ---------------------------------------------------------------------------

  /**
   * Pass 1: Read file, create FileNode with metadata. Returns file content.
   */
  private async createFileNode(
    projectId: string,
    absRoot: string,
    absPath: string,
  ): Promise<string> {
    const relPath = relative(absRoot, absPath);
    const ext = extname(absPath);
    const fileId = this.fileId(projectId, relPath);

    const content = await readFile(absPath, 'utf-8');
    const fileStat = await stat(absPath);

    const contentHash = createHash('md5').update(content).digest('hex');

    // Build FileNode
    const fileNode: FileNode = {
      id: fileId,
      type: 'file',
      projectId,
      path: relPath,
      extension: ext.replace(/^\./, ''),
      size: fileStat.size,
      contentHash,
      lastModified: fileStat.mtimeMs,
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Parse exports and store as metadata (skip for JSON files)
    if (ext !== '.json') {
      const exports = this.parseExports(content);
      if (exports.length > 0) {
        fileNode.metadata.exports = exports;
      }
    }

    this.graph.addNode(fileNode);
    return content;
  }

  /**
   * Pass 2: Parse imports from cached content and create edges.
   * All FileNodes must already exist in the graph for cross-reference resolution.
   */
  private createEdgesForFile(
    projectId: string,
    absRoot: string,
    absPath: string,
    content: string,
  ): void {
    const relPath = relative(absRoot, absPath);
    const ext = extname(absPath);

    // Skip edge creation for JSON files
    if (ext === '.json') return;

    const specifiers = this.parseImports(content);

    for (const specifier of specifiers) {
      if (this.isRelativeSpecifier(specifier)) {
        this.addRelativeImportEdge(projectId, absRoot, absPath, relPath, specifier);
      } else {
        this.addBareSpecifierEdge(projectId, relPath, specifier);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Import / Export Parsing
  // ---------------------------------------------------------------------------

  /**
   * Extract all import specifiers from file content.
   */
  private parseImports(content: string): string[] {
    const specifiers = new Set<string>();

    for (const re of [IMPORT_FROM_RE, EXPORT_FROM_RE, REQUIRE_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        specifiers.add(match[1]!);
      }
    }

    return [...specifiers];
  }

  /**
   * Extract exported identifiers from file content.
   */
  private parseExports(content: string): string[] {
    const names: string[] = [];
    EXPORT_DECL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EXPORT_DECL_RE.exec(content)) !== null) {
      names.push(match[1]!);
    }
    return names;
  }

  // ---------------------------------------------------------------------------
  // Edge Creation
  // ---------------------------------------------------------------------------

  /**
   * Resolve a relative import specifier and create an IMPORTS edge.
   */
  private addRelativeImportEdge(
    projectId: string,
    absRoot: string,
    sourceAbsPath: string,
    sourceRelPath: string,
    specifier: string,
  ): void {
    const sourceDir = dirname(sourceAbsPath);
    const resolved = this.resolveRelativeImport(absRoot, sourceDir, specifier);
    if (!resolved) return;

    const targetRelPath = resolved;
    const sourceId = this.fileId(projectId, sourceRelPath);
    const targetId = this.fileId(projectId, targetRelPath);
    const edgeId = this.edgeId(sourceId, targetId, 'imports');

    // Only create edge if target node exists in the graph
    if (!this.graph.getNode(targetId)) return;

    const edge: GraphEdge = {
      id: edgeId,
      sourceId,
      targetId,
      type: 'imports',
      projectId,
      weight: 1,
      metadata: { specifier },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.graph.addEdge(edge);
  }

  /**
   * Create/find a ModuleNode for a bare specifier and add a DEPENDS_ON edge.
   */
  private addBareSpecifierEdge(
    projectId: string,
    sourceRelPath: string,
    specifier: string,
  ): void {
    const packageName = this.extractPackageName(specifier);
    const moduleId = this.moduleId(projectId, packageName);
    const sourceId = this.fileId(projectId, sourceRelPath);

    // Create ModuleNode if not already present
    if (!this.graph.getNode(moduleId)) {
      const moduleNode: ModuleNode = {
        id: moduleId,
        type: 'module',
        projectId,
        name: packageName,
        version: '*',
        isExternal: true,
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.graph.addNode(moduleNode);
    }

    const edgeId = this.edgeId(sourceId, moduleId, 'depends_on');

    // Avoid duplicate edges
    if (this.graph.getEdge(edgeId)) return;

    const edge: GraphEdge = {
      id: edgeId,
      sourceId,
      targetId: moduleId,
      type: 'depends_on',
      projectId,
      weight: 1,
      metadata: { specifier },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.graph.addEdge(edge);
  }

  // ---------------------------------------------------------------------------
  // Import Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a relative specifier to a project-relative path.
   * Tries common extension and index file patterns.
   * Returns the relative path (from absRoot) if found in the graph, else undefined.
   */
  private resolveRelativeImport(
    absRoot: string,
    sourceDir: string,
    specifier: string,
  ): string | undefined {
    // Normalise the specifier by stripping .js extension (ESM convention)
    const cleanSpec = specifier.replace(/\.js$/, '');

    const base = resolve(sourceDir, cleanSpec);
    const relBase = relative(absRoot, base);

    // Extensions to try (direct file match)
    const tryExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

    // 1. Try exact extensions
    for (const ext of tryExts) {
      const candidate = relBase + ext;
      if (this.graph.getFileByPath(candidate)) return candidate;
    }

    // 2. Try index files (directory import)
    const indexExts = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    for (const idx of indexExts) {
      const candidate = relBase + idx;
      if (this.graph.getFileByPath(candidate)) return candidate;
    }

    // 3. Maybe the original specifier already has a resolvable extension
    const rawRel = relative(absRoot, resolve(sourceDir, specifier));
    if (this.graph.getFileByPath(rawRel)) return rawRel;

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Directory Walking
  // ---------------------------------------------------------------------------

  /**
   * Recursively walk a directory and return absolute paths of source files.
   */
  private async walkSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const subFiles = await this.walkSourceFiles(join(dir, entry.name));
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (SOURCE_EXTENSIONS.has(ext)) {
          files.push(join(dir, entry.name));
        }
      }
    }

    return files;
  }

  // ---------------------------------------------------------------------------
  // ID Helpers
  // ---------------------------------------------------------------------------

  private fileId(projectId: string, relPath: string): string {
    // Normalise to posix separators for deterministic IDs across platforms
    return `file:${projectId}:${relPath.split('\\').join('/')}`;
  }

  private moduleId(projectId: string, packageName: string): string {
    return `module:${projectId}:${packageName}`;
  }

  private edgeId(sourceId: string, targetId: string, edgeType: string): string {
    return `edge:${sourceId}:${targetId}:${edgeType}`;
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  private isRelativeSpecifier(specifier: string): boolean {
    return specifier.startsWith('.');
  }

  /**
   * Extract package name from a bare specifier.
   * `@scope/pkg/deep` → `@scope/pkg`
   * `react/jsx-runtime` → `react`
   * `node:fs` → `node:fs`
   */
  private extractPackageName(specifier: string): string {
    if (specifier.startsWith('node:')) return specifier;

    if (specifier.startsWith('@')) {
      // Scoped: @scope/name/... → @scope/name
      const parts = specifier.split('/');
      return parts.slice(0, 2).join('/');
    }

    // Unscoped: name/... → name
    return specifier.split('/')[0]!;
  }
}
