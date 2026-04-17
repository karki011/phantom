/**
 * GraphBuilder — Builds file-level dependency graph from project source
 * Layer 1: Parses imports/exports to build FileNode + edge relationships
 * Source code only — skips node_modules, .git, dist, build, coverage
 *
 * @author Subash Karki
 */
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, extname, join } from 'node:path';
import type { ParseResult } from './parsers/types.js';
import type { FileNode, ModuleNode, GraphEdge } from '../types/graph.js';
import type { EventBus } from '../events/event-bus.js';
import type { InMemoryGraph } from './in-memory-graph.js';
import { ParserRegistry } from './parsers/registry.js';

/** Source file extensions we process */
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java',
]);

/** Directories to skip during walk */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.claude', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache',
  '__pycache__', '.venv', 'venv', 'env', 'target', '.gradle', 'bin', 'obj',
]);

/** Extension resolution strategies per language */
const RESOLUTION_STRATEGIES: Record<string, { exts: string[]; indexFiles: string[] }> = {
  javascript: {
    exts: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
    indexFiles: ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'],
  },
  python: {
    exts: ['.py'],
    indexFiles: ['/__init__.py'],
  },
  go: {
    exts: ['.go'],
    indexFiles: [],
  },
  rust: {
    exts: ['.rs'],
    indexFiles: ['/mod.rs'],
  },
  java: {
    exts: ['.java'],
    indexFiles: [],
  },
};

export class GraphBuilder {
  private parserRegistry: ParserRegistry;

  constructor(
    private graph: InMemoryGraph,
    private eventBus: EventBus,
  ) {
    this.parserRegistry = new ParserRegistry();
  }

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

    const parseCache = new Map<string, ParseResult>();

    // Pass 1: Create all FileNodes (no edges yet) so cross-references resolve
    const fileContents = new Map<string, string>();
    for (const absPath of filePaths) {
      try {
        const content = await this.createFileNode(projectId, absRoot, absPath, parseCache);
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
          this.createEdgesForFile(projectId, absRoot, absPath, content, parseCache);
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
    const existingNode = this.graph.getFileByPathInProject(projectId, relPath);
    if (existingNode) {
      this.graph.removeNode(existingNode.id);
    }

    const parseCache = new Map<string, ParseResult>();
    const content = await this.createFileNode(projectId, absRoot, absPath, parseCache);
    this.createEdgesForFile(projectId, absRoot, absPath, content, parseCache);
  }

  // ---------------------------------------------------------------------------
  // Internal: two-pass file processing
  // ---------------------------------------------------------------------------

  /**
   * Pass 1: Read file, create FileNode with metadata. Returns file content.
   * Populates parseCache so Pass 2 can reuse the parse result.
   */
  private async createFileNode(
    projectId: string,
    absRoot: string,
    absPath: string,
    parseCache: Map<string, ParseResult>,
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

    // Parse exports using language-aware parser (skip for JSON files)
    if (ext !== '.json') {
      const parser = this.parserRegistry.getParser(ext.replace(/^\./, ''));
      if (parser) {
        let result = parseCache.get(absPath);
        if (!result) {
          result = parser.parse(content, relPath);
          parseCache.set(absPath, result);
        }
        if (result.exports.length > 0) {
          fileNode.metadata.exports = result.exports.map((e) => e.name);
        }
      }
    }

    this.graph.addNode(fileNode);
    return content;
  }

  /**
   * Pass 2: Resolve imports and create edges. Reuses parseCache from Pass 1
   * so each file is parsed exactly once per build.
   */
  private createEdgesForFile(
    projectId: string,
    absRoot: string,
    absPath: string,
    content: string,
    parseCache: Map<string, ParseResult>,
  ): void {
    const relPath = relative(absRoot, absPath);
    const ext = extname(absPath);

    // Skip edge creation for JSON files
    if (ext === '.json') return;

    const parser = this.parserRegistry.getParser(ext.replace(/^\./, ''));
    if (!parser) return;

    let result = parseCache.get(absPath);
    if (!result) {
      result = parser.parse(content, relPath);
      parseCache.set(absPath, result);
    }

    for (const imp of result.imports) {
      if (imp.isRelative) {
        this.addRelativeImportEdge(projectId, absRoot, absPath, relPath, imp.specifier, parser.id);
      } else {
        this.addBareSpecifierEdge(projectId, relPath, imp.specifier, parser.id);
      }
    }
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
    languageId: string = 'javascript',
  ): void {
    const sourceDir = dirname(sourceAbsPath);
    const resolved = this.resolveRelativeImport(projectId, absRoot, sourceDir, specifier, languageId);
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
    languageId: string = 'javascript',
  ): void {
    const packageName = this.extractPackageName(specifier, languageId);
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
   * Tries language-aware extension and index file patterns.
   * Returns the relative path (from absRoot) if found in the graph, else undefined.
   */
  private resolveRelativeImport(
    projectId: string,
    absRoot: string,
    sourceDir: string,
    specifier: string,
    languageId: string = 'javascript',
  ): string | undefined {
    const strategy = RESOLUTION_STRATEGIES[languageId] ?? RESOLUTION_STRATEGIES['javascript']!;

    // Language-specific specifier normalisation
    let cleanSpec = specifier;
    if (languageId === 'javascript') {
      // Strip .js extension (ESM convention)
      cleanSpec = specifier.replace(/\.js$/, '');
    } else if (languageId === 'java') {
      // Convert Java package path (com.foo.Bar) to file path (com/foo/Bar)
      cleanSpec = specifier.replace(/\./g, '/');
    } else if (languageId === 'rust') {
      // super::super::x must step up twice, not once. Count chained super:: prefixes.
      let stripped = specifier;
      let superDepth = 0;
      while (stripped.startsWith('super::')) {
        superDepth++;
        stripped = stripped.slice(7);
      }
      if (superDepth > 0) {
        cleanSpec = '../'.repeat(superDepth) + stripped.replace(/::/g, '/');
      } else {
        cleanSpec = stripped
          .replace(/^crate::/, '')
          .replace(/^self::/, './')
          .replace(/::/g, '/');
      }
    }

    const base = resolve(sourceDir, cleanSpec);
    const relBase = relative(absRoot, base);

    // 1. Try exact extensions
    for (const ext of strategy.exts) {
      const candidate = relBase + ext;
      if (this.graph.getFileByPathInProject(projectId, candidate)) return candidate;
    }

    // 2. Try index/module files (directory import)
    for (const idx of strategy.indexFiles) {
      const candidate = relBase + idx;
      if (this.graph.getFileByPathInProject(projectId, candidate)) return candidate;
    }

    // 3. Maybe the original specifier already has a resolvable extension
    const rawRel = relative(absRoot, resolve(sourceDir, specifier));
    if (this.graph.getFileByPathInProject(projectId, rawRel)) return rawRel;

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Directory Walking
  // ---------------------------------------------------------------------------

  /**
   * Recursively walk a directory and return absolute paths of source files.
   * Guards against symlink cycles by tracking visited real paths.
   */
  private async walkSourceFiles(
    dir: string,
    visitedRealPaths: Set<string> = new Set(),
  ): Promise<string[]> {
    // Resolve the real path to detect symlink cycles.
    let realDir: string;
    try {
      realDir = await realpath(dir);
    } catch {
      // Broken symlink or permission error — skip this entry gracefully.
      return [];
    }

    if (visitedRealPaths.has(realDir)) {
      // Cycle detected — already walked this real directory.
      return [];
    }
    visitedRealPaths.add(realDir);

    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const entryPath = join(dir, entry.name);

        // For plain directories check the skip list immediately.
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

        // Resolve real path of the child to detect cycles / skip dirs reached via symlink.
        let realEntry: string;
        try {
          realEntry = await realpath(entryPath);
        } catch {
          // Broken symlink or inaccessible path — skip.
          continue;
        }

        // Check if the resolved target is actually a directory we should recurse into.
        let entryStat: Awaited<ReturnType<typeof stat>>;
        try {
          entryStat = await stat(entryPath);
        } catch {
          continue;
        }

        if (!entryStat.isDirectory()) {
          // Symlink that resolves to a file — treat it as a regular file entry below.
          const ext = extname(entry.name);
          if (SOURCE_EXTENSIONS.has(ext) && !visitedRealPaths.has(realEntry)) {
            files.push(entryPath);
          }
          continue;
        }

        // Skip named skip-dirs even when reached through a symlink.
        if (SKIP_DIRS.has(entry.name)) continue;

        const subFiles = await this.walkSourceFiles(entryPath, visitedRealPaths);
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

  /**
   * Extract package name from a bare specifier.
   * Language-aware: JS uses npm conventions, others use full specifier.
   *
   * JS/TS: `@scope/pkg/deep` → `@scope/pkg`, `react/jsx-runtime` → `react`
   * Go: `github.com/pkg/errors` → `github.com/pkg/errors` (full path)
   * Rust: `std::io` → `std::io` (full path)
   * Python: `os.path` → `os.path` (full dotted path)
   * Java: `java.util.List` → `java.util.List` (full package)
   */
  private extractPackageName(specifier: string, languageId: string = 'javascript'): string {
    // Non-JS languages: use the full specifier as the package name
    if (languageId !== 'javascript') {
      return specifier;
    }

    // JS/TS npm conventions
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
